import type {VcpApiConfig} from '../../config/apiConfig.js';
import {
	buildToolPlaneRuntimeState,
	resolveToolRegistry,
	type ToolPlaneRuntimeState,
} from './toolRouteArbiter.js';

export function buildPreparedToolPlaneRuntimeState(options: {
	config: Pick<VcpApiConfig, 'toolTransport'>;
	registry: Pick<ReturnType<typeof resolveToolRegistry>, 'retainedToolCounts'>;
	localDiscoveredToolCount: number;
	bridgeDiscoveredToolCount: number;
	bridgeLoadFailed?: boolean;
}): ToolPlaneRuntimeState {
	return buildToolPlaneRuntimeState({
		config: options.config,
		localDiscoveredToolCount: options.localDiscoveredToolCount,
		localRetainedToolCount: options.registry.retainedToolCounts.local,
		bridgeDiscoveredToolCount: options.bridgeDiscoveredToolCount,
		bridgeRetainedToolCount: options.registry.retainedToolCounts.bridge,
		bridgeLoadFailed: options.bridgeLoadFailed,
	});
}
