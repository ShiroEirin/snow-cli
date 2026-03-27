import test from 'ava';
import {buildToolRegistrySnapshot} from '../../tooling/core/toolRegistry.js';
import {buildLocalToolSpecs} from '../../tooling/core/toolProviders/localProvider.js';
import {buildMcpToolSpecs} from '../../tooling/core/toolProviders/mcpProvider.js';
import {hydrateSessionToolIdentity} from './toolIdentityHydrator.js';

test('hydrateSessionToolIdentity backfills toolId and publicName for legacy local session messages', t => {
	const registry = buildToolRegistrySnapshot(
		buildLocalToolSpecs([
			{
				serviceName: 'filesystem',
				publicName: 'filesystem-read',
				originName: 'read',
				description: 'Read file',
				inputSchema: {type: 'object'},
			},
		]),
	);

	const messages: any[] = [
		{
			role: 'assistant',
			content: '',
			tool_calls: [
				{
					id: 'call-1',
					type: 'function',
					function: {
						name: 'filesystem-read',
						arguments: '{"filePath":"README.md"}',
					},
				},
			],
		},
		{
			role: 'tool',
			tool_call_id: 'call-1',
			content: 'ok',
		},
	];

	const changed = hydrateSessionToolIdentity(messages, registry);

	t.true(changed);
	t.truthy(messages[0].tool_calls[0].toolId);
	t.is(messages[0].tool_calls[0].publicName, 'filesystem-read');
	t.is(messages[0].tool_calls[0].rawName, 'filesystem-read');
	t.is(messages[1].toolId, messages[0].tool_calls[0].toolId);
	t.is(messages[1].name, 'filesystem-read');
});

test('hydrateSessionToolIdentity upgrades external mcp tool names through registry aliases', t => {
	const registry = buildToolRegistrySnapshot(
		buildMcpToolSpecs('servercode', [
			{
				name: 'search',
				description: 'Search code',
				inputSchema: {type: 'object'},
			},
		]),
	);

	const messages: any[] = [
		{
			role: 'assistant',
			content: '',
			tool_calls: [
				{
					id: 'call-1',
					type: 'function',
					publicName: 'servercode-search',
					function: {
						name: 'servercode-search',
						arguments: '{"query":"todo"}',
					},
				},
			],
		},
	];

	const changed = hydrateSessionToolIdentity(messages, registry);

	t.true(changed);
	t.truthy(messages[0].tool_calls[0].toolId);
	t.is(messages[0].tool_calls[0].publicName, 'servercode-search');
	t.is(messages[0].tool_calls[0].rawName, 'servercode-search');
});
