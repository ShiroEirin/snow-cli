import test from 'ava';

import {
	resolveVcpGatewayModelFetchMethod,
	resolveVcpGatewayRequest,
	shouldUseVcpGateway,
} from './gateway.js';

const TOOL = {
	type: 'function' as const,
	function: {
		name: 'demo_tool',
		description: 'demo',
		parameters: {
			type: 'object',
			properties: {},
		},
	},
};

test('keep original request routing when VCP gateway is disabled', t => {
	const resolution = resolveVcpGatewayRequest(
		{
			baseUrl: 'https://api.example.com/v1',
			requestMethod: 'anthropic',
			enableVcpGateway: false,
		},
		{
			model: 'claude-3-7-sonnet',
			tools: [TOOL],
			toolChoice: 'auto',
		},
	);

	t.false(resolution.enabled);
	t.is(resolution.requestMethod, 'anthropic');
	t.deepEqual(resolution.tools, [TOOL]);
	t.is(resolution.toolChoice, 'auto');
});

test('auto-enable VCP gateway on localhost endpoints', t => {
	t.true(
		shouldUseVcpGateway({
			baseUrl: 'http://localhost:8080/v1',
			requestMethod: 'responses',
		}),
	);
	t.false(
		shouldUseVcpGateway({
			baseUrl: 'https://api.example.com/v1',
			requestMethod: 'responses',
		}),
	);
});

test('route anthropic-like models through chat and strip tools in gateway mode', t => {
	const resolution = resolveVcpGatewayRequest(
		{
			baseUrl: 'http://127.0.0.1:5432/v1',
			requestMethod: 'anthropic',
		},
		{
			model: 'claude-3-opus',
			tools: [TOOL],
			toolChoice: 'auto',
		},
	);

	t.true(resolution.enabled);
	t.is(resolution.requestMethod, 'chat');
	t.is(resolution.tools, undefined);
	t.is(resolution.toolChoice, undefined);
});

test('keep tools for gemini-like models in gateway mode', t => {
	const resolution = resolveVcpGatewayRequest(
		{
			baseUrl: 'http://localhost:8080/v1',
			requestMethod: 'gemini',
		},
		{
			model: 'gemini-2.5-pro',
			tools: [TOOL],
			toolChoice: 'auto',
		},
	);

	t.true(resolution.enabled);
	t.is(resolution.requestMethod, 'chat');
	t.deepEqual(resolution.tools, [TOOL]);
	t.is(resolution.toolChoice, 'auto');
});

test('force-enable gateway on remote endpoints when explicitly configured', t => {
	const resolution = resolveVcpGatewayRequest(
		{
			baseUrl: 'https://vcp.example.com/v1',
			requestMethod: 'responses',
			enableVcpGateway: true,
		},
		{
			model: 'gpt-5',
		},
	);

	t.true(resolution.enabled);
	t.is(resolution.requestMethod, 'chat');
});

test('fetch models through chat endpoint when gateway is active', t => {
	t.is(
		resolveVcpGatewayModelFetchMethod({
			baseUrl: 'http://localhost:8080/v1',
			requestMethod: 'anthropic',
		}),
		'chat',
	);
	t.is(
		resolveVcpGatewayModelFetchMethod({
			baseUrl: 'https://api.example.com/v1',
			requestMethod: 'anthropic',
			enableVcpGateway: false,
		}),
		'anthropic',
	);
});
