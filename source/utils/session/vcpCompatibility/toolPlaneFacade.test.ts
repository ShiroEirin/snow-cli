import anyTest from 'ava';
import type {MCPTool} from '../../execution/mcpToolsManager.js';
import {buildBridgeManifestToolFilters} from './toolPlaneFacade.js';

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
