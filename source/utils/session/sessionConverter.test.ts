import test from 'ava';

import {convertSessionMessagesToUI} from './sessionConverter.js';

test('convertSessionMessagesToUI preserves raw toolResult without overriding specialized preview payloads', t => {
	const uiMessages = convertSessionMessagesToUI([
		{
			role: 'assistant',
			content: '',
			tool_calls: [
				{
					id: 'call-1',
					type: 'function',
					function: {
						name: 'filesystem-read',
						arguments: '{"filePath":"main.py"}',
					},
				},
			],
		},
		{
			role: 'tool',
			tool_call_id: 'call-1',
			content: '{"content":"raw payload"}',
			historyContent: 'compact preview',
			messageStatus: 'success',
		},
	] as any);

	const toolMessage = uiMessages.find(
		message => message.toolName === 'filesystem-read',
	);
	t.truthy(toolMessage);
	t.is(toolMessage?.content, '');
	t.is(toolMessage?.toolCallId, 'call-1');
	t.is(toolMessage?.toolStatusDetail, '✓ filesystem-read');
	t.is(toolMessage?.toolResult, '{"content":"raw payload"}');
	t.is(toolMessage?.toolResultPreview, undefined);
});

test('convertSessionMessagesToUI keeps compact preview for bridge-style tools', t => {
	const uiMessages = convertSessionMessagesToUI([
		{
			role: 'assistant',
			content: '',
			tool_calls: [
				{
					id: 'call-bridge',
					type: 'function',
					function: {
						name: 'vcp-bridge-tool',
						arguments: '{"query":"main"}',
					},
				},
			],
		},
		{
			role: 'tool',
			tool_call_id: 'call-bridge',
			content: '{"raw":"payload"}',
			historyContent: 'model history summary',
			previewContent: '{"summary":"compact preview"}',
			messageStatus: 'success',
		},
	] as any);

	const toolMessage = uiMessages.find(
		message => message.toolName === 'vcp-bridge-tool',
	);
	t.truthy(toolMessage);
	t.is(toolMessage?.content, '');
	t.is(toolMessage?.toolStatusDetail, '✓ vcp-bridge-tool');
	t.is(toolMessage?.toolResult, '{"raw":"payload"}');
	t.is(toolMessage?.toolResultPreview, '{"summary":"compact preview"}');
});

test('convertSessionMessagesToUI does not expose preview metadata for skill-execute strings', t => {
	const uiMessages = convertSessionMessagesToUI([
		{
			role: 'assistant',
			content: '',
			tool_calls: [
				{
					id: 'call-skill',
					type: 'function',
					function: {
						name: 'skill-execute',
						arguments: '{"skill":"demo"}',
					},
				},
			],
		},
		{
			role: 'tool',
			tool_call_id: 'call-skill',
			content: 'Skill execution finished',
			historyContent: 'compact preview',
			messageStatus: 'success',
		},
	] as any);

	const toolMessage = uiMessages.find(
		message => message.toolName === 'skill-execute',
	);
	t.truthy(toolMessage);
	t.is(toolMessage?.toolStatusDetail, '✓ skill-execute');
	t.is(toolMessage?.toolResult, 'Skill execution finished');
	t.is(toolMessage?.toolResultPreview, undefined);
});

test('convertSessionMessagesToUI does not replay stale pending message when tool result already exists', t => {
	const uiMessages = convertSessionMessagesToUI([
		{
			role: 'assistant',
			content: '',
			tool_calls: [
				{
					id: 'call-async',
					type: 'function',
					function: {
						name: 'terminal-execute',
						arguments: '{"command":"echo hi"}',
					},
				},
			],
		},
		{
			role: 'tool',
			tool_call_id: 'call-async',
			content: '{"stdout":"hi","exitCode":0}',
			messageStatus: 'success',
			toolStatusDetail: 'SnowBridge: Completed',
		},
	] as any);

	const terminalMessages = uiMessages.filter(
		message => message.toolName === 'terminal-execute',
	);

	t.is(terminalMessages.length, 1);
	t.false(Boolean(terminalMessages[0]?.toolPending));
	t.is(
		terminalMessages[0]?.toolStatusDetail,
		'✓ terminal-execute\n└─ SnowBridge: Completed',
	);
});

test('convertSessionMessagesToUI replays successful sub-agent quick tools in compact mode', t => {
	const uiMessages = convertSessionMessagesToUI([
		{
			role: 'assistant',
			content: '⚇ filesystem-read',
			subAgentInternal: true,
			tool_calls: [
				{
					id: 'subagent-quick-call',
					type: 'function',
					function: {
						name: 'filesystem-read',
						arguments: '{"filePath":"main.py"}',
					},
				},
			],
		},
		{
			role: 'tool',
			tool_call_id: 'subagent-quick-call',
			content: '{"content":"print(\\"hi\\")"}',
			messageStatus: 'success',
			subAgentInternal: true,
		},
	] as any);

	t.is(uiMessages.length, 1);
	t.is(uiMessages[0]?.role, 'subagent');
	t.true(
		uiMessages[0]?.content.includes('filesystem-read (filePath: "main.py")'),
	);
	t.deepEqual(uiMessages[0]?.pendingToolIds, []);
	t.is(uiMessages[0]?.toolResult, undefined);
	t.is(uiMessages[0]?.toolCallId, undefined);
});

test('convertSessionMessagesToUI preserves replay parallel group for non-time-consuming tools', t => {
	const uiMessages = convertSessionMessagesToUI([
		{
			role: 'assistant',
			content: '',
			tool_calls: [
				{
					id: 'call-read',
					type: 'function',
					function: {
						name: 'filesystem-read',
						arguments: '{"filePath":"main.py"}',
					},
				},
				{
					id: 'call-search',
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
			tool_call_id: 'call-read',
			content: '{"content":"raw payload"}',
			messageStatus: 'success',
		},
		{
			role: 'tool',
			tool_call_id: 'call-search',
			content: '{"content":"doc payload"}',
			messageStatus: 'success',
		},
	] as any);

	const parallelMessages = uiMessages.filter(message => message.parallelGroup);

	t.is(parallelMessages.length, 2);
	t.truthy(parallelMessages[0]?.parallelGroup);
	t.is(
		parallelMessages[0]?.parallelGroup,
		parallelMessages[1]?.parallelGroup,
	);
});
