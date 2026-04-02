import {
	createStreamingChatCompletion,
	type ChatMessage,
} from '../../../api/chat.js';
import {createStreamingResponse} from '../../../api/responses.js';
import {createStreamingGeminiCompletion} from '../../../api/gemini.js';
import {createStreamingAnthropicCompletion} from '../../../api/anthropic.js';
import type {MCPTool} from '../../../utils/execution/mcpToolsManager.js';
import {applyVcpOutboundMessageTransforms} from '../../../utils/session/vcpCompatibility/applyOutboundMessageTransforms.js';
import {resolveVcpModeRequest} from '../../../utils/session/vcpCompatibility/mode.js';

export type StreamFactoryOptions = {
	config: any;
	model: string;
	conversationMessages: ChatMessage[];
	activeTools: MCPTool[];
	sessionId?: string;
	useBasicModel?: boolean;
	planMode?: boolean;
	vulnerabilityHuntingMode?: boolean;
	teamMode?: boolean;
	toolSearchDisabled?: boolean;
	signal: AbortSignal;
	onRetry: (error: Error, attempt: number, nextDelay: number) => void;
};

export function buildStreamRequestContext(
	options: Pick<
		StreamFactoryOptions,
		'config' | 'model' | 'conversationMessages' | 'activeTools'
	>,
) {
	const {config, model, conversationMessages, activeTools} = options;
	const tools = activeTools.length > 0 ? activeTools : undefined;
	const resolvedRequest = resolveVcpModeRequest(config, {
		model,
		tools,
		toolChoice: 'auto',
	});
	const transformedMessages = applyVcpOutboundMessageTransforms({
		config: {
			...config,
			requestMethod: resolvedRequest.requestMethod,
		},
		messages: conversationMessages,
	});

	return {
		resolvedRequest,
		transformedMessages,
	};
}

export function createStreamGenerator(options: StreamFactoryOptions) {
	const {
		config,
		model,
		sessionId,
		signal,
		onRetry,
	} = options;
	const {resolvedRequest, transformedMessages} = buildStreamRequestContext(options);

	if (resolvedRequest.requestMethod === 'anthropic') {
		return createStreamingAnthropicCompletion(
			{
				model,
				messages: transformedMessages,
				temperature: 0,
				max_tokens: config.maxTokens || 4096,
				tools: resolvedRequest.tools,
				sessionId,
				disableThinking: options.useBasicModel,
				planMode: options.planMode,
				vulnerabilityHuntingMode: options.vulnerabilityHuntingMode,
				teamMode: options.teamMode,
				toolSearchDisabled: options.toolSearchDisabled,
			},
			signal,
			onRetry,
		);
	}

	if (resolvedRequest.requestMethod === 'gemini') {
		return createStreamingGeminiCompletion(
			{
				model,
				messages: transformedMessages,
				temperature: 0,
				tools: resolvedRequest.tools,
				planMode: options.planMode,
				vulnerabilityHuntingMode: options.vulnerabilityHuntingMode,
				teamMode: options.teamMode,
				toolSearchDisabled: options.toolSearchDisabled,
			},
			signal,
			onRetry,
		);
	}

	if (resolvedRequest.requestMethod === 'responses') {
		return createStreamingResponse(
			{
				model,
				messages: transformedMessages,
				temperature: 0,
				tools: resolvedRequest.tools,
				tool_choice: resolvedRequest.toolChoice,
				prompt_cache_key: sessionId,
				reasoning: options.useBasicModel ? null : undefined,
				planMode: options.planMode,
				vulnerabilityHuntingMode: options.vulnerabilityHuntingMode,
				teamMode: options.teamMode,
				toolSearchDisabled: options.toolSearchDisabled,
			},
			signal,
			onRetry,
		);
	}

	return createStreamingChatCompletion(
		{
			model,
			messages: transformedMessages,
			temperature: 0,
			tools: resolvedRequest.tools,
			planMode: options.planMode,
			vulnerabilityHuntingMode: options.vulnerabilityHuntingMode,
			teamMode: options.teamMode,
			toolSearchDisabled: options.toolSearchDisabled,
		},
		signal,
		onRetry,
	);
}
