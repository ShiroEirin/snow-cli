import anyTest from 'ava';

const test = anyTest as any;

import {validateApiConfig} from '../../config/apiConfig.js';
import {
	resolveToolExecutionRoute,
	resolveToolRegistry,
	resolveToolTransport,
	shouldIncludeBridgeTools,
	shouldIncludeLocalTools,
} from './toolRouteArbiter.js';
import {
	buildBridgeToolSnapshot,
	clearBridgeToolSnapshot,
} from './toolSnapshot.js';

test.afterEach(() => {
	clearBridgeToolSnapshot('hybrid-session');
});

test('resolve transport flags for local bridge and hybrid', (t: any) => {
	t.is(resolveToolTransport({toolTransport: 'local'}), 'local');
	t.is(resolveToolTransport({toolTransport: 'bridge'}), 'bridge');
	t.is(resolveToolTransport({toolTransport: 'hybrid'}), 'hybrid');
	t.true(shouldIncludeLocalTools({toolTransport: 'local'}));
	t.false(shouldIncludeBridgeTools({toolTransport: 'local'}));
	t.false(shouldIncludeLocalTools({toolTransport: 'bridge'}));
	t.true(shouldIncludeBridgeTools({toolTransport: 'bridge'}));
	t.true(shouldIncludeLocalTools({toolTransport: 'hybrid'}));
	t.true(shouldIncludeBridgeTools({toolTransport: 'hybrid'}));
});

test('resolve execution route by transport mode and session snapshot', (t: any) => {
	buildBridgeToolSnapshot('hybrid-session', {
		plugins: [
			{
				name: 'FileOperator',
				displayName: 'FileOperator',
				description: 'File operations',
				bridgeCommands: [
					{
						commandName: 'ReadFile',
						description: 'Read a file.',
						parameters: [],
						example: '',
					},
				],
			},
		],
	});

	t.is(
		resolveToolExecutionRoute({
			config: {toolTransport: 'bridge'},
			toolName: 'vcp-fileoperator-readfile',
			snapshotKey: 'hybrid-session',
		}),
		'bridge',
	);
	t.is(
		resolveToolExecutionRoute({
			config: {toolTransport: 'hybrid'},
			toolName: 'filesystem-read',
			snapshotKey: 'hybrid-session',
		}),
		'local',
	);
	t.is(
		resolveToolExecutionRoute({
			config: {toolTransport: 'local'},
			toolName: 'vcp-fileoperator-readfile',
			snapshotKey: 'hybrid-session',
		}),
		'local',
	);
});

test('validate hybrid transport requires bridge key like bridge mode', (t: any) => {
	t.true(
		validateApiConfig({
			toolTransport: 'hybrid',
		}).includes(
			'bridgeVcpKey is required when toolTransport is set to bridge or hybrid',
		),
	);
	t.deepEqual(
		validateApiConfig({
			toolTransport: 'hybrid',
			bridgeVcpKey: 'Snow',
		}),
		[],
	);
});

test('resolve tool registry keeps local and bridge planes isolated by transport', (t: any) => {
	const localTool = {
		type: 'function' as const,
		function: {
			name: 'filesystem-read',
			description: 'Read file from local MCP.',
			parameters: {type: 'object', properties: {}},
		},
	};
	const localService = {
		serviceName: 'filesystem',
		tools: [
			{
				name: 'filesystem-read',
				description: 'Read file from local MCP.',
				inputSchema: {type: 'object', properties: {}},
			},
		],
		isBuiltIn: false,
		connected: true,
	};
	const bridgeSnapshot = {
		modelTools: [
			{
				type: 'function' as const,
				function: {
					name: 'vcp-fileoperator-readfile',
					description: 'Read file from SnowBridge.',
					parameters: {type: 'object', properties: {}},
				},
			},
		],
		servicesInfo: [
			{
				serviceName: 'vcp-fileoperator',
				tools: [
					{
						name: 'vcp-fileoperator-readfile',
						description: 'Read file from SnowBridge.',
						inputSchema: {type: 'object', properties: {}},
					},
				],
				isBuiltIn: false,
				connected: true,
			},
		],
	};

	const localOnly = resolveToolRegistry({
		config: {toolTransport: 'local'},
		localTools: [localTool],
		localServicesInfo: [localService],
		bridgeSnapshot,
	});
	t.deepEqual(
		localOnly.tools.map(tool => tool.function.name),
		['filesystem-read'],
	);

	const bridgeOnly = resolveToolRegistry({
		config: {toolTransport: 'bridge'},
		localTools: [localTool],
		localServicesInfo: [localService],
		bridgeSnapshot,
	});
	t.deepEqual(
		bridgeOnly.tools.map(tool => tool.function.name),
		['vcp-fileoperator-readfile'],
	);
});

test('resolve tool registry prefers local tools when hybrid sees duplicates', (t: any) => {
	const localTool = {
		type: 'function' as const,
		function: {
			name: 'shared-read',
			description: 'Local tool description.',
			parameters: {type: 'object', properties: {}},
		},
	};
	const bridgeSnapshot = {
		modelTools: [
			{
				type: 'function' as const,
				function: {
					name: 'shared-read',
					description: 'Bridge tool description.',
					parameters: {type: 'object', properties: {}},
				},
			},
		],
		servicesInfo: [
			{
				serviceName: 'vcp-shared',
				tools: [
					{
						name: 'shared-read',
						description: 'Bridge tool description.',
						inputSchema: {type: 'object', properties: {}},
					},
				],
				isBuiltIn: false,
				connected: true,
			},
		],
	};

	const registry = resolveToolRegistry({
		config: {toolTransport: 'hybrid'},
		localTools: [localTool],
		localServicesInfo: [],
		bridgeSnapshot,
	});

	t.deepEqual(
		registry.tools.map(tool => tool.function.name),
		['shared-read'],
	);
	t.is(registry.tools[0]?.function.description, 'Local tool description.');
	t.deepEqual(registry.duplicateToolNames, ['shared-read']);
});
