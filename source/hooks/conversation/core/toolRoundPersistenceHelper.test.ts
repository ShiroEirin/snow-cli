import test from 'ava';

import {
	projectToolResultForPersistence,
	resolveToolResultMessageStatus,
} from './toolRoundPersistenceHelper.js';

test('projectToolResultForPersistence keeps conversation and history projections aligned', t => {
	const {conversationMessage, historyMessage} = projectToolResultForPersistence(
		{
			tool_call_id: 'tool-1',
			role: 'tool',
			content: 'raw tool result',
			historyContent: 'summarized tool result',
			previewContent: '{"summary":"ui preview"}',
		},
		'success',
		{projectConversationMessage: true},
	);

	t.is(conversationMessage.content, 'summarized tool result');
	t.is(conversationMessage.historyContent, 'summarized tool result');
	t.is(conversationMessage.previewContent, '{"summary":"ui preview"}');
	t.is(conversationMessage.messageStatus, 'success');

	t.is(historyMessage.content, 'raw tool result');
	t.is(historyMessage.historyContent, 'summarized tool result');
	t.is(historyMessage.previewContent, '{"summary":"ui preview"}');
	t.is(historyMessage.messageStatus, 'success');
});

test('projectToolResultForPersistence can keep raw conversation tool content when projection is disabled', t => {
	const {conversationMessage, historyMessage} = projectToolResultForPersistence(
		{
			tool_call_id: 'tool-1',
			role: 'tool',
			content: 'raw tool result',
			historyContent: 'summarized tool result',
			previewContent: '{"summary":"ui preview"}',
		},
		'success',
		{projectConversationMessage: false},
	);

	t.is(conversationMessage.content, 'raw tool result');
	t.is(conversationMessage.historyContent, 'summarized tool result');
	t.is(conversationMessage.previewContent, '{"summary":"ui preview"}');
	t.is(historyMessage.content, 'raw tool result');
});

test('projectToolResultForPersistence defaults to raw conversation content for vcp local config', t => {
	const {conversationMessage, historyMessage} = projectToolResultForPersistence(
		{
			tool_call_id: 'tool-1',
			role: 'tool',
			content: 'raw tool result',
			historyContent: 'summarized tool result',
			previewContent: '{"summary":"ui preview"}',
		},
		'success',
		{
			config: {
				backendMode: 'vcp',
				toolTransport: 'local',
			},
		},
	);

	t.is(conversationMessage.content, 'raw tool result');
	t.is(conversationMessage.historyContent, 'summarized tool result');
	t.is(historyMessage.content, 'raw tool result');
});

test('resolveToolResultMessageStatus marks executor errors as error messages', t => {
	t.is(
		resolveToolResultMessageStatus({content: 'Error: Tool execution aborted by user'}),
		'error',
	);
	t.is(
		resolveToolResultMessageStatus({content: '{"ok":true}'}),
		'success',
	);
});
