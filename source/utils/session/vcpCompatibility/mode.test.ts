import anyTest from 'ava';

const test = anyTest as any;

import {
	isVcpModeEnabled,
	resolveVcpRequestHeaders,
	resolveVcpModeModelFetchMethod,
	resolveVcpModeRequest,
	shouldSanitizeVcpModeTools,
} from './mode.js';

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

test('keep original request routing when VCP mode is disabled', (t: any) => {
	const resolution = resolveVcpModeRequest(
		{
			baseUrl: 'https://api.example.com/v1',
			requestMethod: 'anthropic',
			backendMode: 'native',
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

test('require explicit backendMode to enable VCP mode', (t: any) => {
	t.true(
		isVcpModeEnabled({
			backendMode: 'vcp',
			baseUrl: 'http://localhost:8080/v1',
			requestMethod: 'responses',
		}),
	);
	t.false(
		isVcpModeEnabled({
			baseUrl: 'http://localhost:8080/v1',
			requestMethod: 'responses',
		}),
	);
	t.false(
		isVcpModeEnabled({
			backendMode: 'native',
			baseUrl: 'http://localhost:8080/v1',
			requestMethod: 'responses',
		}),
	);
});

test('emit explicit snow protocol headers only for vcp requests', (t: any) => {
	t.deepEqual(
		resolveVcpRequestHeaders({
			backendMode: 'vcp',
			toolTransport: 'bridge',
			baseUrl: 'http://127.0.0.1:6005/v1',
			requestMethod: 'chat',
		}),
		{
			'x-snow-client': 'snow-cli',
			'x-snow-protocol': 'function-calling',
			'x-snow-tool-mode': 'bridge',
		},
	);

	t.deepEqual(
		resolveVcpRequestHeaders({
			backendMode: 'native',
			toolTransport: 'bridge',
			baseUrl: 'https://api.example.com/v1',
			requestMethod: 'chat',
		}),
		{},
	);
});

test('route anthropic-like models through chat and keep tools in VCP mode', (t: any) => {
	const resolution = resolveVcpModeRequest(
		{
			baseUrl: 'https://vcp.example.com/v1',
			requestMethod: 'anthropic',
			backendMode: 'vcp',
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
								'Optional placeholder for zero-argument tool compatibility on Anthropic-style VCP mode endpoints. Omit during normal use.',
						},
					},
					required: [],
				},
			},
		},
	]);
	t.is(resolution.toolChoice, 'auto');
});

test('sanitize anthropic-compatible tool schemas in VCP mode', (t: any) => {
	const resolution = resolveVcpModeRequest(
		{
			baseUrl: 'https://vcp.example.com/v1',
			requestMethod: 'anthropic',
			backendMode: 'vcp',
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

test('keep tools for gemini-like models in VCP mode', (t: any) => {
	const resolution = resolveVcpModeRequest(
		{
			baseUrl: 'https://vcp.example.com/v1',
			requestMethod: 'gemini',
			backendMode: 'vcp',
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

test('only sanitize tool schemas for anthropic-compatible VCP mode requests', (t: any) => {
	t.true(
		shouldSanitizeVcpModeTools(
			{
				backendMode: 'vcp',
				requestMethod: 'chat',
			},
			{
				model: 'claude-opus-4-6',
				tools: [TOOL],
			},
		),
	);

	t.false(
		shouldSanitizeVcpModeTools(
			{
				backendMode: 'vcp',
				requestMethod: 'gemini',
			},
			{
				model: 'gemini-2.5-pro',
				tools: [TOOL],
			},
		),
	);
});

test('preserve model fetch request method outside the VCP chat entrypoint', (t: any) => {
	t.is(
		resolveVcpModeModelFetchMethod({
			backendMode: 'vcp',
			requestMethod: 'anthropic',
		}),
		'anthropic',
	);
	t.is(
		resolveVcpModeModelFetchMethod({
			backendMode: 'native',
			requestMethod: 'anthropic',
		}),
		'anthropic',
	);
});
