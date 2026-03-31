import anyTest from 'ava';
import type {ApiConfig} from '../../config/apiConfig.js';
import {SnowBridgeClient} from './bridgeClient.js';

const test = anyTest as any;

const bridgeConfig: Pick<
	ApiConfig,
	'baseUrl' | 'bridgeVcpKey' | 'bridgeAccessToken' | 'toolTransport'
> = {
	baseUrl: 'http://127.0.0.1:6005',
	bridgeVcpKey: '123456',
	bridgeAccessToken: '',
	toolTransport: 'bridge',
};

const hybridConfig: Pick<
	ApiConfig,
	'baseUrl' | 'bridgeVcpKey' | 'bridgeAccessToken' | 'toolTransport'
> = {
	...bridgeConfig,
	toolTransport: 'hybrid',
};

test('cancelTool surfaces cancellation transport failures', async (t: any) => {
	const client = new SnowBridgeClient() as any;
	const expectedError = new Error('cancel ack timeout');

	client.sendRequest = async () => {
		throw expectedError;
	};

	const error = await t.throwsAsync(
		client.cancelTool({
			config: bridgeConfig,
			requestId: 'request-1',
			invocationId: 'request-1',
		}),
	);

	t.is(error, expectedError);
	client.disconnect();
});

test('executeTool does not dispatch after aborting during connection setup', async (t: any) => {
	const client = new SnowBridgeClient() as any;
	const abortController = new AbortController();
	let resolveConnection = () => {};
	let cancelCount = 0;
	let sendCount = 0;

	client.ensureConnected = async () =>
		new Promise<void>(resolve => {
			resolveConnection = resolve;
		});
	client.sendConnectedRequest = async () => {
		sendCount += 1;
		return {
			status: 'success',
			result: 'should-not-run',
		};
	};
	client.cancelTool = async () => {
		cancelCount += 1;
	};

	const executionPromise = client.executeTool({
		config: bridgeConfig,
		toolName: 'vcp-demo-run',
		toolArgs: {query: 'SnowBridge'},
		abortSignal: abortController.signal,
	});

	abortController.abort();
	resolveConnection();

	const error = await t.throwsAsync(executionPromise);
	t.regex(error.message, /SnowBridge tool execution aborted/i);
	t.is(sendCount, 0);
	t.is(cancelCount, 1);
	client.disconnect();
});

test('getManifest evicts expired cache entries before reloading', async (t: any) => {
	const client = new SnowBridgeClient() as any;
	const connectionKey = client.buildConnectionKey(bridgeConfig);
	let sendCount = 0;

	client.manifestCache.set(connectionKey, {
		manifest: {plugins: [{name: 'expired'}]},
		expiresAt: Date.now() - 1,
	});
	client.sendRequest = async () => {
		sendCount += 1;
		return {
			status: 'success',
			plugins: [{name: 'fresh'}],
		};
	};

	const manifest = await client.getManifest(bridgeConfig);

	t.is(sendCount, 1);
	t.deepEqual(manifest, {plugins: [{name: 'fresh'}]});
	t.is(client.manifestCache.size, 1);
	client.disconnect();
});

test('bridge and hybrid share the same connection key', (t: any) => {
	const client = new SnowBridgeClient() as any;

	t.is(
		client.buildConnectionKey(bridgeConfig),
		client.buildConnectionKey(hybridConfig),
	);
	client.disconnect();
});

test('ensureConnected reuses the same socket when switching bridge mode', async (t: any) => {
	const client = new SnowBridgeClient() as any;
	let cleanupCount = 0;

	client.cleanupSocket = () => {
		cleanupCount += 1;
	};
	client.socket = {
		readyState: 1,
	};
	client.activeConnectionKey = client.buildConnectionKey(bridgeConfig);

	await client.ensureConnected(hybridConfig);

	t.is(cleanupCount, 0);
	t.is(client.activeConnectionKey, client.buildConnectionKey(bridgeConfig));
	client.disconnect();
});

test('getManifest reuses cache across bridge and hybrid transport modes', async (t: any) => {
	const client = new SnowBridgeClient() as any;
	let sendCount = 0;

	client.sendRequest = async () => {
		sendCount += 1;
		return {
			status: 'success',
			plugins: [{name: 'shared-cache'}],
		};
	};

	const bridgeManifest = await client.getManifest(bridgeConfig);
	const hybridManifest = await client.getManifest(hybridConfig);

	t.is(sendCount, 1);
	t.deepEqual(bridgeManifest, hybridManifest);
	t.is(client.manifestCache.size, 1);
	client.disconnect();
});

test('getManifest keeps manifest cache bounded with LRU-style eviction', async (t: any) => {
	const client = new SnowBridgeClient() as any;
	let sendCount = 0;

	client.sendRequest = async () => {
		sendCount += 1;
		return {
			status: 'success',
			plugins: [{name: `plugin-${sendCount}`}],
		};
	};

	for (let index = 0; index < 101; index += 1) {
		await client.getManifest({
			baseUrl: `http://127.0.0.1:${6005 + index}`,
			bridgeVcpKey: String(index),
			bridgeAccessToken: '',
			toolTransport: 'bridge',
		});
	}

	t.is(client.manifestCache.size, 100);
	t.false(client.manifestCache.has(client.buildConnectionKey({
		baseUrl: 'http://127.0.0.1:6005',
		bridgeVcpKey: '0',
		bridgeAccessToken: '',
		toolTransport: 'bridge',
	})));
	client.disconnect();
});

test('sendConnectedRequest includes Snow bridge request headers', async (t: any) => {
	const client = new SnowBridgeClient() as any;
	let serializedPayload = '';

	client.socket = {
		send(payload: string) {
			serializedPayload = payload;
		},
		removeAllListeners() {},
		close() {},
		readyState: 3,
	};

	const requestPromise = client.sendConnectedRequest({
		config: {
			...hybridConfig,
		},
		type: 'get_vcp_manifests',
		expectedType: 'vcp_manifest_response',
		payload: {
			requestId: 'request-headers-1',
		},
		timeoutMs: 5_000,
	});

	client.handleMessage(
		JSON.stringify({
			type: 'vcp_manifest_response',
			data: {
				requestId: 'request-headers-1',
				status: 'success',
				plugins: [],
			},
		}),
	);

	await requestPromise;

	const parsedPayload = JSON.parse(serializedPayload);
	t.deepEqual(parsedPayload.data.requestHeaders, {
		'x-snow-client': 'snow-cli',
		'x-snow-protocol': 'function-calling',
		'x-snow-tool-mode': 'hybrid',
		'x-snow-channel': 'bridge-ws',
	});
	client.disconnect();
});
