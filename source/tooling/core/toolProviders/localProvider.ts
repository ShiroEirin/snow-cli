import {createSnowToolId} from '../toolRegistry.js';
import type {SnowToolOwner, SnowToolSpec} from '../types.js';

type LocalProviderInput = {
	serviceName: string;
	publicName: string;
	originName: string;
	description: string;
	inputSchema: Record<string, unknown>;
	owner?: Extract<
		SnowToolOwner,
		'snow_builtin' | 'snow_subagent' | 'snow_team' | 'snow_skill'
	>;
	enabled?: boolean;
	connected?: boolean;
	metadata?: Record<string, unknown>;
};

export function buildLocalToolSpecs(
	inputs: LocalProviderInput[],
): SnowToolSpec[] {
	return inputs.map(input => ({
		toolId: createSnowToolId({
			owner: input.owner || 'snow_builtin',
			serviceName: input.serviceName,
			originName: input.originName,
		}),
		publicName: input.publicName,
		description: input.description,
		inputSchema: input.inputSchema,
		owner: input.owner || 'snow_builtin',
		transport: 'local',
		serviceName: input.serviceName,
		originName: input.originName,
		enabled: input.enabled !== false,
		connected: input.connected !== false,
		metadata: input.metadata,
	}));
}
