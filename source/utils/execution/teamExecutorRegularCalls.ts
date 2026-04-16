import type {ChatMessage} from '../../api/chat.js';
import type {ConfirmationResult} from '../../ui/components/tools/ToolConfirmation.js';
import {
	getToolExecutionBinding,
	type ToolExecutionBinding,
} from '../session/vcpCompatibility/toolExecutionBinding.js';
import type {
	AddToAlwaysApprovedCallback,
	ToolApprovalChecker,
	ToolCall,
} from './toolExecutor.js';

export interface TeammateRegularCallApprovalOptions {
	toolCall: ToolCall;
	toolArgs: Record<string, any>;
	requestToolConfirmation?: (
		toolName: string,
		toolArgs: Record<string, any>,
	) => Promise<ConfirmationResult>;
	isToolAutoApproved?: ToolApprovalChecker;
	yoloMode?: boolean;
	addToAlwaysApproved?: AddToAlwaysApprovedCallback;
}

export type ParsedTeammateToolArgsResult =
	| {ok: true; args: Record<string, any>}
	| {ok: false; args: Record<string, any>; error: string};

export function parseTeammateToolArgs(
	toolCall: Pick<ToolCall, 'function'>,
): Record<string, any> {
	return parseTeammateToolArgsResult(toolCall).args;
}

export function parseTeammateToolArgsResult(
	toolCall: Pick<ToolCall, 'function'>,
): ParsedTeammateToolArgsResult {
	try {
		return {
			ok: true,
			args: JSON.parse(toolCall.function.arguments || '{}') as Record<string, any>,
		};
	} catch {
		return {
			ok: false,
			args: {},
			error: `Invalid tool arguments JSON for ${toolCall.function.name}. Refusing to execute a malformed payload.`,
		};
	}
}

export async function resolveTeammateRegularToolApproval(
	options: TeammateRegularCallApprovalOptions,
): Promise<{approved: true} | {approved: false; feedback: string}> {
	const toolName = options.toolCall.function.name;

	if (options.yoloMode) {
		return {approved: true};
	}

	if (options.isToolAutoApproved?.(toolName)) {
		return {approved: true};
	}

	if (!options.requestToolConfirmation) {
		return {approved: true};
	}

	const confirmResult = await options.requestToolConfirmation(
		toolName,
		options.toolArgs,
	);
	if (confirmResult === 'approve' || confirmResult === 'approve_always') {
		if (confirmResult === 'approve_always') {
			options.addToAlwaysApproved?.(toolName);
		}

		return {approved: true};
	}

	return {
		approved: false,
		feedback:
			typeof confirmResult === 'object' &&
			confirmResult.type === 'reject_with_reply'
				? confirmResult.reason
				: 'Tool execution denied by user.',
	};
}

const MUTATING_MANAGE_ACTIONS = new Map<string, Set<string>>([
	['todo-manage', new Set(['add', 'update', 'delete'])],
	['notebook-manage', new Set(['add', 'update', 'delete'])],
]);

function isProtectedManageToolCall(
	toolCall: ToolCall,
	binding: ToolExecutionBinding | undefined,
): boolean {
	const resolvedToolName =
		binding?.kind === 'local' ? binding.toolName : toolCall.function.name;
	const protectedActions = MUTATING_MANAGE_ACTIONS.get(resolvedToolName);

	if (!protectedActions) {
		return false;
	}

	const parsedArgs = parseTeammateToolArgsResult(toolCall);
	if (!parsedArgs.ok) {
		return false;
	}

	return (
		typeof parsedArgs.args['action'] === 'string' &&
		protectedActions.has(parsedArgs.args['action'])
	);
}

export function partitionPlanApprovalRegularCalls(options: {
	toolCalls: ToolCall[];
	toolPlaneKey: string;
	isPlanApprovalProtectedTool: (
		toolName: string,
		binding?: ToolExecutionBinding,
	) => boolean;
	getToolExecutionBindingImpl?: typeof getToolExecutionBinding;
}): {
	blockedCalls: ToolCall[];
	executableCalls: ToolCall[];
} {
	const getBinding =
		options.getToolExecutionBindingImpl || getToolExecutionBinding;
	const blockedCalls = options.toolCalls.filter(toolCall => {
		const binding = getBinding(toolCall.function.name, options.toolPlaneKey);
		if (isProtectedManageToolCall(toolCall, binding)) {
			return true;
		}
		return options.isPlanApprovalProtectedTool(toolCall.function.name, binding);
	});
	const executableCalls = options.toolCalls.filter(
		toolCall => !blockedCalls.includes(toolCall),
	);

	return {
		blockedCalls,
		executableCalls,
	};
}

export async function executeAndRecordTeammateRegularToolCall(options: {
	toolCall: ToolCall;
	toolArgs: Record<string, any>;
	messages: ChatMessage[];
	executeRegularToolCall: (
		toolCall: ToolCall,
		toolArgs: Record<string, any>,
	) => Promise<{
		message: ChatMessage;
		emitContent: string;
	}>;
	emitToolResult: (content: string) => void;
}): Promise<void> {
	const executionResult = await options.executeRegularToolCall(
		options.toolCall,
		options.toolArgs,
	);
	options.messages.push(executionResult.message);
	options.emitToolResult(executionResult.emitContent);
}
