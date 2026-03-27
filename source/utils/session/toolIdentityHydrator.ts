import type {ChatMessage} from '../../api/types.js';
import {resolveSnowToolSpec} from '../../tooling/core/toolRouter.js';
import type {ToolRegistrySnapshot} from '../../tooling/core/types.js';

export function hydrateSessionToolIdentity(
	messages: ChatMessage[],
	registry: ToolRegistrySnapshot,
): boolean {
	let changed = false;
	const toolCallIdentityMap = new Map<
		string,
		{
			toolId?: string;
			publicName: string;
			rawName: string;
		}
	>();

	for (const message of messages) {
		if (message.role !== 'assistant' || !message.tool_calls) {
			continue;
		}

		message.tool_calls = message.tool_calls.map(toolCall => {
			const rawName = toolCall.rawName || toolCall.function.name;
			const requestedPublicName = toolCall.publicName || rawName;
			const resolvedTool = resolveSnowToolSpec(registry, {
				toolId: toolCall.toolId,
				publicName: requestedPublicName,
				rawName,
			});
			const publicName = resolvedTool?.publicName || requestedPublicName;
			const nextToolCall = {
				...toolCall,
				toolId: resolvedTool?.toolId || toolCall.toolId,
				publicName,
				rawName,
				function: {
					name: publicName,
					arguments: toolCall.function.arguments,
				},
			};

			if (
				nextToolCall.toolId !== toolCall.toolId ||
				nextToolCall.publicName !== toolCall.publicName ||
				nextToolCall.rawName !== toolCall.rawName ||
				nextToolCall.function.name !== toolCall.function.name
			) {
				changed = true;
			}

			toolCallIdentityMap.set(nextToolCall.id, {
				toolId: nextToolCall.toolId,
				publicName,
				rawName,
			});

			return nextToolCall;
		});
	}

	for (const message of messages) {
		if (message.role !== 'tool' || !message.tool_call_id) {
			continue;
		}

		const linkedIdentity = toolCallIdentityMap.get(message.tool_call_id);
		if (!linkedIdentity) {
			continue;
		}

		const nextName = message.name || linkedIdentity.publicName;
		if (
			message.toolId !== linkedIdentity.toolId ||
			message.publicName !== linkedIdentity.publicName ||
			message.rawName !== linkedIdentity.rawName ||
			message.name !== nextName
		) {
			changed = true;
		}

		message.toolId = linkedIdentity.toolId;
		message.publicName = linkedIdentity.publicName;
		message.rawName = linkedIdentity.rawName;
		message.name = nextName;
	}

	return changed;
}
