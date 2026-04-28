import {getSnowConfig} from '../config/apiConfig.js';
import {snowBridgeClient} from '../session/vcpCompatibility/bridgeClient.js';
import {
	coerceBridgeExecutionArguments,
	getToolExecutionBinding,
} from '../session/vcpCompatibility/toolExecutionBinding.js';

type SnowBridgeExecuteToolOptions = Parameters<
	typeof snowBridgeClient.executeTool
>[0] & {
	originName?: string;
	pluginName?: string;
	publicName?: string;
	toolId?: string;
};

export async function executeBridgeToolCall(options: {
	toolName: string;
	args: Record<string, any>;
	toolPlaneKey?: string;
	abortSignal?: AbortSignal;
	onStatus?: (payload: unknown) => void;
}) {
	const config = getSnowConfig();
	const executionBinding = getToolExecutionBinding(
		options.toolName,
		options.toolPlaneKey,
	);
	if (!executionBinding || executionBinding.kind !== 'bridge') {
		throw new Error(`Bridge tool binding not found for ${options.toolName}`);
	}

	const bridgeArgs = coerceBridgeExecutionArguments(
		options.args,
		executionBinding,
	);
	const bridgeOriginName =
		executionBinding.originName || executionBinding.pluginName;
	const bridgeExecuteOptions: SnowBridgeExecuteToolOptions = {
		config,
		toolName: bridgeOriginName,
		originName: bridgeOriginName,
		pluginName: executionBinding.pluginName,
		publicName: executionBinding.publicName || executionBinding.pluginName,
		...(executionBinding.toolId ? {toolId: executionBinding.toolId} : {}),
		toolArgs: {
			...bridgeArgs,
			command: executionBinding.commandName,
		},
		abortSignal: options.abortSignal,
		onStatus: options.onStatus,
	};

	return snowBridgeClient.executeTool(bridgeExecuteOptions);
}
