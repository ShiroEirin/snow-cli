import test from 'ava';

import {
	buildConversationToolMessage,
	buildHistoryToolMessage,
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
