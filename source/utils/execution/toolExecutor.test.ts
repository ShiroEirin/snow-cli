import anyTest from 'ava';

const test = anyTest as any;

import {
	createTeamUserQuestionAdapter,
	executeToolCall,
	type ToolCall,
} from './toolExecutor.js';

test('team askuser adapter preserves cancelled responses', async (t: any) => {
	const adapter = createTeamUserQuestionAdapter(
		async (_question, _options, _multiSelect) => ({
			selected: 'skip',
			customInput: 'user cancelled from main session',
			cancelled: true,
		}),
	);

	const response = await adapter?.('Continue?', ['yes', 'no'], false);

	t.deepEqual(response, {
		selected: 'skip',
		customInput: 'user cancelled from main session',
		cancelled: true,
	});
});

test('tool_search bypasses regular execution binding lookup', async (t: any) => {
	const toolCall: ToolCall = {
		id: 'tool-search-call',
		type: 'function',
		function: {
			name: 'tool_search',
			arguments: JSON.stringify({query: 'subagent filesystem'}),
		},
	};

	const result = await executeToolCall(toolCall);

	t.is(result.tool_call_id, 'tool-search-call');
	t.false(result.content.startsWith('Error:'));
	t.true(result.content.includes('subagent filesystem'));
});
