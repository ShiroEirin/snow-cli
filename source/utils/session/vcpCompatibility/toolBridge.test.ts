import test from 'ava';

import {mapBridgePluginsToTools} from './toolBridge.js';

test('map bridge plugins into Snow tool schemas', t => {
	const mapped = mapBridgePluginsToTools([
		{
			name: 'DailyNote',
			displayName: '日记系统',
			description: '创建和更新日记。',
			bridgeCommands: [
				{
					commandName: 'create',
					description: '创建一篇新的日记。',
					parameters: [
						{name: 'maid', type: 'string', required: true},
						{name: 'Date', type: 'string', required: true},
						{name: 'Content', type: 'string', required: true},
					],
				},
				{
					commandName: 'update',
					description: '更新现有日记。',
					parameters: [
						{name: 'target', type: 'string', required: true},
						{name: 'replace', type: 'string', required: true},
					],
				},
			],
		},
	]);

	t.is(mapped.tools.length, 1);
	t.is(mapped.tools[0]?.function.name, 'DailyNote');
	t.true(mapped.tools[0]?.function.description.includes('Commands: create, update'));

	const schema = mapped.tools[0]?.function.parameters as Record<string, any>;
	t.is(schema['type'], 'object');
	t.true(schema['additionalProperties']);
	t.deepEqual(schema['required'], ['command']);
	t.deepEqual(schema['properties']?.command?.enum, ['create', 'update']);
	t.is(schema['properties']?.maid?.type, 'string');
	t.is(schema['properties']?.target?.type, 'string');
});

test('preserve stable bridge tool identity and capability tags', t => {
	const mapped = mapBridgePluginsToTools(
		[
			{
				name: 'DailyNote',
				originName: 'DailyNoteManager',
				toolId: 'vcp_bridge:snowbridge:dailynotemanager',
				displayName: '日记系统',
				description: '创建和更新日记。',
				capabilityTags: ['custom_tag'],
				bridgeCommands: [{commandName: 'create'}],
			},
		],
		{
			cancelVcpTool: true,
			asyncCallbacks: true,
			statusEvents: true,
		},
	);

	const definition = mapped.definitions.get('DailyNote');
	t.truthy(definition);
	t.is(definition?.toolId, 'vcp_bridge:snowbridge:dailynotemanager');
	t.is(definition?.originName, 'DailyNoteManager');
	t.true(definition?.capabilityTags.includes('custom_tag') || false);
	t.true(definition?.capabilityTags.includes('single_command') || false);
	t.true(definition?.capabilityTags.includes('cancellable') || false);
	t.true(definition?.capabilityTags.includes('async_callback') || false);
	t.true(definition?.capabilityTags.includes('status_events') || false);
});

test('deduplicate duplicate bridge plugin names', t => {
	const mapped = mapBridgePluginsToTools([
		{
			name: 'Randomness',
			description: '随机工具',
			bridgeCommands: [{commandName: 'rollDice'}],
		},
		{
			name: 'Randomness',
			description: '另一个随机工具',
			bridgeCommands: [{commandName: 'drawTarot'}],
		},
	]);

	t.deepEqual(
		mapped.tools.map(tool => tool.function.name),
		['Randomness', 'Randomness_2'],
	);
});

test('simplify single-command bridge plugins into direct tool schemas', t => {
	const mapped = mapBridgePluginsToTools([
		{
			name: 'ServerCodeSearcher',
			displayName: '代码搜索器',
			description: '高性能代码搜索。',
			bridgeCommands: [
				{
					commandName: 'SearchCode',
					parameters: [
						{name: 'workspaceRoot', type: 'string', required: true},
						{name: 'query', type: 'string', required: true},
						{name: 'maxResults', type: 'integer'},
					],
				},
			],
		},
	]);

	t.is(mapped.tools.length, 1);
	t.is(mapped.tools[0]?.function.name, 'ServerCodeSearcher');
	t.true(
		mapped.tools[0]?.function.description.includes(
			'Command: SearchCode. Pass the needed top-level fields directly.',
		),
	);

	const schema = mapped.tools[0]?.function.parameters as Record<string, any>;
	t.is(schema['type'], 'object');
	t.true(schema['additionalProperties']);
	t.deepEqual(schema['required'], ['workspaceRoot', 'query']);
	t.falsy(schema['properties']?.command);
	t.is(schema['properties']?.workspaceRoot?.type, 'string');
	t.is(schema['properties']?.query?.type, 'string');
	t.is(schema['properties']?.maxResults?.type, 'integer');
});
