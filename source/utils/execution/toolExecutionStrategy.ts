import {executeMCPTool} from './mcpToolsManager.js';
import {sessionManager} from '../session/sessionManager.js';
import {
	getToolExecutionBinding,
	type ToolExecutionBinding,
} from '../session/vcpCompatibility/toolExecutionBinding.js';
import {summarizeBridgeStatusPayload} from '../session/vcpCompatibility/bridgeStatus.js';
import {executeBridgeToolCall} from './bridgeToolExecution.js';
import {normalizeBridgeIngressPayload, extractToolResultSidecar} from './bridgeIngress.js';
import {buildToolHistoryArtifacts} from './toolHistoryArtifacts.js';
import {shouldBuildStructuredToolArtifacts} from './toolResultPolicy.js';
import type {ToolLifecycleUpdate, ToolResult} from './toolTypes.js';
import {extractMultimodalContent} from './toolResultContent.js';

export type RegularToolStrategyResult = {
	toolResult: ToolResult;
	rawResult: unknown;
	executionBinding?: ToolExecutionBinding;
};

export async function executeRegularToolStrategy(options: {
	toolCallId: string;
	toolName: string;
	args: Record<string, any>;
	abortSignal?: AbortSignal;
	onTokenUpdate?: (tokenCount: number) => void;
	toolPlaneKey?: string;
	onToolLifecycleUpdate?: (update: ToolLifecycleUpdate) => void;
	requireBinding?: boolean;
}): Promise<RegularToolStrategyResult> {
	const currentSessionId = sessionManager.getCurrentSession()?.id;
	const lookupKey = options.toolPlaneKey || currentSessionId;
	const executionBinding = getToolExecutionBinding(options.toolName, lookupKey);

	if (!executionBinding) {
		if (options.requireBinding === false) {
			const rawResult = await executeMCPTool(
				options.toolName,
				options.args,
				options.abortSignal,
				options.onTokenUpdate,
			);

			return buildStrategyResult({
				toolCallId: options.toolCallId,
				toolName: options.toolName,
				rawResult,
			});
		}

		throw new Error(`Tool execution binding not found for ${options.toolName}`);
	}

	if (executionBinding.kind === 'bridge') {
		const rawResult = await executeBridgeToolCall({
			toolName: options.toolName,
			args: options.args,
			toolPlaneKey: lookupKey,
			abortSignal: options.abortSignal,
			onStatus: payload => {
				const bridgeSummary = summarizeBridgeStatusPayload(
					normalizeBridgeIngressPayload(payload),
				);
				if (!bridgeSummary) {
					return;
				}

				options.onToolLifecycleUpdate?.({
					...bridgeSummary,
					toolCallId: options.toolCallId,
					toolName: options.toolName,
				});
			},
		});

		return buildStrategyResult({
			toolCallId: options.toolCallId,
			toolName: options.toolName,
			rawResult,
			executionBinding,
		});
	}

	const rawResult = await executeMCPTool(
		options.toolName,
		options.args,
		options.abortSignal,
		options.onTokenUpdate,
	);

	return buildStrategyResult({
		toolCallId: options.toolCallId,
		toolName: options.toolName,
		rawResult,
		executionBinding,
	});
}

function buildStrategyResult(options: {
	toolCallId: string;
	toolName: string;
	rawResult: unknown;
	executionBinding?: ToolExecutionBinding;
}): RegularToolStrategyResult {
	const normalizedResult =
		options.executionBinding?.kind === 'bridge'
			? normalizeBridgeIngressPayload(options.rawResult)
			: options.rawResult;
	const {textContent, images} = extractMultimodalContent(normalizedResult);
	const toolHistoryArtifacts = buildStructuredArtifacts({
		toolName: options.toolName,
		executionBinding: options.executionBinding,
		normalizedResult,
		textContent,
	});
	const bridgeSummary =
		options.executionBinding?.kind === 'bridge'
			? summarizeBridgeStatusPayload(normalizedResult)
			: null;

	return {
		rawResult: normalizedResult,
		executionBinding: options.executionBinding,
		toolResult: {
			tool_call_id: options.toolCallId,
			role: 'tool',
			content: textContent,
			...(toolHistoryArtifacts
				? {
						historyContent: toolHistoryArtifacts.historyContent,
						previewContent: toolHistoryArtifacts.previewContent,
				  }
				: {}),
			toolStatusDetail: bridgeSummary?.detail,
			toolLifecycleState: bridgeSummary?.state,
			images,
		},
	};
}

function buildStructuredArtifacts(options: {
	toolName: string;
	executionBinding?: ToolExecutionBinding;
	normalizedResult: unknown;
	textContent: string;
}) {
	if (
		!shouldBuildStructuredToolArtifacts({
			toolName: options.toolName,
			executionBinding: options.executionBinding,
		})
	) {
		return undefined;
	}

	const sidecar = extractToolResultSidecar(options.normalizedResult);
	if (sidecar.historyContent || sidecar.previewContent) {
		return {
			historyContent:
				sidecar.historyContent ||
				buildToolHistoryArtifacts(
					options.normalizedResult,
					options.textContent,
				).historyContent,
			previewContent: sidecar.previewContent,
		};
	}

	return buildToolHistoryArtifacts(options.normalizedResult, options.textContent);
}
