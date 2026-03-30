import type {MCPTool} from '../../execution/mcpToolsManager.js';
import {SessionLeaseStore} from './sessionLeaseStore.js';

export type LocalToolExecutionBinding = {
	kind: 'local';
	toolName: string;
};

export type BridgeToolExecutionBinding = {
	kind: 'bridge';
	toolName: string;
	pluginName: string;
	displayName: string;
	commandName: string;
	stringifyArgumentNames?: string[];
};

export type ToolExecutionBinding =
	| LocalToolExecutionBinding
	| BridgeToolExecutionBinding;

const DEFAULT_TOOL_PLANE_KEY = '__default__';
const TOOL_EXECUTION_BINDING_TTL_MS = 6 * 60 * 60 * 1000;
const TOOL_EXECUTION_BINDING_SWEEP_INTERVAL_MS = 10 * 60 * 1000;

const bindingLeaseStore = new SessionLeaseStore<Map<string, ToolExecutionBinding>>(
	{
		defaultKey: DEFAULT_TOOL_PLANE_KEY,
		ttlMs: TOOL_EXECUTION_BINDING_TTL_MS,
		sweepIntervalMs: TOOL_EXECUTION_BINDING_SWEEP_INTERVAL_MS,
	},
);

export function buildLocalToolExecutionBindings(
	tools: MCPTool[],
): LocalToolExecutionBinding[] {
	return tools.map(tool => ({
		kind: 'local',
		toolName: tool.function.name,
	}));
}

export function registerToolExecutionBindings(
	toolPlaneKey: string | undefined,
	bindings: ToolExecutionBinding[],
): void {
	const bindingPlane = new Map<string, ToolExecutionBinding>();

	for (const binding of bindings) {
		bindingPlane.set(binding.toolName, binding);
	}

	bindingLeaseStore.registerResource(toolPlaneKey, bindingPlane);
}

export function rotateToolExecutionBindingsSession(options: {
	sessionKey?: string;
	nextToolPlaneKey?: string;
	bindings: ToolExecutionBinding[];
}): string {
	const bindingPlane = new Map<string, ToolExecutionBinding>();
	for (const binding of options.bindings) {
		bindingPlane.set(binding.toolName, binding);
	}

	return bindingLeaseStore.rotateSession({
		sessionKey: options.sessionKey,
		nextResourceKey: options.nextToolPlaneKey,
		value: bindingPlane,
	});
}

export function clearToolExecutionBindings(toolPlaneKey?: string): void {
	bindingLeaseStore.clearResource(toolPlaneKey);
}

export function clearToolExecutionBindingsSession(sessionKey?: string): void {
	bindingLeaseStore.clearSession(sessionKey);
}

export function getToolExecutionBinding(
	toolName: string,
	toolPlaneKey?: string,
): ToolExecutionBinding | undefined {
	return bindingLeaseStore.getResource(toolPlaneKey)?.get(toolName);
}

export function filterToolExecutionBindings(
	toolNames: string[],
	toolPlaneKey?: string,
): ToolExecutionBinding[] {
	const bindingPlane = bindingLeaseStore.getResource(toolPlaneKey);
	if (!bindingPlane) {
		return [];
	}

	const filteredBindings: ToolExecutionBinding[] = [];
	const seenToolNames = new Set<string>();

	for (const toolName of toolNames) {
		if (seenToolNames.has(toolName)) {
			continue;
		}

		seenToolNames.add(toolName);
		const binding = bindingPlane.get(toolName);
		if (binding) {
			filteredBindings.push(binding);
		}
	}

	return filteredBindings;
}

function stringifyBridgeArgumentValue(value: unknown): unknown {
	if (typeof value === 'string') {
		return value;
	}

	if (
		typeof value === 'number' ||
		typeof value === 'boolean' ||
		typeof value === 'bigint'
	) {
		return String(value);
	}

	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

export function coerceBridgeExecutionArguments(
	args: Record<string, unknown>,
	binding: BridgeToolExecutionBinding,
): Record<string, unknown> {
	if (
		!binding.stringifyArgumentNames ||
		binding.stringifyArgumentNames.length === 0
	) {
		return args;
	}

	const normalizedArgs: Record<string, unknown> = {...args};

	for (const argumentName of binding.stringifyArgumentNames) {
		if (!(argumentName in normalizedArgs)) {
			continue;
		}

		const argumentValue = normalizedArgs[argumentName];
		if (argumentValue === undefined) {
			continue;
		}

		normalizedArgs[argumentName] = stringifyBridgeArgumentValue(argumentValue);
	}

	return normalizedArgs;
}
