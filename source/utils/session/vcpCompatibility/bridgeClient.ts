import {randomUUID} from 'node:crypto';
import {WebSocket} from 'ws';
import type {ApiConfig} from '../../config/apiConfig.js';
import {
	normalizeBridgeManifestResponse,
	type BridgeManifestResponse,
} from './bridgeManifestTranslator.js';

type BridgeEnvelope<T = unknown> = {
	type: string;
	data?: T;
};

export type BridgeToolExecutionResponse = {
	status: string;
	result?: unknown;
	error?: {message?: string};
	asyncStatus?: BridgeAsyncStatus;
	statusEvents?: BridgeStatusEvent[];
	[key: string]: unknown;
};

export type BridgeAsyncStatus = {
	enabled?: boolean;
	state?: string;
	event?: string;
	taskId?: string;
	[key: string]: unknown;
};

export type BridgeStatusEvent = {
	type: 'vcp_tool_status';
	requestId?: string;
	invocationId: string;
	toolId?: string;
	toolName?: string;
	originName?: string;
	taskId?: string;
	status?: string;
	isAsync: boolean;
	asyncStatus: BridgeAsyncStatus;
	bridgeType?: string;
	result?: unknown;
	error?: {message?: string; [key: string]: unknown};
	rawData: Record<string, unknown>;
};

export type BridgeManifestToolFilters = {
	include?: string[];
	profileName?: string;
	includeExactToolNames?: string[];
	excludeExactToolNames?: string[];
	excludeBridgeToolIds?: string[];
	excludePluginNames?: string[];
};

export type BridgeManifestRequestOptions = {
	toolFilters?: BridgeManifestToolFilters;
};

type BridgePendingRequest = {
	resolve: (value: any) => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout | null;
	type: string;
	timeoutMessage: string;
	onEnvelope?: (
		envelopeType: string,
		data: Record<string, unknown>,
	) => 'continue_waiting' | void;
};

export type BridgeStatusListener = (event: BridgeStatusEvent) => void;

const BRIDGE_EXECUTE_TIMEOUT_MS = 120_000;
const BRIDGE_ASYNC_EXECUTE_TIMEOUT_MS = 10 * 60 * 1000;
const BRIDGE_MANIFEST_CACHE_MS = 30_000;
const BRIDGE_MANIFEST_METADATA_REVALIDATE_MS = 5_000;
const BRIDGE_MANIFEST_CACHE_MAX_ENTRIES = 100;
const SNOW_BRIDGE_CHANNEL = 'bridge-ws';

type BridgeManifestCacheEntry = {
	connectionKey: string;
	manifest: BridgeManifestResponse;
	expiresAt: number;
	refreshAfter: number;
};

type BridgePendingManifestRequest = {
	connectionKey: string;
	promise: Promise<BridgeManifestResponse>;
};

function normalizeUniqueStrings(values: unknown[]): string[] {
	return Array.from(
		new Set(
			values
				.map(value => String(value || '').trim())
				.filter(Boolean),
		),
	).sort((left, right) => left.localeCompare(right));
}

function normalizeManifestToolFilters(
	toolFilters?: BridgeManifestToolFilters,
): BridgeManifestToolFilters | undefined {
	if (!toolFilters) {
		return undefined;
	}

	const normalized = {
		include: normalizeUniqueStrings(toolFilters.include || []),
		profileName: String(toolFilters.profileName || '').trim(),
		includeExactToolNames: normalizeUniqueStrings(
			toolFilters.includeExactToolNames || [],
		),
		excludeExactToolNames: normalizeUniqueStrings(
			toolFilters.excludeExactToolNames || [],
		),
		excludeBridgeToolIds: normalizeUniqueStrings(
			toolFilters.excludeBridgeToolIds || [],
		),
		excludePluginNames: normalizeUniqueStrings(
			toolFilters.excludePluginNames || [],
		),
	};

	if (
		!normalized.profileName &&
		Object.entries(normalized)
			.filter(([key]) => key !== 'profileName')
			.every(([, values]) => Array.isArray(values) && values.length === 0)
	) {
		return undefined;
	}

	return normalized;
}

function buildManifestCacheKey(options: {
	connectionKey: string;
	toolFilters?: BridgeManifestToolFilters;
}): string {
	return JSON.stringify({
		connectionKey: options.connectionKey,
		toolFilters: options.toolFilters || null,
	});
}

function shouldUseMetadataRevalidation(
	manifest: BridgeManifestResponse,
): boolean {
	return Boolean(
		manifest.metadata?.revision ||
			manifest.metadata?.reloadedAt ||
			manifest.metadata?.requiresApproval !== undefined ||
			manifest.metadata?.approvalTimeoutMs !== undefined,
	);
}

function normalizeBridgeStatusEvent(
	data: Record<string, unknown>,
): BridgeStatusEvent | null {
	const invocationId = String(data['invocationId'] || '').trim();
	if (!invocationId) {
		return null;
	}

	const asyncStatusCandidate =
		data['asyncStatus'] && typeof data['asyncStatus'] === 'object'
			? {...(data['asyncStatus'] as Record<string, unknown>)}
			: {};
	const taskId =
		String(
			data['taskId'] ||
				asyncStatusCandidate['taskId'] ||
				'',
		).trim() || undefined;
	const status =
		String(
			data['status'] ||
				asyncStatusCandidate['state'] ||
				'',
		).trim() || undefined;
	const asyncStatus: BridgeAsyncStatus = {
		...asyncStatusCandidate,
		...(taskId ? {taskId} : {}),
	};

	return {
		type: 'vcp_tool_status',
		...(data['requestId'] ? {requestId: String(data['requestId'])} : {}),
		invocationId,
		...(data['toolId'] ? {toolId: String(data['toolId'])} : {}),
		...(data['toolName'] ? {toolName: String(data['toolName'])} : {}),
		...(data['originName'] ? {originName: String(data['originName'])} : {}),
		...(taskId ? {taskId} : {}),
		...(status ? {status} : {}),
		isAsync: data['async'] === true || Boolean(taskId),
		asyncStatus,
		...(data['bridgeType'] ? {bridgeType: String(data['bridgeType'])} : {}),
		...(data['result'] !== undefined ? {result: data['result']} : {}),
		...(data['error'] && typeof data['error'] === 'object'
			? {error: data['error'] as BridgeStatusEvent['error']}
			: {}),
		rawData: {...data},
	};
}

function formatBridgeErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return String(error || 'unknown error');
}

export class SnowBridgeClient {
	private readonly debugFrames = process.env['SNOW_DEBUG_BRIDGE'] === '1';
	private socket: WebSocket | null = null;
	private connectPromise: Promise<void> | null = null;
	private pendingRequests = new Map<string, BridgePendingRequest>();
	private pendingStatusListeners = new Map<string, BridgeStatusListener>();
	private manifestCache = new Map<string, BridgeManifestCacheEntry>();
	private pendingManifestRequests = new Map<
		string,
		BridgePendingManifestRequest
	>();
	private activeConnectionKey = '';

	private buildConnectionKey(config: Pick<
		ApiConfig,
		| 'baseUrl'
		| 'bridgeWsUrl'
		| 'bridgeVcpKey'
		| 'bridgeAccessToken'
		| 'toolTransport'
	>): string {
		return JSON.stringify({
			baseUrl: config.baseUrl,
			bridgeWsUrl: config.bridgeWsUrl || '',
			bridgeVcpKey: config.bridgeVcpKey || '',
			bridgeAccessToken: config.bridgeAccessToken || '',
		});
	}

	private buildBridgeRequestHeaders(
		config: Pick<ApiConfig, 'toolTransport'>,
	): Record<string, string> {
		const toolMode =
			config.toolTransport === 'hybrid' ? 'hybrid' : 'bridge';

		return {
			'x-snow-client': 'snow-cli',
			'x-snow-protocol': 'function-calling',
			'x-snow-tool-mode': toolMode,
			'x-snow-channel': SNOW_BRIDGE_CHANNEL,
		};
	}

	private buildWebSocketUrl(
		config: Pick<ApiConfig, 'baseUrl' | 'bridgeWsUrl' | 'bridgeVcpKey'>,
	): string {
		const explicitBridgeWsUrl = (config.bridgeWsUrl || '').trim();
		if (explicitBridgeWsUrl) {
			const parsed = new URL(explicitBridgeWsUrl);
			if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
				throw new Error(
					'SnowBridge WebSocket URL must use ws:// or wss:// protocol.',
				);
			}

			return parsed.toString();
		}

		const key = (config.bridgeVcpKey || '').trim();
		if (!key) {
			throw new Error(
				'SnowBridge requires bridgeVcpKey when toolTransport=bridge unless bridgeWsUrl is provided.',
			);
		}

		const parsed = new URL(config.baseUrl);
		parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
		parsed.pathname = `/vcp-distributed-server/VCP_Key=${encodeURIComponent(key)}`;
		parsed.search = '';
		parsed.hash = '';
		return parsed.toString();
	}

	private cleanupSocket(): void {
		if (this.socket) {
			this.socket.removeAllListeners();
			if (
				this.socket.readyState !== WebSocket.CLOSED &&
				this.socket.readyState !== WebSocket.CLOSING
			) {
				this.socket.close();
			}
		}
		this.socket = null;
		this.connectPromise = null;
		this.activeConnectionKey = '';
	}

	disconnect(): void {
		this.rejectAllPending(
			new Error('SnowBridge connection closed by client reset.'),
		);
		this.cleanupSocket();
	}

	clearManifestCache(
		config?: Pick<
			ApiConfig,
			| 'baseUrl'
			| 'bridgeWsUrl'
			| 'bridgeVcpKey'
			| 'bridgeAccessToken'
			| 'toolTransport'
		>,
	): void {
		if (!config) {
			this.manifestCache.clear();
			this.pendingManifestRequests.clear();
			return;
		}

		const connectionKey = this.buildConnectionKey(config);
		for (const [cacheKey, entry] of this.manifestCache.entries()) {
			if (entry.connectionKey === connectionKey) {
				this.manifestCache.delete(cacheKey);
			}
		}

		for (const [cacheKey, entry] of this.pendingManifestRequests.entries()) {
			if (entry.connectionKey === connectionKey) {
				this.pendingManifestRequests.delete(cacheKey);
			}
		}
	}

	private touchManifestCacheEntry(
		connectionKey: string,
		entry: BridgeManifestCacheEntry,
	): void {
		this.manifestCache.delete(connectionKey);
		this.manifestCache.set(connectionKey, entry);
	}

	private pruneManifestCache(now = Date.now()): void {
		for (const [connectionKey, entry] of this.manifestCache.entries()) {
			if (entry.expiresAt <= now) {
				this.manifestCache.delete(connectionKey);
			}
		}

		while (this.manifestCache.size > BRIDGE_MANIFEST_CACHE_MAX_ENTRIES) {
			const oldestConnectionKey = this.manifestCache.keys().next().value;
			if (!oldestConnectionKey) {
				break;
			}

			this.manifestCache.delete(oldestConnectionKey);
		}
	}

	private cacheManifest(options: {
		manifestCacheKey: string;
		connectionKey: string;
		manifest: BridgeManifestResponse;
		now?: number;
	}): BridgeManifestResponse {
		const now = options.now ?? Date.now();
		const refreshInterval = shouldUseMetadataRevalidation(options.manifest)
			? BRIDGE_MANIFEST_METADATA_REVALIDATE_MS
			: BRIDGE_MANIFEST_CACHE_MS;

		this.touchManifestCacheEntry(options.manifestCacheKey, {
			connectionKey: options.connectionKey,
			manifest: options.manifest,
			expiresAt: now + BRIDGE_MANIFEST_CACHE_MS,
			refreshAfter: now + refreshInterval,
		});
		this.pruneManifestCache(now);
		return options.manifest;
	}

	private loadManifest(options: {
		config: Pick<
			ApiConfig,
			| 'baseUrl'
			| 'bridgeWsUrl'
			| 'bridgeVcpKey'
			| 'bridgeAccessToken'
			| 'toolTransport'
		>;
		connectionKey: string;
		manifestCacheKey: string;
		toolFilters?: BridgeManifestToolFilters;
	}): Promise<BridgeManifestResponse> {
		const manifestPromise = this.sendRequest<{
			status: string;
			plugins?: BridgeManifestResponse['plugins'];
			bridgeVersion?: string;
			vcpVersion?: string;
			capabilities?: BridgeManifestResponse['capabilities'];
			metadata?: BridgeManifestResponse['metadata'];
			sidecar?: BridgeManifestResponse['sidecar'];
			revision?: string;
			reloadedAt?: string;
			requiresApproval?: boolean;
			approvalTimeoutMs?: number;
			error?: {message?: string};
		}>({
			config: options.config,
			type: 'get_vcp_manifests',
			expectedType: 'vcp_manifest_response',
			payload: {
				...(options.toolFilters ? {toolFilters: options.toolFilters} : {}),
			},
		})
			.then(response => {
				if (response.status !== 'success') {
					throw new Error(
						response.error?.message || 'Failed to load SnowBridge manifest.',
					);
				}

				const manifest = normalizeBridgeManifestResponse({
					...(response.bridgeVersion !== undefined
						? {bridgeVersion: response.bridgeVersion}
						: {}),
					...(response.vcpVersion !== undefined
						? {vcpVersion: response.vcpVersion}
						: {}),
					...(response.capabilities !== undefined
						? {capabilities: response.capabilities}
						: {}),
					plugins: response.plugins || [],
					...(response.metadata !== undefined
						? {metadata: response.metadata}
						: {}),
					...(response.sidecar !== undefined ? {sidecar: response.sidecar} : {}),
					...(response.revision !== undefined
						? {revision: response.revision}
						: {}),
					...(response.reloadedAt !== undefined
						? {reloadedAt: response.reloadedAt}
						: {}),
					...(response.requiresApproval !== undefined
						? {requiresApproval: response.requiresApproval}
						: {}),
					...(response.approvalTimeoutMs !== undefined
						? {approvalTimeoutMs: response.approvalTimeoutMs}
						: {}),
				});
				return this.cacheManifest({
					manifestCacheKey: options.manifestCacheKey,
					connectionKey: options.connectionKey,
					manifest,
				});
			})
			.finally(() => {
				this.pendingManifestRequests.delete(options.manifestCacheKey);
			});

		this.pendingManifestRequests.set(options.manifestCacheKey, {
			connectionKey: options.connectionKey,
			promise: manifestPromise,
		});
		return manifestPromise;
	}

	private queueManifestRefresh(options: {
		config: Pick<
			ApiConfig,
			| 'baseUrl'
			| 'bridgeWsUrl'
			| 'bridgeVcpKey'
			| 'bridgeAccessToken'
			| 'toolTransport'
		>;
		connectionKey: string;
		manifestCacheKey: string;
		toolFilters?: BridgeManifestToolFilters;
	}): void {
		if (this.pendingManifestRequests.has(options.manifestCacheKey)) {
			return;
		}

		void this.loadManifest(options).catch(error => {
			this.manifestCache.delete(options.manifestCacheKey);
			console.warn(
				`[SnowBridge] Background manifest refresh failed for ${options.connectionKey}: ${formatBridgeErrorMessage(error)}`,
			);
		});
	}

	private rejectAllPending(error: Error): void {
		for (const [requestId, pending] of this.pendingRequests.entries()) {
			if (pending.timer) {
				clearTimeout(pending.timer);
			}
			pending.reject(error);
			this.pendingRequests.delete(requestId);
		}
		this.pendingStatusListeners.clear();
	}

	private rejectPendingRequest(requestId: string, error: Error): void {
		const pending = this.pendingRequests.get(requestId);
		if (!pending) {
			return;
		}

		if (pending.timer) {
			clearTimeout(pending.timer);
		}
		this.pendingRequests.delete(requestId);
		pending.reject(error);
	}

	private armPendingTimer(requestId: string, timeoutMs: number): void {
		const pending = this.pendingRequests.get(requestId);
		if (!pending) {
			return;
		}

		if (pending.timer) {
			clearTimeout(pending.timer);
		}

		pending.timer = setTimeout(() => {
			this.pendingRequests.delete(requestId);
			pending.reject(new Error(pending.timeoutMessage));
		}, timeoutMs);
	}

	private handleMessage(message: unknown): void {
		try {
			const raw =
				typeof message === 'string'
					? message
					: Buffer.isBuffer(message)
					? message.toString()
					: String(message);
			const envelope = JSON.parse(raw) as BridgeEnvelope<any>;
			const data = envelope.data || {};
			const requestId = String(data.requestId || '');
			const invocationId = String(data.invocationId || '');

			if (envelope.type === 'vcp_tool_status' && invocationId) {
				const statusEvent = normalizeBridgeStatusEvent(data);
				if (statusEvent) {
					this.pendingStatusListeners.get(invocationId)?.(statusEvent);
				}
			}

			if (!requestId) {
				return;
			}

			const pending = this.pendingRequests.get(requestId);
			if (!pending) {
				return;
			}

			if (pending.onEnvelope?.(envelope.type, data) === 'continue_waiting') {
				return;
			}

			if (pending.type === envelope.type) {
				if (pending.timer) {
					clearTimeout(pending.timer);
				}
				this.pendingRequests.delete(requestId);
				pending.resolve(data);
				return;
			}

			if (
				pending.type === 'vcp_tool_result' &&
				(envelope.type === 'vcp_tool_result' ||
					envelope.type === 'vcp_tool_cancel_ack')
			) {
				if (pending.timer) {
					clearTimeout(pending.timer);
				}
				this.pendingRequests.delete(requestId);
				pending.resolve(data);
			}
		} catch (error) {
			if (this.debugFrames) {
				console.warn('[SnowBridge] Ignored malformed bridge frame:', error);
			}
		}
	}

	private async ensureConnected(
		config: Pick<
			ApiConfig,
			| 'baseUrl'
			| 'bridgeWsUrl'
			| 'bridgeVcpKey'
			| 'bridgeAccessToken'
			| 'toolTransport'
		>,
	): Promise<void> {
		const nextConnectionKey = this.buildConnectionKey(config);
		if (
			this.socket?.readyState === WebSocket.OPEN &&
			this.activeConnectionKey === nextConnectionKey
		) {
			return;
		}

		if (this.connectPromise && this.activeConnectionKey === nextConnectionKey) {
			return this.connectPromise;
		}

		this.cleanupSocket();
		this.activeConnectionKey = nextConnectionKey;
		const wsUrl = this.buildWebSocketUrl(config);

		this.connectPromise = new Promise<void>((resolve, reject) => {
			const socket = new WebSocket(wsUrl);
			this.socket = socket;

			const onOpen = () => {
				socket.off('error', onError);
				resolve();
			};

			const onError = (error: Error) => {
				socket.off('open', onOpen);
				this.cleanupSocket();
				reject(error);
			};

			socket.on('open', onOpen);
			socket.on('error', onError);
			socket.on('message', payload => this.handleMessage(payload));
			socket.on('close', () => {
				this.cleanupSocket();
				this.rejectAllPending(new Error('SnowBridge connection closed.'));
			});
		}).finally(() => {
			this.connectPromise = null;
		});

		return this.connectPromise ?? Promise.resolve();
	}

	private sendRequest<TResponse>(options: {
		config: Pick<
			ApiConfig,
			| 'baseUrl'
			| 'bridgeWsUrl'
			| 'bridgeVcpKey'
			| 'bridgeAccessToken'
			| 'toolTransport'
		>;
		type: string;
		expectedType: string;
		payload: Record<string, unknown>;
		timeoutMs?: number;
		timeoutMessage?: string;
		onEnvelope?: (
			envelopeType: string,
			data: Record<string, unknown>,
		) => 'continue_waiting' | void;
	}): Promise<TResponse> {
		return this.ensureConnected(options.config).then(() =>
			this.sendConnectedRequest(options),
		);
	}

	private sendConnectedRequest<TResponse>(options: {
		config: Pick<
			ApiConfig,
			| 'baseUrl'
			| 'bridgeWsUrl'
			| 'bridgeVcpKey'
			| 'bridgeAccessToken'
			| 'toolTransport'
		>;
		type: string;
		expectedType: string;
		payload: Record<string, unknown>;
		timeoutMs?: number;
		timeoutMessage?: string;
		onEnvelope?: (
			envelopeType: string,
			data: Record<string, unknown>,
		) => 'continue_waiting' | void;
	}): Promise<TResponse> {
		return new Promise<TResponse>((resolve, reject) => {
			const requestId = String(
				options.payload['requestId'] || randomUUID(),
			);
			const timeoutMs = options.timeoutMs ?? 20_000;
			const payload = {
				type: options.type,
				data: {
					...options.payload,
					requestId,
					accessToken: options.config.bridgeAccessToken || undefined,
					requestHeaders: this.buildBridgeRequestHeaders(options.config),
					clientInfo: {
						clientId: 'snow-cli',
						clientName: 'snow-cli',
					},
				},
			};

			this.pendingRequests.set(requestId, {
				resolve,
				reject,
				timer: null,
				type: options.expectedType,
				timeoutMessage:
					options.timeoutMessage ||
					`SnowBridge request timed out: ${options.type} (${requestId})`,
				onEnvelope: options.onEnvelope,
			});
			this.armPendingTimer(requestId, timeoutMs);

			try {
				this.socket?.send(JSON.stringify(payload));
			} catch (error) {
				const pending = this.pendingRequests.get(requestId);
				if (pending?.timer) {
					clearTimeout(pending.timer);
				}
				this.pendingRequests.delete(requestId);
				reject(
					error instanceof Error
						? error
						: new Error('Failed to send SnowBridge request.'),
				);
			}
		});
	}

	async getManifest(
		config: Pick<
			ApiConfig,
			| 'baseUrl'
			| 'bridgeWsUrl'
			| 'bridgeVcpKey'
			| 'bridgeAccessToken'
			| 'toolTransport'
		>,
		options?: BridgeManifestRequestOptions,
	): Promise<BridgeManifestResponse> {
		const connectionKey = this.buildConnectionKey(config);
		const toolFilters = normalizeManifestToolFilters(options?.toolFilters);
		const manifestCacheKey = buildManifestCacheKey({
			connectionKey,
			toolFilters,
		});
		const now = Date.now();
		const cachedManifest = this.manifestCache.get(manifestCacheKey);
		if (cachedManifest && cachedManifest.expiresAt > now) {
			this.touchManifestCacheEntry(manifestCacheKey, cachedManifest);
			if (cachedManifest.refreshAfter <= now) {
				this.queueManifestRefresh({
					config,
					connectionKey,
					manifestCacheKey,
					toolFilters,
				});
			}
			return cachedManifest.manifest;
		}
		if (cachedManifest) {
			this.manifestCache.delete(manifestCacheKey);
		}

		const pendingManifest = this.pendingManifestRequests.get(manifestCacheKey);
		if (pendingManifest) {
			return pendingManifest.promise;
		}

		return this.loadManifest({
			config,
			connectionKey,
			manifestCacheKey,
			toolFilters,
		});
	}

	async executeTool(options: {
		config: Pick<
			ApiConfig,
			| 'baseUrl'
			| 'bridgeWsUrl'
			| 'bridgeVcpKey'
			| 'bridgeAccessToken'
			| 'toolTransport'
		>;
		toolName: string;
		toolArgs: Record<string, unknown>;
		onStatus?: BridgeStatusListener;
		abortSignal?: AbortSignal;
	}): Promise<BridgeToolExecutionResponse> {
		const requestId = randomUUID();
		const invocationId = requestId;
		const abortMessage = `SnowBridge tool execution aborted: ${options.toolName}`;
		let aborted = false;
		const statusEvents: BridgeStatusEvent[] = [];

		if (options.abortSignal?.aborted) {
			throw new Error(abortMessage);
		}

		if (options.onStatus) {
			this.pendingStatusListeners.set(invocationId, statusEvent => {
				statusEvents.push(statusEvent);
				options.onStatus?.(statusEvent);
			});
		} else {
			this.pendingStatusListeners.set(invocationId, statusEvent => {
				statusEvents.push(statusEvent);
			});
		}

		const abortHandler = () => {
			if (aborted) {
				return;
			}

			aborted = true;
			this.rejectPendingRequest(
				requestId,
				new Error(abortMessage),
			);
			void this.cancelTool({
				config: options.config,
				requestId,
				invocationId,
			}).catch(error => {
				console.warn(
					`[SnowBridge] Failed to cancel tool "${options.toolName}" (${requestId}): ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}).finally(() => {
				this.pendingStatusListeners.delete(invocationId);
			});
		};

		if (options.abortSignal) {
			if (options.abortSignal.aborted) {
				abortHandler();
			} else {
				options.abortSignal.addEventListener('abort', abortHandler, {once: true});
			}
		}

		try {
			await this.ensureConnected(options.config);
			if (aborted || options.abortSignal?.aborted) {
				throw new Error(abortMessage);
			}

			const response = await this.sendConnectedRequest<BridgeToolExecutionResponse>({
				config: options.config,
				type: 'execute_vcp_tool',
				expectedType: 'vcp_tool_result',
				payload: {
					requestId,
					invocationId,
					toolName: options.toolName,
					toolArgs: options.toolArgs,
				},
				timeoutMs: BRIDGE_EXECUTE_TIMEOUT_MS,
				timeoutMessage: `SnowBridge tool execution timed out: ${options.toolName}`,
				onEnvelope: (envelopeType, data) => {
					if (envelopeType !== 'vcp_tool_status') {
						return;
					}

					if (
						data['async'] === true ||
						data['status'] === 'accepted' ||
						data['taskId']
					) {
						this.armPendingTimer(
							requestId,
							BRIDGE_ASYNC_EXECUTE_TIMEOUT_MS,
						);
					}

					return 'continue_waiting';
				},
			});

			if (response.status !== 'success') {
				throw new Error(response.error?.message || 'SnowBridge tool execution failed.');
			}

			return statusEvents.length > 0
				? {
						...response,
						statusEvents,
				  }
				: response;
		} finally {
			this.pendingStatusListeners.delete(invocationId);
			options.abortSignal?.removeEventListener('abort', abortHandler);
		}
	}

	async cancelTool(options: {
		config: Pick<
			ApiConfig,
			| 'baseUrl'
			| 'bridgeWsUrl'
			| 'bridgeVcpKey'
			| 'bridgeAccessToken'
			| 'toolTransport'
		>;
		requestId: string;
		invocationId: string;
	}): Promise<void> {
		await this.sendRequest({
			config: options.config,
			type: 'cancel_vcp_tool',
			expectedType: 'vcp_tool_cancel_ack',
			payload: {
				requestId: options.requestId,
				invocationId: options.invocationId,
			},
			timeoutMs: 5_000,
		});
	}
}

export const snowBridgeClient = new SnowBridgeClient();
