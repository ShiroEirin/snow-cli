import type {
	SnowBridgeApiConfig,
	VcpApiConfig,
} from '../../config/apiConfig.js';
import type {MCPServiceTools, MCPTool} from '../../execution/mcpToolsManager.js';
import {
	resolveToolRegistry,
	type ToolPlaneRuntimeState,
} from './toolRouteArbiter.js';
import {
	rotateToolExecutionBindingsSession,
} from './toolExecutionBinding.js';
import {DEFAULT_TOOL_PLANE_KEY} from './constants.js';
import {buildPreparedToolPlaneRuntimeState} from './toolPlaneRuntime.js';
import {loadPreparedToolPlaneSources} from './toolPlaneSourceLoader.js';

export {buildBridgeManifestToolFilters} from './toolPlaneFilters.js';
export {buildPreparedToolPlaneRuntimeState} from './toolPlaneRuntime.js';

export type PreparedToolPlane = {
	tools: MCPTool[];
	servicesInfo: MCPServiceTools[];
	duplicateToolNames: string[];
	toolPlaneKey: string;
	runtimeState: ToolPlaneRuntimeState;
};

export function appendSyntheticToolPlaneTools(
	tools: MCPTool[],
	syntheticTools?: readonly MCPTool[],
): MCPTool[] {
	if (!syntheticTools || syntheticTools.length === 0) {
		return tools;
	}

	return [...tools, ...syntheticTools];
}

type PreparedToolPlaneConfig = SnowBridgeApiConfig &
	Pick<VcpApiConfig, 'bridgeToolProfile'>;

function resolveFallbackToolPlaneKey(sessionKey?: string): string {
	return sessionKey?.trim() || DEFAULT_TOOL_PLANE_KEY;
}

export async function prepareToolPlane(options: {
	config: PreparedToolPlaneConfig;
	sessionKey?: string;
	syntheticTools?: readonly MCPTool[];
}): Promise<PreparedToolPlane> {
	const {
		localTools,
		localServicesInfo,
		bridgeSnapshot,
		bridgeLoadFailed,
	} = await loadPreparedToolPlaneSources({
		config: options.config,
		sessionKey: options.sessionKey,
	});

	const registry = resolveToolRegistry({
		config: options.config,
		localTools,
		localServicesInfo,
		bridgeSnapshot,
	});
	const runtimeState = buildPreparedToolPlaneRuntimeState({
		config: options.config,
		registry,
		localDiscoveredToolCount: localTools.length,
		bridgeDiscoveredToolCount: bridgeSnapshot?.modelTools.length || 0,
		bridgeLoadFailed,
	});
	const toolPlaneKey = rotateToolExecutionBindingsSession({
		sessionKey: options.sessionKey,
		nextToolPlaneKey:
			bridgeSnapshot?.snapshotKey ||
			resolveFallbackToolPlaneKey(options.sessionKey),
		bindings: registry.executionBindings,
	});

	return {
		tools: appendSyntheticToolPlaneTools(
			registry.tools,
			options.syntheticTools,
		),
		servicesInfo: registry.servicesInfo,
		duplicateToolNames: registry.duplicateToolNames,
		toolPlaneKey,
		runtimeState,
	};
}
