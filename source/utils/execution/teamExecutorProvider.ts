import type {ChatMessage} from '../../api/chat.js';
import type {ApiConfig} from '../config/apiConfig.js';
import {applyVcpOutboundMessageTransforms} from '../session/vcpCompatibility/applyOutboundMessageTransforms.js';
import type {
	VcpModeRequestArgs,
	VcpModeResolution,
} from '../session/vcpCompatibility/mode.js';

type TeammateStream = AsyncIterable<any>;
type TeammateTools = NonNullable<VcpModeRequestArgs['tools']>;
type TeammateResolvedRequest = VcpModeResolution & {
	tools?: VcpModeResolution['tools'];
};

export interface TeammateProviderStreamFactories {
	createStreamingChatCompletion: (
		options: {
			model: string;
			messages: ChatMessage[];
			temperature: number;
			tools?: VcpModeResolution['tools'];
			tool_choice?: VcpModeResolution['toolChoice'];
		},
		abortSignal?: AbortSignal,
	) => TeammateStream;
	createStreamingAnthropicCompletion: (
		options: {
			model: string;
			messages: ChatMessage[];
			temperature: number;
			max_tokens: number;
			tools?: VcpModeResolution['tools'];
			sessionId?: string;
		},
		abortSignal?: AbortSignal,
	) => TeammateStream;
	createStreamingGeminiCompletion: (
		options: {
			model: string;
			messages: ChatMessage[];
			temperature: number;
			tools?: VcpModeResolution['tools'];
		},
		abortSignal?: AbortSignal,
	) => TeammateStream;
	createStreamingResponse: (
		options: {
			model: string;
			messages: ChatMessage[];
			temperature: number;
			tools?: VcpModeResolution['tools'];
			tool_choice?: VcpModeResolution['toolChoice'];
			prompt_cache_key?: string;
		},
		abortSignal?: AbortSignal,
	) => TeammateStream;
}

export interface PrepareTeammateProviderRequestOptions {
	config: ApiConfig;
	model: string;
	allowedTools: TeammateTools;
	messages: ChatMessage[];
	resolveVcpModeRequest: (
		config: ApiConfig,
		args: VcpModeRequestArgs,
	) => VcpModeResolution;
}

export function prepareTeammateProviderRequest(
	options: PrepareTeammateProviderRequestOptions,
): {
	resolvedRequest: TeammateResolvedRequest;
	transformedMessages: ChatMessage[];
} {
	const resolvedRequest = options.resolveVcpModeRequest(options.config, {
		model: options.model,
		tools: options.allowedTools,
		toolChoice: 'auto',
	}) as TeammateResolvedRequest;
	const transformedMessages = applyVcpOutboundMessageTransforms({
		config: {
			...options.config,
			requestMethod: resolvedRequest.requestMethod,
		},
		messages: options.messages,
	});

	return {
		resolvedRequest,
		transformedMessages,
	};
}

export interface CreateTeammateProviderStreamOptions
	extends PrepareTeammateProviderRequestOptions {
	currentSessionId?: string;
	abortSignal?: AbortSignal;
	streamFactories: TeammateProviderStreamFactories;
}

export function createTeammateProviderStream(
	options: CreateTeammateProviderStreamOptions,
): TeammateStream {
	const {resolvedRequest, transformedMessages} =
		prepareTeammateProviderRequest(options);

	switch (resolvedRequest.requestMethod) {
		case 'anthropic': {
			return options.streamFactories.createStreamingAnthropicCompletion(
				{
					model: options.model,
					messages: transformedMessages,
					temperature: 0,
					max_tokens: options.config.maxTokens || 4096,
					tools: resolvedRequest.tools,
					sessionId: options.currentSessionId,
				},
				options.abortSignal,
			);
		}

		case 'gemini': {
			return options.streamFactories.createStreamingGeminiCompletion(
				{
					model: options.model,
					messages: transformedMessages,
					temperature: 0,
					tools: resolvedRequest.tools,
				},
				options.abortSignal,
			);
		}

		case 'responses': {
			return options.streamFactories.createStreamingResponse(
				{
					model: options.model,
					messages: transformedMessages,
					temperature: 0,
					tools: resolvedRequest.tools,
					tool_choice: resolvedRequest.toolChoice,
					prompt_cache_key: options.currentSessionId,
				},
				options.abortSignal,
			);
		}

		default: {
			return options.streamFactories.createStreamingChatCompletion(
				{
					model: options.model,
					messages: transformedMessages,
					temperature: 0,
					tools: resolvedRequest.tools,
					tool_choice: resolvedRequest.toolChoice,
				},
				options.abortSignal,
			);
		}
	}
}
