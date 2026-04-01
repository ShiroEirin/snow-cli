import test from 'ava';

import {buildHistoryToolMessage} from './toolResultHistory.js';

test('buildHistoryToolMessage prefers summarized history content for persistence', t => {
	const message = buildHistoryToolMessage(
		{
			tool_call_id: 'tool-1',
			role: 'tool',
			content: 'raw tool result',
			historyContent: 'summarized tool result',
		},
		'success',
	);

	t.is(message.content, 'summarized tool result');
	t.is(message.messageStatus, 'success');
	t.false('historyContent' in message);
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
