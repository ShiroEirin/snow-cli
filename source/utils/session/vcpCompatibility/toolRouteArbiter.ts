import type {MCPServiceTools, MCPTool} from '../../execution/mcpToolsManager.js';
import type {ApiConfig, ToolTransport} from '../../config/apiConfig.js';
import {getBridgeToolByName} from './toolSnapshot.js';
import type {
	BridgeModelToolDescriptor,
	SessionBridgeToolSnapshot,
} from './toolSnapshot.js';

export type ResolvedToolRegistry = {
	tools: MCPTool[];
	servicesInfo: MCPServiceTools[];
	duplicateToolNames: string[];
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

function dedupeRegistryTools(
	sources: Array<{
		tools: MCPTool[];
		servicesInfo: MCPServiceTools[];
	}>,
): ResolvedToolRegistry {
	const seenToolNames = new Set<string>();
	const duplicateToolNames = new Set<string>();
	const resolvedTools: MCPTool[] = [];
	const resolvedServices = new Map<string, MCPServiceTools>();

	for (const source of sources) {
		for (const tool of source.tools) {
			const toolName = tool.function.name;
			if (seenToolNames.has(toolName)) {
				duplicateToolNames.add(toolName);
				continue;
			}

			seenToolNames.add(toolName);
			resolvedTools.push(tool);
		}

		for (const serviceInfo of source.servicesInfo) {
			if (!resolvedServices.has(serviceInfo.serviceName)) {
				resolvedServices.set(serviceInfo.serviceName, serviceInfo);
			}
		}
	}

	return {
		tools: resolvedTools,
		servicesInfo: Array.from(resolvedServices.values()),
		duplicateToolNames: Array.from(duplicateToolNames).sort(),
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
	bridgeSnapshot?: Pick<SessionBridgeToolSnapshot, 'modelTools' | 'servicesInfo'>;
}): ResolvedToolRegistry {
	const transport = resolveToolTransport(options.config);
	const bridgeTools = options.bridgeSnapshot
		? projectBridgeToolsToRegistryTools(options.bridgeSnapshot.modelTools)
		: [];
	const bridgeServicesInfo = options.bridgeSnapshot?.servicesInfo || [];

	switch (transport) {
		case 'bridge':
			return dedupeRegistryTools([
				{
					tools: bridgeTools,
					servicesInfo: bridgeServicesInfo,
				},
			]);
		case 'hybrid':
			return dedupeRegistryTools([
				{
					tools: options.localTools,
					servicesInfo: options.localServicesInfo,
				},
				{
					tools: bridgeTools,
					servicesInfo: bridgeServicesInfo,
				},
			]);
		case 'local':
		default:
			return dedupeRegistryTools([
				{
					tools: options.localTools,
					servicesInfo: options.localServicesInfo,
				},
			]);
	}
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
