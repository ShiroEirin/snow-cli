import test from 'ava';

import {applyVcpOutboundMessageTransforms} from './applyOutboundMessageTransforms.js';
import {
	applyVcpTimeSyntaxBridge,
	shouldApplyVcpTimeBridge,
} from './timeContextBridge.js';

test('bridge follow-up ::Time query with previous user time anchor', t => {
	const messages = [
		{
			role: 'system' as const,
			content: '你可以使用 [[Nova日记本::Time]] 来检索日记。',
		},
		{
			role: 'user' as const,
			content: '查一下昨天的日记',
		},
		{
			role: 'assistant' as const,
			content: '我先帮你看看。',
		},
		{
			role: 'user' as const,
			content: '继续查一下',
		},
	];

	t.true(
		shouldApplyVcpTimeBridge(
			{
				baseUrl: 'http://localhost:8080/v1',
				requestMethod: 'chat',
			},
			messages,
		),
	);

	const bridgedMessages = applyVcpTimeSyntaxBridge(messages);
	const lastUserMessage = bridgedMessages[bridgedMessages.length - 1];

	t.not(lastUserMessage, messages[messages.length - 1]);
	t.true(
		(lastUserMessage?.content || '').includes(
			'补充时间上下文：本轮 ::Time 检索沿用上一轮用户提到的"昨天"。',
		),
	);
});

test('do not bridge VCP system invitation user messages', t => {
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
			content: '[系统邀请指令:]继续沿用刚才的时间范围',
		},
	];

	const bridgedMessages = applyVcpTimeSyntaxBridge(messages);
	t.is(bridgedMessages, messages);
});

test('do not apply ::Time bridge on remote endpoints unless explicitly enabled', t => {
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

	t.false(
		shouldApplyVcpTimeBridge(
			{
				baseUrl: 'https://api.example.com/v1',
				requestMethod: 'chat',
			},
			messages,
		),
	);

	const transformedMessages = applyVcpOutboundMessageTransforms({
		config: {
			baseUrl: 'https://api.example.com/v1',
			requestMethod: 'chat',
		},
		messages,
	});

	t.is(transformedMessages, messages);
});

test('allow explicit ::Time bridge enablement on remote endpoints', t => {
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

	t.true(
		shouldApplyVcpTimeBridge(
			{
				baseUrl: 'https://api.example.com/v1',
				requestMethod: 'chat',
				enableVcpTimeBridge: true,
			},
			messages,
		),
	);

	const transformedMessages = applyVcpOutboundMessageTransforms({
		config: {
			baseUrl: 'https://api.example.com/v1',
			requestMethod: 'chat',
			enableVcpTimeBridge: true,
		},
		messages,
	});

	t.true(
		(transformedMessages[transformedMessages.length - 1]?.content || '').includes(
			'补充时间上下文：本轮 ::Time 检索沿用上一轮用户提到的"昨天"。',
		),
	);
});

test('do not apply ::Time bridge for non-chat requests', t => {
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

	t.false(
		shouldApplyVcpTimeBridge(
			{
				baseUrl: 'http://localhost:8080/v1',
				requestMethod: 'responses',
			},
			messages,
		),
	);
});

test('do not bridge ::Time syntax discussion prompts', t => {
	const messages = [
		{
			role: 'system' as const,
			content: '[[Nova日记本::Time]]',
		},
		{
			role: 'user' as const,
			content: 'role.md 里的 [[Nova日记本::Time]] 语法是什么意思？',
		},
	];

	const bridgedMessages = applyVcpTimeSyntaxBridge(messages);
	t.is(bridgedMessages, messages);
});

test('do not bridge when the latest assistant reply already contains a time anchor', t => {
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
			content: '昨天的记录我已经定位到了。',
		},
		{
			role: 'user' as const,
			content: '继续查一下',
		},
	];

	const bridgedMessages = applyVcpTimeSyntaxBridge(messages);
	t.is(bridgedMessages, messages);
});

test('expand recent time windows directly in the current user message', t => {
	const messages = [
		{
			role: 'system' as const,
			content: '[[Nova日记本::Time]]',
		},
		{
			role: 'user' as const,
			content: '查一下最近的日记',
		},
	];

	const bridgedMessages = applyVcpTimeSyntaxBridge(messages);
	const lastUserMessage = bridgedMessages[bridgedMessages.length - 1];

	t.not(lastUserMessage, messages[messages.length - 1]);
	t.true(
		(lastUserMessage?.content || '').includes(
			'补充时间上下文：本轮 ::Time 检索按近7天时间窗理解：今天、昨天、前天、大前天、4天前、5天前、6天前。',
		),
	);
});

test('carry expanded recent time windows for english follow-up queries', t => {
	const messages = [
		{
			role: 'system' as const,
			content: '[[Nova日记本::Time]]',
		},
		{
			role: 'user' as const,
			content: 'show recently diary notes',
		},
		{
			role: 'assistant' as const,
			content: 'ok',
		},
		{
			role: 'user' as const,
			content: 'follow-up please',
		},
	];

	const bridgedMessages = applyVcpTimeSyntaxBridge(messages);
	const lastUserMessage = bridgedMessages[bridgedMessages.length - 1];

	t.true(
		(lastUserMessage?.content || '').includes(
			'补充时间上下文：本轮 ::Time 检索沿用上一轮的recent 7-day window：today, yesterday, 2 days ago, 3 days ago, 4 days ago, 5 days ago, 6 days ago。',
		),
	);
});

test('respect allowTimeBridge=false when outbound transforms are applied', t => {
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

	const transformedMessages = applyVcpOutboundMessageTransforms({
		config: {
			baseUrl: 'http://localhost:8080/v1',
			requestMethod: 'chat',
		},
		messages,
		allowTimeBridge: false,
	});

	t.is(transformedMessages, messages);
});
