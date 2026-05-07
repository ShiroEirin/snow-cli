import test from 'ava';

import {ChatToolCallAccumulator} from './chatToolCallAccumulator.js';

test('keeps multiple streamed tool calls separated by tool call id', t => {
	const accumulator = new ChatToolCallAccumulator();

	const firstDeltaTexts = accumulator.append([
		{
			id: 'call_todo',
			function: {
				name: 'todo-get',
			},
		},
		{
			id: 'call_read',
			function: {
				name: 'filesystem-read',
			},
		},
	]);

	const secondDeltaTexts = accumulator.append([
		{
			id: 'call_todo',
			function: {
				arguments: '{}',
			},
		},
		{
			id: 'call_read',
			function: {
				arguments: '{"filePath":["AGENTS.md","ROLE.md","snow-cli/README.md"]}',
			},
		},
	]);

	t.deepEqual(firstDeltaTexts, ['todo-get', 'filesystem-read']);
	t.deepEqual(secondDeltaTexts, [
		'{}',
		'{"filePath":["AGENTS.md","ROLE.md","snow-cli/README.md"]}',
	]);

	t.deepEqual(accumulator.finalize(), [
		{
			id: 'call_todo',
			type: 'function',
			function: {
				name: 'todo-get',
				arguments: '{}',
			},
		},
		{
			id: 'call_read',
			type: 'function',
			function: {
				name: 'filesystem-read',
				arguments: '{"filePath":["AGENTS.md","ROLE.md","snow-cli/README.md"]}',
			},
		},
	]);
});

test('falls back to index-based grouping when ids are unavailable', t => {
	const accumulator = new ChatToolCallAccumulator();

	accumulator.append([
		{
			index: 0,
			function: {
				name: 'todo-get',
			},
		},
		{
			index: 1,
			function: {
				name: 'terminal-execute',
			},
		},
	]);

	accumulator.append([
		{
			index: 0,
			function: {
				arguments: '{}',
			},
		},
		{
			index: 1,
			function: {
				arguments: '{"command":"pwd"}',
			},
		},
	]);

	t.deepEqual(accumulator.finalize(), [
		{
			id: 'call_anonymous_0',
			type: 'function',
			function: {
				name: 'todo-get',
				arguments: '{}',
			},
		},
		{
			id: 'call_anonymous_1',
			type: 'function',
			function: {
				name: 'terminal-execute',
				arguments: '{"command":"pwd"}',
			},
		},
	]);
});

test('repairs malformed accumulated arguments into valid json on finalize', t => {
	const accumulator = new ChatToolCallAccumulator();

	accumulator.append([
		{
			id: 'call_read',
			function: {
				name: 'filesystem-read',
				arguments: '{"filePath":["AGENTS.md"]',
			},
		},
	]);

	t.deepEqual(accumulator.finalize(), [
		{
			id: 'call_read',
			type: 'function',
			function: {
				name: 'filesystem-read',
				arguments: '{"filePath":["AGENTS.md"]}',
			},
		},
	]);
});

test('does not merge two complete anonymous tool names when both are known tools', t => {
	const accumulator = new ChatToolCallAccumulator([
		'todo-get',
		'filesystem-read',
	]);

	accumulator.append([
		{
			function: {
				name: 'todo-get',
			},
		},
	]);

	accumulator.append([
		{
			function: {
				name: 'filesystem-read',
			},
		},
	]);

	accumulator.append([
		{
			function: {
				arguments: '{}',
			},
		},
	]);

	accumulator.append([
		{
			function: {
				arguments: '{"filePath":["ROLE.md"]}',
			},
		},
	]);

	t.deepEqual(accumulator.finalize(), [
		{
			id: 'call_anonymous_0',
			type: 'function',
			function: {
				name: 'todo-get',
				arguments: '{}',
			},
		},
		{
			id: 'call_anonymous_1',
			type: 'function',
			function: {
				name: 'filesystem-read',
				arguments: '{"filePath":["ROLE.md"]}',
			},
		},
	]);
});

test('keeps anonymous name fragments together when they form a known tool name', t => {
	const accumulator = new ChatToolCallAccumulator(['filesystem-read']);

	accumulator.append([
		{
			function: {
				name: 'filesystem-',
			},
		},
	]);

	accumulator.append([
		{
			function: {
				name: 'read',
			},
		},
	]);

	accumulator.append([
		{
			function: {
				arguments: '{"filePath":["README.md"]}',
			},
		},
	]);

	t.deepEqual(accumulator.finalize(), [
		{
			id: 'call_anonymous_0',
			type: 'function',
			function: {
				name: 'filesystem-read',
				arguments: '{"filePath":["README.md"]}',
			},
		},
	]);
});

test('does not duplicate a complete tool name when the same id repeats it', t => {
	const accumulator = new ChatToolCallAccumulator(['tool_search']);

	const firstDeltaTexts = accumulator.append([
		{
			id: 'toolu_functions.tool_search:1',
			function: {
				name: 'tool_search',
			},
		},
	]);

	const secondDeltaTexts = accumulator.append([
		{
			id: 'toolu_functions.tool_search:1',
			function: {
				name: 'tool_search',
			},
		},
		{
			id: 'toolu_functions.tool_search:1',
			function: {
				arguments: '{}',
			},
		},
	]);

	t.deepEqual(firstDeltaTexts, ['tool_search']);
	t.deepEqual(secondDeltaTexts, ['{}']);
	t.deepEqual(accumulator.finalize(), [
		{
			id: 'toolu_functions.tool_search:1',
			type: 'function',
			function: {
				name: 'tool_search',
				arguments: '{}',
			},
		},
	]);
});

test('upgrades a partial streamed tool name when the same id later sends the full name', t => {
	const accumulator = new ChatToolCallAccumulator(['tool_search']);

	const firstDeltaTexts = accumulator.append([
		{
			id: 'toolu_functions.tool_search:1',
			function: {
				name: 'tool_',
			},
		},
	]);

	const secondDeltaTexts = accumulator.append([
		{
			id: 'toolu_functions.tool_search:1',
			function: {
				name: 'tool_search',
			},
		},
		{
			id: 'toolu_functions.tool_search:1',
			function: {
				arguments: '{}',
			},
		},
	]);

	t.deepEqual(firstDeltaTexts, ['tool_']);
	t.deepEqual(secondDeltaTexts, ['search', '{}']);
	t.deepEqual(accumulator.finalize(), [
		{
			id: 'toolu_functions.tool_search:1',
			type: 'function',
			function: {
				name: 'tool_search',
				arguments: '{}',
			},
		},
	]);
});
