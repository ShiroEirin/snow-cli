import test from 'ava';

import {
	projectToolMessageForContext,
	projectToolMessagesForContext,
} from './toolMessageProjection.js';

test('projectToolMessageForContext truncates oversized tool content', t => {
	const projected = projectToolMessageForContext({
		role: 'tool',
		content: `${'line\n'.repeat(32)}tail`,
	});

	t.true(projected.content.includes('[projected tool context truncated]'));
});

test('projectToolMessagesForContext keeps same-content tool results separate across distinct tool ids', t => {
	const projected = projectToolMessagesForContext([
		{
			role: 'tool',
			tool_call_id: 'tool-a',
			content: '{"content":"same payload"}',
		},
		{
			role: 'tool',
			tool_call_id: 'tool-b',
			content: '{"content":"same payload"}',
		},
	]);

	t.is(projected[0]?.content, '{"content":"same payload"}');
	t.is(projected[1]?.content, '{"content":"same payload"}');
});

test('projectToolMessagesForContext still collapses duplicated repeats for the same tool id', t => {
	const projected = projectToolMessagesForContext([
		{
			role: 'tool',
			tool_call_id: 'tool-a',
			content: '{"content":"same payload"}',
		},
		{
			role: 'tool',
			tool_call_id: 'tool-a',
			content: '{"content":"same payload"}',
		},
	]);

	t.is(projected[1]?.content, '[duplicate tool context omitted ×2]');
});
