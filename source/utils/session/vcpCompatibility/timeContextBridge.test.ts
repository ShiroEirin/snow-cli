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

test('do not bridge when the latest assistant reply already mentions time words', t => {
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
			content:
				'当前看来 `::Time` 对明确时间词（今天/昨天）较稳定，但对“最近几天”仍要谨慎。',
		},
		{
			role: 'user' as const,
			content: '继续查一下',
		},
	];

	const bridgedMessages = applyVcpTimeSyntaxBridge(messages);
	t.is(bridgedMessages, messages);
});

test('do not expand wide time words directly in the current user message', t => {
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
	t.is(bridgedMessages, messages);
});

test('carry english wide time anchors as raw phrases on follow-up queries', t => {
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
			'补充时间上下文：本轮 ::Time 检索沿用上一轮用户提到的"recently"。',
		),
	);
});

test('carry wide time anchors as raw phrases instead of expanding time windows', t => {
	const messages = [
		{
			role: 'system' as const,
			content: '[[Nova日记本::Time]]',
		},
		{
			role: 'user' as const,
			content: '查一下最近的日记',
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

	const bridgedMessages = applyVcpTimeSyntaxBridge(messages);
	const lastUserMessage = bridgedMessages[bridgedMessages.length - 1];

	t.true(
		(lastUserMessage?.content || '').includes(
			'补充时间上下文：本轮 ::Time 检索沿用上一轮用户提到的"最近"。',
		),
	);
	t.false((lastUserMessage?.content || '').includes('近7天时间窗'));
});

test(
	'do not bridge when the latest assistant reply already carries the same wide time phrase',
	t => {
	const messages = [
		{
			role: 'system' as const,
			content: '[[Nova日记本::Time]]',
		},
		{
			role: 'user' as const,
			content: '查一下最近几天关于 snow 魔改的日记',
		},
		{
			role: 'assistant' as const,
			content:
				'当前看来 `::Time` 对今天/昨天较稳定，但最近几天这种宽时间词还要继续验证。',
		},
		{
			role: 'user' as const,
			content: '继续，只看时间线',
		},
	];

	const bridgedMessages = applyVcpTimeSyntaxBridge(messages);
	t.is(bridgedMessages, messages);
	},
);

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
