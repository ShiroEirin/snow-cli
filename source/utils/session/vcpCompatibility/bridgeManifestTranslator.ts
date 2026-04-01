import type {MCPServiceTools} from '../../execution/mcpToolsManager.js';
import type {BridgeToolExecutionBinding} from './toolExecutionBinding.js';

export type BridgeManifestCommand = {
	commandName?: string;
	commandIdentifier?: string;
	command?: string;
	description?: string;
	parameters?: unknown[];
	example?: string;
};

export type BridgeManifestPlugin = {
	name: string;
	displayName: string;
	description: string;
	pluginType?: string;
	bridgeCommands: BridgeManifestCommand[];
};

export type BridgeManifestResponse = {
	bridgeVersion?: string;
	vcpVersion?: string;
	capabilities?: Record<string, unknown>;
	plugins: BridgeManifestPlugin[];
};

export type BridgeModelToolDescriptor = {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
};

export type BridgeToolPlane = {
	modelTools: BridgeModelToolDescriptor[];
	servicesInfo: MCPServiceTools[];
	bindings: BridgeToolExecutionBinding[];
};

type BridgeToolParameterDefinition = {
	name: string;
	required: boolean;
	schema: Record<string, unknown>;
	source: 'structured' | 'description';
};

const SUPPORTED_BRIDGE_PLUGIN_TYPES = new Set([
	'synchronous',
	'asynchronous',
	'hybridservice',
]);

function slugifySegment(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function buildBridgeToolName(
	pluginName: string,
	commandName: string,
): string {
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

	if (
		/comma[-\s]?separated|comma separated|csv|逗号分隔|多个用逗号分隔/.test(
			normalizedHint,
		)
	) {
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

function coerceDefaultValue(
	rawDefaultValue: string | undefined,
	type: unknown,
): unknown {
	const normalizedDefaultValue = String(rawDefaultValue || '').trim();
	if (!normalizedDefaultValue) {
		return undefined;
	}

	const normalizedType = Array.isArray(type)
		? type[0]
		: typeof type === 'string'
			? type
			: undefined;
	if (normalizedType === 'boolean') {
		if (/^(true|false)$/i.test(normalizedDefaultValue)) {
			return normalizedDefaultValue.toLowerCase() === 'true';
		}

		if (/^(是|否)$/u.test(normalizedDefaultValue)) {
			return normalizedDefaultValue === '是';
		}
	}

	if (normalizedType === 'number') {
		const numericValue = Number(normalizedDefaultValue);
		if (!Number.isNaN(numericValue)) {
			return numericValue;
		}
	}

	return normalizedDefaultValue.replace(/^['"`]|['"`]$/g, '');
}

function isRequiredHint(value?: string): boolean {
	const normalizedValue = String(value || '').toLowerCase();
	return /required|mandatory|必需|必须|必填/.test(normalizedValue);
}

function extractDefaultValue(value?: string): string | undefined {
	const normalizedValue = String(value || '').trim();
	if (!normalizedValue) {
		return undefined;
	}

	const match =
		/(?:default|默认值|默认为)\s*(?:is|为|[:：])?\s*([^\s,，。；;]+)/i.exec(
			normalizedValue,
		);

	return match?.[1]?.trim();
}

function normalizeParameterDefinition(
	name: string,
	options?: {
		description?: string;
		required?: boolean;
		typeHint?: string;
		source?: 'structured' | 'description';
	},
): BridgeToolParameterDefinition {
	const description = options?.description?.trim();
	const inferredSchema = inferSchemaFromTypeHint(options?.typeHint || description);
	const defaultValue = coerceDefaultValue(
		extractDefaultValue([options?.typeHint, description].filter(Boolean).join(', ')),
		inferredSchema['type'],
	);
	return {
		name,
		required: options?.required ?? false,
		source: options?.source ?? 'structured',
		schema: {
			...inferredSchema,
			...(description ? {description} : {}),
			...(defaultValue !== undefined ? {default: defaultValue} : {}),
		},
	};
}

function normalizeParameterDefinitions(
	parameters: unknown[],
): BridgeToolParameterDefinition[] {
	const definitions = new Map<string, BridgeToolParameterDefinition>();

	for (const parameter of parameters) {
		if (typeof parameter === 'string') {
			definitions.set(
				parameter,
				normalizeParameterDefinition(parameter, {
					source: 'structured',
				}),
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
				source: 'structured',
			}),
		);
	}

	return Array.from(definitions.values());
}

function shouldSkipDescriptionParameter(
	name: string,
	description?: string,
): boolean {
	if (/^(tool_name|command\d*|commandidentifier|commandname|toolid)$/i.test(name)) {
		return true;
	}

	if (
		/^action$/i.test(name) &&
		/\b(?:固定为|固定值|always|must be|(?:is\s+)?fixed\s+to|command|命令)\b/i.test(
			description || '',
		)
	) {
		return true;
	}

	return false;
}

function normalizeDescriptionParameterName(name: string): string {
	return String(name || '')
		.trim()
		.replace(/^[`'"“”‘’]+|[`'"“”‘’]+$/g, '')
		.trim();
}

function isLegacySectionStart(line: string): boolean {
	return /^\**\s*(?:调用格式|调用示例|示例|example|call format)(?:\s*[（(][^)）]+[)）])?\s*[:：]/i.test(
		line,
	);
}

function extractLegacySectionHint(line: string): string | null {
	const normalizedLine = String(line || '').trim();
	if (!normalizedLine) {
		return null;
	}

	const parenthesizedHint =
		/[（(]([^)）]+)[)）]\s*[:：]?\**$/u.exec(normalizedLine)?.[1]?.trim() ||
		'';
	if (parenthesizedHint) {
		return `示例提示：${parenthesizedHint.replace(/[。；;:：]+$/u, '')}。`;
	}

	const colonHint =
		/[:：]\s*(.+?)\**$/u.exec(normalizedLine)?.[1]?.trim() || '';
	if (
		colonHint &&
		!/(?:TOOL_REQUEST|END_TOOL_REQUEST|tool_name|「始」|「末」)/i.test(colonHint)
	) {
		return `调用提示：${colonHint.replace(/[。；;:：]+$/u, '')}。`;
	}

	return null;
}

function isLegacyProtocolLine(line: string): boolean {
	return (
		/(<<<\[(?:TOOL_REQUEST|END_TOOL_REQUEST|TOOL_REQUEST_EXP|END_TOOL_REQUEST_EXP)\]>>>)/i.test(
			line,
		) ||
		/\b(?:TOOL_REQUEST|END_TOOL_REQUEST)\b/i.test(line) ||
		/\btool_name\s*[:：=]/i.test(line) ||
		/^\s*(?:[-*•]|\d+\.)?\s*`?(?:command|action|tool_name)`?(?:\s*[（(][^)）]+[)）])?\s*[:：]\s*(?:固定为|固定值|always|must be|is fixed to)/i.test(
			line,
		) ||
		/[「『]始[」』]|[「『]末[」』]/u.test(line) ||
		/^\**\s*(?:请使用以下格式|必须按照以下格式|请严格使用|支持串语法|支持批量调用)/i.test(
			line,
		)
	);
}

function normalizeBridgeTextInput(text: string): string {
	return String(text || '')
		.replace(/\\r\\n/g, '\n')
		.replace(/\\n/g, '\n')
		.replace(/\\t/g, '\t');
}

function sanitizeBridgeText(text: string): string {
	const sanitizedLines: string[] = [];
	let skippingLegacyBlock = false;

	for (const rawLine of normalizeBridgeTextInput(text)
		.replace(/\r\n?/g, '\n')
		.split('\n')) {
		const line = rawLine.trim();

		if (!line) {
			if (skippingLegacyBlock) {
				skippingLegacyBlock = false;
			}

			if (
				sanitizedLines.length > 0 &&
				sanitizedLines[sanitizedLines.length - 1] !== ''
			) {
				sanitizedLines.push('');
			}

			continue;
		}

		if (isLegacySectionStart(line)) {
			const legacyHint = extractLegacySectionHint(line);
			if (
				legacyHint &&
				!sanitizedLines.includes(legacyHint)
			) {
				sanitizedLines.push(legacyHint);
			}
			skippingLegacyBlock = true;
			continue;
		}

		if (skippingLegacyBlock || isLegacyProtocolLine(line)) {
			continue;
		}

		sanitizedLines.push(line);
	}

	return sanitizedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function hasStrictDescriptionContract(description: string): boolean {
	const normalizedDescription = normalizeBridgeTextInput(description).toLowerCase();
	return (
		/不要包含任何未列出的参数|不要包含任何其他参数|禁止包含任何其他参数/u.test(
			normalizedDescription,
		) ||
		/do not include any (?:other|unlisted) parameters/.test(
			normalizedDescription,
		) ||
		/strictly (?:according to|follow)/.test(normalizedDescription)
	);
}

function extractParameterDefinitionsFromDescription(
	description: string,
): BridgeToolParameterDefinition[] {
	const definitions = new Map<string, BridgeToolParameterDefinition>();
	const sanitizedDescription = sanitizeBridgeText(description);

	for (const rawLine of sanitizedDescription.split('\n')) {
		const line = rawLine.trim();
		if (!line) {
			continue;
		}

		const match = /^(?:[-*•]|\d+\.)?\s*(?:`(?<backtickName>[^`]+)`|(?<plainName>[A-Za-z_][\w.-]*))(?:\s*[（(](?<meta>[^)）]+)[)）])?\s*[:：]\s*(?<description>.+)$/.exec(
			line,
		);
		if (!match?.groups) {
			continue;
		}

		const name = normalizeDescriptionParameterName(
			match.groups['backtickName'] || match.groups['plainName'] || '',
		);
		const parameterDescription = match.groups['description']?.trim();
		const meta = match.groups['meta']?.trim();
		if (!name || shouldSkipDescriptionParameter(name, [meta, parameterDescription].filter(Boolean).join(', '))) {
			continue;
		}
		const typeHint = [meta, parameterDescription].filter(Boolean).join(', ');
		const required = isRequiredHint(meta) || isRequiredHint(parameterDescription);

		definitions.set(
			name,
			normalizeParameterDefinition(name, {
				description: parameterDescription,
				required,
				typeHint,
				source: 'description',
			}),
		);
	}

	return Array.from(definitions.values());
}

function buildModelDescription(options: {
	pluginDisplayName: string;
	commandName: string;
	pluginDescription: string;
	commandDescription: string;
}): string {
	const details = [
		sanitizeBridgeText(options.commandDescription),
		sanitizeBridgeText(options.pluginDescription),
	].filter(Boolean);

	if (details.length === 0) {
		return `${options.pluginDisplayName} command ${options.commandName}.`;
	}

	return details.join('\n\n');
}

function buildParametersSchema(
	parameterDefinitions: BridgeToolParameterDefinition[],
	options?: {
		strictDescriptionContract?: boolean;
	},
): Record<string, unknown> {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];

	for (const parameter of parameterDefinitions) {
		properties[parameter.name] = parameter.schema;
		if (parameter.required) {
			required.push(parameter.name);
		}
	}

	const isStrictSchema =
		parameterDefinitions.length > 0 &&
		(parameterDefinitions.every(parameter => parameter.source === 'structured') ||
			options?.strictDescriptionContract === true);

	return {
		type: 'object',
		properties,
		required,
		additionalProperties: !isStrictSchema,
	};
}

function resolveBridgeCommandName(command: BridgeManifestCommand): string | null {
	const candidate =
		command.commandName || command.commandIdentifier || command.command;
	const normalizedCandidate = String(candidate || '').trim();
	return normalizedCandidate || null;
}

function shouldTranslateBridgePlugin(plugin: BridgeManifestPlugin): boolean {
	if (!plugin.pluginType) {
		return true;
	}

	return SUPPORTED_BRIDGE_PLUGIN_TYPES.has(plugin.pluginType);
}

export function translateBridgeManifestToToolPlane(
	manifest: BridgeManifestResponse,
): BridgeToolPlane {
	const modelTools: BridgeModelToolDescriptor[] = [];
	const servicesInfo: MCPServiceTools[] = [];
	const bindings: BridgeToolExecutionBinding[] = [];

	for (const plugin of manifest.plugins) {
		if (!shouldTranslateBridgePlugin(plugin)) {
			continue;
		}

		const pluginTools: MCPServiceTools['tools'] = [];

		for (const command of plugin.bridgeCommands) {
			const commandName = resolveBridgeCommandName(command);
			if (!commandName) {
				continue;
			}

			const toolName = buildBridgeToolName(plugin.name, commandName);
			const description = buildModelDescription({
				pluginDisplayName: plugin.displayName,
				commandName,
				pluginDescription: plugin.description,
				commandDescription: command.description || '',
			});
			const structuredParameterDefinitions = normalizeParameterDefinitions(
				command.parameters || [],
			);
			const parameterDefinitions =
				structuredParameterDefinitions.length > 0
					? structuredParameterDefinitions
					: extractParameterDefinitionsFromDescription(
							command.description || '',
						);
			const stringifyArgumentNames = parameterDefinitions
				.filter(parameter => parameter.source === 'description')
				.map(parameter => parameter.name);
			const parameters = buildParametersSchema(parameterDefinitions, {
				strictDescriptionContract:
					structuredParameterDefinitions.length === 0 &&
					hasStrictDescriptionContract(command.description || ''),
			});

			modelTools.push({
				type: 'function',
				function: {
					name: toolName,
					description,
					parameters,
				},
			});

			pluginTools.push({
				name: toolName,
				description,
				inputSchema: parameters,
			});

			bindings.push({
				kind: 'bridge',
				toolName,
				pluginName: plugin.name,
				displayName: plugin.displayName,
				commandName,
				stringifyArgumentNames,
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
		bindings,
	};
}
