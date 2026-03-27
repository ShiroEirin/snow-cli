import {randomUUID} from 'node:crypto';
import {WebSocket} from 'ws';
import {getVersionHeader} from '../../core/version.js';
import {logger} from '../../core/logger.js';

type BridgeToolShape = {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
};

type BridgeServiceToolShape = {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	toolId?: string;
	originName?: string;
	displayName?: string;
	capabilityTags?: string[];
};

type BridgeServiceInfoShape = {
	serviceName: string;
	tools: BridgeServiceToolShape[];
	isBuiltIn: boolean;
	connected: boolean;
	error?: string;
};

type VcpToolBridgeConfig = {
	backendMode?: 'native' | 'vcp';
	toolTransport?: 'local' | 'bridge';
	vcpToolBridgeWsUrl?: string;
	vcpToolBridgeToken?: string;
	vcpToolBridgeToolFilter?: string;
};

type VcpBridgeManifestParameter = {
	name?: string;
	description?: string;
	required?: boolean;
	type?: string;
	enum?: unknown[];
};

type VcpBridgeCommand = {
	commandName: string;
	description?: string;
	parameters?: VcpBridgeManifestParameter[];
	example?: string;
};

type VcpBridgeError = {
	code?: string;
	message?: string;
	retryable?: boolean;
	source?: 'snowbridge' | 'plugin';
	details?: Record<string, unknown>;
};

type VcpBridgeAsyncStatus = {
	enabled?: boolean;
	state?: 'accepted' | 'running' | 'completed' | 'error' | 'cancelled';
	event?: 'lifecycle' | 'log' | 'info' | 'result';
	taskId?: string;
};

type VcpBridgePlugin = {
	name: string;
	publicName?: string;
	originName?: string;
	toolId?: string;
	displayName?: string;
	description?: string;
	bridgeCommands: VcpBridgeCommand[];
	capabilityTags?: string[];
};

type VcpBridgeCapabilities = {
	cancelVcpTool?: boolean;
	toolFilters?: boolean;
	asyncCallbacks?: boolean;
	statusEvents?: boolean;
	clientAuth?: boolean;
};

type VcpManifestResponsePayload = {
	requestId?: string;
	status?: 'success' | 'error';
	bridgeVersion?: string;
	vcpVersion?: string;
	capabilities?: VcpBridgeCapabilities;
	plugins?: VcpBridgePlugin[];
	error?: VcpBridgeError;
};

type VcpToolResultPayload = {
	requestId?: string;
	invocationId?: string;
	status?: 'success' | 'error';
	toolId?: string;
	toolName?: string;
	originName?: string;
	asyncStatus?: VcpBridgeAsyncStatus;
	taskId?: string;
	result?: unknown;
	error?: VcpBridgeError;
};

type VcpToolStatusPayload = {
	requestId?: string;
	invocationId?: string;
	toolId?: string;
	toolName?: string;
	originName?: string;
	status?: string;
	async?: boolean;
	taskId?: string;
	asyncStatus?: VcpBridgeAsyncStatus;
	result?: unknown;
	bridgeType?: string;
	error?: VcpBridgeError;
};

type VcpToolCancelAckPayload = {
	requestId?: string;
	invocationId?: string;
	accepted?: boolean;
	mode?: 'cancelled' | 'ignored' | 'unsupported';
	error?: VcpBridgeError;
};

type PendingRequest<T> = {
	resolve: (value: T) => void;
	reject: (reason?: unknown) => void;
	timer: NodeJS.Timeout;
};

type PendingExecutionRequest = PendingRequest<unknown> & {
	aborted: boolean;
};

export type VcpBridgeToolDefinition = {
	toolId: string;
	toolName: string;
	pluginName: string;
	originName: string;
	publicName: string;
	displayName: string;
	description: string;
	commands: VcpBridgeCommand[];
	parameters: Record<string, unknown>;
	capabilityTags: string[];
};

export type VcpBridgeDiscoveryResult = {
	tools: BridgeToolShape[];
	serviceInfo: BridgeServiceInfoShape;
	capabilities?: {
		cancellable?: boolean;
		asyncCallback?: boolean;
		statusEvents?: boolean;
		clientAuth?: boolean;
	};
};

const BRIDGE_SERVICE_NAME = 'snowbridge';
const BRIDGE_DISCOVERY_TIMEOUT_MS = 15000;
const BRIDGE_EXECUTION_TIMEOUT_MS = 300000;
const BRIDGE_CANCEL_TIMEOUT_MS = 5000;
const MAX_COMMAND_SUMMARY_COUNT = 4;
const SAFE_TOOL_NAME_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

function isBridgeEnabled(config: VcpToolBridgeConfig): boolean {
	return config.backendMode === 'vcp' && config.toolTransport === 'bridge';
}

function splitFilterValues(value?: string): string[] {
	return String(value || '')
		.split(',')
		.map(item => item.trim())
		.filter(Boolean);
}

function summarizeText(value?: string, maxLength = 160): string {
	const normalized = String(value || '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!normalized) {
		return '';
	}

	const firstSentence = normalized.split(/(?<=[。！？.!?])\s+/)[0] || normalized;
	if (firstSentence.length <= maxLength) {
		return firstSentence;
	}

	return `${firstSentence.slice(0, maxLength - 1)}…`;
}

function normalizeToolIdSegment(value: string): string {
	return (
		String(value || '')
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, '_')
			.replace(/^_+|_+$/g, '') || 'tool'
	);
}

function createBridgeToolId(originName: string): string {
	return [
		normalizeToolIdSegment('vcp_bridge'),
		normalizeToolIdSegment(BRIDGE_SERVICE_NAME),
		normalizeToolIdSegment(originName),
	].join(':');
}

function uniqueStrings(values: Array<string | undefined>): string[] {
	return Array.from(
		new Set(
			values
				.map(value => String(value || '').trim())
				.filter(Boolean),
		),
	);
}

function normalizeBridgeToolName(rawName: string, usedNames: Set<string>): string {
	const trimmed = String(rawName || '').trim();
	const normalizedBase =
		SAFE_TOOL_NAME_REGEX.test(trimmed) && trimmed.length > 0
			? trimmed
			: `vcp_${trimmed.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'tool'}`;

	if (!usedNames.has(normalizedBase)) {
		usedNames.add(normalizedBase);
		return normalizedBase;
	}

	let suffix = 2;
	while (usedNames.has(`${normalizedBase}_${suffix}`)) {
		suffix += 1;
	}

	const uniqueName = `${normalizedBase}_${suffix}`;
	usedNames.add(uniqueName);
	return uniqueName;
}

function normalizeSchemaType(rawType?: string): string | string[] {
	const typeValue = String(rawType || '')
		.trim()
		.toLowerCase();

	switch (typeValue) {
		case 'number':
		case 'float':
		case 'double':
		case 'numeric':
		case '数字':
		case '数值':
			return 'number';
		case 'integer':
		case 'int':
		case '整数':
			return 'integer';
		case 'boolean':
		case 'bool':
		case '布尔':
			return 'boolean';
		case 'array':
		case 'list':
		case 'json[]':
		case '数组':
			return 'array';
		case 'object':
		case 'json':
		case 'map':
		case '对象':
			return 'object';
		case 'string':
		case 'text':
		case '字符串':
		default:
			return 'string';
	}
}

function buildParameterSchema(
	parameter: VcpBridgeManifestParameter,
	commandName: string,
): Record<string, unknown> {
	const schemaType = normalizeSchemaType(parameter.type);
	const schema: Record<string, unknown> = {
		type: schemaType,
		description: `${summarizeText(parameter.description, 220) || 'Parameter for VCP bridge command.'} (command: ${commandName})`,
	};

	if (schemaType === 'array') {
		schema['items'] = {type: 'string'};
	}

	if (schemaType === 'object') {
		schema['additionalProperties'] = true;
	}

	if (Array.isArray(parameter.enum) && parameter.enum.length > 0) {
		schema['enum'] = parameter.enum;
	}

	return schema;
}

function mergePropertySchemas(
	currentSchema: Record<string, unknown> | undefined,
	nextSchema: Record<string, unknown>,
): Record<string, unknown> {
	if (!currentSchema) {
		return {...nextSchema};
	}

	const merged = {...currentSchema, ...nextSchema};
	const currentType = currentSchema['type'];
	const nextType = nextSchema['type'];

	if (currentType && nextType && currentType !== nextType) {
		const uniqueTypes = Array.from(
			new Set(
				[currentType, nextType]
					.flatMap(value => (Array.isArray(value) ? value : [value]))
					.filter(Boolean),
			),
		);
		merged['type'] = uniqueTypes.length === 1 ? uniqueTypes[0] : uniqueTypes;
	}

	if (currentSchema['description'] && nextSchema['description']) {
		const descriptions = Array.from(
			new Set([
				String(currentSchema['description']),
				String(nextSchema['description']),
			]),
		);
		merged['description'] = descriptions.join(' | ');
	}

	if (
		Array.isArray(currentSchema['enum']) ||
		Array.isArray(nextSchema['enum'])
	) {
		merged['enum'] = Array.from(
			new Set([
				...(Array.isArray(currentSchema['enum']) ? currentSchema['enum'] : []),
				...(Array.isArray(nextSchema['enum']) ? nextSchema['enum'] : []),
			]),
		);
	}

	return merged;
}

function buildBridgeCapabilityTags(
	commands: VcpBridgeCommand[],
	bridgeCapabilities: VcpBridgeCapabilities = {},
	existingTags: string[] = [],
): string[] {
	const tags = [...existingTags, 'bridge_transport'];
	tags.push(commands.length > 1 ? 'multi_command' : 'single_command');

	if (bridgeCapabilities.cancelVcpTool) {
		tags.push('cancellable');
	}

	if (bridgeCapabilities.asyncCallbacks) {
		tags.push('async_callback');
	}

	if (bridgeCapabilities.statusEvents) {
		tags.push('status_events');
	}

	if (bridgeCapabilities.clientAuth) {
		tags.push('client_auth');
	}

	return uniqueStrings(tags);
}

function buildToolParameters(commands: VcpBridgeCommand[]): Record<string, unknown> {
	if (commands.length === 1) {
		const [singleCommand] = commands;
		if (!singleCommand) {
			return {
				type: 'object',
				additionalProperties: true,
				properties: {},
			};
		}

		const properties: Record<string, Record<string, unknown>> = {};
		const required = (singleCommand.parameters || [])
			.filter(parameter => parameter?.name && parameter.required)
			.map(parameter => String(parameter.name));

		for (const parameter of singleCommand.parameters || []) {
			if (!parameter.name) {
				continue;
			}

			properties[parameter.name] = buildParameterSchema(
				parameter,
				singleCommand.commandName,
			);
		}

		return {
			type: 'object',
			additionalProperties: true,
			properties,
			...(required.length > 0 ? {required} : {}),
		};
	}

	const properties: Record<string, Record<string, unknown>> = {
		command: {
			type: 'string',
			enum: commands.map(command => command.commandName),
			description: commands
				.map(
					command =>
						`${command.commandName}: ${summarizeText(command.description, 120) || 'Use this sub-command.'}`,
				)
				.join(' | '),
		},
	};

	for (const command of commands) {
		for (const parameter of command.parameters || []) {
			if (!parameter.name) {
				continue;
			}

			properties[parameter.name] = mergePropertySchemas(
				properties[parameter.name],
				buildParameterSchema(parameter, command.commandName),
			);
		}
	}

	return {
		type: 'object',
		additionalProperties: true,
		properties,
		required: ['command'],
	};
}

function buildToolDescription(plugin: VcpBridgePlugin): string {
	const summary = summarizeText(plugin.description, 180);
	const commandNames = plugin.bridgeCommands.map(command => command.commandName);
	if (commandNames.length === 1) {
		return [
			`[SnowBridge] ${plugin.displayName || plugin.name}`,
			summary || 'Remote VCP plugin exported through SnowBridge.',
			`Command: ${commandNames[0]}. Pass the needed top-level fields directly.`,
		]
			.filter(Boolean)
			.join(' ');
	}

	const commandSummary = commandNames
		.slice(0, MAX_COMMAND_SUMMARY_COUNT)
		.join(', ');
	const moreCount = Math.max(0, commandNames.length - MAX_COMMAND_SUMMARY_COUNT);
	const suffix = moreCount > 0 ? ` +${moreCount}` : '';

	return [
		`[SnowBridge] ${plugin.displayName || plugin.name}`,
		summary || 'Remote VCP plugin exported through SnowBridge.',
		commandNames.length > 0
			? `Commands: ${commandSummary}${suffix}. Pass "command" plus the needed top-level fields.`
			: '',
	]
		.filter(Boolean)
		.join(' ');
}

export function mapBridgePluginsToTools(
	plugins: VcpBridgePlugin[],
	bridgeCapabilities: VcpBridgeCapabilities = {},
): {
	tools: BridgeToolShape[];
	definitions: Map<string, VcpBridgeToolDefinition>;
	serviceTools: BridgeServiceToolShape[];
} {
	const usedNames = new Set<string>();
	const tools: BridgeToolShape[] = [];
	const serviceTools: BridgeServiceToolShape[] = [];
	const definitions = new Map<string, VcpBridgeToolDefinition>();

	for (const plugin of plugins) {
		if (!plugin?.name || !Array.isArray(plugin.bridgeCommands)) {
			continue;
		}

		const filteredCommands = plugin.bridgeCommands.filter(
			command => command?.commandName,
		);
		if (filteredCommands.length === 0) {
			continue;
		}

		const originName = plugin.originName || plugin.name;
		const publicName = plugin.publicName || plugin.name;
		const toolName = normalizeBridgeToolName(publicName, usedNames);
		const parameters = buildToolParameters(filteredCommands);
		const description = buildToolDescription(plugin);
		const capabilityTags = buildBridgeCapabilityTags(
			filteredCommands,
			bridgeCapabilities,
			plugin.capabilityTags || [],
		);
		const definition: VcpBridgeToolDefinition = {
			toolId: plugin.toolId || createBridgeToolId(originName),
			toolName,
			pluginName: originName,
			originName,
			publicName: toolName,
			displayName: plugin.displayName || plugin.name,
			description,
			commands: filteredCommands,
			parameters,
			capabilityTags,
		};

		definitions.set(toolName, definition);
		tools.push({
			type: 'function',
			function: {
				name: toolName,
				description,
				parameters,
			},
		});
		serviceTools.push({
			name: toolName,
			description,
			inputSchema: parameters,
			toolId: definition.toolId,
			originName,
			displayName: definition.displayName,
			capabilityTags,
		});
	}

	return {tools, definitions, serviceTools};
}

function createBridgeServiceInfo(
	tools: BridgeServiceToolShape[],
	error?: string,
): BridgeServiceInfoShape {
	return {
		serviceName: BRIDGE_SERVICE_NAME,
		tools,
		isBuiltIn: false,
		connected: !error,
		...(error ? {error} : {}),
	};
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (error && typeof error === 'object' && 'message' in error) {
		return String(error.message);
	}

	return String(error);
}

function toBridgeExecutionError(
	error: VcpBridgeError | undefined,
	fallbackMessage: string,
): Error {
	const codePrefix = error?.code ? `[${error.code}] ` : '';
	const nextError = new Error(`${codePrefix}${error?.message || fallbackMessage}`);
	nextError.name = 'VcpBridgeError';
	Object.assign(nextError, {bridgeError: error});
	return nextError;
}

function buildClientInfo() {
	return {
		clientId: 'snow-cli',
		clientName: 'snow-cli',
		version: getVersionHeader(),
	};
}

function buildBridgeConfigKey(config: VcpToolBridgeConfig): string {
	return JSON.stringify({
		backendMode: config.backendMode,
		toolTransport: config.toolTransport,
		vcpToolBridgeWsUrl: config.vcpToolBridgeWsUrl,
		vcpToolBridgeToken: config.vcpToolBridgeToken,
		vcpToolBridgeToolFilter: config.vcpToolBridgeToolFilter,
	});
}

function clearTimer(timer?: NodeJS.Timeout): void {
	if (timer) {
		clearTimeout(timer);
	}
}

class VcpToolBridgeClient {
	private socket: WebSocket | null = null;
	private socketConfigKey: string | null = null;
	private connectPromise: Promise<void> | null = null;
	private lastUsedAt = 0;
	private capabilities: VcpBridgeCapabilities = {};
	private definitions = new Map<string, VcpBridgeToolDefinition>();
	private pendingManifestRequests = new Map<
		string,
		PendingRequest<VcpManifestResponsePayload>
	>();
	private pendingExecutionRequests = new Map<
		string,
		PendingExecutionRequest
	>();
	private pendingCancelRequests = new Map<
		string,
		PendingRequest<VcpToolCancelAckPayload>
	>();

	private markUsed(): void {
		this.lastUsedAt = Date.now();
	}

	private isSocketOpen(): boolean {
		return this.socket?.readyState === WebSocket.OPEN;
	}

	private cleanupPendingRequests(error: Error): void {
		for (const pending of this.pendingManifestRequests.values()) {
			clearTimer(pending.timer);
			pending.reject(error);
		}
		for (const pending of this.pendingExecutionRequests.values()) {
			clearTimer(pending.timer);
			pending.reject(error);
		}
		for (const pending of this.pendingCancelRequests.values()) {
			clearTimer(pending.timer);
			pending.reject(error);
		}

		this.pendingManifestRequests.clear();
		this.pendingExecutionRequests.clear();
		this.pendingCancelRequests.clear();
	}

	private setDefinitions(definitions: Map<string, VcpBridgeToolDefinition>): void {
		this.definitions.clear();

		for (const definition of definitions.values()) {
			for (const key of uniqueStrings([
				definition.toolId,
				definition.toolName,
				definition.publicName,
				definition.originName,
				definition.pluginName,
			])) {
				this.definitions.set(key, definition);
			}
		}
	}

	private handleSocketMessage(raw: WebSocket.RawData): void {
		let payload: any;
		try {
			payload = JSON.parse(raw.toString());
		} catch (error) {
			logger.warn('[SnowBridge] Failed to parse bridge message:', error);
			return;
		}

		const data = payload?.data ?? {};
		switch (payload?.type) {
			case 'connection_ack':
				return;

			case 'vcp_manifest_response': {
				const requestId = data.requestId;
				if (!requestId) {
					return;
				}
				const pending = this.pendingManifestRequests.get(requestId);
				if (!pending) {
					return;
				}
				clearTimer(pending.timer);
				this.pendingManifestRequests.delete(requestId);
				pending.resolve(data);
				return;
			}

			case 'vcp_tool_result': {
				const resultPayload = data as VcpToolResultPayload;
				const invocationId = resultPayload.invocationId;
				if (!invocationId) {
					return;
				}
				const pending = this.pendingExecutionRequests.get(invocationId);
				if (!pending || pending.aborted) {
					return;
				}
				clearTimer(pending.timer);
				this.pendingExecutionRequests.delete(invocationId);
				if (resultPayload.status === 'error') {
					pending.reject(
						toBridgeExecutionError(
							resultPayload.error,
							'VCP bridge tool execution failed.',
						),
					);
					return;
				}
				pending.resolve(resultPayload.result);
				return;
			}

			case 'vcp_tool_status': {
				const statusPayload = data as VcpToolStatusPayload;
				if (statusPayload.status && statusPayload.status !== 'accepted') {
					logger.debug?.('[SnowBridge] Tool status event:', statusPayload);
				}
				return;
			}

			case 'vcp_tool_cancel_ack': {
				const invocationId = data.invocationId;
				if (!invocationId) {
					return;
				}
				const pending = this.pendingCancelRequests.get(invocationId);
				if (!pending) {
					return;
				}
				clearTimer(pending.timer);
				this.pendingCancelRequests.delete(invocationId);
				pending.resolve(data);
			}
		}
	}

	private registerSocketHandlers(socket: WebSocket): void {
		socket.on('message', raw => {
			this.markUsed();
			this.handleSocketMessage(raw);
		});

		socket.on('close', () => {
			const error = new Error('VCP bridge connection closed.');
			this.socket = null;
			this.socketConfigKey = null;
			this.connectPromise = null;
			this.cleanupPendingRequests(error);
		});

		socket.on('error', error => {
			logger.warn('[SnowBridge] WebSocket error:', error);
		});
	}

	private async ensureConnected(config: VcpToolBridgeConfig): Promise<void> {
		const wsUrl = config.vcpToolBridgeWsUrl?.trim();
		if (!wsUrl) {
			throw new Error('VCP bridge WebSocket URL is not configured.');
		}

		const nextConfigKey = buildBridgeConfigKey(config);
		if (this.isSocketOpen() && this.socketConfigKey === nextConfigKey) {
			this.markUsed();
			return;
		}

		if (this.connectPromise && this.socketConfigKey === nextConfigKey) {
			await this.connectPromise;
			this.markUsed();
			return;
		}

		await this.close();

		this.socketConfigKey = nextConfigKey;
		this.connectPromise = new Promise<void>((resolve, reject) => {
			const socket = new WebSocket(wsUrl);
			let settled = false;
			const timer = setTimeout(() => {
				if (settled) {
					return;
				}
				settled = true;
				socket.terminate();
				reject(new Error('Timed out while connecting to SnowBridge.'));
			}, BRIDGE_DISCOVERY_TIMEOUT_MS);

			socket.once('open', () => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimer(timer);
				this.socket = socket;
				this.registerSocketHandlers(socket);
				this.markUsed();
				resolve();
			});

			socket.once('error', error => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimer(timer);
				reject(
					new Error(
						`Failed to connect to SnowBridge: ${toErrorMessage(error)}`,
					),
				);
			});
		});

		try {
			await this.connectPromise;
		} finally {
			this.connectPromise = null;
		}
	}

	private sendMessage(payload: unknown): void {
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
			throw new Error('VCP bridge socket is not connected.');
		}

		this.socket.send(JSON.stringify(payload));
		this.markUsed();
	}

	private async requestManifests(
		config: VcpToolBridgeConfig,
	): Promise<VcpManifestResponsePayload> {
		await this.ensureConnected(config);
		const requestId = randomUUID();

		const response = await new Promise<VcpManifestResponsePayload>(
			(resolve, reject) => {
				const timer = setTimeout(() => {
					this.pendingManifestRequests.delete(requestId);
					reject(
						new Error('Timed out while waiting for VCP bridge manifest response.'),
					);
				}, BRIDGE_DISCOVERY_TIMEOUT_MS);

				this.pendingManifestRequests.set(requestId, {
					resolve,
					reject,
					timer,
				});

				this.sendMessage({
					type: 'get_vcp_manifests',
					data: {
						requestId,
						accessToken: config.vcpToolBridgeToken?.trim() || undefined,
						clientInfo: buildClientInfo(),
						toolFilters: splitFilterValues(config.vcpToolBridgeToolFilter),
					},
				});
			},
		);

		if (response.status === 'error') {
			throw toBridgeExecutionError(
				response.error,
				'SnowBridge returned an error while listing tools.',
			);
		}

		this.capabilities = response.capabilities || {};
		return response;
	}

	private async sendCancelRequest(
		config: VcpToolBridgeConfig,
		requestId: string,
		invocationId: string,
	): Promise<void> {
		if (!this.capabilities.cancelVcpTool) {
			return;
		}

		if (!this.isSocketOpen()) {
			return;
		}

		try {
			await new Promise<VcpToolCancelAckPayload>((resolve, reject) => {
				const timer = setTimeout(() => {
					this.pendingCancelRequests.delete(invocationId);
					reject(new Error('Timed out while waiting for VCP bridge cancel ack.'));
				}, BRIDGE_CANCEL_TIMEOUT_MS);

				this.pendingCancelRequests.set(invocationId, {
					resolve,
					reject,
					timer,
				});

				this.sendMessage({
					type: 'cancel_vcp_tool',
					data: {
						requestId,
						invocationId,
						accessToken: config.vcpToolBridgeToken?.trim() || undefined,
						clientInfo: buildClientInfo(),
					},
				});
			});
		} catch (error) {
			logger.debug?.('[SnowBridge] Cancel request failed:', error);
		}
	}

	async discoverTools(
		config: VcpToolBridgeConfig,
	): Promise<VcpBridgeDiscoveryResult> {
		if (!isBridgeEnabled(config)) {
			this.setDefinitions(new Map());
			return {
				tools: [],
				serviceInfo: createBridgeServiceInfo([]),
				capabilities: {},
			};
		}

		const manifest = await this.requestManifests(config);
		const mapped = mapBridgePluginsToTools(
			manifest.plugins || [],
			manifest.capabilities || {},
		);
		this.setDefinitions(mapped.definitions);

		return {
			tools: mapped.tools,
			serviceInfo: createBridgeServiceInfo(mapped.serviceTools),
			capabilities: {
				cancellable: manifest.capabilities?.cancelVcpTool,
				asyncCallback: manifest.capabilities?.asyncCallbacks,
				statusEvents: manifest.capabilities?.statusEvents,
				clientAuth: manifest.capabilities?.clientAuth,
			},
		};
	}

	async executeTool(
		config: VcpToolBridgeConfig,
		toolRef: string,
		args: Record<string, unknown>,
		abortSignal?: AbortSignal,
	): Promise<unknown> {
		if (!isBridgeEnabled(config)) {
			throw new Error('VCP bridge tool execution is not enabled in current config.');
		}

		if (abortSignal?.aborted) {
			throw new Error('Tool execution aborted by user');
		}

		if (!this.definitions.has(toolRef)) {
			await this.discoverTools(config);
		}

		const definition = this.definitions.get(toolRef);
		if (!definition) {
			throw new Error(`Unknown VCP bridge tool: ${toolRef}`);
		}

		await this.ensureConnected(config);
		const requestId = randomUUID();
		const invocationId = randomUUID();
		const payloadArgs = Object.fromEntries(
			Object.entries(args || {}).filter(([, value]) => value !== undefined),
		);
		if (!payloadArgs['command'] && definition.commands.length === 1) {
			payloadArgs['command'] = definition.commands[0]?.commandName;
		}

		return await new Promise<unknown>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pendingExecutionRequests.delete(invocationId);
				reject(new Error(`VCP bridge tool "${toolRef}" timed out.`));
			}, BRIDGE_EXECUTION_TIMEOUT_MS);

			const pending: PendingExecutionRequest = {
				resolve,
				reject,
				timer,
				aborted: false,
			};
			this.pendingExecutionRequests.set(invocationId, pending);

			const abortHandler = () => {
				const currentPending = this.pendingExecutionRequests.get(invocationId);
				if (!currentPending || currentPending.aborted) {
					return;
				}
				currentPending.aborted = true;
				clearTimer(currentPending.timer);
				this.pendingExecutionRequests.delete(invocationId);
				void this.sendCancelRequest(config, requestId, invocationId);
				reject(new Error('Tool execution aborted by user'));
			};

			if (abortSignal) {
				abortSignal.addEventListener('abort', abortHandler, {once: true});
			}

			this.sendMessage({
				type: 'execute_vcp_tool',
				data: {
					requestId,
					invocationId,
					toolId: definition.toolId,
					toolName: definition.pluginName,
					originName: definition.originName,
					publicName: definition.publicName,
					toolArgs: payloadArgs,
					accessToken: config.vcpToolBridgeToken?.trim() || undefined,
					clientInfo: buildClientInfo(),
				},
			});

			const finalize = () => {
				if (abortSignal) {
					abortSignal.removeEventListener('abort', abortHandler);
				}
			};

			const originalResolve = pending.resolve;
			const originalReject = pending.reject;
			pending.resolve = value => {
				finalize();
				originalResolve(value);
			};
			pending.reject = reason => {
				finalize();
				originalReject(reason);
			};
		});
	}

	async cleanupIdleConnection(maxIdleMs: number): Promise<void> {
		if (!this.socket || !this.lastUsedAt) {
			return;
		}

		if (Date.now() - this.lastUsedAt > maxIdleMs) {
			await this.close();
		}
	}

	async close(): Promise<void> {
		if (!this.socket) {
			return;
		}

		const socket = this.socket;
		this.socket = null;
		this.socketConfigKey = null;
		this.connectPromise = null;
		this.setDefinitions(new Map());
		this.capabilities = {};
		this.cleanupPendingRequests(new Error('VCP bridge connection was closed.'));

		await new Promise<void>(resolve => {
			socket.once('close', () => resolve());
			try {
				socket.close();
			} catch {
				resolve();
			}
		});
	}
}

const bridgeClient = new VcpToolBridgeClient();

export async function discoverVcpBridgeTools(
	config: VcpToolBridgeConfig,
): Promise<VcpBridgeDiscoveryResult> {
	try {
		return await bridgeClient.discoverTools(config);
	} catch (error) {
		const message = toErrorMessage(error);
		logger.warn('[SnowBridge] Discovery failed:', message);
		return {
			tools: [],
			serviceInfo: createBridgeServiceInfo([], message),
			capabilities: {},
		};
	}
}

export async function executeVcpBridgeTool(
	config: VcpToolBridgeConfig,
	toolName: string,
	args: Record<string, unknown>,
	abortSignal?: AbortSignal,
): Promise<unknown> {
	return await bridgeClient.executeTool(config, toolName, args, abortSignal);
}

export async function cleanupIdleVcpBridgeConnection(
	maxIdleMs: number,
): Promise<void> {
	await bridgeClient.cleanupIdleConnection(maxIdleMs);
}

export async function closeVcpBridgeConnection(): Promise<void> {
	await bridgeClient.close();
}
