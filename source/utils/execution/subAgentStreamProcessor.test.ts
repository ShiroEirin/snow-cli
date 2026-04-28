import anyTest from 'ava';

const test = anyTest as any;

import {
	countMessagesTokens,
	resolveSubAgentCompressionRequestMethod,
} from '../core/subAgentContextCompressor.js';
import {projectToolMessagesForContext} from '../session/toolMessageProjection.js';
import {
	buildSubAgentStreamRequestContext,
	processStreamEvents,
	shouldApplySubAgentOutboundTransforms,
} from './subAgentStreamProcessor.js';

async function* emptyStream() {}

test('processStreamEvents counts raw subagent messages for compression fallback', async (t: any) => {
	const longToolContent = `${'line\n'.repeat(80)}tail`;
	const ctx = {
		agent: {name: 'Explore Agent'},
		messages: [
			{role: 'user', content: 'read the requested files'},
			{role: 'tool', content: longToolContent},
		],
		latestTotalTokens: 0,
	} as any;

	await processStreamEvents(ctx, emptyStream(), {maxContextTokens: 1_000_000});

	const rawTokens = countMessagesTokens(ctx.messages);
	const projectedTokens = countMessagesTokens(
		projectToolMessagesForContext(ctx.messages),
	);

	t.is(ctx.latestTotalTokens, rawTokens);
	t.true(rawTokens > projectedTokens);
});

test('buildSubAgentStreamRequestContext keeps vcp chat forcing without older-message projection', (t: any) => {
	const messages = [
		{role: 'assistant', content: '<div>older assistant</div>'},
		{role: 'assistant', content: 'assistant 1'},
		{role: 'assistant', content: 'assistant 2'},
		{role: 'assistant', content: 'assistant 3'},
		{role: 'assistant', content: 'assistant 4'},
		{role: 'assistant', content: 'assistant 5'},
		{role: 'assistant', content: 'assistant 6'},
		{role: 'assistant', content: 'assistant 7'},
	] as any;

	const {resolvedRequest, transformedMessages} =
		buildSubAgentStreamRequestContext({
			config: {
				backendMode: 'vcp',
				requestMethod: 'responses',
				baseUrl: 'http://127.0.0.1:6005/v1',
			},
			model: 'glm-5',
			messages,
			allowedTools: [],
		});

	t.is(resolvedRequest.requestMethod, 'chat');
	t.is(transformedMessages[0]?.content, '<div>older assistant</div>');
});

test('subagent outbound transforms stay on in every VCP tool mode', (t: any) => {
	t.true(
		shouldApplySubAgentOutboundTransforms({
			backendMode: 'vcp',
			toolTransport: 'local',
		}),
	);
	t.true(
		shouldApplySubAgentOutboundTransforms({
			backendMode: 'vcp',
		}),
	);
});

test('subagent outbound transforms stay on for bridge and hybrid tool modes', (t: any) => {
	t.true(
		shouldApplySubAgentOutboundTransforms({
			backendMode: 'vcp',
			toolTransport: 'bridge',
		}),
	);
	t.true(
		shouldApplySubAgentOutboundTransforms({
			backendMode: 'vcp',
			toolTransport: 'hybrid',
		}),
	);
});

test('subagent local VCP keeps chat compatibility transforms without bridge projection', (t: any) => {
	const messages = [
		{role: 'user', content: '昨天帮我查过日报'},
		{role: 'assistant', content: '已记录。'},
		{role: 'user', content: '继续用 {{Diary::Time}} 查一下'},
	] as any;

	const {transformedMessages} = buildSubAgentStreamRequestContext({
		config: {
			backendMode: 'vcp',
			requestMethod: 'responses',
			toolTransport: 'local',
			baseUrl: 'http://127.0.0.1:6005/v1',
		},
		model: 'glm-5',
		messages,
		allowedTools: [],
	});

	t.true(
		String(transformedMessages.at(-1)?.content).includes('补充时间上下文'),
	);
});

test('subagent compression request method follows VCP route resolution', (t: any) => {
	t.is(
		resolveSubAgentCompressionRequestMethod({
			backendMode: 'vcp',
			requestMethod: 'responses',
			model: 'glm-5',
		}),
		'chat',
	);
	t.is(
		resolveSubAgentCompressionRequestMethod({
			backendMode: 'native',
			requestMethod: 'responses',
			model: 'gpt-5',
		}),
		'responses',
	);
});
