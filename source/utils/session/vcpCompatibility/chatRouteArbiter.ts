import type {RequestMethod} from '../../config/apiConfig.js';
import type {VcpCompatibilityConfig} from './types.js';

export function resolveChatRouteRequestMethod(
	config: VcpCompatibilityConfig,
): RequestMethod {
	return config.requestMethod || 'chat';
}

export function resolveModelFetchRouteMethod(
	config: VcpCompatibilityConfig,
): RequestMethod {
	return config.requestMethod || 'chat';
}
