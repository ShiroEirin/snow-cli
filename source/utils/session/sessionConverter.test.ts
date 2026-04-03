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
	t.is(toolMessage?.toolResult, 'Skill execution finished');
	t.is(toolMessage?.toolResultPreview, undefined);
});
