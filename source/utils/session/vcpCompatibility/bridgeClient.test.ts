import anyTest from 'ava';
import type {ApiConfig} from '../../config/apiConfig.js';
import {SnowBridgeClient} from './bridgeClient.js';

const test = anyTest as any;

const bridgeConfig: Pick<
	ApiConfig,
	| 'baseUrl'
	| 'bridgeWsUrl'
	| 'bridgeVcpKey'
	| 'bridgeAccessToken'
	| 'toolTransport'
> = {
	baseUrl: 'http://127.0.0.1:6005',
	bridgeWsUrl: '',
	bridgeVcpKey: '123456',
	bridgeAccessToken: '',
	toolTransport: 'bridge',
};

const hybridConfig: Pick<
	ApiConfig,
	| 'baseUrl'
	| 'bridgeWsUrl'
	| 'bridgeVcpKey'
	| 'bridgeAccessToken'
	| 'toolTransport'
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
	let sendCount = 0;

	client.sendRequest = async () => {
		sendCount += 1;
		return {
			status: 'success',
			plugins: [
				{
					name: `fresh-${sendCount}`,
					displayName: `Fresh ${sendCount}`,
					description: 'Fresh manifest plugin.',
					bridgeCommands: [],
				},
			],
		};
	};

	await client.getManifest(bridgeConfig);
	const cacheKey = Array.from(client.manifestCache.keys())[0];
	client.manifestCache.set(cacheKey, {
		...client.manifestCache.get(cacheKey),
		connectionKey: client.buildConnectionKey(bridgeConfig),
		manifest: {plugins: [{name: 'expired'}]},
		expiresAt: Date.now() - 1,
		refreshAfter: Date.now() - 1,
	});

	const manifest = await client.getManifest(bridgeConfig);

	t.is(sendCount, 2);
	t.deepEqual(manifest, {
		plugins: [
			{
				name: 'fresh-2',
				displayName: 'Fresh 2',
				description: 'Fresh manifest plugin.',
				bridgeCommands: [],
			},
		],
	});
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

test('getManifest forwards normalized tool filters and caches by filter shape', async (t: any) => {
	const client = new SnowBridgeClient() as any;
	const observedPayloads: Array<Record<string, unknown>> = [];

	client.sendRequest = async ({payload}: {payload: Record<string, unknown>}) => {
		observedPayloads.push(payload);
		return {
			status: 'success',
			plugins: [{name: `filtered-${observedPayloads.length}`}],
		};
	};

	const firstManifest = await client.getManifest(bridgeConfig, {
		toolFilters: {
			excludeExactToolNames: ['vcp-demo-run', 'vcp-demo-run', 'filesystem-read'],
		},
	});
	const sharedManifest = await client.getManifest(hybridConfig, {
		toolFilters: {
			excludeExactToolNames: ['filesystem-read', 'vcp-demo-run'],
		},
	});
	const secondManifest = await client.getManifest(bridgeConfig, {
		toolFilters: {
			excludeExactToolNames: ['vcp-other-run'],
		},
	});

	t.is(observedPayloads.length, 2);
	t.deepEqual(observedPayloads[0], {
		toolFilters: {
			include: [],
			profileName: '',
			includeExactToolNames: [],
			excludeExactToolNames: ['filesystem-read', 'vcp-demo-run'],
			excludeBridgeToolIds: [],
			excludePluginNames: [],
		},
	});
	t.deepEqual(firstManifest, sharedManifest);
	t.notDeepEqual(firstManifest, secondManifest);
	client.disconnect();
});

test('getManifest forwards profile-aware bridge filters', async (t: any) => {
	const client = new SnowBridgeClient() as any;
	const observedPayloads: Array<Record<string, unknown>> = [];

	client.sendRequest = async ({payload}: {payload: Record<string, unknown>}) => {
		observedPayloads.push(payload);
		return {
			status: 'success',
			plugins: [{name: 'profiled-manifest'}],
		};
	};

	await client.getManifest(bridgeConfig, {
		toolFilters: {
			profileName: 'writer-mode',
		},
	});

	t.deepEqual(observedPayloads[0], {
		toolFilters: {
			include: [],
			profileName: 'writer-mode',
			includeExactToolNames: [],
			excludeExactToolNames: [],
			excludeBridgeToolIds: [],
			excludePluginNames: [],
		},
	});
	client.disconnect();
});

test('queueManifestRefresh logs failures and evicts stale cache entries', async (t: any) => {
	const client = new SnowBridgeClient() as any;
	const connectionKey = client.buildConnectionKey(bridgeConfig);
	const manifestCacheKey = JSON.stringify({
		connectionKey,
		toolFilters: null,
	});
	const warningMessages: string[] = [];
	const originalWarn = console.warn;

	client.manifestCache.set(manifestCacheKey, {
		connectionKey,
		manifest: {plugins: [{name: 'stale-manifest'}]},
		expiresAt: Date.now() + 30_000,
		refreshAfter: Date.now() - 1,
	});
	client.loadManifest = async () => {
		throw new Error('refresh timeout');
	};
	console.warn = (message?: unknown) => {
		warningMessages.push(String(message || ''));
	};

	try {
		client.queueManifestRefresh({
			config: bridgeConfig,
			connectionKey,
			manifestCacheKey,
		});
		await Promise.resolve();
		await Promise.resolve();
	} finally {
		console.warn = originalWarn;
	}

	t.false(client.manifestCache.has(manifestCacheKey));
	t.true(
		warningMessages.some(message =>
			message.includes('Background manifest refresh failed'),
		),
	);
	client.disconnect();
});

test('buildWebSocketUrl prefers explicit bridgeWsUrl override', (t: any) => {
	const client = new SnowBridgeClient() as any;

	t.is(
		client.buildWebSocketUrl({
			baseUrl: 'http://127.0.0.1:6005',
			bridgeWsUrl: 'wss://bridge.example.com/socket',
			bridgeVcpKey: '',
		}),
		'wss://bridge.example.com/socket',
	);
	client.disconnect();
});

test('buildConnectionKey includes explicit bridgeWsUrl override', (t: any) => {
	const client = new SnowBridgeClient() as any;
	const derivedKey = client.buildConnectionKey(bridgeConfig);
	const explicitKey = client.buildConnectionKey({
		...bridgeConfig,
		bridgeWsUrl: 'wss://bridge.example.com/socket',
	});

	t.not(derivedKey, explicitKey);
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

test('executeTool preserves the bridge status envelope for upper seams', async (t: any) => {
	const client = new SnowBridgeClient() as any;

	client.ensureConnected = async () => {};
	client.sendConnectedRequest = async () => ({
		status: 'success',
		result: {
			MaidName: 'Nova',
			timestamp: '2026-04-01T12:02:51.374+08:00',
		},
		asyncStatus: {
			enabled: false,
			state: 'completed',
			event: 'result',
		},
	});

	const response = await client.executeTool({
		config: bridgeConfig,
		toolName: 'vcp-dailynote-create',
		toolArgs: {
			maid: 'Nova',
			Date: '2026-04-01',
			Content: 'Tag: SnowBridge',
		},
	});

	t.is(response.status, 'success');
	t.deepEqual(response.result, {
		MaidName: 'Nova',
		timestamp: '2026-04-01T12:02:51.374+08:00',
	});
	t.deepEqual(response.asyncStatus, {
		enabled: false,
		state: 'completed',
		event: 'result',
	});
	client.disconnect();
});

test('executeTool exposes structured bridge status events', async (t: any) => {
	const client = new SnowBridgeClient() as any;
	const observedStatusEvents: any[] = [];

	client.ensureConnected = async () => {};
	client.sendConnectedRequest = async (request: {
		payload: Record<string, unknown>;
	}) => {
		client.handleMessage(
			JSON.stringify({
				type: 'vcp_tool_status',
				data: {
					requestId: request.payload['requestId'],
					invocationId: request.payload['invocationId'],
					toolId: 'vcp_bridge:snowbridge:demo',
					toolName: 'DemoTool',
					originName: 'DemoPlugin',
					taskId: 'task-42',
					status: 'running',
					async: true,
					asyncStatus: {
						enabled: true,
						state: 'running',
						event: 'log',
					},
					bridgeType: 'log',
					result: {
						step: 'queued',
					},
				},
			}),
		);

		return {
			status: 'success',
			result: {
				ok: true,
			},
			asyncStatus: {
				enabled: true,
				state: 'completed',
				event: 'result',
			},
		};
	};

	const response = await client.executeTool({
		config: bridgeConfig,
		toolName: 'DemoPlugin',
		toolArgs: {query: 'SnowBridge'},
		onStatus: (statusEvent: unknown) => {
			observedStatusEvents.push(statusEvent);
		},
	});

	t.is(observedStatusEvents.length, 1);
	t.deepEqual(observedStatusEvents[0], {
		type: 'vcp_tool_status',
		requestId: observedStatusEvents[0].requestId,
		invocationId: observedStatusEvents[0].invocationId,
		toolId: 'vcp_bridge:snowbridge:demo',
		toolName: 'DemoTool',
		originName: 'DemoPlugin',
		taskId: 'task-42',
		status: 'running',
		isAsync: true,
		asyncStatus: {
			enabled: true,
			state: 'running',
			event: 'log',
			taskId: 'task-42',
		},
		bridgeType: 'log',
		result: {
			step: 'queued',
		},
		rawData: {
			requestId: observedStatusEvents[0].requestId,
			invocationId: observedStatusEvents[0].invocationId,
			toolId: 'vcp_bridge:snowbridge:demo',
			toolName: 'DemoTool',
			originName: 'DemoPlugin',
			taskId: 'task-42',
			status: 'running',
			async: true,
			asyncStatus: {
				enabled: true,
				state: 'running',
				event: 'log',
			},
			bridgeType: 'log',
			result: {
				step: 'queued',
			},
		},
	});
	t.deepEqual(response.statusEvents, observedStatusEvents);
	client.disconnect();
});

test('getManifest normalizes metadata sidecars from SnowBridge responses', async (t: any) => {
	const client = new SnowBridgeClient() as any;

	client.sendRequest = async () => ({
		status: 'success',
		revision: 'rev-bridge-1',
		reloadedAt: '2026-04-04T10:10:00.000Z',
		plugins: [
			{
				name: 'FileOperator',
				displayName: 'FileOperator',
				description: 'File tools.',
				requiresApproval: true,
				approvalTimeoutMs: 60_000,
				bridgeCommands: [
					{
						commandName: 'ReadFile',
						description: 'Read file.',
						parameters: [],
					},
				],
			},
		],
	});

	const manifest = await client.getManifest(bridgeConfig);

	t.deepEqual(manifest.metadata, {
		revision: 'rev-bridge-1',
		reloadedAt: '2026-04-04T10:10:00.000Z',
	});
	t.deepEqual(manifest.plugins[0]?.metadata, {
		requiresApproval: true,
		approvalTimeoutMs: 60_000,
	});
	client.disconnect();
});

test('getManifest revalidates metadata-aware cache entries before ttl expiry', async (t: any) => {
	const client = new SnowBridgeClient() as any;
	const responses = [
		{
			status: 'success',
			revision: 'rev-1',
			plugins: [{name: 'rev-1-plugin', displayName: 'rev-1', description: '', bridgeCommands: []}],
		},
		{
			status: 'success',
			revision: 'rev-2',
			plugins: [{name: 'rev-2-plugin', displayName: 'rev-2', description: '', bridgeCommands: []}],
		},
	];
	let sendCount = 0;

	client.sendRequest = async () => {
		const response = responses[Math.min(sendCount, responses.length - 1)];
		sendCount += 1;
		return response;
	};

	const firstManifest = await client.getManifest(bridgeConfig);
	const cacheKey = Array.from(client.manifestCache.keys())[0];
	const cachedEntry = client.manifestCache.get(cacheKey);
	t.truthy(cachedEntry);

	cachedEntry.refreshAfter = Date.now() - 1;
	const cachedManifest = await client.getManifest(bridgeConfig);
	await new Promise(resolve => {
		setTimeout(resolve, 0);
	});
	const refreshedManifest = await client.getManifest(bridgeConfig);

	t.is(sendCount, 2);
	t.is(firstManifest.metadata?.revision, 'rev-1');
	t.is(cachedManifest.metadata?.revision, 'rev-1');
	t.is(refreshedManifest.metadata?.revision, 'rev-2');
	client.disconnect();
});
