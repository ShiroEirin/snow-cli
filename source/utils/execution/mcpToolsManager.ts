import {getMCPConfig, getOpenAiConfig} from '../config/apiConfig.js';
import {mcpTools as filesystemTools} from '../../mcp/filesystem.js';
import {mcpTools as terminalTools} from '../../mcp/bash.js';
import {mcpTools as aceCodeSearchTools} from '../../mcp/aceCodeSearch.js';
import {mcpTools as websearchTools} from '../../mcp/websearch.js';
import {mcpTools as ideDiagnosticsTools} from '../../mcp/ideDiagnostics.js';
import {mcpTools as codebaseSearchTools} from '../../mcp/codebaseSearch.js';
import {mcpTools as askUserQuestionTools} from '../../mcp/askUserQuestion.js';
import {mcpTools as schedulerTools} from '../../mcp/scheduler.js';
import {TodoService} from '../../mcp/todo.js';
import {mcpTools as notebookTools} from '../../mcp/notebook.js';
import {getMCPTools as getSubAgentTools} from '../../mcp/subagent.js';
import {getTeamMCPTools as getTeamTools} from '../../mcp/team.js';
import {getMCPTools as getSkillTools} from '../../mcp/skills.js';
import {sessionManager} from '../session/sessionManager.js';
import {
	isBuiltInServiceEnabled,
	getDisabledBuiltInServices,
} from '../config/disabledBuiltInTools.js';
import {getDisabledSkills} from '../config/disabledSkills.js';
import {
	cleanupIdleVcpBridgeConnection,
	closeVcpBridgeConnection,
	discoverVcpBridgeTools,
} from '../session/vcpCompatibility/toolBridge.js';
import {logger} from '../core/logger.js';
import {HookFailedError} from './hookFailedError.js';
import {executeBridgeToolCall} from '../../tooling/core/toolExecutors/bridgeExecutor.js';
import {
	executeLocalToolCall,
	isLocalToolService,
} from '../../tooling/core/toolExecutors/localExecutor.js';
import {
	EXTERNAL_MCP_CLIENT_IDLE_TIMEOUT,
	cleanupIdleExternalMcpConnections,
	closeAllExternalMcpConnections,
	closeExternalMcpConnection,
	executeExternalMcpToolCall,
	probeExternalMcpTools,
} from '../../tooling/core/toolExecutors/mcpExecutor.js';
import {buildBridgeToolSpecs} from '../../tooling/core/toolProviders/bridgeProvider.js';
import {buildLocalToolSpecs} from '../../tooling/core/toolProviders/localProvider.js';
import {buildMcpToolSpecs} from '../../tooling/core/toolProviders/mcpProvider.js';
import {buildToolRegistrySnapshot} from '../../tooling/core/toolRegistry.js';
import {tryRouteSnowToolCall} from '../../tooling/core/toolRouter.js';
import type {
	SnowToolCall,
	SnowToolSpec,
	ToolRegistrySnapshot,
} from '../../tooling/core/types.js';
import os from 'os';
import path from 'path';

/**
 * Extended Error interface with optional isHookFailure flag
 */
export interface HookError extends Error {
	isHookFailure?: boolean;
}

export interface MCPTool {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: any;
	};
}

export interface MCPServiceTools {
	serviceName: string;
	tools: Array<{
		name: string;
		description: string;
		inputSchema: any;
	}>;
	isBuiltIn: boolean;
	connected: boolean;
	error?: string;
	enabled?: boolean;
}

// Cache for MCP tools to avoid reconnecting on every message
interface MCPToolsCache {
	tools: MCPTool[];
	servicesInfo: MCPServiceTools[];
	registry: ToolRegistrySnapshot;
	lastUpdate: number;
	configHash: string;
}

let toolsCache: MCPToolsCache | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Lazy initialization of TODO service to avoid circular dependencies
let todoService: TodoService | null = null;
const VCP_BRIDGE_SERVICE_NAME = 'snowbridge';

function toSchemaRecord(value: any): Record<string, unknown> {
	return (value && typeof value === 'object' ? value : {}) as Record<
		string,
		unknown
	>;
}

/**
 * Get the TODO service instance (lazy initialization)
 * TODO 服务路径与 Session 保持一致，按项目分类存储
 */
export function getTodoService(): TodoService {
	if (!todoService) {
		// 获取当前项目ID，与 Session 路径结构保持一致
		const projectId = sessionManager.getProjectId();
		const basePath = path.join(os.homedir(), '.snow', 'todos', projectId);

		todoService = new TodoService(basePath, () => {
			const session = sessionManager.getCurrentSession();
			return session ? session.id : null;
		});
	}
	return todoService;
}

/**
 * Get all registered service prefixes (synchronous)
 * Used for detecting merged tool names
 * Returns cached service names if available, otherwise returns built-in services
 */
export function getRegisteredServicePrefixes(): string[] {
	// 内置服务前缀（始终可用）
	const builtInPrefixes = [
		'todo-',
		'notebook-',
		'filesystem-',
		'terminal-',
		'ace-',
		'websearch-',
		'ide-',
		'codebase-',
		'askuser-',
		'scheduler-',
		'skill-',
		'subagent-',
	];

	// 如果有缓存，从缓存中获取外部 MCP 服务名称
	if (toolsCache?.servicesInfo) {
		const cachedPrefixes = toolsCache.servicesInfo
			.map(s => `${s.serviceName}-`)
			.filter(p => !builtInPrefixes.includes(p));
		return [...builtInPrefixes, ...cachedPrefixes];
	}

	// 尝试从 MCP 配置中获取外部服务名称
	try {
		const mcpConfig = getMCPConfig();
		const externalPrefixes = Object.keys(mcpConfig.mcpServers || {}).map(
			name => `${name}-`,
		);
		return [...builtInPrefixes, ...externalPrefixes];
	} catch {
		return builtInPrefixes;
	}
}

/**
 * Generate a hash of the current MCP configuration and sub-agents
 */
async function generateConfigHash(): Promise<string> {
	try {
		const mcpConfig = getMCPConfig();
		const apiConfig = getOpenAiConfig();
		const subAgents = getSubAgentTools(); // Include sub-agents in hash

		// Include skills in hash (both project and global)
		const projectRoot = process.cwd();
		const skillTools = await getSkillTools(projectRoot);

		// 🔥 CRITICAL: Include codebase enabled status in hash
		const {loadCodebaseConfig} = await import('../config/codebaseConfig.js');
		const codebaseConfig = loadCodebaseConfig();

		return JSON.stringify({
			mcpServers: mcpConfig.mcpServers,
			subAgents: subAgents.map(t => t.name), // Only track agent names for hash
			skills: skillTools.map(t => t.name), // Include skill names in hash
			codebaseEnabled: codebaseConfig.enabled, // 🔥 Must include to invalidate cache on enable/disable
			disabledBuiltInServices: getDisabledBuiltInServices(), // Include disabled built-in services in hash
			disabledSkills: getDisabledSkills(), // Include disabled skills in hash
			backendMode: apiConfig.backendMode,
			toolTransport: apiConfig.toolTransport,
			vcpToolBridgeWsUrl: apiConfig.vcpToolBridgeWsUrl,
			vcpToolBridgeToolFilter: apiConfig.vcpToolBridgeToolFilter,
			vcpToolBridgeToken: apiConfig.vcpToolBridgeToken,
			vcpToolBridgeFallbackToLocal: apiConfig.vcpToolBridgeFallbackToLocal,
		});
	} catch {
		return '';
	}
}

/**
 * Check if the cache is valid and not expired
 */
async function isCacheValid(): Promise<boolean> {
	if (!toolsCache) return false;

	const now = Date.now();
	const isExpired = now - toolsCache.lastUpdate > CACHE_DURATION;
	const configHash = await generateConfigHash();
	const configChanged = toolsCache.configHash !== configHash;

	return !isExpired && !configChanged;
}

/**
 * Get cached tools or build cache if needed
 */
async function getCachedTools(): Promise<MCPTool[]> {
	if (await isCacheValid()) {
		return toolsCache!.tools;
	}
	await refreshToolsCache();
	return toolsCache!.tools;
}

export async function getToolRegistrySnapshot(): Promise<ToolRegistrySnapshot> {
	if (await isCacheValid()) {
		return toolsCache!.registry;
	}

	await refreshToolsCache();
	return toolsCache!.registry;
}

/**
 * Refresh the tools cache by collecting all available tools
 */
async function refreshToolsCache(): Promise<void> {
	const allTools: MCPTool[] = [];
	const servicesInfo: MCPServiceTools[] = [];
	const canonicalSpecs: SnowToolSpec[] = [];

	// Helper: Add a built-in service, respecting disabled state
	// Disabled services are added to servicesInfo (for MCP panel display) but NOT to allTools (AI cannot use them)
	const addBuiltInService = (
		serviceName: string,
		tools: Array<{name: string; description: string; inputSchema: any}>,
		prefix: string,
	) => {
		const enabled = isBuiltInServiceEnabled(serviceName);
		const serviceTools = tools.map(tool => ({
			name: tool.name.replace(`${prefix}-`, ''),
			description: tool.description,
			inputSchema: tool.inputSchema,
		}));

		servicesInfo.push({
			serviceName,
			tools: serviceTools,
			isBuiltIn: true,
			connected: true,
			enabled,
		});

		// Only add to allTools if enabled
		if (enabled) {
			for (const tool of tools) {
				allTools.push({
					type: 'function',
					function: {
						name: tool.name,
						description: tool.description,
						parameters: tool.inputSchema,
					},
				});
			}
		}

		canonicalSpecs.push(
			...buildLocalToolSpecs(
				tools.map(tool => ({
					serviceName,
					publicName: tool.name,
					originName: tool.name.replace(`${prefix}-`, ''),
					description: tool.description,
					inputSchema: toSchemaRecord(tool.inputSchema),
					enabled,
					connected: true,
				})),
			),
		);
	};

	// Add built-in filesystem tools
	addBuiltInService('filesystem', filesystemTools, 'filesystem');

	// Add built-in terminal tools
	addBuiltInService('terminal', terminalTools, 'terminal');

	// Add built-in TODO tools
	const todoSvc = getTodoService();
	await todoSvc.initialize();
	const todoTools = todoSvc.getTools();
	addBuiltInService(
		'todo',
		todoTools.map(t => ({
			name: t.name,
			description: t.description || '',
			inputSchema: t.inputSchema,
		})),
		'todo',
	);

	// Add built-in Notebook tools
	addBuiltInService(
		'notebook',
		notebookTools.map(t => ({
			name: t.name,
			description: t.description || '',
			inputSchema: t.inputSchema,
		})),
		'notebook',
	);

	// Add built-in ACE Code Search tools
	addBuiltInService('ace', aceCodeSearchTools, 'ace');

	// Add built-in Web Search tools
	addBuiltInService('websearch', websearchTools, 'websearch');

	// Add built-in IDE Diagnostics tools
	addBuiltInService('ide', ideDiagnosticsTools, 'ide');

	// Add built-in Ask User Question tools
	const askUserToolsNormalized = askUserQuestionTools.map(tool => ({
		name: tool.function.name,
		description: tool.function.description,
		inputSchema: tool.function.parameters,
	}));
	addBuiltInService('askuser', askUserToolsNormalized, 'askuser');

	// Add built-in Scheduler tools
	const schedulerToolsNormalized = schedulerTools.map(tool => ({
		name: tool.function.name,
		description: tool.function.description,
		inputSchema: tool.function.parameters,
	}));
	addBuiltInService('scheduler', schedulerToolsNormalized, 'scheduler');

	// Add sub-agent tools (dynamically generated from configuration)
	const subAgentTools = getSubAgentTools();

	if (subAgentTools.length > 0) {
		const enabled = isBuiltInServiceEnabled('subagent');
		servicesInfo.push({
			serviceName: 'subagent',
			tools: subAgentTools,
			isBuiltIn: true,
			connected: true,
			enabled,
		});

		if (enabled) {
			for (const tool of subAgentTools) {
				allTools.push({
					type: 'function',
					function: {
						name: `subagent-${tool.name}`,
						description: tool.description,
						parameters: tool.inputSchema,
					},
				});
			}
		}

		canonicalSpecs.push(
			...buildLocalToolSpecs(
				subAgentTools.map(tool => ({
					serviceName: 'subagent',
					publicName: `subagent-${tool.name}`,
					originName: tool.name,
					description: tool.description,
					inputSchema: toSchemaRecord(tool.inputSchema),
					owner: 'snow_subagent',
					enabled,
					connected: true,
				})),
			),
		);
	}

	// Add team tools (for Agent Team mode)
	const {getTeamMode} = await import('../config/projectSettings.js');
	if (getTeamMode()) {
		const teamTools = getTeamTools();
		if (teamTools.length > 0) {
			const teamEnabled = isBuiltInServiceEnabled('team');
			servicesInfo.push({
				serviceName: 'team',
				tools: teamTools,
				isBuiltIn: true,
				connected: true,
				enabled: teamEnabled !== false,
			});

			if (teamEnabled !== false) {
				for (const tool of teamTools) {
					allTools.push({
						type: 'function',
						function: {
							name: `team-${tool.name}`,
							description: tool.description,
							parameters: tool.inputSchema,
						},
					});
				}
			}

			canonicalSpecs.push(
				...buildLocalToolSpecs(
					teamTools.map(tool => ({
						serviceName: 'team',
						publicName: `team-${tool.name}`,
						originName: tool.name,
						description: tool.description,
						inputSchema: toSchemaRecord(tool.inputSchema),
						owner: 'snow_team',
						enabled: teamEnabled !== false,
						connected: true,
					})),
				),
			);
		}
	}

	// Add skill tools (dynamically generated from available skills)
	const projectRoot = process.cwd();
	const skillTools = await getSkillTools(projectRoot);

	if (skillTools.length > 0) {
		const enabled = isBuiltInServiceEnabled('skill');
		servicesInfo.push({
			serviceName: 'skill',
			tools: skillTools,
			isBuiltIn: true,
			connected: true,
			enabled,
		});

		if (enabled) {
			for (const tool of skillTools) {
				allTools.push({
					type: 'function',
					function: {
						name: tool.name,
						description: tool.description,
						parameters: tool.inputSchema,
					},
				});
			}
		}

		canonicalSpecs.push(
			...buildLocalToolSpecs(
				skillTools.map(tool => ({
					serviceName: 'skill',
					publicName: tool.name,
					originName: tool.name.replace(/^skill-/, ''),
					description: tool.description,
					inputSchema: toSchemaRecord(tool.inputSchema),
					owner: 'snow_skill',
					enabled,
					connected: true,
				})),
			),
		);
	}

	// Add SnowBridge-exported tools when VCP mode explicitly enables bridge transport
	try {
		const apiConfig = getOpenAiConfig();
		if (
			apiConfig.backendMode === 'vcp' &&
			apiConfig.toolTransport === 'bridge'
		) {
			const bridgeResult = await discoverVcpBridgeTools(apiConfig);
			const reservedNames = new Set(allTools.map(tool => tool.function.name));
			const filteredBridgeTools = bridgeResult.tools.filter(tool => {
				const toolName = tool.function.name;
				if (reservedNames.has(toolName)) {
					logger.warn(
						`Skipping VCP bridge tool "${toolName}" because the name already exists locally.`,
					);
					return false;
				}
				reservedNames.add(toolName);
				return true;
			});
			const filteredServiceInfo = {
				...bridgeResult.serviceInfo,
				tools: bridgeResult.serviceInfo.tools.filter(tool =>
					filteredBridgeTools.some(
						bridgeTool => bridgeTool.function.name === tool.name,
					),
				),
			};
			servicesInfo.push(filteredServiceInfo);
			canonicalSpecs.push(
				...buildBridgeToolSpecs({
					tools: filteredBridgeTools,
					serviceInfo: filteredServiceInfo,
					capabilities: bridgeResult.capabilities,
				}),
			);

			if (filteredServiceInfo.connected) {
				for (const tool of filteredBridgeTools) {
					allTools.push(tool);
				}
			} else if (apiConfig.vcpToolBridgeFallbackToLocal === false) {
				allTools.length = 0;
			}
		}
	} catch (error) {
		servicesInfo.push({
			serviceName: VCP_BRIDGE_SERVICE_NAME,
			tools: [],
			isBuiltIn: false,
			connected: false,
			error: error instanceof Error ? error.message : 'Unknown bridge error',
		});
	}

	// Add built-in Codebase Search tools (conditionally loaded if enabled and index is available)
	try {
		// First check if codebase feature is enabled in config
		const {loadCodebaseConfig} = await import('../config/codebaseConfig.js');
		const codebaseConfig = loadCodebaseConfig();

		// Only proceed if feature is enabled
		if (codebaseConfig.enabled) {
			const projectRoot = process.cwd();
			const dbPath = path.join(
				projectRoot,
				'.snow',
				'codebase',
				'embeddings.db',
			);
			const fs = await import('node:fs');

			// Only add if database file exists
			if (fs.existsSync(dbPath)) {
				// Check if database has data by importing CodebaseDatabase
				const {CodebaseDatabase} = await import(
					'../codebase/codebaseDatabase.js'
				);
				const db = new CodebaseDatabase(projectRoot);
				await db.initialize();
				const totalChunks = db.getTotalChunks();
				db.close();

				if (totalChunks > 0) {
					const codebaseSearchServiceTools = codebaseSearchTools.map(tool => ({
						name: tool.name.replace('codebase-', ''),
						description: tool.description,
						inputSchema: tool.inputSchema,
					}));

					servicesInfo.push({
						serviceName: 'codebase',
						tools: codebaseSearchServiceTools,
						isBuiltIn: true,
						connected: true,
					});

					for (const tool of codebaseSearchTools) {
						allTools.push({
							type: 'function',
							function: {
								name: tool.name,
								description: tool.description,
								parameters: tool.inputSchema,
							},
						});
					}

					canonicalSpecs.push(
						...buildLocalToolSpecs(
							codebaseSearchTools.map(tool => ({
								serviceName: 'codebase',
								publicName: tool.name,
								originName: tool.name.replace('codebase-', ''),
								description: tool.description,
								inputSchema: toSchemaRecord(tool.inputSchema),
								enabled: true,
								connected: true,
							})),
						),
					);
				}
			}
		}
	} catch (error) {
		// Silently ignore if codebase search tools are not available
		logger.debug('Codebase search tools not available:', error);
	}

	// Add user-configured MCP server tools (probe for availability but don't maintain connections)
	try {
		const mcpConfig = getMCPConfig();
		for (const [serviceName, server] of Object.entries(mcpConfig.mcpServers)) {
			// Skip disabled services
			if (server.enabled === false) {
				servicesInfo.push({
					serviceName,
					tools: [],
					isBuiltIn: false,
					connected: false,
					error: 'Disabled by user',
				});
				continue;
			}

			try {
				const serviceTools = await probeExternalMcpTools(
					serviceName,
					server,
				);
				servicesInfo.push({
					serviceName,
					tools: serviceTools,
					isBuiltIn: false,
					connected: true,
				});

				for (const tool of serviceTools) {
					allTools.push({
						type: 'function',
						function: {
							name: `${serviceName}-${tool.name}`,
							description: tool.description,
							parameters: tool.inputSchema,
						},
					});
				}
				canonicalSpecs.push(...buildMcpToolSpecs(serviceName, serviceTools));
			} catch (error) {
				servicesInfo.push({
					serviceName,
					tools: [],
					isBuiltIn: false,
					connected: false,
					error: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		}
	} catch (error) {
		logger.warn('Failed to load MCP config:', error);
	}

	const registry = buildToolRegistrySnapshot(canonicalSpecs);

	// Update cache
	toolsCache = {
		tools: registry.publicTools as MCPTool[],
		servicesInfo,
		registry,
		lastUpdate: Date.now(),
		configHash: await generateConfigHash(),
	};
}

/**
 * Manually refresh the tools cache (for configuration changes)
 */
export async function refreshMCPToolsCache(): Promise<void> {
	toolsCache = null;
	await refreshToolsCache();
}

/**
 * Reconnect a specific MCP service and update cache
 * @param serviceName - Name of the service to reconnect
 */
export async function reconnectMCPService(serviceName: string): Promise<void> {
	if (!toolsCache) {
		await refreshToolsCache();
		return;
	}

	// Handle built-in services (they don't need reconnection)
	if (
		serviceName === 'filesystem' ||
		serviceName === 'terminal' ||
		serviceName === 'todo' ||
		serviceName === 'ace' ||
		serviceName === 'websearch' ||
		serviceName === 'codebase' ||
		serviceName === 'askuser' ||
		serviceName === 'scheduler' ||
		serviceName === 'subagent' ||
		serviceName === 'team'
	) {
		return;
	}

	// Get the server config
	const mcpConfig = getMCPConfig();
	const server = mcpConfig.mcpServers[serviceName];

	if (!server) {
		throw new Error(`Service ${serviceName} not found in configuration`);
	}

	await closeExternalMcpConnection(serviceName);
	await refreshToolsCache();
}

/**
 * Clear the tools cache (useful for testing or forcing refresh)
 */
export function clearMCPToolsCache(): void {
	toolsCache = null;
}

/**
 * Collect all available MCP tools from built-in and user-configured services
 * Uses caching to avoid reconnecting on every message
 */
export async function collectAllMCPTools(): Promise<MCPTool[]> {
	return await getCachedTools();
}

/**
 * Get detailed information about all MCP services and their tools
 * Uses cached data when available
 */
export async function getMCPServicesInfo(): Promise<MCPServiceTools[]> {
	if (!(await isCacheValid())) {
		await refreshToolsCache();
	}
	// Ensure toolsCache is not null before accessing
	return toolsCache?.servicesInfo || [];
}

/**
 * Close idle persistent connections
 */
export async function cleanupIdleMCPConnections(): Promise<void> {
	await cleanupIdleExternalMcpConnections();
	await cleanupIdleVcpBridgeConnection(EXTERNAL_MCP_CLIENT_IDLE_TIMEOUT);
}

/**
 * Close all persistent MCP connections
 */
export async function closeAllMCPConnections(): Promise<void> {
	await closeAllExternalMcpConnections();
	await closeVcpBridgeConnection();
}

/**
 * Execute an MCP tool by parsing the prefixed tool name
 * Only connects to the service when actually needed
 */
export async function executeMCPToolCall(
	toolCall: Pick<SnowToolCall, 'toolId' | 'publicName' | 'rawName'>,
	args: any,
	abortSignal?: AbortSignal,
	onTokenUpdate?: (tokenCount: number) => void,
): Promise<any> {
	const toolName = toolCall.publicName || toolCall.rawName || '';

	// Normalize args: parse stringified JSON parameters for known parameters
	// Some AI models (e.g., Anthropic) may serialize array/object parameters as JSON strings
	// Only parse parameters that are EXPECTED to be arrays/objects (whitelist approach)
	if (args && typeof args === 'object') {
		// Whitelist: parameters that may legitimately be arrays or objects
		const arrayOrObjectParams = [
			'filePath',
			'files',
			'paths',
			'items',
			'options',
		];

		for (const [key, value] of Object.entries(args)) {
			// Only process whitelisted parameters
			if (arrayOrObjectParams.includes(key) && typeof value === 'string') {
				const trimmed = value.trim();
				// Only attempt to parse if it looks like JSON array or object
				if (
					(trimmed.startsWith('[') && trimmed.endsWith(']')) ||
					(trimmed.startsWith('{') && trimmed.endsWith('}'))
				) {
					try {
						const parsed = JSON.parse(value);
						// Type safety: Only replace if parsed result is array or plain object
						if (
							parsed !== null &&
							typeof parsed === 'object' &&
							(Array.isArray(parsed) || parsed.constructor === Object)
						) {
							args[key] = parsed;
						}
					} catch {
						// Keep original value if parsing fails
					}
				}
			}
		}
	}

	let result: any;
	let executionError: Error | null = null;

	try {
		// Handle tool_search meta-tool (progressive tool discovery)
		if (toolName === 'tool_search') {
			const {toolSearchService} = await import('./toolSearchService.js');
			const {textResult} = toolSearchService.search(
				args.query || '',
				args.maxResults,
			);
			result = textResult;
			return result;
		}

		const apiConfig = getOpenAiConfig();
		const mcpConfig = getMCPConfig();

		const registry = await getToolRegistrySnapshot();
		const routedExecution = await tryRouteSnowToolCall(
			registry,
			{
				id: 'runtime-tool-call',
				toolId: toolCall.toolId,
				publicName: toolName,
				rawName: toolName,
				argumentsText: JSON.stringify(args ?? {}),
			},
			args ?? {},
			{
				vcp_bridge: async spec =>
					await executeBridgeToolCall(
						apiConfig,
						spec.toolId,
						(args ?? {}) as Record<string, unknown>,
						abortSignal,
					),
				snow_mcp: async spec => {
					const server = mcpConfig.mcpServers[spec.serviceName];
					if (!server) {
						throw new Error(`MCP service not found: ${spec.serviceName}`);
					}

					return executeExternalMcpToolCall(
						spec.serviceName,
						server,
						spec.originName,
						args ?? {},
					);
				},
				snow_builtin: async spec => spec,
				snow_subagent: async spec => spec,
				snow_team: async spec => spec,
				snow_skill: async spec => spec,
			},
			{abortSignal},
		);

		if (!routedExecution.matched) {
			throw new Error(
				`Tool not found in registry: ${toolName}. The current execution path only supports tools registered by the canonical Snow registry.`,
			);
		}

		if (
			routedExecution.spec.owner === 'vcp_bridge' ||
			routedExecution.spec.owner === 'snow_mcp'
		) {
			result = routedExecution.result;
			return result;
		}

		const serviceName = routedExecution.spec.serviceName;
		const actualToolName = routedExecution.spec.originName;

		// Check if built-in service is disabled
		const builtInServices = [
			'todo',
			'notebook',
			'filesystem',
			'terminal',
			'ace',
			'websearch',
			'ide',
			'codebase',
			'askuser',
			'scheduler',
			'skill',
			'subagent',
			'team',
		];
		if (
			builtInServices.includes(serviceName) &&
			!isBuiltInServiceEnabled(serviceName)
		) {
			throw new Error(
				`Built-in service "${serviceName}" is currently disabled. ` +
					`You can re-enable it in the MCP panel (Tab key to toggle).`,
			);
		}

		if (isLocalToolService(serviceName)) {
			result = await executeLocalToolCall({
				serviceName,
				actualToolName,
				toolName,
				args,
				getTodoService,
				abortSignal,
				onTokenUpdate,
			});
		} else {
			// Handle user-configured MCP service tools - connect only when needed
			const server = mcpConfig.mcpServers[serviceName];

			if (!server) {
				throw new Error(`MCP service not found: ${serviceName}`);
			}
			// Connect to service and execute tool
			logger.info(
				`Executing tool ${actualToolName} on MCP service ${serviceName}... args: ${
					args ? JSON.stringify(args) : 'none'
				}`,
			);
			result = await executeExternalMcpToolCall(
				serviceName,
				server,
				actualToolName,
				args,
			);
		}
	} catch (error) {
		executionError = error instanceof Error ? error : new Error(String(error));
		throw executionError;
	} finally {
		// Execute afterToolCall hook
		try {
			const {unifiedHooksExecutor} = await import('./unifiedHooksExecutor.js');
			const hookResult = await unifiedHooksExecutor.executeHooks(
				'afterToolCall',
				{
					toolName,
					args,
					result,
					error: executionError,
				},
			);

			// Handle hook result based on exit code strategy
			if (hookResult && !hookResult.success) {
				// Find failed command hook
				const commandError = hookResult.results.find(
					(r: any) => r.type === 'command' && !r.success,
				);

				if (commandError && commandError.type === 'command') {
					const {exitCode, command, output, error} = commandError;

					if (exitCode === 1) {
						// Exit code 1: Warning - stderr replaces tool result content
						console.warn(
							`[WARN] afterToolCall hook warning (exitCode: ${exitCode}):
` +
								`output: ${output || '(empty)'}
` +
								`error: ${error || '(empty)'}`,
						);

						const replacedContent =
							error ||
							output ||
							`[afterToolCall Hook Warning] Command: ${command} exited with code 1`;

						if (typeof result === 'string') {
							result = replacedContent;
						} else if (result && typeof result === 'object') {
							if ('content' in result && typeof result.content === 'string') {
								result.content = replacedContent;
							} else {
								result = replacedContent;
							}
						}
					} else if (exitCode >= 2 || exitCode < 0) {
						// Exit code 2+: Critical error - throw structured hook error
						const combinedOutput =
							[output, error].filter(Boolean).join('\n\n') || '(no output)';
						throw new HookFailedError(
							'afterToolCall',
							exitCode,
							command,
							combinedOutput,
						);
					}
				}
			}
		} catch (error) {
			// Re-throw if it's a critical hook error (exit code 2+)
			if (error instanceof HookFailedError) {
				throw error;
			}
			// Otherwise just warn - don't block tool execution on unexpected errors
			logger.warn('Failed to execute afterToolCall hook:', error);
		}
	}

	// Re-throw execution error if it exists (from try block)
	if (executionError) {
		const err: any = executionError;
		console.log(
			'[DEBUG] Re-throwing executionError:',
			err.message || String(err),
		);
		throw executionError;
	}

	// Apply token limit validation before returning result (truncates if exceeded)
	const {wrapToolResultWithTokenLimit} = await import('./tokenLimiter.js');
	result = await wrapToolResultWithTokenLimit(result, toolName);

	return result;
}

export async function executeMCPTool(
	toolName: string,
	args: any,
	abortSignal?: AbortSignal,
	onTokenUpdate?: (tokenCount: number) => void,
): Promise<any> {
	return await executeMCPToolCall(
		{
			publicName: toolName,
			rawName: toolName,
		},
		args,
		abortSignal,
		onTokenUpdate,
	);
}
