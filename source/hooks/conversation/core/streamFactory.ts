import {
	createStreamingChatCompletion,
	type ChatMessage,
} from '../../../api/chat.js';
import {createStreamingResponse} from '../../../api/responses.js';
import {createStreamingGeminiCompletion} from '../../../api/gemini.js';
import {createStreamingAnthropicCompletion} from '../../../api/anthropic.js';
import type {MCPTool} from '../../../utils/execution/mcpToolsManager.js';
import {resolveVcpGatewayRequest} from '../../../utils/session/vcpCompatibility/gateway.js';

export type StreamFactoryOptions = {
	config: any;
	model: string;
	conversationMessages: ChatMessage[];
	activeTools: MCPTool[];
	sessionId?: string;
	useBasicModel?: boolean;
	planMode?: boolean;
	vulnerabilityHuntingMode?: boolean;
	toolSearchDisabled?: boolean;
	signal: AbortSignal;
	onRetry: (error: Error, attempt: number, nextDelay: number) => void;
};

export function createStreamGenerator(options: StreamFactoryOptions) {
	const {
		config,
		model,
		conversationMessages,
		activeTools,
		sessionId,
		signal,
		onRetry,
	} = options;
	const tools = activeTools.length > 0 ? activeTools : undefined;
	const gatewayRequest = resolveVcpGatewayRequest(config, {
		model,
		tools,
		toolChoice: 'auto',
	});

	if (gatewayRequest.requestMethod === 'anthropic') {
		return createStreamingAnthropicCompletion(
			{
				model,
				messages: conversationMessages,
				temperature: 0,
				max_tokens: config.maxTokens || 4096,
				tools: gatewayRequest.tools,
				sessionId,
				disableThinking: options.useBasicModel,
				planMode: options.planMode,
				vulnerabilityHuntingMode: options.vulnerabilityHuntingMode,
				toolSearchDisabled: options.toolSearchDisabled,
			},
			signal,
			onRetry,
		);
	}

	if (gatewayRequest.requestMethod === 'gemini') {
		return createStreamingGeminiCompletion(
			{
				model,
				messages: conversationMessages,
				temperature: 0,
				tools: gatewayRequest.tools,
				planMode: options.planMode,
				vulnerabilityHuntingMode: options.vulnerabilityHuntingMode,
				toolSearchDisabled: options.toolSearchDisabled,
			},
			signal,
			onRetry,
		);
	}

	if (gatewayRequest.requestMethod === 'responses') {
		return createStreamingResponse(
			{
				model,
				messages: conversationMessages,
				temperature: 0,
				tools: gatewayRequest.tools,
				tool_choice: gatewayRequest.toolChoice,
				prompt_cache_key: sessionId,
				reasoning: options.useBasicModel ? null : undefined,
				planMode: options.planMode,
				vulnerabilityHuntingMode: options.vulnerabilityHuntingMode,
				toolSearchDisabled: options.toolSearchDisabled,
			},
			signal,
			onRetry,
		);
	}

	return createStreamingChatCompletion(
		{
			model,
			messages: conversationMessages,
			temperature: 0,
			tools: gatewayRequest.tools,
			planMode: options.planMode,
			vulnerabilityHuntingMode: options.vulnerabilityHuntingMode,
			toolSearchDisabled: options.toolSearchDisabled,
		},
		signal,
		onRetry,
	);
}
