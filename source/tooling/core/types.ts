import type {ChatCompletionTool, ImageContent} from '../../api/types.js';

export type SnowToolOwner =
	| 'snow_builtin'
	| 'snow_mcp'
	| 'snow_subagent'
	| 'snow_team'
	| 'snow_skill'
	| 'vcp_bridge';

export type SnowToolTransport = 'local' | 'mcp' | 'bridge';

export type SnowToolCapabilities = {
	cancellable?: boolean;
	asyncCallback?: boolean;
	statusEvents?: boolean;
	clientAuth?: boolean;
};

export type SnowToolSpec = {
	toolId: string;
	publicName: string;
	description: string;
	inputSchema: Record<string, unknown>;
	owner: SnowToolOwner;
	transport: SnowToolTransport;
	serviceName: string;
	originName: string;
	enabled: boolean;
	connected: boolean;
	capabilities?: SnowToolCapabilities;
	metadata?: Record<string, unknown>;
	aliases?: string[];
};

export type ToolRegistryConflict = {
	publicName: string;
	toolIds: string[];
	resolvedNames: string[];
};

export type ToolRegistrySnapshot = {
	tools: SnowToolSpec[];
	publicTools: ChatCompletionTool[];
	toolsById: Map<string, SnowToolSpec>;
	toolsByPublicName: Map<string, SnowToolSpec>;
	conflicts: ToolRegistryConflict[];
};

export type SnowToolCall = {
	id: string;
	toolId?: string;
	publicName: string;
	argumentsText: string;
	rawName?: string;
	thoughtSignature?: string;
};

export type SnowToolResult = {
	toolCallId: string;
	toolId?: string;
	publicName: string;
	content: string;
	error?: boolean;
	name?: string;
	images?: ImageContent[];
	metadata?: Record<string, unknown>;
};
