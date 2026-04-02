import test from 'ava';

import {buildStreamRequestContext} from './streamFactory.js';

test('build stream request context applies ::Time bridge with resolved VCP chat method', t => {
	const messages = [
		{
			role: 'system' as const,
			content: '[[Nova日记本::Time]]',
		},
		{
			role: 'user' as const,
			content: '查一下昨天的日记',
		},
		{
			role: 'assistant' as const,
			content: '好的。',
		},
		{
			role: 'user' as const,
			content: '继续查一下',
		},
	];

	const {resolvedRequest, transformedMessages} = buildStreamRequestContext({
		config: {
			baseUrl: 'http://127.0.0.1:6005/v1',
			backendMode: 'vcp',
			requestMethod: 'responses',
		},
		model: 'gpt-5',
		conversationMessages: messages,
		activeTools: [],
	});

	t.is(resolvedRequest.requestMethod, 'chat');
	t.true(
		(transformedMessages[transformedMessages.length - 1]?.content || '').includes(
			'补充时间上下文：本轮 ::Time 检索沿用上一轮用户提到的"昨天"。',
		),
	);
});

test('build stream request context keeps native non-chat requests untouched', t => {
	const messages = [
		{
			role: 'system' as const,
			content: '[[Nova日记本::Time]]',
		},
		{
			role: 'user' as const,
			content: '继续查一下',
		},
	];

	const {resolvedRequest, transformedMessages} = buildStreamRequestContext({
		config: {
			baseUrl: 'http://127.0.0.1:6005/v1',
			backendMode: 'native',
			requestMethod: 'responses',
		},
		model: 'gpt-5',
		conversationMessages: messages,
		activeTools: [],
	});

	t.is(resolvedRequest.requestMethod, 'responses');
	t.is(transformedMessages, messages);
});
