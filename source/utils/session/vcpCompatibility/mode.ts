import type {ChatCompletionTool} from '../../../api/chat.js';
import type {RequestMethod} from '../../config/apiConfig.js';
import {sanitizeAnthropicVcpTools} from './anthropicToolSchemaSanitizer.js';
import type {VcpCompatibilityConfig} from './types.js';

export type VcpModeToolChoice = 'auto' | 'none' | 'required';

export type VcpModeRequestArgs = {
	model?: string;
	tools?: ChatCompletionTool[];
	toolChoice?: VcpModeToolChoice;
};

export type VcpModeResolution = {
	enabled: boolean;
	requestMethod: RequestMethod;
	tools?: ChatCompletionTool[];
	toolChoice?: VcpModeToolChoice;
};

export function resolveVcpRequestHeaders(
	config: VcpCompatibilityConfig,
): Record<string, string> {
	if (!isVcpModeEnabled(config)) {
		return {};
	}

	return {
		'x-snow-client': 'snow-cli',
		'x-snow-protocol': 'function-calling',
		'x-snow-tool-mode': config.toolTransport || 'local',
	};
}

function looksLikeAnthropicModel(model?: string): boolean {
	return /(claude|anthropic)/i.test(model ?? '');
}

export function isVcpModeEnabled(config: VcpCompatibilityConfig): boolean {
	return config.backendMode === 'vcp';
}

export function shouldSanitizeVcpModeTools(
	config: VcpCompatibilityConfig,
	args: VcpModeRequestArgs = {},
): boolean {
	if (!isVcpModeEnabled(config)) {
		return false;
	}

	return config.requestMethod === 'anthropic' || looksLikeAnthropicModel(args.model);
}

export function resolveVcpModeRequest(
	config: VcpCompatibilityConfig,
	args: VcpModeRequestArgs = {},
): VcpModeResolution {
	const requestMethod = config.requestMethod || 'chat';
	const enabled = isVcpModeEnabled(config);

	if (!enabled) {
		return {
			enabled: false,
			requestMethod,
			tools: args.tools,
			toolChoice: args.toolChoice,
		};
	}

	const resolvedTools =
		args.tools && args.tools.length > 0
			? shouldSanitizeVcpModeTools(config, args)
				? sanitizeAnthropicVcpTools(args.tools)
				: args.tools
			: undefined;

	return {
		enabled: true,
		requestMethod: 'chat',
		tools: resolvedTools,
		toolChoice: resolvedTools ? args.toolChoice : undefined,
	};
}

export function resolveVcpModeModelFetchMethod(
	config: VcpCompatibilityConfig,
): RequestMethod {
	return config.requestMethod || 'chat';
}
