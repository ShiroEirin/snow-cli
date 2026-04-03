import test from 'ava';

import {buildToolResultMessages} from './toolResultDisplay.js';
import {buildToolHistoryArtifacts} from '../../../utils/execution/toolHistoryArtifacts.js';

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

test('buildToolResultMessages keeps raw bridge image_url payload while preview uses sanitized history sidecar', t => {
	const imageUrl = 'https://cdn.example.com/generated/chart.png?token=secret';
	const rawPayload = JSON.stringify({
		status: 'success',
		result: {
			content: [
				{
					type: 'text',
					text: 'Generated chart preview.',
				},
				{
					type: 'image_url',
					image_url: {url: imageUrl},
				},
			],
		},
	});
	const artifacts = buildToolHistoryArtifacts(JSON.parse(rawPayload), rawPayload);
	const messages = buildToolResultMessages(
		[
			{
				role: 'tool',
				tool_call_id: 'call-bridge-image',
				content: rawPayload,
				historyContent: artifacts.historyContent,
				previewContent: artifacts.previewContent,
				messageStatus: 'success',
			},
		],
		[
			{
				id: 'call-bridge-image',
				type: 'function',
				function: {
					name: 'vcp-bridge-tool',
					arguments: '{"query":"chart"}',
				},
			},
		],
		undefined,
	);

	t.is(messages[0]?.toolResult, rawPayload);
	t.true(messages[0]?.toolResultPreview?.includes('"summary"') || false);
	t.true(
		messages[0]?.toolResultPreview?.includes(
			'"Generated chart preview."',
		) || false,
	);
	t.true(
		messages[0]?.toolResultPreview?.includes('[1 image URL item omitted]') ||
			false,
	);
	t.false(messages[0]?.toolResultPreview?.includes(imageUrl) || false);
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
