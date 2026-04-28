import anyTest from 'ava';

const test = anyTest as any;

import {snowBridgeClient} from '../session/vcpCompatibility/bridgeClient.js';
import {
	clearToolExecutionBindings,
	registerToolExecutionBindings,
} from '../session/vcpCompatibility/toolExecutionBinding.js';
import {executeBridgeToolCall} from './bridgeToolExecution.js';

test.serial(
	'executeBridgeToolCall prefers originName and keeps compatibility identity fields',
	async (t: any) => {
		const toolPlaneKey = 'bridge-execution-identity';
		const originalExecuteTool = snowBridgeClient.executeTool;
		let observedOptions: any;

		registerToolExecutionBindings(toolPlaneKey, [
			{
				kind: 'bridge',
				toolName: 'vcp-fileoperatorpublic-readfile',
				pluginName: 'FileOperatorPublic',
				originName: 'FileOperator',
				publicName: 'FileOperatorPublic',
				toolId: 'vcp_bridge:fileoperator',
				displayName: 'Marketing File Operator',
				commandName: 'ReadFile',
				stringifyArgumentNames: ['limit'],
			},
		]);

		snowBridgeClient.executeTool = (async (options: any) => {
			observedOptions = options;
			return {
				status: 'success',
				result: {
					ok: true,
				},
			} as any;
		}) as typeof snowBridgeClient.executeTool;

		try {
			const response = await executeBridgeToolCall({
				toolName: 'vcp-fileoperatorpublic-readfile',
				toolPlaneKey,
				args: {
					path: 'demo.txt',
					limit: 3,
				},
			});

			t.is(response.status, 'success');
			t.is(observedOptions.toolName, 'FileOperator');
			t.is(observedOptions.originName, 'FileOperator');
			t.is(observedOptions.pluginName, 'FileOperatorPublic');
			t.is(observedOptions.publicName, 'FileOperatorPublic');
			t.is(observedOptions.toolId, 'vcp_bridge:fileoperator');
			t.deepEqual(observedOptions.toolArgs, {
				path: 'demo.txt',
				limit: '3',
				command: 'ReadFile',
			});
		} finally {
			snowBridgeClient.executeTool = originalExecuteTool;
			clearToolExecutionBindings(toolPlaneKey);
		}
	},
);

test.serial(
	'executeBridgeToolCall falls back to pluginName for legacy bridge bindings',
	async (t: any) => {
		const toolPlaneKey = 'bridge-execution-legacy-identity';
		const originalExecuteTool = snowBridgeClient.executeTool;
		let observedOptions: any;

		registerToolExecutionBindings(toolPlaneKey, [
			{
				kind: 'bridge',
				toolName: 'vcp-legacyplugin-run',
				pluginName: 'LegacyPlugin',
				displayName: 'Legacy Plugin',
				commandName: 'Run',
				stringifyArgumentNames: [],
			},
		]);

		snowBridgeClient.executeTool = (async (options: any) => {
			observedOptions = options;
			return {
				status: 'success',
				result: {
					ok: true,
				},
			} as any;
		}) as typeof snowBridgeClient.executeTool;

		try {
			await executeBridgeToolCall({
				toolName: 'vcp-legacyplugin-run',
				toolPlaneKey,
				args: {
					query: 'SnowBridge',
				},
			});

			t.is(observedOptions.toolName, 'LegacyPlugin');
			t.is(observedOptions.originName, 'LegacyPlugin');
			t.is(observedOptions.pluginName, 'LegacyPlugin');
			t.is(observedOptions.publicName, 'LegacyPlugin');
			t.false('toolId' in observedOptions);
			t.deepEqual(observedOptions.toolArgs, {
				query: 'SnowBridge',
				command: 'Run',
			});
		} finally {
			snowBridgeClient.executeTool = originalExecuteTool;
			clearToolExecutionBindings(toolPlaneKey);
		}
	},
);
