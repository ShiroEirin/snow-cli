import type {ApiConfig} from '../../../utils/config/apiConfig.js';
import {executeVcpBridgeTool} from '../../../utils/session/vcpCompatibility/toolBridge.js';

export async function executeBridgeToolCall(
	apiConfig: ApiConfig,
	toolRef: string,
	args: Record<string, unknown>,
	abortSignal?: AbortSignal,
): Promise<unknown> {
	return executeVcpBridgeTool(apiConfig, toolRef, args, abortSignal);
}
