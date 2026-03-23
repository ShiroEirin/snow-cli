import type {ChatCompletionTool} from '../../../api/chat.js';
import type {RequestMethod} from '../../config/apiConfig.js';
import type {VcpCompatibilityConfig} from './types.js';

export type VcpGatewayToolChoice = 'auto' | 'none' | 'required';

export type VcpGatewayRequestArgs = {
	model?: string;
	tools?: ChatCompletionTool[];
	toolChoice?: VcpGatewayToolChoice;
};

export type VcpGatewayResolution = {
	enabled: boolean;
	requestMethod: RequestMethod;
	tools?: ChatCompletionTool[];
	toolChoice?: VcpGatewayToolChoice;
};

const LOCALHOST_BASE_URL_PATTERN =
	/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/.*)?$/i;

const ANTHROPIC_MODEL_PATTERN =
	/\b(?:claude|anthropic|opus|sonnet|haiku)\b/i;
const GEMINI_MODEL_PATTERN = /\b(?:gemini|learnlm)\b/i;

function looksLikeVcpCompatibleEndpoint(baseUrl?: string): boolean {
	if (!baseUrl) {
		return false;
	}

	return LOCALHOST_BASE_URL_PATTERN.test(baseUrl);
}

function shouldStripToolsForModel(model?: string): boolean {
	if (!model) {
		return false;
	}

	if (GEMINI_MODEL_PATTERN.test(model)) {
		return false;
	}

	return ANTHROPIC_MODEL_PATTERN.test(model);
}

export function shouldUseVcpGateway(config: VcpCompatibilityConfig): boolean {
	if (config.enableVcpGateway === true) {
		return true;
	}

	if (config.enableVcpGateway === false) {
		return false;
	}

	return looksLikeVcpCompatibleEndpoint(config.baseUrl);
}

export function resolveVcpGatewayRequest(
	config: VcpCompatibilityConfig,
	args: VcpGatewayRequestArgs = {},
): VcpGatewayResolution {
	const requestMethod = config.requestMethod || 'chat';
	const enabled = shouldUseVcpGateway(config);

	if (!enabled) {
		return {
			enabled: false,
			requestMethod,
			tools: args.tools,
			toolChoice: args.toolChoice,
		};
	}

	const resolvedTools =
		args.tools && args.tools.length > 0 && !shouldStripToolsForModel(args.model)
			? args.tools
			: undefined;

	return {
		enabled: true,
		requestMethod: 'chat',
		tools: resolvedTools,
		toolChoice: resolvedTools ? args.toolChoice : undefined,
	};
}

export function resolveVcpGatewayModelFetchMethod(
	config: VcpCompatibilityConfig,
): RequestMethod {
	if (shouldUseVcpGateway(config)) {
		return 'chat';
	}

	return config.requestMethod || 'chat';
}
