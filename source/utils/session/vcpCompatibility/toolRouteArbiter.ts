import type {ApiConfig, ToolTransport} from '../../config/apiConfig.js';
import {getBridgeToolByName} from './toolSnapshot.js';

export function resolveToolTransport(
	config: Pick<ApiConfig, 'toolTransport'>,
): ToolTransport {
	if (
		config.toolTransport === 'bridge' ||
		config.toolTransport === 'hybrid'
	) {
		return config.toolTransport;
	}

	return 'local';
}

export function shouldIncludeBridgeTools(
	config: Pick<ApiConfig, 'toolTransport'>,
): boolean {
	const transport = resolveToolTransport(config);
	return transport === 'bridge' || transport === 'hybrid';
}

export function shouldIncludeLocalTools(
	config: Pick<ApiConfig, 'toolTransport'>,
): boolean {
	const transport = resolveToolTransport(config);
	return transport === 'local' || transport === 'hybrid';
}

export function resolveToolExecutionRoute(options: {
	config: Pick<ApiConfig, 'toolTransport'>;
	toolName: string,
	snapshotKey?: string,
}): 'local' | 'bridge' {
	if (!shouldIncludeBridgeTools(options.config)) {
		return 'local';
	}

	return getBridgeToolByName(options.toolName, options.snapshotKey)
		? 'bridge'
		: 'local';
}
