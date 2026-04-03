import anyTest from 'ava';
import type {MCPTool} from '../../execution/mcpToolsManager.js';
import {
	buildBridgeManifestToolFilters,
	buildPreparedToolPlaneRuntimeState,
} from './toolPlaneFacade.js';

const test = anyTest as any;

test('buildBridgeManifestToolFilters excludes exact local tool names in hybrid mode', (t: any) => {
	const localTools: MCPTool[] = [
		{
			type: 'function',
			function: {
				name: 'filesystem-read',
				description: 'Read a file.',
				parameters: {type: 'object'},
			},
		},
		{
			type: 'function',
			function: {
				name: 'vcp-demo-run',
				description: 'Demo bridge tool.',
				parameters: {type: 'object'},
			},
		},
		{
			type: 'function',
			function: {
				name: 'filesystem-read',
				description: 'Duplicate local tool name.',
				parameters: {type: 'object'},
			},
		},
	];

	t.deepEqual(
		buildBridgeManifestToolFilters({
			transport: 'hybrid',
			localTools,
		}),
		{
			excludeExactToolNames: ['filesystem-read', 'vcp-demo-run'],
		},
	);
});

test('buildBridgeManifestToolFilters skips bridge-only sessions', (t: any) => {
	t.is(
		buildBridgeManifestToolFilters({
			transport: 'bridge',
			localTools: [
				{
					type: 'function',
					function: {
						name: 'filesystem-read',
						description: 'Read a file.',
						parameters: {type: 'object'},
					},
				},
			],
		}),
		undefined,
	);
});

test('buildPreparedToolPlaneRuntimeState downgrades hybrid runtime to local on bridge failure', (t: any) => {
	t.deepEqual(
		buildPreparedToolPlaneRuntimeState({
			config: {toolTransport: 'hybrid'},
			registry: {
				retainedToolCounts: {
					local: 2,
					bridge: 0,
				},
			},
			localDiscoveredToolCount: 2,
			bridgeDiscoveredToolCount: 0,
			bridgeLoadFailed: true,
		}),
		{
			snapshot: {
				configuredTransport: 'hybrid',
				effectiveTransport: 'local',
				local: {
					requested: true,
					discoveredToolCount: 2,
					retainedToolCount: 2,
					active: true,
				},
				bridge: {
					requested: true,
					discoveredToolCount: 0,
					retainedToolCount: 0,
					active: false,
				},
			},
			sidecar: {
				reasonCode: 'bridge_manifest_failed',
			},
		},
	);
});

test('buildPreparedToolPlaneRuntimeState marks bridge tools as shadowed when duplicates remove runtime bridge capability', (t: any) => {
	const runtimeState = buildPreparedToolPlaneRuntimeState({
		config: {toolTransport: 'hybrid'},
		registry: {
			retainedToolCounts: {
				local: 1,
				bridge: 0,
			},
		},
		localDiscoveredToolCount: 1,
		bridgeDiscoveredToolCount: 3,
	});

	t.is(runtimeState.snapshot.effectiveTransport, 'local');
	t.is(runtimeState.sidecar.reasonCode, 'bridge_tools_shadowed');
	t.is(runtimeState.snapshot.bridge.discoveredToolCount, 3);
	t.is(runtimeState.snapshot.bridge.retainedToolCount, 0);
});
