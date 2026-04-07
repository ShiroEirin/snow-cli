import test from 'ava';

import {
	buildConversationToolMessage,
	buildHistoryToolMessage,
	projectToolMessagesForContext,
	projectToolMessageForContext,
} from '../../../utils/session/toolMessageProjection.js';

test('buildHistoryToolMessage preserves raw content while keeping summary sidecar', t => {
	const message = buildHistoryToolMessage(
		{
			tool_call_id: 'tool-1',
			role: 'tool',
			content: 'raw tool result',
			historyContent: 'summarized tool result',
			previewContent: '{"summary":"ui preview"}',
		},
		'success',
	);

	t.is(message.content, 'raw tool result');
	t.is(message.historyContent, 'summarized tool result');
	t.is(message.previewContent, '{"summary":"ui preview"}');
	t.is(message.messageStatus, 'success');
});

test('buildHistoryToolMessage falls back to raw content when no summary exists', t => {
	const message = buildHistoryToolMessage({
		tool_call_id: 'tool-2',
		role: 'tool',
		content: 'raw tool result',
	});

	t.is(message.content, 'raw tool result');
	t.false('messageStatus' in message);
});

test('buildConversationToolMessage projects summarized content for model context', t => {
	const message = buildConversationToolMessage(
		{
			tool_call_id: 'tool-3',
			role: 'tool',
			content: 'raw tool result',
			historyContent: 'summarized tool result',
			previewContent: '{"summary":"ui preview"}',
		},
		'success',
	);

	t.is(message.content, 'summarized tool result');
	t.is(message.historyContent, 'summarized tool result');
	t.is(message.previewContent, '{"summary":"ui preview"}');
	t.is(message.messageStatus, 'success');
});

test('buildConversationToolMessage falls back to raw content when no summary exists', t => {
	const message = buildConversationToolMessage({
		tool_call_id: 'tool-3b',
		role: 'tool',
		content: 'raw tool result',
	});

	t.is(message.content, 'raw tool result');
	t.false('messageStatus' in message);
});

test('projectToolMessageForContext uses summarized tool content only for tool messages', t => {
	const projectedToolMessage = projectToolMessageForContext({
		tool_call_id: 'tool-4',
		role: 'tool',
		content: 'raw tool result',
		historyContent: 'summarized tool result',
		previewContent: '{"summary":"ui preview"}',
	});

	t.is(projectedToolMessage.content, 'summarized tool result');
	t.is(projectedToolMessage.historyContent, 'summarized tool result');
	t.is(projectedToolMessage.previewContent, '{"summary":"ui preview"}');

	const projectedWithoutHistory = projectToolMessageForContext({
		tool_call_id: 'tool-4b',
		role: 'tool',
		content: 'raw tool result',
		previewContent: '{"summary":"ui preview"}',
	});

	t.is(projectedWithoutHistory.content, 'raw tool result');
	t.is(projectedWithoutHistory.previewContent, '{"summary":"ui preview"}');

	const projectedAssistantMessage = projectToolMessageForContext({
		role: 'assistant',
		content: 'assistant text',
		historyContent: 'should not be used',
	});

	t.is(projectedAssistantMessage.content, 'assistant text');
});

test('projectToolMessagesForContext deduplicates repeated tool summaries for the same tool call', t => {
	const projectedMessages = projectToolMessagesForContext([
		{
			tool_call_id: 'tool-dup',
			role: 'tool',
			content: 'raw 1',
			historyContent: 'same tool summary',
		},
		{
			tool_call_id: 'tool-dup',
			role: 'tool',
			content: 'raw 2',
			historyContent: 'same tool summary',
		},
	] as any);

	t.is(projectedMessages[0]?.content, 'same tool summary');
	t.is(projectedMessages[1]?.content, '[duplicate tool context omitted ×2]');
});

test('projectToolMessagesForContext keeps identical summaries from different tool calls', t => {
	const projectedMessages = projectToolMessagesForContext([
		{
			tool_call_id: 'tool-a',
			role: 'tool',
			content: 'raw 1',
			historyContent: 'same tool summary',
		},
		{
			tool_call_id: 'tool-b',
			role: 'tool',
			content: 'raw 2',
			historyContent: 'same tool summary',
		},
	] as any);

	t.is(projectedMessages[0]?.content, 'same tool summary');
	t.is(projectedMessages[1]?.content, 'same tool summary');
});

test('projectToolMessagesForContext enforces a total projection budget across tool messages', t => {
	const oversizedSummary = Array.from({length: 220}, () => '0123456789').join('');
	const projectedMessages = projectToolMessagesForContext([
		{
			role: 'tool',
			content: oversizedSummary,
			historyContent: `first ${oversizedSummary}`,
		},
		{
			role: 'tool',
			content: oversizedSummary,
			historyContent: `second ${oversizedSummary}`,
		},
		{
			role: 'tool',
			content: oversizedSummary,
			historyContent: `third ${oversizedSummary}`,
		},
		{
			role: 'tool',
			content: oversizedSummary,
			historyContent: `fourth ${oversizedSummary}`,
		},
		{
			role: 'tool',
			content: oversizedSummary,
			historyContent: `fifth ${oversizedSummary}`,
		},
	] as any);

	t.true(
		projectedMessages.some(message =>
			message.content.includes('[tool context omitted: projection budget exceeded]') ||
			message.content.includes('[tool context truncated by projection budget]'),
		),
	);
});
