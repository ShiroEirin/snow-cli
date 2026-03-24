import test from 'ava';
import type {ChatMessage} from './types.js';
import {convertToOpenAIMessages} from './chat.js';

test('convertToOpenAIMessages attaches tool message names for VCP gateway requests', t => {
	const messages: ChatMessage[] = [
		{
			role: 'user',
			content: 'read files',
		},
		{
			role: 'assistant',
			content: '',
			tool_calls: [
				{
					id: 'call-read',
					type: 'function',
					function: {
						name: 'filesystem-read',
						arguments: '{"filePath":"README.md"}',
					},
				},
				{
					id: 'call-todo',
					type: 'function',
					function: {
						name: 'todo-update',
						arguments: '{"todoId":"todo-1","status":"completed"}',
					},
				},
			],
		},
		{
			role: 'tool',
			content: '{"content":"ok"}',
			tool_call_id: 'call-read',
		},
		{
			role: 'tool',
			content: '{"content":"done"}',
			tool_call_id: 'call-todo',
		},
	];

	const converted = convertToOpenAIMessages(
		messages,
		false,
		undefined,
		false,
		false,
		false,
		true,
	);

	const toolMessages = converted.filter(message => message.role === 'tool');
	t.is(toolMessages.length, 2);
	t.deepEqual(
		toolMessages.map(message => message.name),
		['filesystem-read', 'todo-update'],
	);
});

test('convertToOpenAIMessages keeps tool messages unchanged when VCP gateway mode is off', t => {
	const messages: ChatMessage[] = [
		{
			role: 'user',
			content: 'read files',
		},
		{
			role: 'assistant',
			content: '',
			tool_calls: [
				{
					id: 'call-read',
					type: 'function',
					function: {
						name: 'filesystem-read',
						arguments: '{"filePath":"README.md"}',
					},
				},
			],
		},
		{
			role: 'tool',
			content: '{"content":"ok"}',
			tool_call_id: 'call-read',
		},
	];

	const converted = convertToOpenAIMessages(
		messages,
		false,
		undefined,
		false,
		false,
		false,
		false,
	);

	const toolMessage = converted.find(message => message.role === 'tool');
	t.truthy(toolMessage);
	t.is(toolMessage?.name, undefined);
});

test('convertToOpenAIMessages prefers explicit tool message names when present', t => {
	const messages: ChatMessage[] = [
		{
			role: 'user',
			content: 'read files',
		},
		{
			role: 'assistant',
			content: '',
			tool_calls: [
				{
					id: 'call-read',
					type: 'function',
					function: {
						name: 'filesystem-read',
						arguments: '{"filePath":"README.md"}',
					},
				},
			],
		},
		{
			role: 'tool',
			name: 'filesystem-read',
			content: '{"content":"ok"}',
			tool_call_id: 'call-read',
		},
	];

	const converted = convertToOpenAIMessages(
		messages,
		false,
		undefined,
		false,
		false,
		false,
		true,
	);

	const toolMessage = converted.find(message => message.role === 'tool');
	t.is(toolMessage?.name, 'filesystem-read');
});
