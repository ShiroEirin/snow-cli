import test from 'ava';

import {
	buildInvalidToolCallCorrectionMessage,
	buildInvalidToolCallTerminationMessage,
	countRecentInvalidToolCallCorrections,
	detectInvalidToolCalls,
	MAX_INVALID_TOOL_CALL_CORRECTION_REPEATS,
	shouldAbortInvalidToolCallLoop,
} from './invalidToolCallGuard.js';
import type {ToolCall} from '../../../utils/execution/toolExecutor.js';

function createToolCall(name: string, args = '{}'): ToolCall {
	return {
		id: `call_${name}`,
		type: 'function',
		function: {
			name,
			arguments: args,
		},
	};
}

test('keeps valid tool calls untouched', t => {
	const issues = detectInvalidToolCalls(
		[
			createToolCall('todo-get'),
			createToolCall('filesystem-read', '{"filePath":["ROLE.md"]}'),
		],
		['tool_search', 'todo-get', 'filesystem-read'],
	);

	t.deepEqual(issues, []);
});

test('detects concatenated tool names made from loaded tools', t => {
	const issues = detectInvalidToolCalls(
		[createToolCall('todo-getfilesystem-read')],
		['tool_search', 'todo-get', 'filesystem-read'],
	);

	t.is(issues.length, 1);
	t.is(issues[0]?.reason, 'concatenated_tools');
	t.deepEqual(
		issues[0]?.reason === 'concatenated_tools'
			? issues[0].splitToolNames
			: [],
		['todo-get', 'filesystem-read'],
	);
});

test('detects unknown tool names that are not loaded', t => {
	const issues = detectInvalidToolCalls(
		[createToolCall('filesystem-open_magic_portal')],
		['tool_search', 'filesystem-read', 'filesystem-edit'],
	);

	t.is(issues.length, 1);
	t.is(issues[0]?.reason, 'unknown_tool');
});

test('builds a correction message that tells the model to resend valid calls', t => {
	const correctionMessage = buildInvalidToolCallCorrectionMessage([
		{
			toolCall: createToolCall('todo-getfilesystem-read'),
			reason: 'concatenated_tools',
			splitToolNames: ['todo-get', 'filesystem-read'],
		},
		{
			toolCall: createToolCall('filesystem-open_magic_portal'),
			reason: 'unknown_tool',
		},
	]);

	t.is(correctionMessage.role, 'user');
	t.true(correctionMessage.content.includes('不会写入工具历史'));
	t.true(correctionMessage.content.includes('`todo-getfilesystem-read`'));
	t.true(correctionMessage.content.includes('`todo-get` + `filesystem-read`'));
	t.true(correctionMessage.content.includes('`filesystem-open_magic_portal`'));
	t.true(correctionMessage.content.includes('tool_search'));
});

test('escalates correction wording after repeated invalid tool calls', t => {
	const correctionMessage = buildInvalidToolCallCorrectionMessage(
		[
			{
				toolCall: createToolCall('todo-getfilesystem-read'),
				reason: 'concatenated_tools',
				splitToolNames: ['todo-get', 'filesystem-read'],
			},
		],
		{repeatCount: 1},
	);

	t.true(correctionMessage.content.includes('[系统工具纠偏-强制]'));
	t.true(correctionMessage.content.includes('再次重发了同一个无效工具名'));
	t.true(correctionMessage.content.includes('`todo-get`'));
	t.true(correctionMessage.content.includes('`filesystem-read`'));
});

test('terminates invalid tool correction loop after too many retries', t => {
	const terminationMessage = buildInvalidToolCallTerminationMessage(
		[
			{
				toolCall: createToolCall('todo-getfilesystem-read'),
				reason: 'concatenated_tools',
				splitToolNames: ['todo-get', 'filesystem-read'],
			},
		],
		{repeatCount: MAX_INVALID_TOOL_CALL_CORRECTION_REPEATS},
	);

	t.true(terminationMessage.content.includes('[系统工具纠偏-终止]'));
	t.true(terminationMessage.content.includes('为避免死循环，本轮对话已终止'));
	t.true(terminationMessage.content.includes('`tool_search`'));
});

test('aborts only when repeat count reaches configured limit', t => {
	t.false(
		shouldAbortInvalidToolCallLoop(
			MAX_INVALID_TOOL_CALL_CORRECTION_REPEATS - 1,
		),
	);
	t.true(
		shouldAbortInvalidToolCallLoop(MAX_INVALID_TOOL_CALL_CORRECTION_REPEATS),
	);
});

test('counts recent matching correction messages', t => {
	const issues = [
		{
			toolCall: createToolCall('todo-getfilesystem-read'),
			reason: 'concatenated_tools' as const,
			splitToolNames: ['todo-get', 'filesystem-read'],
		},
	];

	const count = countRecentInvalidToolCallCorrections(
		[
			{
				role: 'user',
				content:
					'[系统工具纠偏]\n- `todo-getfilesystem-read` 不是有效工具名；它看起来把多个工具拼接到了一起：`todo-get` + `filesystem-read`。',
			},
			{
				role: 'assistant',
				content: '',
			},
			{
				role: 'user',
				content:
					'[系统工具纠偏-强制]\n- `todo-getfilesystem-read` 不是有效工具名；它看起来把多个工具拼接到了一起：`todo-get` + `filesystem-read`。',
			},
		],
		issues,
	);

	t.is(count, 2);
});
