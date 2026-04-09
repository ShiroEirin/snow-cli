import anyTest from 'ava';

const test = anyTest as any;

import {
	applyBridgeToolStatusUpdate,
	replacePendingToolMessages,
} from './toolRoundMessageAdapter.js';

test('applyBridgeToolStatusUpdate settles terminal bridge updates without leaving pending state behind', (t: any) => {
	const updatedMessages = applyBridgeToolStatusUpdate(
		[
			{
				role: 'assistant',
				content: '⚡ vcp-bridge-tool',
				streaming: false,
				toolName: 'vcp-bridge-tool',
				toolCallId: 'call-1',
				toolPending: true,
				messageStatus: 'pending',
			},
		] as any,
		{
			toolCallId: 'call-1',
			toolName: 'vcp-bridge-tool',
			status: 'success',
			state: 'completed',
			detail: 'SnowBridge: Completed',
			isTerminal: true,
		},
	);

	t.false(updatedMessages[0]?.toolPending);
	t.is(updatedMessages[0]?.messageStatus, 'success');
	t.is(updatedMessages[0]?.toolLifecycleState, 'completed');
	t.is(
		updatedMessages[0]?.toolStatusDetail,
		'✓ vcp-bridge-tool\n└─ SnowBridge: Completed',
	);
});

test('replacePendingToolMessages reuses the settled bridge shell for the final result payload', (t: any) => {
	const nextMessages = replacePendingToolMessages(
		[
			{
				role: 'assistant',
				content: '',
				streaming: false,
				toolName: 'vcp-bridge-tool',
				toolCallId: 'call-1',
				toolPending: false,
				messageStatus: 'success',
				toolLifecycleState: 'completed',
				toolStatusDetail: '✓ vcp-bridge-tool\n└─ SnowBridge: Completed',
			},
		] as any,
		[
			{
				role: 'assistant',
				content: '',
				streaming: false,
				toolName: 'vcp-bridge-tool',
				toolCallId: 'call-1',
				messageStatus: 'success',
				toolLifecycleState: 'completed',
				toolStatusDetail: '✓ vcp-bridge-tool\n└─ SnowBridge: Completed',
				toolResult: '{"ok":true}',
				toolResultPreview: '{"summary":"done"}',
			},
		] as any,
	);

	t.is(nextMessages.length, 1);
	t.false(nextMessages[0]?.toolPending);
	t.is(nextMessages[0]?.toolResult, '{"ok":true}');
	t.is(nextMessages[0]?.toolResultPreview, '{"summary":"done"}');
});
