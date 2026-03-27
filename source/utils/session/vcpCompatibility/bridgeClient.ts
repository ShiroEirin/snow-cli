import {randomUUID} from 'node:crypto';
import {WebSocket} from 'ws';
import type {ApiConfig} from '../../config/apiConfig.js';
import type {BridgeManifestResponse} from './toolSnapshot.js';

type BridgeEnvelope<T = unknown> = {
	type: string;
	data?: T;
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

type BridgeStatusListener = (event: unknown) => void;

const BRIDGE_EXECUTE_TIMEOUT_MS = 120_000;
const BRIDGE_ASYNC_EXECUTE_TIMEOUT_MS = 10 * 60 * 1000;

class SnowBridgeClient {
	private readonly debugFrames = process.env['SNOW_DEBUG_BRIDGE'] === '1';
	private socket: WebSocket | null = null;
	private connectPromise: Promise<void> | null = null;
	private pendingRequests = new Map<string, BridgePendingRequest>();
	private pendingStatusListeners = new Map<string, BridgeStatusListener>();
	private activeConnectionKey = '';

	private buildConnectionKey(config: Pick<
		ApiConfig,
		'baseUrl' | 'bridgeVcpKey' | 'bridgeAccessToken'
	>): string {
		return JSON.stringify({
			baseUrl: config.baseUrl,
			bridgeVcpKey: config.bridgeVcpKey || '',
			bridgeAccessToken: config.bridgeAccessToken || '',
		});
	}

	private buildWebSocketUrl(config: Pick<ApiConfig, 'baseUrl' | 'bridgeVcpKey'>): string {
		const key = (config.bridgeVcpKey || '').trim();
		if (!key) {
			throw new Error('SnowBridge requires bridgeVcpKey when toolTransport=bridge.');
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
				this.pendingStatusListeners.get(invocationId)?.(data);
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
		config: Pick<ApiConfig, 'baseUrl' | 'bridgeVcpKey' | 'bridgeAccessToken'>,
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
		config: Pick<ApiConfig, 'baseUrl' | 'bridgeVcpKey' | 'bridgeAccessToken'>;
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
		return this.ensureConnected(options.config).then(
			() =>
				new Promise<TResponse>((resolve, reject) => {
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
				}),
		);
	}

	async getManifest(
		config: Pick<ApiConfig, 'baseUrl' | 'bridgeVcpKey' | 'bridgeAccessToken'>,
	): Promise<BridgeManifestResponse> {
		const response = await this.sendRequest<{
			status: string;
			plugins?: BridgeManifestResponse['plugins'];
			error?: {message?: string};
		}>({
			config,
			type: 'get_vcp_manifests',
			expectedType: 'vcp_manifest_response',
			payload: {},
		});

		if (response.status !== 'success') {
			throw new Error(response.error?.message || 'Failed to load SnowBridge manifest.');
		}

		return {
			plugins: response.plugins || [],
		};
	}

	async executeTool(options: {
		config: Pick<ApiConfig, 'baseUrl' | 'bridgeVcpKey' | 'bridgeAccessToken'>;
		toolName: string;
		toolArgs: Record<string, unknown>;
		onStatus?: BridgeStatusListener;
		abortSignal?: AbortSignal;
	}): Promise<unknown> {
		const requestId = randomUUID();
		const invocationId = requestId;
		const abortMessage = `SnowBridge tool execution aborted: ${options.toolName}`;

		if (options.abortSignal?.aborted) {
			throw new Error(abortMessage);
		}

		if (options.onStatus) {
			this.pendingStatusListeners.set(invocationId, options.onStatus);
		}

		const abortHandler = () => {
			this.rejectPendingRequest(
				requestId,
				new Error(abortMessage),
			);
			void this.cancelTool({
				config: options.config,
				requestId,
				invocationId,
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
			const response = await this.sendRequest<{
				status: string;
				result?: unknown;
				error?: {message?: string};
			}>({
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

			return response.result;
		} finally {
			this.pendingStatusListeners.delete(invocationId);
			options.abortSignal?.removeEventListener('abort', abortHandler);
		}
	}

	async cancelTool(options: {
		config: Pick<ApiConfig, 'baseUrl' | 'bridgeVcpKey' | 'bridgeAccessToken'>;
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
		}).catch(() => {});
	}
}

export const snowBridgeClient = new SnowBridgeClient();
