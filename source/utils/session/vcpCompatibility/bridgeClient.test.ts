import anyTest from 'ava';
import type {ApiConfig} from '../../config/apiConfig.js';
import {SnowBridgeClient} from './bridgeClient.js';

const test = anyTest as any;

const bridgeConfig: Pick<ApiConfig, 'baseUrl' | 'bridgeVcpKey' | 'bridgeAccessToken'> = {
	baseUrl: 'http://127.0.0.1:6005',
	bridgeVcpKey: '123456',
	bridgeAccessToken: '',
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
		});
	}

	t.is(client.manifestCache.size, 100);
	t.false(client.manifestCache.has(client.buildConnectionKey({
		baseUrl: 'http://127.0.0.1:6005',
		bridgeVcpKey: '0',
		bridgeAccessToken: '',
	})));
	client.disconnect();
});
