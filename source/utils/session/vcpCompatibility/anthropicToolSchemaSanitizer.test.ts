import test from 'ava';

import {
	sanitizeAnthropicGatewayTools,
	sanitizeAnthropicToolSchema,
} from './anthropicToolSchemaSanitizer.js';

test('strip default annotations from anthropic gateway schema', t => {
	const sanitized = sanitizeAnthropicToolSchema({
		type: 'object',
		properties: {
			createDirectories: {
				type: 'boolean',
				default: true,
			},
		},
	}) as Record<string, any>;

	t.deepEqual(sanitized, {
		type: 'object',
		properties: {
			createDirectories: {
				type: 'boolean',
			},
		},
		required: [],
	});
});

test('add explicit empty required array for object schemas with only optional fields', t => {
	const sanitized = sanitizeAnthropicToolSchema({
		type: 'object',
		properties: {
			scope: {
				type: 'string',
			},
		},
	}) as Record<string, any>;

	t.deepEqual(sanitized, {
		type: 'object',
		properties: {
			scope: {
				type: 'string',
			},
		},
		required: [],
	});
});

test('inject zero-argument compatibility placeholder for empty object schemas', t => {
	const sanitized = sanitizeAnthropicToolSchema({
		type: 'object',
		properties: {},
	}) as Record<string, any>;

	t.deepEqual(sanitized, {
		type: 'object',
		properties: {
			_noop: {
				type: 'string',
				description:
					'Optional placeholder for zero-argument tool compatibility on Anthropic-style VCP gateways. Omit during normal use.',
			},
		},
		required: [],
	});
});

test('flatten oneOf unions into anthropic-safe types', t => {
	const sanitized = sanitizeAnthropicToolSchema({
		type: 'object',
		properties: {
			content: {
				oneOf: [
					{
						type: 'string',
						description: 'Single TODO item description',
					},
					{
						type: 'array',
						items: {type: 'string'},
						description: 'Multiple TODO item descriptions',
					},
				],
				description: 'TODO item description(s)',
			},
		},
		required: ['content'],
	}) as Record<string, any>;

	t.deepEqual(sanitized, {
		type: 'object',
		properties: {
			content: {
				type: ['string', 'array'],
				items: {type: 'string'},
				description: 'TODO item description(s)',
			},
		},
		required: ['content'],
	});
});

test('drop ambiguous array item unions while keeping broad type support', t => {
	const sanitized = sanitizeAnthropicToolSchema({
		type: 'object',
		properties: {
			filePath: {
				oneOf: [
					{
						type: 'string',
					},
					{
						type: 'array',
						items: {type: 'string'},
					},
					{
						type: 'array',
						items: {
							type: 'object',
							properties: {
								path: {type: 'string'},
							},
							required: ['path'],
						},
					},
				],
				description: 'File path(s)',
			},
		},
		required: ['filePath'],
	}) as Record<string, any>;

	t.deepEqual(sanitized, {
		type: 'object',
		properties: {
			filePath: {
				type: ['string', 'array'],
				description: 'File path(s)',
			},
		},
		required: ['filePath'],
	});
});

test('sanitize tool arrays recursively for anthropic gateway', t => {
	const sanitized = sanitizeAnthropicGatewayTools([
		{
			type: 'function',
			function: {
				name: 'todo-add',
				description: 'Add TODO items',
				parameters: {
					type: 'object',
					properties: {
						content: {
							oneOf: [
								{type: 'string'},
								{type: 'array', items: {type: 'string'}},
							],
						},
						parentId: {
							type: 'string',
							default: 'root',
						},
					},
				},
			},
		},
	]);

	t.deepEqual(sanitized, [
		{
			type: 'function',
			function: {
				name: 'todo-add',
				description: 'Add TODO items',
				parameters: {
					type: 'object',
					properties: {
						content: {
							type: ['string', 'array'],
							items: {type: 'string'},
						},
						parentId: {
							type: 'string',
						},
					},
					required: [],
				},
			},
		},
	]);
});
