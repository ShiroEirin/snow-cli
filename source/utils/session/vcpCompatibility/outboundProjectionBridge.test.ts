import test from 'ava';

import {applyVcpOutboundMessageTransforms} from './applyOutboundMessageTransforms.js';
import {
	applyOutboundProjectionBridge,
	projectOutboundMessageContent,
	sanitizeOutboundProjectionText,
	vcpOutboundProjectionTransform,
} from './outboundProjectionBridge.js';

test('sanitize outbound projection text strips html shells and protocol markers', t => {
	const sanitized = sanitizeOutboundProjectionText(
		'<think>hidden</think><div>visible</div>\n[系统邀请指令:继续]\ntool_name: old-protocol',
	);

	t.false(sanitized.includes('<div>'));
	t.false(sanitized.includes('系统邀请指令'));
	t.false(sanitized.includes('tool_name:'));
	t.true(sanitized.includes('hidden visible'));
});

test('project outbound message content truncates oversized older payloads into stable projection', t => {
	const projected = projectOutboundMessageContent(
		Array.from({length: 30}, (_, index) => `line ${index + 1}`).join('\n'),
	);

	t.true(projected.includes('[projected older context omitted:'));
	t.false(projected.includes('line 30'));
});

test('apply outbound projection keeps recent assistant/tool messages raw while compacting older ones', t => {
	const messages = [
		{role: 'system' as const, content: 'system'},
		{role: 'assistant' as const, content: '<div>older assistant</div>'},
		{
			role: 'tool' as const,
			content: 'raw tool payload',
			historyContent: '<b>older tool history</b>',
		},
		{role: 'assistant' as const, content: 'assistant 1'},
		{role: 'assistant' as const, content: 'assistant 2'},
		{role: 'assistant' as const, content: 'assistant 3'},
		{role: 'assistant' as const, content: 'assistant 4'},
		{role: 'assistant' as const, content: 'assistant 5'},
		{role: 'tool' as const, content: 'recent raw tool'},
	];

	const transformed = applyOutboundProjectionBridge(messages as any);

	t.not(transformed, messages);
	t.is(transformed[1]?.content, 'older assistant');
	t.is(transformed[2]?.content, 'older tool history');
	t.is(transformed[2]?.historyContent, 'older tool history');
	t.is(transformed[8]?.content, 'recent raw tool');
});

test('vcp outbound projection transform only activates for vcp chat mode', t => {
	t.false(
		vcpOutboundProjectionTransform.shouldApply({
			config: {
				backendMode: 'native',
				requestMethod: 'chat',
			},
			messages: Array.from({length: 8}, () => ({
				role: 'assistant',
				content: 'older assistant',
			})) as any,
		}),
	);
	t.false(
		vcpOutboundProjectionTransform.shouldApply({
			config: {
				backendMode: 'vcp',
				requestMethod: 'anthropic',
			},
			messages: Array.from({length: 8}, () => ({
				role: 'assistant',
				content: 'older assistant',
			})) as any,
		}),
	);
	t.true(
		vcpOutboundProjectionTransform.shouldApply({
			config: {
				backendMode: 'vcp',
				requestMethod: 'chat',
			},
			messages: Array.from({length: 8}, () => ({
				role: 'assistant',
				content: 'older assistant',
			})) as any,
		}),
	);
});

test('applyVcpOutboundMessageTransforms keeps helper disabled outside vcp chat mode', t => {
	const messages = [
		{role: 'assistant' as const, content: '<div>older assistant</div>'},
		{role: 'assistant' as const, content: 'assistant 1'},
		{role: 'assistant' as const, content: 'assistant 2'},
		{role: 'assistant' as const, content: 'assistant 3'},
		{role: 'assistant' as const, content: 'assistant 4'},
		{role: 'assistant' as const, content: 'assistant 5'},
		{role: 'assistant' as const, content: 'assistant 6'},
		{role: 'assistant' as const, content: 'assistant 7'},
	];

	const nativeTransformed = applyVcpOutboundMessageTransforms({
		config: {
			backendMode: 'native',
			requestMethod: 'chat',
		},
		messages: messages as any,
	});
	const nonChatTransformed = applyVcpOutboundMessageTransforms({
		config: {
			backendMode: 'vcp',
			requestMethod: 'anthropic',
		},
		messages: messages as any,
	});

	t.is(nativeTransformed[0]?.content, '<div>older assistant</div>');
	t.is(nonChatTransformed[0]?.content, '<div>older assistant</div>');
});

test('applyVcpOutboundMessageTransforms keeps projection disabled in vcp local mode', t => {
	const messages = [
		{role: 'assistant' as const, content: '<div>older assistant</div>'},
		{role: 'assistant' as const, content: 'assistant 1'},
		{role: 'assistant' as const, content: 'assistant 2'},
		{role: 'assistant' as const, content: 'assistant 3'},
		{role: 'assistant' as const, content: 'assistant 4'},
		{role: 'assistant' as const, content: 'assistant 5'},
		{role: 'assistant' as const, content: 'assistant 6'},
		{role: 'assistant' as const, content: 'assistant 7'},
	];

	const transformed = applyVcpOutboundMessageTransforms({
		config: {
			backendMode: 'vcp',
			toolTransport: 'local',
			requestMethod: 'chat',
		},
		messages: messages as any,
	});

	t.is(transformed[0]?.content, '<div>older assistant</div>');
});

test('applyVcpOutboundMessageTransforms respects allowProjectionBridge=false', t => {
	const messages = [
		{role: 'assistant' as const, content: '<div>older assistant</div>'},
		{role: 'assistant' as const, content: 'assistant 1'},
		{role: 'assistant' as const, content: 'assistant 2'},
		{role: 'assistant' as const, content: 'assistant 3'},
		{role: 'assistant' as const, content: 'assistant 4'},
		{role: 'assistant' as const, content: 'assistant 5'},
		{role: 'assistant' as const, content: 'assistant 6'},
		{role: 'assistant' as const, content: 'assistant 7'},
	];

	const transformed = applyVcpOutboundMessageTransforms({
		config: {
			backendMode: 'vcp',
			requestMethod: 'chat',
		},
		messages: messages as any,
		allowProjectionBridge: false,
	});

	t.is(transformed[0]?.content, '<div>older assistant</div>');
});
