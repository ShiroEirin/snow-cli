import type {ToolResult} from '../../../utils/execution/toolExecutor.js';
import {
	buildConversationToolMessage,
	buildHistoryToolMessage,
} from '../../../utils/session/toolMessageProjection.js';

export type ToolResultMessageStatus = 'pending' | 'success' | 'error';

/**
 * Resolves the UI/history status for a completed tool result payload.
 *
 * Args:
 *   result: Tool result payload emitted by the executor.
 *
 * Returns:
 *   The message status that should be applied to both projections.
 */
export function resolveToolResultMessageStatus(
	result: Pick<ToolResult, 'content'>,
): Extract<ToolResultMessageStatus, 'success' | 'error'> {
	return result.content.startsWith('Error:') ? 'error' : 'success';
}

/**
 * Builds the paired conversation/history projections for a tool result.
 *
 * Args:
 *   result: Tool result payload or derived payload to project.
 *   messageStatus: Optional status to stamp onto both projections.
 *
 * Returns:
 *   The conversation-facing and history-facing messages for the same tool result.
 */
export function projectToolResultForPersistence<
	T extends {
		role: string;
		content: string;
		historyContent?: string;
	},
>(
	result: T,
	messageStatus?: ToolResultMessageStatus,
	options?: {
		projectConversationMessage?: boolean;
	},
) {
	const projectConversationMessage =
		options?.projectConversationMessage !== false;
	return {
		conversationMessage: projectConversationMessage
			? buildConversationToolMessage(result, messageStatus)
			: buildHistoryToolMessage(result, messageStatus),
		historyMessage: buildHistoryToolMessage(result, messageStatus),
	};
}
