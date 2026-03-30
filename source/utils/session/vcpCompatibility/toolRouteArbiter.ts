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
					tools: bridgeTools,
					servicesInfo: bridgeServicesInfo,
					executionBindings: bridgeBindings,
				},
			]);
		case 'hybrid':
			return dedupeRegistryTools([
				{
					tools: options.localTools,
					servicesInfo: options.localServicesInfo,
					executionBindings: localBindings,
				},
				{
					tools: bridgeTools,
					servicesInfo: bridgeServicesInfo,
					executionBindings: bridgeBindings,
				},
			]);
		case 'local':
		default:
			return dedupeRegistryTools([
				{
					tools: options.localTools,
					servicesInfo: options.localServicesInfo,
					executionBindings: localBindings,
				},
			]);
	}
}
