import test from 'ava';
import {buildToolRegistrySnapshot} from './toolRegistry.js';
import {tryRouteSnowToolCall} from './toolRouter.js';

test('tryRouteSnowToolCall routes by toolId before public name', async t => {
	const snapshot = buildToolRegistrySnapshot([
		{
			toolId: 'snow_builtin:filesystem:read',
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

	const routed = await tryRouteSnowToolCall(
		snapshot,
		{
			id: 'call-1',
			toolId: 'snow_builtin:filesystem:read',
			publicName: 'renamed-tool',
			argumentsText: '{}',
		},
		{},
		{
			snow_builtin: async spec => spec.publicName,
		},
	);

	t.true(routed.matched);
	if (routed.matched) {
		t.is(routed.result, 'filesystem-read');
	}
});

test('tryRouteSnowToolCall returns unmatched when tool is not registered', async t => {
	const snapshot = buildToolRegistrySnapshot([]);
	const routed = await tryRouteSnowToolCall(
		snapshot,
		{
			id: 'call-2',
			publicName: 'missing-tool',
			argumentsText: '{}',
		},
		{},
		{},
	);

	t.deepEqual(routed, {matched: false});
});
