import anyTest from 'ava';

const test = anyTest as any;

import {countMessagesTokens} from '../core/subAgentContextCompressor.js';
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

	const {resolvedRequest, transformedMessages} = buildSubAgentStreamRequestContext({
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

test('subagent outbound transforms stay off in VCP local-tools mode', (t: any) => {
	t.false(
		shouldApplySubAgentOutboundTransforms({
			backendMode: 'vcp',
			toolTransport: 'local',
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
