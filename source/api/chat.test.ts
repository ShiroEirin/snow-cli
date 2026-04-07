import anyTest from 'ava';

const test = anyTest as any;

import {
	applyStreamingToolCallDelta,
	finalizeStreamingToolCalls,
	mergeStreamingToolCallField,
} from './chat.js';

test('append standard tool name deltas', (t: any) => {
	const merged = mergeStreamingToolCallField('filesystem-', 'read');

	t.deepEqual(merged, {
		value: 'filesystem-read',
		delta: 'read',
	});
});

test('deduplicate repeated full tool name fragments', (t: any) => {
	const merged = mergeStreamingToolCallField(
		'filesystem-read',
		'filesystem-read',
	);

	t.deepEqual(merged, {
		value: 'filesystem-read',
		delta: '',
	});
});

test('promote resent full tool name over partial prefix', (t: any) => {
	const merged = mergeStreamingToolCallField(
		'filesystem-',
		'filesystem-read',
	);

	t.deepEqual(merged, {
		value: 'filesystem-read',
		delta: 'read',
	});
});

test('deduplicate repeated full tool arguments payloads', (t: any) => {
	const merged = mergeStreamingToolCallField(
		'{"filePath":"D:/repo/.helloagents/INDEX.md"}',
		'{"filePath":"D:/repo/.helloagents/INDEX.md"}',
	);

	t.deepEqual(merged, {
		value: '{"filePath":"D:/repo/.helloagents/INDEX.md"}',
		delta: '',
	});
});

test('promote resent full tool arguments over partial json prefix', (t: any) => {
	const merged = mergeStreamingToolCallField(
		'{"filePath":"D:/repo/.helloagents/',
		'{"filePath":"D:/repo/.helloagents/INDEX.md"}',
	);

	t.deepEqual(merged, {
		value: '{"filePath":"D:/repo/.helloagents/INDEX.md"}',
		delta: 'INDEX.md"}',
	});
});

test('keep missing-index parallel tool calls isolated by id and order', (t: any) => {
	const toolCallsBuffer: Record<number, any> = {};
	const toolCallIndexById = new Map<string, number>();

	applyStreamingToolCallDelta(
		toolCallsBuffer,
		toolCallIndexById,
		{
			id: 'tool-1',
			function: {name: 'filesystem-read'},
		},
		0,
		2,
	);
	applyStreamingToolCallDelta(
		toolCallsBuffer,
		toolCallIndexById,
		{
			id: 'tool-2',
			function: {name: 'filesystem-read'},
		},
		1,
		2,
	);
	applyStreamingToolCallDelta(
		toolCallsBuffer,
		toolCallIndexById,
		{
			function: {arguments: '{"filePath":"D:/repo/a.txt"'},
		},
		0,
		2,
	);
	applyStreamingToolCallDelta(
		toolCallsBuffer,
		toolCallIndexById,
		{
			function: {arguments: '{"filePath":"D:/repo/b.txt"}'},
		},
		1,
		2,
	);

	const toolCalls = finalizeStreamingToolCalls(toolCallsBuffer);

	t.deepEqual(
		toolCalls.map((toolCall: any) => toolCall.id),
		['tool-1', 'tool-2'],
	);
	t.deepEqual(
		toolCalls.map((toolCall: any) => toolCall.function.name),
		['filesystem-read', 'filesystem-read'],
	);
	t.is(toolCalls[0]!.function.arguments, '{"filePath":"D:/repo/a.txt"}');
	t.is(toolCalls[1]!.function.arguments, '{"filePath":"D:/repo/b.txt"}');
});

test('skip ambiguous missing-id multi-tool deltas instead of concatenating tool names', (t: any) => {
	const toolCallsBuffer: Record<number, any> = {};
	const toolCallIndexById = new Map<string, number>();

	applyStreamingToolCallDelta(
		toolCallsBuffer,
		toolCallIndexById,
		{
			id: 'tool-1',
			function: {name: 'filesystem-read'},
		},
		0,
		2,
	);
	applyStreamingToolCallDelta(
		toolCallsBuffer,
		toolCallIndexById,
		{
			id: 'tool-2',
			function: {name: 'terminal-execute'},
		},
		1,
		2,
	);

	applyStreamingToolCallDelta(
		toolCallsBuffer,
		toolCallIndexById,
		{
			function: {name: 'terminal-execute'},
		},
		0,
		2,
	);

	const toolCalls = finalizeStreamingToolCalls(toolCallsBuffer);

	t.deepEqual(
		toolCalls.map((toolCall: any) => toolCall.function.name),
		['filesystem-read', 'terminal-execute'],
	);
});

test('remap conflicting missing-index tool name delta to the uniquely matching buffered tool', (t: any) => {
	const toolCallsBuffer: Record<number, any> = {};
	const toolCallIndexById = new Map<string, number>();

	applyStreamingToolCallDelta(
		toolCallsBuffer,
		toolCallIndexById,
		{
			function: {name: 'filesystem-read'},
		},
		0,
		2,
	);
	applyStreamingToolCallDelta(
		toolCallsBuffer,
		toolCallIndexById,
		{
			function: {name: 'todo-get'},
		},
		1,
		2,
	);
	applyStreamingToolCallDelta(
		toolCallsBuffer,
		toolCallIndexById,
		{
			function: {name: 'todo-get'},
		},
		0,
		2,
	);
	applyStreamingToolCallDelta(
		toolCallsBuffer,
		toolCallIndexById,
		{
			function: {arguments: '{}'},
		},
		1,
		2,
	);

	const toolCalls = finalizeStreamingToolCalls(toolCallsBuffer);

	t.deepEqual(
		toolCalls.map((toolCall: any) => ({
			name: toolCall.function.name,
			arguments: toolCall.function.arguments,
		})),
		[
			{
				name: 'filesystem-read',
				arguments: '{}',
			},
			{
				name: 'todo-get',
				arguments: '{}',
			},
		],
	);
});

test('drop multi-tool argument deltas that arrive before any stable identity', (t: any) => {
	const toolCallsBuffer: Record<number, any> = {};
	const toolCallIndexById = new Map<string, number>();

	const deltaText = applyStreamingToolCallDelta(
		toolCallsBuffer,
		toolCallIndexById,
		{
			function: {arguments: '{"filePath":"D:/repo/a.txt"}'},
		},
		0,
		2,
	);

	t.is(deltaText, '');
	t.deepEqual(finalizeStreamingToolCalls(toolCallsBuffer), []);
});

test('finalize streaming tool calls repairs malformed json arguments', (t: any) => {
	const toolCalls = finalizeStreamingToolCalls({
		0: {
			id: 'tool-1',
			type: 'function',
			function: {
				name: 'filesystem-read',
				arguments: '{"filePath":"D:/repo/.helloagents/INDEX.md"',
			},
		},
	});

	t.deepEqual(toolCalls, [
		{
			id: 'tool-1',
			type: 'function',
			function: {
				name: 'filesystem-read',
				arguments: '{"filePath":"D:/repo/.helloagents/INDEX.md"}',
			},
		},
	]);
});

test('drop streaming tool calls with unrecoverable malformed json arguments', (t: any) => {
	const toolCalls = finalizeStreamingToolCalls({
		0: {
			id: 'tool-1',
			type: 'function',
			function: {
				name: 'filesystem-read',
				arguments: '{"filePath":"D:/repo/a.txt"}{"command":"pwd"}',
			},
		},
	});

	t.deepEqual(toolCalls, []);
});
