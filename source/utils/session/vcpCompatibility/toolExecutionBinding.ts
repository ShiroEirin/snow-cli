import {resolve as resolvePath} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {MCPTool} from '../../execution/mcpToolsManager.js';
import type {
	BridgeToolEffect,
	BridgeToolMetadata,
	SnowBridgeToolIdentityFields,
} from './types.js';
import {SessionLeaseStore} from './sessionLeaseStore.js';
import {DEFAULT_TOOL_PLANE_KEY} from './constants.js';

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
	metadata?: BridgeToolMetadata;
	stringifyArgumentNames?: string[];
	argumentBindings?: BridgeToolArgumentBinding[];
} & SnowBridgeToolIdentityFields;

export type BridgeToolArgumentBinding = {
	name: string;
	aliases?: string[];
	fileUrlCompatible?: boolean;
	pathLike?: boolean;
};

export type ToolExecutionBinding =
	| LocalToolExecutionBinding
	| BridgeToolExecutionBinding;

const TOOL_EXECUTION_BINDING_TTL_MS = 6 * 60 * 60 * 1000;
const TOOL_EXECUTION_BINDING_SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_TOOL_PLANE_LOOKUP_KEY = DEFAULT_TOOL_PLANE_KEY.trim();

const bindingLeaseStore = new SessionLeaseStore<
	Map<string, ToolExecutionBinding>
>({
	defaultKey: DEFAULT_TOOL_PLANE_KEY,
	ttlMs: TOOL_EXECUTION_BINDING_TTL_MS,
	sweepIntervalMs: TOOL_EXECUTION_BINDING_SWEEP_INTERVAL_MS,
});
const bindingSessionRegistry = new Map<string, string>();

function resolveBindingLookupKey(key?: string): string {
	const normalizedKey = key?.trim();
	return normalizedKey ? normalizedKey : DEFAULT_TOOL_PLANE_LOOKUP_KEY;
}

function clearRegisteredBindingPlane(resourceKey: string): void {
	for (const [
		sessionKey,
		registeredResourceKey,
	] of bindingSessionRegistry.entries()) {
		if (registeredResourceKey === resourceKey) {
			bindingSessionRegistry.delete(sessionKey);
		}
	}
}

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

	const resolvedToolPlaneKey = bindingLeaseStore.registerResource(
		toolPlaneKey,
		bindingPlane,
	);
	clearRegisteredBindingPlane(resolvedToolPlaneKey);
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

	const resolvedResourceKey = bindingLeaseStore.rotateSession({
		sessionKey: options.sessionKey,
		nextResourceKey: options.nextToolPlaneKey,
		value: bindingPlane,
	});
	bindingSessionRegistry.set(
		resolveBindingLookupKey(options.sessionKey),
		resolvedResourceKey,
	);

	return resolvedResourceKey;
}

export function clearToolExecutionBindings(toolPlaneKey?: string): void {
	const resolvedToolPlaneKey = resolveBindingLookupKey(toolPlaneKey);
	bindingLeaseStore.clearResource(resolvedToolPlaneKey);
	clearRegisteredBindingPlane(resolvedToolPlaneKey);
}

export function clearToolExecutionBindingsSession(sessionKey?: string): void {
	const resolvedSessionKey = resolveBindingLookupKey(sessionKey);
	const registeredResourceKey = bindingSessionRegistry.get(resolvedSessionKey);
	bindingLeaseStore.clearSession(resolvedSessionKey);
	bindingSessionRegistry.delete(resolvedSessionKey);
	if (registeredResourceKey) {
		clearRegisteredBindingPlane(registeredResourceKey);
	}
}

export function getToolExecutionBinding(
	toolName: string,
	toolPlaneKey?: string,
): ToolExecutionBinding | undefined {
	const normalizedToolPlaneKey = toolPlaneKey?.trim();
	if (normalizedToolPlaneKey) {
		const directBinding = bindingLeaseStore
			.getResource(normalizedToolPlaneKey)
			?.get(toolName);
		if (directBinding) {
			return directBinding;
		}

		const registeredResourceKey = bindingSessionRegistry.get(
			normalizedToolPlaneKey,
		);
		if (
			registeredResourceKey &&
			registeredResourceKey !== normalizedToolPlaneKey
		) {
			return bindingLeaseStore
				.getResource(registeredResourceKey)
				?.get(toolName);
		}

		return undefined;
	}

	return bindingLeaseStore
		.getResource(DEFAULT_TOOL_PLANE_LOOKUP_KEY)
		?.get(toolName);
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

const MUTATING_BRIDGE_EFFECTS = new Set<BridgeToolEffect>([
	'write',
	'delete',
	'command',
]);

function inferBridgeToolEffectFromName(
	binding: BridgeToolExecutionBinding,
): BridgeToolEffect {
	const rawName = `${binding.pluginName} ${binding.displayName} ${binding.commandName}`;
	const normalizedName = rawName.toLowerCase();

	if (/\b(?:delete|remove|unlink|erase|clear|purge)\b/i.test(rawName)) {
		return 'delete';
	}

	if (
		/\b(?:exec|execute|run|shell|terminal|command|script|spawn)\b/i.test(
			rawName,
		)
	) {
		return 'command';
	}

	if (
		/\b(?:write|edit|replace|create|update|save|apply|patch|move|copy|upload|append|organize|associate)\b/i.test(
			rawName,
		)
	) {
		return 'write';
	}

	if (
		/\b(?:read|get|list|query|search|find|lookup|inspect|status|describe|preview|fetch)\b/i.test(
			rawName,
		)
	) {
		return 'read';
	}

	if (/(delete|remove|unlink|erase|clear|purge)/i.test(normalizedName)) {
		return 'delete';
	}

	if (
		/(exec|execute|run|shell|terminal|command|script|spawn)/i.test(
			normalizedName,
		)
	) {
		return 'command';
	}

	if (
		/(write|edit|replace|create|update|save|apply|patch|move|copy|upload|append|organize|associate)/i.test(
			normalizedName,
		)
	) {
		return 'write';
	}

	if (
		/(read|get|list|query|search|find|lookup|inspect|status|describe|preview|fetch)/i.test(
			normalizedName,
		)
	) {
		return 'read';
	}

	return 'unknown';
}

export function resolveBridgeToolEffect(
	binding: BridgeToolExecutionBinding,
): BridgeToolEffect {
	return binding.metadata?.effect || inferBridgeToolEffectFromName(binding);
}

export function hasBridgePathLikeArguments(
	binding: BridgeToolExecutionBinding,
): boolean {
	return (binding.argumentBindings || []).some(
		argumentBinding =>
			argumentBinding.pathLike || argumentBinding.fileUrlCompatible,
	);
}

export function isBridgeToolMutationSensitive(
	binding: BridgeToolExecutionBinding,
): boolean {
	if (binding.metadata?.requiresApproval === true) {
		return true;
	}

	const explicitEffect = binding.metadata?.effect;
	const inferredEffect = inferBridgeToolEffectFromName(binding);
	if (
		(explicitEffect && MUTATING_BRIDGE_EFFECTS.has(explicitEffect)) ||
		MUTATING_BRIDGE_EFFECTS.has(inferredEffect)
	) {
		return true;
	}

	if (
		binding.metadata?.readOnly === true ||
		explicitEffect === 'read' ||
		inferredEffect === 'read'
	) {
		return false;
	}

	return hasBridgePathLikeArguments(binding);
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function looksLikeBareFileNameCandidate(value: string): boolean {
	return /^[^\s:*?"<>|]+(?:\.[^\s:*?"<>|]+)+$/u.test(value);
}

function looksLikeLocalPathCandidate(
	value: string,
	allowBareFileName = true,
): boolean {
	const normalizedValue = String(value || '').trim();
	if (!normalizedValue) {
		return false;
	}

	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedValue)) {
		return false;
	}

	return (
		/^[a-z]:[\\/]/i.test(normalizedValue) ||
		/^\\\\/.test(normalizedValue) ||
		/^[\\/]/.test(normalizedValue) ||
		/^\.\.?(?:[\\/]|$)/.test(normalizedValue) ||
		/[\\/]/.test(normalizedValue) ||
		(allowBareFileName && looksLikeBareFileNameCandidate(normalizedValue))
	);
}

function tokenizePathPropertyName(key: string): string[] {
	return key
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.split(/[^a-zA-Z0-9]+/)
		.map(token => token.trim().toLowerCase())
		.filter(Boolean)
		.map(token => {
			if (token.endsWith('ies')) {
				return `${token.slice(0, -3)}y`;
			}

			if (token.length > 1 && token.endsWith('s')) {
				return token.slice(0, -1);
			}

			return token;
		});
}

function looksLikePathPropertyName(key: string): boolean {
	const tokens = tokenizePathPropertyName(key);
	return tokens.some(
		token =>
			token === 'path' ||
			token === 'file' ||
			token === 'url' ||
			token === 'uri' ||
			token === 'image' ||
			token === 'directory' ||
			token === 'dir' ||
			token === 'folder' ||
			token === 'cwd',
	);
}

type FileUrlTraversalMode = 'root' | 'keyedPath' | 'neutral';

function normalizeBridgeFileUrlValue(
	value: unknown,
	traversalMode: FileUrlTraversalMode = 'root',
): unknown {
	if (typeof value === 'string') {
		const normalizedValue = value.trim();
		if (
			!normalizedValue ||
			normalizedValue.toLowerCase().startsWith('file://') ||
			!looksLikeLocalPathCandidate(normalizedValue, traversalMode !== 'neutral')
		) {
			return value;
		}

		return pathToFileURL(resolvePath(normalizedValue)).toString();
	}

	if (Array.isArray(value)) {
		return value.map(item => normalizeBridgeFileUrlValue(item, traversalMode));
	}

	if (isPlainObject(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				normalizeBridgeFileUrlValue(
					item,
					looksLikePathPropertyName(key) ? 'keyedPath' : 'neutral',
				),
			]),
		);
	}

	return value;
}

export function normalizeBridgeArgumentAliases(
	args: Record<string, unknown>,
	binding: BridgeToolExecutionBinding,
): Record<string, unknown> {
	if (!binding.argumentBindings || binding.argumentBindings.length === 0) {
		return {...args};
	}

	const normalizedArgs: Record<string, unknown> = {...args};

	for (const argumentBinding of binding.argumentBindings) {
		const aliases = Array.from(
			new Set(
				(argumentBinding.aliases || [])
					.map(alias => String(alias || '').trim())
					.filter(alias => alias && alias !== argumentBinding.name),
			),
		);
		const providedAlias = aliases.find(alias => alias in normalizedArgs);

		if (!(argumentBinding.name in normalizedArgs) && providedAlias) {
			normalizedArgs[argumentBinding.name] = normalizedArgs[providedAlias];
		}

		for (const alias of aliases) {
			delete normalizedArgs[alias];
		}
	}

	return normalizedArgs;
}

export function coerceBridgeExecutionArguments(
	args: Record<string, unknown>,
	binding: BridgeToolExecutionBinding,
): Record<string, unknown> {
	const normalizedArgs = normalizeBridgeArgumentAliases(args, binding);
	const fileUrlCompatibleArgs: Record<string, unknown> = {...normalizedArgs};

	for (const argumentBinding of binding.argumentBindings || []) {
		if (
			!argumentBinding.fileUrlCompatible ||
			!(argumentBinding.name in fileUrlCompatibleArgs) ||
			fileUrlCompatibleArgs[argumentBinding.name] === undefined
		) {
			continue;
		}

		fileUrlCompatibleArgs[argumentBinding.name] = normalizeBridgeFileUrlValue(
			fileUrlCompatibleArgs[argumentBinding.name],
		);
	}

	if (
		!binding.stringifyArgumentNames ||
		binding.stringifyArgumentNames.length === 0
	) {
		return fileUrlCompatibleArgs;
	}

	const coercedArgs: Record<string, unknown> = {...fileUrlCompatibleArgs};

	for (const argumentName of binding.stringifyArgumentNames) {
		if (!(argumentName in coercedArgs)) {
			continue;
		}

		const argumentValue = coercedArgs[argumentName];
		if (argumentValue === undefined) {
			continue;
		}

		coercedArgs[argumentName] = stringifyBridgeArgumentValue(argumentValue);
	}

	return coercedArgs;
}
