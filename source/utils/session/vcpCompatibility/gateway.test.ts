import test from 'ava';

import {
	resolveVcpGatewayModelFetchMethod,
	resolveVcpGatewayRequest,
	shouldSanitizeVcpGatewayTools,
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

const COMPLEX_TOOL = {
	type: 'function' as const,
	function: {
		name: 'filesystem-read',
		description: 'demo',
		parameters: {
			type: 'object',
			properties: {
				filePath: {
					oneOf: [
						{
							type: 'string',
						},
						{
							type: 'array',
							items: {
								type: 'string',
							},
						},
						{
							type: 'array',
							items: {
								type: 'object',
								properties: {
									path: {
										type: 'string',
									},
								},
								required: ['path'],
							},
						},
					],
					description: 'File path(s)',
				},
				contextLines: {
					type: 'number',
					default: 8,
				},
			},
			required: ['filePath'],
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

test('route anthropic-like models through chat and keep tools in gateway mode', t => {
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
	t.deepEqual(resolution.tools, [
		{
			type: 'function',
			function: {
				name: 'demo_tool',
				description: 'demo',
				parameters: {
					type: 'object',
					properties: {
						_noop: {
							type: 'string',
							description:
								'Optional placeholder for zero-argument tool compatibility on Anthropic-style VCP gateways. Omit during normal use.',
						},
					},
					required: [],
				},
			},
		},
	]);
	t.is(resolution.toolChoice, 'auto');
});

test('sanitize anthropic-compatible tool schemas in gateway mode', t => {
	const resolution = resolveVcpGatewayRequest(
		{
			baseUrl: 'http://127.0.0.1:5432/v1',
			requestMethod: 'anthropic',
		},
		{
			model: 'claude-3-opus',
			tools: [COMPLEX_TOOL],
			toolChoice: 'auto',
		},
	);

	t.deepEqual(resolution.tools, [
		{
			type: 'function',
			function: {
				name: 'filesystem-read',
				description: 'demo',
				parameters: {
					type: 'object',
					properties: {
						filePath: {
							type: ['string', 'array'],
							description: 'File path(s)',
						},
						contextLines: {
							type: 'number',
						},
					},
					required: ['filePath'],
				},
			},
		},
	]);
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

test('only sanitize tool schemas for anthropic-compatible gateway requests', t => {
	t.true(
		shouldSanitizeVcpGatewayTools(
			{
				baseUrl: 'http://localhost:8080/v1',
				requestMethod: 'chat',
			},
			{
				model: 'claude-opus-4-6',
				tools: [TOOL],
			},
		),
	);

	t.false(
		shouldSanitizeVcpGatewayTools(
			{
				baseUrl: 'http://localhost:8080/v1',
				requestMethod: 'gemini',
			},
			{
				model: 'gemini-2.5-pro',
				tools: [TOOL],
			},
		),
	);
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
