import {createSnowToolId} from '../toolRegistry.js';
import type {SnowToolSpec} from '../types.js';

type McpProviderInput = {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	connected?: boolean;
	enabled?: boolean;
	metadata?: Record<string, unknown>;
};

export function buildMcpToolSpecs(
	serviceName: string,
	tools: McpProviderInput[],
): SnowToolSpec[] {
	return tools.map(tool => ({
		toolId: createSnowToolId({
			owner: 'snow_mcp',
			serviceName,
			originName: tool.name,
		}),
		publicName: `${serviceName}-${tool.name}`,
		description: tool.description,
		inputSchema: tool.inputSchema,
		owner: 'snow_mcp',
		transport: 'mcp',
		serviceName,
		originName: tool.name,
		enabled: tool.enabled !== false,
		connected: tool.connected !== false,
		metadata: tool.metadata,
	}));
}
