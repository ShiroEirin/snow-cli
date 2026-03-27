import {createSnowToolId} from '../toolRegistry.js';
import type {SnowToolSpec} from '../types.js';

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
	connected: boolean;
	error?: string;
};

export type BridgeProviderDiscovery = {
	tools: BridgeToolShape[];
	serviceInfo: BridgeServiceInfoShape;
	capabilities?: {
		cancellable?: boolean;
		asyncCallback?: boolean;
		statusEvents?: boolean;
		clientAuth?: boolean;
	};
};

export function buildBridgeToolSpecs(
	discovery: BridgeProviderDiscovery,
): SnowToolSpec[] {
	const serviceName = discovery.serviceInfo.serviceName || 'snowbridge';
	const toolInfoByName = new Map(
		(discovery.serviceInfo.tools || []).map(tool => [tool.name, tool]),
	);

	return discovery.tools.map(tool => {
		const bridgeTool = toolInfoByName.get(tool.function.name);
		const originName = bridgeTool?.originName || tool.function.name;
		const metadata: Record<string, unknown> = {};

		if (discovery.serviceInfo.error) {
			metadata['bridgeError'] = discovery.serviceInfo.error;
		}

		if (bridgeTool?.capabilityTags && bridgeTool.capabilityTags.length > 0) {
			metadata['capabilityTags'] = bridgeTool.capabilityTags;
		}

		if (bridgeTool?.displayName) {
			metadata['bridgeDisplayName'] = bridgeTool.displayName;
		}

		return {
			toolId:
				bridgeTool?.toolId ||
				createSnowToolId({
					owner: 'vcp_bridge',
					serviceName,
					originName,
				}),
			publicName: tool.function.name,
			description: tool.function.description,
			inputSchema: tool.function.parameters,
			owner: 'vcp_bridge',
			transport: 'bridge',
			serviceName,
			originName,
			enabled: true,
			connected: discovery.serviceInfo.connected !== false,
			capabilities: discovery.capabilities,
			metadata:
				Object.keys(metadata).length > 0 ? metadata : undefined,
		};
	});
}
