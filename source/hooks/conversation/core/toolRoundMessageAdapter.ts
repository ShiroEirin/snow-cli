import type {BridgeToolStatusUpdate} from '../../../utils/execution/toolExecutor.js';
import type {Message} from '../../../ui/components/chat/MessageList.js';
import {
	buildToolLifecycleSideband,
	deriveBridgeLifecycleState,
	shouldAdvanceBridgeLifecycle,
} from '../../../utils/session/vcpCompatibility/toolLifecycleSideband.js';

function findReplaceableToolMessageIndex(
	existingMessages: Message[],
	toolCallId: string | undefined,
): number {
	if (!toolCallId) {
		return -1;
	}

	let fallbackIndex = -1;
	for (let index = existingMessages.length - 1; index >= 0; index--) {
		const message = existingMessages[index];
		if (message?.toolCallId !== toolCallId) {
			continue;
		}

		if (
			message.toolPending === true ||
			message.messageStatus === 'pending'
		) {
			return index;
		}

		if (fallbackIndex === -1) {
			fallbackIndex = index;
		}
	}

	return fallbackIndex;
}

/**
 * Reconciles tool result UI messages with any matching pending placeholders.
 *
 * Args:
 *   existingMessages: Current rendered chat messages.
 *   resultMessages: Final result messages produced for completed tool calls.
 *
 * Returns:
 *   A message list where matching pending placeholders are replaced in place.
 */
export function replacePendingToolMessages(
	existingMessages: Message[],
	resultMessages: Message[],
): Message[] {
	const nextMessages = [...existingMessages];

	for (const resultMessage of resultMessages) {
		if (!resultMessage.toolCallId) {
			nextMessages.push(resultMessage);
			continue;
		}

		const pendingIndex = findReplaceableToolMessageIndex(
			nextMessages,
			resultMessage.toolCallId,
		);

		if (pendingIndex === -1) {
			nextMessages.push(resultMessage);
			continue;
		}

		nextMessages[pendingIndex] = {
			...nextMessages[pendingIndex],
			...resultMessage,
			toolPending: false,
		};
	}

	return nextMessages;
}

/**
 * Applies a bridge lifecycle update onto the matching tool UI message.
 *
 * Args:
 *   existingMessages: Current rendered chat messages.
 *   update: Bridge lifecycle update emitted during tool execution.
 *
 * Returns:
 *   The original message list when nothing changed, otherwise an updated copy.
 */
export function applyBridgeToolStatusUpdate(
	existingMessages: Message[],
	update: BridgeToolStatusUpdate,
): Message[] {
	let changed = false;
	const nextMessages = existingMessages.map(message => {
		if (message.toolCallId !== update.toolCallId) {
			return message;
		}

		const nextLifecycleState = deriveBridgeLifecycleState(update);
		const currentLifecycleState = message.toolLifecycleState;
		const isSameLifecycleState =
			currentLifecycleState === nextLifecycleState;
		const canAdvance = shouldAdvanceBridgeLifecycle(currentLifecycleState, update);
		if (!canAdvance && !isSameLifecycleState) {
			return message;
		}

		const nextMessageStatus: Message['messageStatus'] =
			update.isTerminal === true
				? nextLifecycleState === 'error' || nextLifecycleState === 'cancelled'
					? 'error'
					: 'success'
				: 'pending';
		const nextToolPending = update.isTerminal !== true;
		const nextSideband = buildToolLifecycleSideband({
			toolName: message.toolName || update.toolName,
			messageStatus: nextMessageStatus,
			detail: update.detail,
		});
		if (
			message.toolStatusDetail === nextSideband &&
			message.messageStatus === nextMessageStatus &&
			message.toolPending === nextToolPending &&
			isSameLifecycleState
		) {
			return message;
		}

		changed = true;
		return {
			...message,
			toolName: message.toolName || update.toolName,
			messageStatus: nextMessageStatus,
			toolPending: nextToolPending,
			toolLifecycleState: nextLifecycleState,
			toolStatusDetail: nextSideband,
		};
	});

	return changed ? nextMessages : existingMessages;
}
