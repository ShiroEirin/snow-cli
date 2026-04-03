import {buildToolLifecycleSideband} from './toolLifecycleSideband.js';

type ToolSidebandCandidate = {
	role: string;
	content?: string;
	messageStatus?: 'pending' | 'success' | 'error';
	toolPending?: boolean;
	toolResult?: string;
	toolStatusDetail?: string;
	toolName?: string;
	toolDisplay?: {
		toolName: string;
	};
	toolCall?: {
		name: string;
	};
};

export function resolveToolSideband(
	message: ToolSidebandCandidate,
	options?: {
		fallbackContent?: string;
	},
): string | undefined {
	if (message.role !== 'assistant' && message.role !== 'subagent') {
		return undefined;
	}

	if (
		!message.toolPending &&
		!message.toolResult &&
		!message.toolStatusDetail &&
		!message.toolCall &&
		!message.toolName
	) {
		return undefined;
	}

	return (
		message.toolStatusDetail ||
		buildToolLifecycleSideband({
			toolName:
				message.toolName ||
				message.toolDisplay?.toolName ||
				message.toolCall?.name,
			messageStatus: message.messageStatus,
			fallbackContent: options?.fallbackContent ?? message.content,
		})
	);
}
