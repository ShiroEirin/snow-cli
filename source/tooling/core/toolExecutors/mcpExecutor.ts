import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
// Intentionally kept for backward compatibility fallback, despite deprecation
import {SSEClientTransport} from '@modelcontextprotocol/sdk/client/sse.js';
import type {MCPServer} from '../../../utils/config/apiConfig.js';
import {logger} from '../../../utils/core/logger.js';
import {resourceMonitor} from '../../../utils/core/resourceMonitor.js';

export type ExternalMcpTool = {
	name: string;
	description: string;
	inputSchema: any;
};

type PersistentMcpClient = {
	client: Client;
	lastUsed: number;
};

export const EXTERNAL_MCP_CLIENT_IDLE_TIMEOUT = 10 * 60 * 1000;

const MCP_ENV_VAR_PATTERN = /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;
const persistentClients = new Map<string, PersistentMcpClient>();

export async function probeExternalMcpTools(
	serviceName: string,
	server: MCPServer,
): Promise<ExternalMcpTool[]> {
	const timeout = getMCPServerTransportType(server) === 'http' ? 15000 : 5000;
	return connectAndGetTools(serviceName, server, timeout);
}

export function getMCPServerTransportType(
	server: MCPServer,
): 'http' | 'stdio' | null {
	if (server.type) {
		if (server.type === 'local') {
			return 'stdio';
		}

		return server.type as 'http' | 'stdio';
	}

	if (server.url) {
		return 'http';
	}

	if (server.command) {
		return 'stdio';
	}

	return null;
}

export function getServerProcessEnv(
	server: MCPServer,
): Record<string, string> {
	const processEnv: Record<string, string> = {};

	Object.entries(process.env).forEach(([key, value]) => {
		if (value !== undefined) {
			processEnv[key] = value;
		}
	});

	if (server.env) {
		Object.assign(processEnv, server.env);
	}

	if (server.environment) {
		Object.assign(processEnv, server.environment);
	}

	return processEnv;
}

export function interpolateMCPConfigValue(
	value: string,
	env: Record<string, string>,
): string {
	return value.replace(MCP_ENV_VAR_PATTERN, (match, braced, simple) => {
		const varName = braced || simple;
		return env[varName] ?? match;
	});
}

export function getHttpTransportConfig(server: MCPServer): {
	url: URL;
	requestInit: RequestInit;
} {
	if (!server.url) {
		throw new Error('No URL specified');
	}

	const env = getServerProcessEnv(server);
	const url = new URL(interpolateMCPConfigValue(server.url, env));
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'application/json, text/event-stream',
	};

	if (env['MCP_API_KEY']) {
		headers['Authorization'] = `Bearer ${env['MCP_API_KEY']}`;
	}

	if (env['MCP_AUTH_HEADER']) {
		headers['Authorization'] = env['MCP_AUTH_HEADER'];
	}

	if (server.headers) {
		Object.entries(server.headers).forEach(([key, value]) => {
			headers[key] = interpolateMCPConfigValue(value, env);
		});
	}

	return {
		url,
		requestInit: {headers},
	};
}

function createMCPClient(serviceName: string): Client {
	return new Client(
		{
			name: `snow-cli-${serviceName}`,
			version: '1.0.0',
		},
		{
			capabilities: {},
		},
	);
}

export function getMCPErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

export function shouldFallbackToSSE(error: unknown): boolean {
	const errorCode = (error as {code?: unknown})?.code;
	if (typeof errorCode === 'number') {
		return [404, 405, 406, 415, 501].includes(errorCode);
	}

	const message = getMCPErrorMessage(error).toLowerCase();
	return (
		message.includes('error posting to endpoint (http 404)') ||
		message.includes('error posting to endpoint (http 405)') ||
		message.includes('error posting to endpoint (http 406)') ||
		message.includes('error posting to endpoint (http 415)') ||
		message.includes('error posting to endpoint (http 501)') ||
		message.includes('method not allowed') ||
		message.includes('unexpected content type')
	);
}

async function connectAndGetTools(
	serviceName: string,
	server: MCPServer,
	timeoutMs: number = 10000,
): Promise<ExternalMcpTool[]> {
	let client = createMCPClient(serviceName);
	let transport: Parameters<Client['connect']>[0];
	let timeoutId: NodeJS.Timeout | null = null;
	let connectionAborted = false;

	const abortConnection = () => {
		connectionAborted = true;
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
	};

	const runWithTimeout = async <T>(
		operation: Promise<T>,
		timeoutMessage: string,
	): Promise<T> => {
		try {
			return await Promise.race([
				operation,
				new Promise<never>((_, reject) => {
					timeoutId = setTimeout(() => {
						abortConnection();
						reject(new Error(timeoutMessage));
					}, timeoutMs);
				}),
			]);
		} finally {
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
		}
	};

	try {
		resourceMonitor.trackMCPConnectionOpened(serviceName);

		const transportType = getMCPServerTransportType(server);
		if (transportType === 'http') {
			const {url, requestInit} = getHttpTransportConfig(server);

			try {
				logger.debug(
					`[MCP] Attempting StreamableHTTP connection to ${serviceName}...`,
				);

				transport = new StreamableHTTPClientTransport(url, {
					requestInit,
				});
				await runWithTimeout(
					client.connect(transport),
					'StreamableHTTP connection timeout',
				);

				logger.debug(
					`[MCP] Successfully connected to ${serviceName} using StreamableHTTP`,
				);
			} catch (httpError) {
				const streamableHttpErrorMessage = getMCPErrorMessage(httpError);

				try {
					await client.close();
				} catch {}

				if (connectionAborted) {
					throw new Error('Connection aborted due to timeout');
				}

				if (!shouldFallbackToSSE(httpError)) {
					throw httpError;
				}

				logger.debug(
					`[MCP] StreamableHTTP is not supported for ${serviceName} (${streamableHttpErrorMessage}), falling back to SSE (deprecated)...`,
				);

				client = createMCPClient(serviceName);
				try {
					transport = new SSEClientTransport(url, {
						requestInit,
					});
					await runWithTimeout(
						client.connect(transport),
						'SSE connection timeout',
					);

					logger.debug(
						`[MCP] Successfully connected to ${serviceName} using SSE (deprecated)`,
					);
				} catch (sseError) {
					throw new Error(
						`StreamableHTTP failed for ${serviceName}: ${streamableHttpErrorMessage}; SSE fallback failed: ${getMCPErrorMessage(
							sseError,
						)}`,
					);
				}
			}
		} else if (transportType === 'stdio') {
			if (!server.command) {
				throw new Error('No command specified');
			}

			transport = new StdioClientTransport({
				command: server.command,
				args: server.args || [],
				env: getServerProcessEnv(server),
				stderr: 'ignore',
			});
			await client.connect(transport);
		} else {
			throw new Error('No URL or command specified');
		}

		const toolsResult = await runWithTimeout(
			client.listTools(),
			'ListTools timeout',
		);

		return (
			toolsResult.tools?.map(tool => ({
				name: tool.name,
				description: tool.description || '',
				inputSchema: tool.inputSchema,
			})) || []
		);
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}

		try {
			await Promise.race([
				client.close(),
				new Promise(resolve => setTimeout(resolve, 1000)),
			]);
			resourceMonitor.trackMCPConnectionClosed(serviceName);
		} catch (error) {
			logger.warn(`Failed to close client for ${serviceName}:`, error);
			resourceMonitor.trackMCPConnectionClosed(serviceName);
		}
	}
}

async function getPersistentClient(
	serviceName: string,
	server: MCPServer,
): Promise<Client> {
	const existing = persistentClients.get(serviceName);
	if (existing) {
		existing.lastUsed = Date.now();
		return existing.client;
	}

	let client = createMCPClient(serviceName);
	resourceMonitor.trackMCPConnectionOpened(serviceName);

	let transport: Parameters<Client['connect']>[0];
	const transportType = getMCPServerTransportType(server);

	try {
		if (transportType === 'http') {
			const {url, requestInit} = getHttpTransportConfig(server);

			try {
				transport = new StreamableHTTPClientTransport(url, {
					requestInit,
				});
				await client.connect(transport);
			} catch (httpError) {
				const streamableHttpErrorMessage = getMCPErrorMessage(httpError);

				try {
					await client.close();
				} catch {}

				if (!shouldFallbackToSSE(httpError)) {
					throw httpError;
				}

				logger.debug(
					`[MCP] StreamableHTTP is not supported for ${serviceName} (${streamableHttpErrorMessage}), falling back to SSE (deprecated)...`,
				);

				client = createMCPClient(serviceName);
				transport = new SSEClientTransport(url, {
					requestInit,
				});

				try {
					await client.connect(transport);
				} catch (sseError) {
					throw new Error(
						`StreamableHTTP failed for ${serviceName}: ${streamableHttpErrorMessage}; SSE fallback failed: ${getMCPErrorMessage(
							sseError,
						)}`,
					);
				}
			}
		} else if (transportType === 'stdio') {
			if (!server.command) {
				throw new Error('No command specified');
			}

			transport = new StdioClientTransport({
				command: server.command,
				args: server.args || [],
				env: getServerProcessEnv(server),
				stderr: 'pipe',
			});
			await client.connect(transport);
		} else {
			throw new Error('No URL or command specified');
		}
	} catch (error) {
		try {
			await client.close();
		} catch {}

		resourceMonitor.trackMCPConnectionClosed(serviceName);
		throw error;
	}

	persistentClients.set(serviceName, {
		client,
		lastUsed: Date.now(),
	});

	logger.info(`Created persistent MCP connection for ${serviceName}`);

	return client;
}

export async function closeExternalMcpConnection(
	serviceName: string,
): Promise<void> {
	const clientInfo = persistentClients.get(serviceName);
	if (!clientInfo) {
		return;
	}

	try {
		await clientInfo.client.close();
		resourceMonitor.trackMCPConnectionClosed(serviceName);
		logger.info(`Closed MCP connection for ${serviceName}`);
	} catch (error) {
		logger.warn(`Failed to close client for ${serviceName}:`, error);
	} finally {
		persistentClients.delete(serviceName);
	}
}

export async function cleanupIdleExternalMcpConnections(): Promise<void> {
	const now = Date.now();
	const toClose: string[] = [];

	for (const [serviceName, clientInfo] of persistentClients.entries()) {
		if (now - clientInfo.lastUsed > EXTERNAL_MCP_CLIENT_IDLE_TIMEOUT) {
			toClose.push(serviceName);
		}
	}

	for (const serviceName of toClose) {
		await closeExternalMcpConnection(serviceName);
	}
}

export async function closeAllExternalMcpConnections(): Promise<void> {
	for (const serviceName of Array.from(persistentClients.keys())) {
		await closeExternalMcpConnection(serviceName);
	}
}

function isConnectionError(error: unknown): boolean {
	if (error instanceof Error) {
		const message = error.message.toLowerCase();
		return (
			message.includes('stream') ||
			message.includes('destroyed') ||
			message.includes('closed') ||
			message.includes('ended') ||
			message.includes('econnreset') ||
			message.includes('econnrefused') ||
			message.includes('epipe') ||
			message.includes('not connected') ||
			message.includes('transport') ||
			(error as {code?: string}).code === 'ERR_STREAM_DESTROYED'
		);
	}

	return false;
}

export async function executeExternalMcpToolCall(
	serviceName: string,
	server: MCPServer,
	toolName: string,
	args: any,
): Promise<any> {
	let retried = false;

	const attemptCall = async (): Promise<any> => {
		const client = await getPersistentClient(serviceName, server);

		logger.debug(
			`Using persistent MCP client for ${serviceName} tool ${toolName}`,
		);

		const timeout = server.timeout ?? 300000;
		const result = await client.callTool(
			{
				name: toolName,
				arguments: args,
			},
			undefined,
			{
				timeout,
				resetTimeoutOnProgress: true,
			},
		);
		logger.debug(`result from ${serviceName} tool ${toolName}:`, result);

		return result.content;
	};

	try {
		return await attemptCall();
	} catch (error) {
		if (!retried && isConnectionError(error)) {
			retried = true;
			logger.info(
				`Connection error for ${serviceName}, reconnecting and retrying...`,
			);
			await closeExternalMcpConnection(serviceName);
			return attemptCall();
		}

		throw error;
	}
}
