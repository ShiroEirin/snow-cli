import type {MCPTool} from '../../execution/mcpToolsManager.js';
import type {VcpApiConfig} from '../../config/apiConfig.js';
import type {BridgeManifestToolFilters} from './bridgeClient.js';
import {resolveToolTransport} from './toolRouteArbiter.js';

export function buildBridgeManifestToolFilters(options: {
	config?: Pick<VcpApiConfig, 'bridgeToolProfile'>;
	transport: ReturnType<typeof resolveToolTransport>;
	localTools: MCPTool[];
}): BridgeManifestToolFilters | undefined {
	const profileName = String(options.config?.bridgeToolProfile || '').trim();
	const excludeExactToolNames =
		options.transport === 'hybrid' && options.localTools.length > 0
			? Array.from(
					new Set(
						options.localTools
							.map(tool => tool.function.name.trim())
							.filter(Boolean),
					),
			  ).sort((left, right) => left.localeCompare(right))
			: [];

	if (!profileName && excludeExactToolNames.length === 0) {
		return undefined;
	}

	return {
		...(profileName ? {profileName} : {}),
		excludeExactToolNames,
	};
}
