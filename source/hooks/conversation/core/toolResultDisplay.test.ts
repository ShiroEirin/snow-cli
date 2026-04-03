import test from 'ava';

import {buildToolResultMessages} from './toolResultDisplay.js';

test('buildToolResultMessages keeps raw toolResult and avoids compact preview for specialized renderers', t => {
	const messages = buildToolResultMessages(
		[
			{
				role: 'tool',
				tool_call_id: 'call-1',
				content: '{"content":"raw payload"}',
				historyContent: 'compact preview',
				messageStatus: 'success',
			},
		],
		[
			{
				id: 'call-1',
				type: 'function',
				function: {
					name: 'filesystem-read',
					arguments: '{"filePath":"main.py"}',
				},
			},
		],
		undefined,
	);

	t.is(messages.length, 1);
	t.is(messages[0]?.toolName, 'filesystem-read');
	t.is(messages[0]?.content, '');
	t.is(messages[0]?.toolCallId, 'call-1');
	t.is(messages[0]?.toolStatusDetail, '✓ filesystem-read');
	t.is(messages[0]?.toolResult, '{"content":"raw payload"}');
	t.is(messages[0]?.toolResultPreview, undefined);
});

test('buildToolResultMessages keeps compact preview only for bridge-like tools', t => {
	const messages = buildToolResultMessages(
		[
			{
				role: 'tool',
				tool_call_id: 'call-bridge',
				content: '{"raw":"payload"}',
				historyContent: 'model history summary',
				previewContent: '{"summary":"compact bridge preview"}',
				messageStatus: 'success',
			},
		],
		[
			{
				id: 'call-bridge',
				type: 'function',
				function: {
					name: 'vcp-bridge-tool',
					arguments: '{"query":"hello"}',
				},
			},
		],
		undefined,
	);

	t.is(messages[0]?.toolResult, '{"raw":"payload"}');
	t.is(messages[0]?.toolResultPreview, '{"summary":"compact bridge preview"}');
	t.is(messages[0]?.toolStatusDetail, '✓ vcp-bridge-tool');
});

test('buildToolResultMessages does not create preview metadata for skill-execute strings', t => {
	const messages = buildToolResultMessages(
		[
			{
				role: 'tool',
				tool_call_id: 'call-skill',
				content: 'Skill execution finished',
				historyContent: 'compact skill preview',
				messageStatus: 'success',
			},
		],
		[
			{
				id: 'call-skill',
				type: 'function',
				function: {
					name: 'skill-execute',
					arguments: '{"skill":"demo"}',
				},
			},
		],
		undefined,
	);

	t.is(messages[0]?.toolResult, 'Skill execution finished');
	t.is(messages[0]?.toolResultPreview, undefined);
	t.is(messages[0]?.toolStatusDetail, '✓ skill-execute');
});

test('buildToolResultMessages carries bridge lifecycle detail into sideband display', t => {
	const messages = buildToolResultMessages(
		[
			{
				role: 'tool',
				tool_call_id: 'call-async',
				content: '{"raw":"payload"}',
				previewContent: '{"summary":"compact preview"}',
				toolStatusDetail: 'SnowBridge: Completed',
				toolLifecycleState: 'completed',
			},
		],
		[
			{
				id: 'call-async',
				type: 'function',
				function: {
					name: 'vcp-bridge-tool',
					arguments: '{"query":"hello"}',
				},
			},
		],
		undefined,
	);

	t.is(messages[0]?.toolLifecycleState, 'completed');
	t.is(
		messages[0]?.toolStatusDetail,
		'✓ vcp-bridge-tool\n└─ SnowBridge: Completed',
	);
});
