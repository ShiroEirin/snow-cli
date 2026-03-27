import {randomUUID} from 'node:crypto';
import type {MCPServiceTools} from '../../execution/mcpToolsManager.js';

export type BridgeManifestCommand = {
	commandName: string;
	description: string;
	parameters: unknown[];
	example: string;
};

export type BridgeManifestPlugin = {
	name: string;
	displayName: string;
	description: string;
	bridgeCommands: BridgeManifestCommand[];
};

export type BridgeManifestResponse = {
	bridgeVersion?: string;
	vcpVersion?: string;
	capabilities?: Record<string, unknown>;
	plugins: BridgeManifestPlugin[];
};

export type BridgeToolBinding = {
	toolName: string;
	pluginName: string;
	displayName: string;
	commandName: string;
	description: string;
	parameters: Record<string, unknown>;
};

export type BridgeModelToolDescriptor = {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
};

export type BridgeToolSnapshot = {
	modelTools: BridgeModelToolDescriptor[];
	servicesInfo: MCPServiceTools[];
};

export type SessionBridgeToolSnapshot = BridgeToolSnapshot & {
	snapshotKey: string;
};

const DEFAULT_BRIDGE_SNAPSHOT_KEY = '__default__';
const bridgeToolBindingsBySnapshot = new Map<
	string,
	Map<string, BridgeToolBinding>
>();
const latestSnapshotKeyBySession = new Map<string, string>();

type BridgeToolParameterDefinition = {
	name: string;
	required: boolean;
	schema: Record<string, unknown>;
};

function slugifySegment(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function buildBridgeToolName(pluginName: string, commandName: string): string {
	return `vcp-${slugifySegment(pluginName)}-${slugifySegment(commandName)}`;
}

function inferSchemaFromTypeHint(typeHint?: string): Record<string, unknown> {
	const normalizedHint = String(typeHint || '').trim().toLowerCase();

	if (!normalizedHint) {
		return {
			type: 'string',
		};
	}

	if (/json\s*string|json字符串/.test(normalizedHint)) {
		return {
			type: 'string',
		};
	}

	if (/boolean|bool|布尔/.test(normalizedHint)) {
		return {
			type: 'boolean',
		};
	}

	if (/integer|number|float|double|数字|整数|数值/.test(normalizedHint)) {
		return {
			type: 'number',
		};
	}

	if (/array|数组|列表/.test(normalizedHint)) {
		return {
			type: 'array',
			items: {
				type: ['string', 'number', 'boolean', 'object', 'array'],
			},
		};
	}

	if (/object|对象|map|字典/.test(normalizedHint)) {
		return {
			type: 'object',
			additionalProperties: true,
		};
	}

	return {
		type: 'string',
	};
}

function normalizeParameterDefinition(
	name: string,
	options?: {
		description?: string;
		required?: boolean;
		typeHint?: string;
	},
): BridgeToolParameterDefinition {
	const description = options?.description?.trim();
	return {
		name,
		required: options?.required ?? false,
		schema: {
			...inferSchemaFromTypeHint(options?.typeHint || description),
			description:
				description || `SnowBridge forwarded argument: ${name}`,
		},
	};
}

function isRequiredHint(value?: string): boolean {
	const normalizedValue = String(value || '').toLowerCase();
	return /required|mandatory|必需|必须|必填/.test(normalizedValue);
}

function extractDescriptionParams(
	description: string,
): BridgeToolParameterDefinition[] {
	const definitions = new Map<string, BridgeToolParameterDefinition>();
	const pattern =
		/(?:^|\n)\s*(?:[-*]|\d+\.)\s*`?([A-Za-z_][A-Za-z0-9_]*)`?\s*(?:\(([^)]*)\))?\s*(?:-|:)/g;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(description)) !== null) {
		const name = match[1];
		if (!name || name === 'tool_name' || name === 'command') {
			continue;
		}

		const metadata = match[2] || '';
		definitions.set(
			name,
			normalizeParameterDefinition(name, {
				description: `SnowBridge forwarded argument: ${name}`,
				required: isRequiredHint(metadata),
				typeHint: metadata,
			}),
		);
	}

	return Array.from(definitions.values());
}

function normalizeParameterDefinitions(
	parameters: unknown[],
): BridgeToolParameterDefinition[] {
	const definitions = new Map<string, BridgeToolParameterDefinition>();

	for (const parameter of parameters) {
		if (typeof parameter === 'string') {
			definitions.set(
				parameter,
				normalizeParameterDefinition(parameter),
			);
			continue;
		}

		if (!parameter || typeof parameter !== 'object') {
			continue;
		}

		const candidate = parameter as {
			name?: unknown;
			description?: unknown;
			required?: unknown;
			type?: unknown;
		};
		const name =
			typeof candidate.name === 'string' ? candidate.name.trim() : '';
		if (!name) {
			continue;
		}

		definitions.set(
			name,
			normalizeParameterDefinition(name, {
				description:
					typeof candidate.description === 'string'
						? candidate.description
						: undefined,
				required:
					candidate.required === true ||
					(typeof candidate.required === 'string' &&
						isRequiredHint(candidate.required)) ||
					isRequiredHint(
						typeof candidate.description === 'string'
							? candidate.description
							: undefined,
					),
				typeHint:
					typeof candidate.type === 'string'
						? candidate.type
						: typeof candidate.description === 'string'
							? candidate.description
							: undefined,
			}),
		);
	}

	return Array.from(definitions.values());
}

function buildBridgeToolParameters(command: {
	commandName: string;
	parameters: BridgeToolParameterDefinition[];
}) {
	const properties: Record<string, unknown> = {
		command: {
			type: 'string',
			description: `Fixed command identifier: ${command.commandName}`,
		},
	};
	const required = ['command'];

	for (const name of command.parameters) {
		properties[name.name] = name.schema;
		if (name.required) {
			required.push(name.name);
		}
	}

	return {
		type: 'object',
		properties,
		required,
		additionalProperties: true,
	};
}

function resolveBridgeSnapshotKey(snapshotKey?: string): string {
	const normalizedKey = snapshotKey?.trim();
	return normalizedKey ? normalizedKey : DEFAULT_BRIDGE_SNAPSHOT_KEY;
}

function ensureBridgeSnapshot(
	snapshotKey?: string,
): Map<string, BridgeToolBinding> {
	const resolvedKey = resolveBridgeSnapshotKey(snapshotKey);
	let snapshot = bridgeToolBindingsBySnapshot.get(resolvedKey);
	if (!snapshot) {
		snapshot = new Map<string, BridgeToolBinding>();
		bridgeToolBindingsBySnapshot.set(resolvedKey, snapshot);
	}

	return snapshot;
}

export function clearBridgeToolSnapshot(snapshotKey?: string): void {
	bridgeToolBindingsBySnapshot.delete(resolveBridgeSnapshotKey(snapshotKey));
}

export function clearBridgeToolSnapshotSession(sessionKey?: string): void {
	const resolvedSessionKey = resolveBridgeSnapshotKey(sessionKey);
	const previousSnapshotKey = latestSnapshotKeyBySession.get(resolvedSessionKey);
	if (previousSnapshotKey) {
		bridgeToolBindingsBySnapshot.delete(previousSnapshotKey);
		latestSnapshotKeyBySession.delete(resolvedSessionKey);
	}
}

export function getBridgeToolByName(
	toolName: string,
	snapshotKey?: string,
): BridgeToolBinding | undefined {
	return bridgeToolBindingsBySnapshot
		.get(resolveBridgeSnapshotKey(snapshotKey))
		?.get(toolName);
}

export function buildBridgeToolSnapshot(
	snapshotKey: string | undefined,
	manifest: BridgeManifestResponse,
): BridgeToolSnapshot {
	const snapshot = ensureBridgeSnapshot(snapshotKey);
	snapshot.clear();

	const modelTools: BridgeModelToolDescriptor[] = [];
	const servicesInfo: MCPServiceTools[] = [];

	for (const plugin of manifest.plugins) {
		const pluginTools: MCPServiceTools['tools'] = [];

		for (const command of plugin.bridgeCommands) {
			const parameterDefinitions =
				command.parameters && command.parameters.length > 0
					? normalizeParameterDefinitions(command.parameters)
					: extractDescriptionParams(command.description);
			const toolName = buildBridgeToolName(plugin.name, command.commandName);
			const toolDescription = [
				`SnowBridge -> ${plugin.displayName} -> ${command.commandName}`,
				command.description || plugin.description || 'VCP bridged tool',
			]
				.filter(Boolean)
				.join('\n\n');
			const parameters = buildBridgeToolParameters({
				...command,
				parameters: parameterDefinitions,
			});

			snapshot.set(toolName, {
				toolName,
				pluginName: plugin.name,
				displayName: plugin.displayName,
				commandName: command.commandName,
				description: toolDescription,
				parameters,
			});

			modelTools.push({
				type: 'function',
				function: {
					name: toolName,
					description: toolDescription,
					parameters,
				},
			});

			pluginTools.push({
				name: toolName,
				description: toolDescription,
				inputSchema: parameters,
			});
		}

		servicesInfo.push({
			serviceName: `vcp-${slugifySegment(plugin.name)}`,
			tools: pluginTools,
			isBuiltIn: false,
			connected: pluginTools.length > 0,
		});
	}

	return {
		modelTools,
		servicesInfo,
	};
}

export function buildSessionBridgeToolSnapshot(
	sessionKey: string | undefined,
	manifest: BridgeManifestResponse,
): SessionBridgeToolSnapshot {
	const resolvedSessionKey = resolveBridgeSnapshotKey(sessionKey);
	clearBridgeToolSnapshotSession(resolvedSessionKey);

	const snapshotKey = `${resolvedSessionKey}:${randomUUID()}`;
	const snapshot = buildBridgeToolSnapshot(snapshotKey, manifest);
	latestSnapshotKeyBySession.set(resolvedSessionKey, snapshotKey);

	return {
		snapshotKey,
		...snapshot,
	};
}
