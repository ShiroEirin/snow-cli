import {getOpenAiConfig} from '../config/apiConfig.js';
import {snowBridgeClient} from '../session/vcpCompatibility/bridgeClient.js';
import {
	coerceBridgeExecutionArguments,
	getToolExecutionBinding,
} from '../session/vcpCompatibility/toolExecutionBinding.js';

export async function executeBridgeToolCall(options: {
	toolName: string;
	args: Record<string, any>;
	toolPlaneKey?: string;
	abortSignal?: AbortSignal;
	onStatus?: (payload: unknown) => void;
}) {
	const config = getOpenAiConfig();
	const executionBinding = getToolExecutionBinding(
		options.toolName,
		options.toolPlaneKey,
	);
	if (!executionBinding || executionBinding.kind !== 'bridge') {
		throw new Error(
			`Bridge tool binding not found for ${options.toolName}`,
		);
	}

	const bridgeArgs = coerceBridgeExecutionArguments(
		options.args,
		executionBinding,
	);

	return snowBridgeClient.executeTool({
		config,
		toolName: executionBinding.pluginName,
		toolArgs: {
			...bridgeArgs,
			command: executionBinding.commandName,
		},
		abortSignal: options.abortSignal,
		onStatus: options.onStatus,
	});
}
