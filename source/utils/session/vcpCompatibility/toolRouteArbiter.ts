import type {MCPServiceTools, MCPTool} from '../../execution/mcpToolsManager.js';
import type {ApiConfig, ToolTransport} from '../../config/apiConfig.js';
import type {BridgeModelToolDescriptor} from './bridgeManifestTranslator.js';
import type {SessionBridgeToolSnapshot} from './toolSnapshot.js';
import {
	buildLocalToolExecutionBindings,
	type ToolExecutionBinding,
} from './toolExecutionBinding.js';

export type ResolvedToolRegistry = {
	tools: MCPTool[];
	servicesInfo: MCPServiceTools[];
	duplicateToolNames: string[];
	executionBindings: ToolExecutionBinding[];
	retainedToolCounts: {
		local: number;
		bridge: number;
	};
};

export type EffectiveToolPlane = ToolTransport | 'none';

export type ToolPlaneRuntimeReasonCode =
	| 'configured'
	| 'bridge_manifest_failed'
	| 'bridge_tools_shadowed'
	| 'bridge_tools_unavailable'
	| 'local_tools_unavailable'
	| 'no_tools_available';

export type ToolPlaneRuntimeSnapshot = {
	configuredTransport: ToolTransport;
	effectiveTransport: EffectiveToolPlane;
	local: {
		requested: boolean;
		discoveredToolCount: number;
		retainedToolCount: number;
		active: boolean;
	};
	bridge: {
		requested: boolean;
		discoveredToolCount: number;
		retainedToolCount: number;
		active: boolean;
	};
};

export type ToolPlaneRuntimeReasonSidecar = {
	reasonCode: ToolPlaneRuntimeReasonCode;
};

export type ToolPlaneRuntimeState = {
	snapshot: ToolPlaneRuntimeSnapshot;
	sidecar: ToolPlaneRuntimeReasonSidecar;
};

function projectBridgeToolsToRegistryTools(
	tools: BridgeModelToolDescriptor[],
): MCPTool[] {
	return tools.map(tool => ({
		type: tool.type,
		function: {
			name: tool.function.name,
			description: tool.function.description,
			parameters: tool.function.parameters,
		},
	}));
}

function isRetainedServiceTool(options: {
	serviceName: string;
	toolName: string;
	retainedToolNames: Set<string>;
}): boolean {
	if (options.retainedToolNames.has(options.toolName)) {
		return true;
	}

	return options.retainedToolNames.has(
		`${options.serviceName}-${options.toolName}`,
	);
}

function dedupeRegistryTools(
	sources: Array<{
		plane: 'local' | 'bridge';
		tools: MCPTool[];
		servicesInfo: MCPServiceTools[];
		executionBindings: ToolExecutionBinding[];
	}>,
): ResolvedToolRegistry {
	const seenToolNames = new Set<string>();
	const duplicateToolNames = new Set<string>();
	const resolvedTools: MCPTool[] = [];
	const resolvedServices = new Map<string, MCPServiceTools>();
	const resolvedBindings = new Map<string, ToolExecutionBinding>();
	const retainedToolCounts = {
		local: 0,
		bridge: 0,
	};

	for (const source of sources) {
		const retainedToolNames = new Set<string>();

		for (const tool of source.tools) {
			const toolName = tool.function.name;
			if (seenToolNames.has(toolName)) {
				duplicateToolNames.add(toolName);
				continue;
			}

			seenToolNames.add(toolName);
			retainedToolNames.add(toolName);
			retainedToolCounts[source.plane] += 1;
			resolvedTools.push(tool);
		}

		for (const binding of source.executionBindings) {
			if (
				retainedToolNames.has(binding.toolName) &&
				!resolvedBindings.has(binding.toolName)
			) {
				resolvedBindings.set(binding.toolName, binding);
			}
		}

		for (const serviceInfo of source.servicesInfo) {
			const retainedServiceTools = serviceInfo.tools.filter(tool =>
				isRetainedServiceTool({
					serviceName: serviceInfo.serviceName,
					toolName: tool.name,
					retainedToolNames,
				}),
			);

			if (retainedServiceTools.length === 0) {
				continue;
			}

			if (!resolvedServices.has(serviceInfo.serviceName)) {
				resolvedServices.set(serviceInfo.serviceName, {
					...serviceInfo,
					tools: retainedServiceTools,
				});
			}
		}
	}

	return {
		tools: resolvedTools,
		servicesInfo: Array.from(resolvedServices.values()),
		duplicateToolNames: Array.from(duplicateToolNames).sort(),
		executionBindings: Array.from(resolvedBindings.values()),
		retainedToolCounts,
	};
}

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

export function resolveToolRegistry(options: {
	config: Pick<ApiConfig, 'toolTransport'>;
	localTools: MCPTool[];
	localServicesInfo: MCPServiceTools[];
	bridgeSnapshot?: Pick<
		SessionBridgeToolSnapshot,
		'modelTools' | 'servicesInfo' | 'bindings'
	>;
}): ResolvedToolRegistry {
	const transport = resolveToolTransport(options.config);
	const bridgeTools = options.bridgeSnapshot
		? projectBridgeToolsToRegistryTools(options.bridgeSnapshot.modelTools)
		: [];
	const bridgeServicesInfo = options.bridgeSnapshot?.servicesInfo || [];
	const localBindings = buildLocalToolExecutionBindings(options.localTools);
	const bridgeBindings = options.bridgeSnapshot?.bindings || [];

	switch (transport) {
		case 'bridge':
			return dedupeRegistryTools([
				{
					plane: 'bridge',
					tools: bridgeTools,
					servicesInfo: bridgeServicesInfo,
					executionBindings: bridgeBindings,
				},
			]);
		case 'hybrid':
			return dedupeRegistryTools([
				{
					plane: 'local',
					tools: options.localTools,
					servicesInfo: options.localServicesInfo,
					executionBindings: localBindings,
				},
				{
					plane: 'bridge',
					tools: bridgeTools,
					servicesInfo: bridgeServicesInfo,
					executionBindings: bridgeBindings,
				},
			]);
		case 'local':
		default:
			return dedupeRegistryTools([
				{
					plane: 'local',
					tools: options.localTools,
					servicesInfo: options.localServicesInfo,
					executionBindings: localBindings,
				},
			]);
	}
}

export function buildToolPlaneRuntimeState(options: {
	config: Pick<ApiConfig, 'toolTransport'>;
	localDiscoveredToolCount: number;
	localRetainedToolCount: number;
	bridgeDiscoveredToolCount: number;
	bridgeRetainedToolCount: number;
	bridgeLoadFailed?: boolean;
}): ToolPlaneRuntimeState {
	const configuredTransport = resolveToolTransport(options.config);
	const localRequested = shouldIncludeLocalTools(options.config);
	const bridgeRequested = shouldIncludeBridgeTools(options.config);
	const localActive = localRequested && options.localRetainedToolCount > 0;
	const bridgeActive = bridgeRequested && options.bridgeRetainedToolCount > 0;

	let effectiveTransport: EffectiveToolPlane;
	if (localActive && bridgeActive) {
		effectiveTransport = 'hybrid';
	} else if (bridgeActive) {
		effectiveTransport = 'bridge';
	} else if (localActive) {
		effectiveTransport = 'local';
	} else {
		effectiveTransport = 'none';
	}

	let reasonCode: ToolPlaneRuntimeReasonCode = 'configured';
	if (effectiveTransport === 'none') {
		reasonCode = 'no_tools_available';
	} else if (
		configuredTransport === 'hybrid' &&
		effectiveTransport === 'local'
	) {
		if (options.bridgeLoadFailed) {
			reasonCode = 'bridge_manifest_failed';
		} else if (
			options.bridgeDiscoveredToolCount > 0 &&
			options.bridgeRetainedToolCount === 0
		) {
			reasonCode = 'bridge_tools_shadowed';
		} else {
			reasonCode = 'bridge_tools_unavailable';
		}
	} else if (
		configuredTransport === 'hybrid' &&
		effectiveTransport === 'bridge'
	) {
		reasonCode = 'local_tools_unavailable';
	}

	return {
		snapshot: {
			configuredTransport,
			effectiveTransport,
			local: {
				requested: localRequested,
				discoveredToolCount: localRequested
					? options.localDiscoveredToolCount
					: 0,
				retainedToolCount: localRequested ? options.localRetainedToolCount : 0,
				active: localActive,
			},
			bridge: {
				requested: bridgeRequested,
				discoveredToolCount: bridgeRequested
					? options.bridgeDiscoveredToolCount
					: 0,
				retainedToolCount: bridgeRequested
					? options.bridgeRetainedToolCount
					: 0,
				active: bridgeActive,
			},
		},
		sidecar: {
			reasonCode,
		},
	};
}
