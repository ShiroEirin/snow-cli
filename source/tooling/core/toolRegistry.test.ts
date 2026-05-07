import test from 'ava';
import {buildToolRegistrySnapshot, createSnowToolId} from './toolRegistry.js';

test('buildToolRegistrySnapshot assigns stable tool ids and public tools', t => {
	const snapshot = buildToolRegistrySnapshot([
		{
			toolId: createSnowToolId({
				owner: 'snow_builtin',
				serviceName: 'filesystem',
				originName: 'read',
			}),
			publicName: 'filesystem-read',
			description: 'Read files',
			inputSchema: {type: 'object'},
			owner: 'snow_builtin',
			transport: 'local',
			serviceName: 'filesystem',
			originName: 'read',
			enabled: true,
			connected: true,
		},
	]);

	t.is(snapshot.tools.length, 1);
	t.is(snapshot.tools[0]?.toolId, 'snow_builtin:filesystem:read');
	t.is(snapshot.publicTools[0]?.function.name, 'filesystem-read');
});

test('buildToolRegistrySnapshot resolves duplicate public names with suffixes', t => {
	const snapshot = buildToolRegistrySnapshot([
		{
			toolId: 'snow_builtin:filesystem:read',
			publicName: 'conflict-tool',
			description: 'First',
			inputSchema: {type: 'object'},
			owner: 'snow_builtin',
			transport: 'local',
			serviceName: 'filesystem',
			originName: 'read',
			enabled: true,
			connected: true,
		},
		{
			toolId: 'vcp_bridge:snowbridge:plugin_a',
			publicName: 'conflict-tool',
			description: 'Second',
			inputSchema: {type: 'object'},
			owner: 'vcp_bridge',
			transport: 'bridge',
			serviceName: 'snowbridge',
			originName: 'plugin_a',
			enabled: true,
			connected: true,
		},
	]);

	t.is(snapshot.tools[0]?.publicName, 'conflict-tool');
	t.is(snapshot.tools[1]?.publicName, 'conflict-tool_2');
	t.deepEqual(snapshot.conflicts[0]?.resolvedNames, [
		'conflict-tool',
		'conflict-tool_2',
	]);
});
