import type {ChatMessage} from '../../../api/chat.js';
import type {Message} from '../../../ui/components/chat/MessageList.js';
import type {ToolCall} from '../../../utils/execution/toolExecutor.js';
import {getToolRegistrySnapshot} from '../../../utils/execution/mcpToolsManager.js';
import {formatToolCallMessage} from '../../../utils/ui/messageFormatter.js';
import {isToolNeedTwoStepDisplay} from '../../../utils/config/toolDisplayConfig.js';
import {resolveSnowToolSpec} from '../../../tooling/core/toolRouter.js';
import {extractThinkingContent} from '../utils/thinkingExtractor.js';

export type ProcessToolCallsOptions = {
	receivedToolCalls: ToolCall[];
	streamedContent: string;
	receivedReasoning: any;
	receivedThinking:
		| {type: 'thinking'; thinking: string; signature?: string}
		| undefined;
	receivedReasoningContent: string | undefined;
	conversationMessages: any[];
	saveMessage: (message: any) => Promise<void>;
	setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
	extractThinkingContent: typeof extractThinkingContent;
	hasStreamedLines?: boolean;
};

export async function processToolCallsAfterStream(
	options: ProcessToolCallsOptions,
): Promise<{parallelGroupId: string | undefined}> {
	const {
		receivedToolCalls,
		streamedContent,
		receivedReasoning,
		receivedThinking,
		receivedReasoningContent,
		conversationMessages,
		saveMessage,
		setMessages,
	} = options;

	const registry = await getToolRegistrySnapshot();
	const normalizedToolCalls = receivedToolCalls.map(toolCall => {
		const rawName = toolCall.rawName || toolCall.function.name;
		const requestedPublicName = toolCall.publicName || rawName;
		const resolvedTool = resolveSnowToolSpec(registry, {
			toolId: toolCall.toolId,
			publicName: requestedPublicName,
			rawName,
		});
		const publicName = resolvedTool?.publicName || requestedPublicName;

		return {
			...toolCall,
			toolId: resolvedTool?.toolId,
			publicName,
			rawName,
			function: {
				name: publicName,
				arguments: toolCall.function.arguments,
			},
		};
	});

	for (const [index, toolCall] of normalizedToolCalls.entries()) {
		receivedToolCalls[index] = toolCall;
	}

	const sharedThoughtSignature = (
		normalizedToolCalls.find(tc => (tc as any).thoughtSignature) as any
	)?.thoughtSignature as string | undefined;

	const assistantMessage: ChatMessage = {
		role: 'assistant',
		content: streamedContent || '',
		tool_calls: normalizedToolCalls.map(tc => ({
			id: tc.id,
			type: 'function' as const,
			toolId: tc.toolId,
			publicName: tc.publicName,
			rawName: tc.rawName,
			function: {
				name: tc.function.name,
				arguments: tc.function.arguments,
			},
			...(((tc as any).thoughtSignature || sharedThoughtSignature) && {
				thoughtSignature:
					(tc as any).thoughtSignature || sharedThoughtSignature,
			}),
		})),
		reasoning: receivedReasoning,
		thinking: receivedThinking,
		reasoning_content: receivedReasoningContent,
	} as any;

	conversationMessages.push(assistantMessage);

	try {
		await saveMessage(assistantMessage);
	} catch (error) {
		console.error('Failed to save assistant message:', error);
	}

	const thinkingContent = extractThinkingContent(
		receivedThinking,
		receivedReasoning,
		receivedReasoningContent,
	);

	if (!options.hasStreamedLines) {
		if ((streamedContent && streamedContent.trim()) || thinkingContent) {
			setMessages(prev => [
				...prev,
				{
					role: 'assistant',
					content: streamedContent?.trim() || '',
					streaming: false,
					thinking: thinkingContent,
				},
			]);
		}
	}

	const parallelGroupId =
		normalizedToolCalls.length > 1
			? `parallel-${Date.now()}-${Math.random()}`
			: undefined;

	// Batch all two-step display messages into a single setMessages call
	// to avoid triggering multiple re-renders in rapid succession
	const pendingDisplayMessages: Message[] = [];
	for (const toolCall of normalizedToolCalls) {
		const toolDisplay = formatToolCallMessage(toolCall);
		let toolArgs;
		try {
			toolArgs = JSON.parse(toolCall.function.arguments);
		} catch (e) {
			toolArgs = {};
		}

		if (isToolNeedTwoStepDisplay(toolCall.function.name)) {
			pendingDisplayMessages.push({
				role: 'assistant',
				content: `⚡ ${toolCall.publicName || toolDisplay.toolName}`,
				streaming: false,
				toolCall: {
					name: toolCall.publicName || toolCall.function.name,
					arguments: toolArgs,
				},
				toolDisplay,
				toolCallId: toolCall.id,
				toolPending: true,
				messageStatus: 'pending',
				parallelGroup: parallelGroupId,
			});
		}
	}

	if (pendingDisplayMessages.length > 0) {
		setMessages(prev => [...prev, ...pendingDisplayMessages]);
	}

	return {parallelGroupId};
}
