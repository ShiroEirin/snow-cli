/**
 * Team Executor
 * Executes teammate sessions in an Agent Team.
 * Based on executeSubAgent but with key differences:
 * - Each teammate runs in its own Git worktree
 * - Full tool access (not restricted like subagents)
 * - Team-specific synthetic tools (message, task management)
 * - Team-aware context (task list, other teammates)
 */

import type {ChatMessage} from '../../api/chat.js';
import type {MCPTool} from './mcpToolsManager.js';
import {teamTracker} from './teamTracker.js';
import type {SubAgentMessage, TokenUsage} from './subAgentExecutor.js';
import type {
	AddToAlwaysApprovedCallback,
	ToolApprovalChecker,
	ToolCall,
	ToolConfirmationCallback,
	UserInteractionCallback,
} from './toolExecutor.js';
import {prepareToolPlane} from '../session/vcpCompatibility/toolPlaneFacade.js';
import type {ToolExecutionBinding} from '../session/vcpCompatibility/toolExecutionBinding.js';
import {rewriteToolArgsForWorktree} from '../team/teamWorktree.js';
import {
	projectToolMessagesForContext,
	shouldProjectToolContext,
} from '../session/toolMessageProjection.js';
import {compressionCoordinator} from '../core/compressionCoordinator.js';
import {
	buildTeammateSyntheticTools,
	dispatchTeammateSyntheticToolCall,
	partitionTeammateToolCalls,
} from './teammateSyntheticTools.js';
import {createTeammateProviderStream} from './teamExecutorProvider.js';
import {
	executeAndRecordTeammateRegularToolCall,
	parseTeammateToolArgsResult,
	partitionPlanApprovalRegularCalls,
	resolveTeammateRegularToolApproval,
} from './teamExecutorRegularCalls.js';

export interface TeammateExecutionOptions {
	onMessage?: (message: SubAgentMessage) => void;
	abortSignal?: AbortSignal;
	requestToolConfirmation?: (
		toolName: string,
		toolArgs: any,
	) => Promise<
		import('../../ui/components/tools/ToolConfirmation.js').ConfirmationResult
	>;
	isToolAutoApproved?: (toolName: string) => boolean;
	yoloMode?: boolean;
	addToAlwaysApproved?: (toolName: string) => void;
	requestUserQuestion?: (
		question: string,
		options: string[],
		multiSelect?: boolean,
	) => Promise<{
		selected: string | string[];
		customInput?: string;
		cancelled?: boolean;
	}>;
	requirePlanApproval?: boolean;
}
export interface TeammateExecutionResult {
	success: boolean;
	result: string;
	error?: string;
	usage?: TokenUsage;
}

export function projectTeammateMessagesForModel(
	config: {backendMode?: 'native' | 'vcp'; toolTransport?: 'local' | 'bridge' | 'hybrid'},
	messages: ChatMessage[],
): ChatMessage[] {
	return shouldProjectToolContext(config)
		? projectToolMessagesForContext(messages)
		: messages;
}

export function createTeammateUserQuestionAdapter(
	requestUserQuestion?: TeammateExecutionOptions['requestUserQuestion'],
) {
	if (!requestUserQuestion) {
		return undefined;
	}

	return async (question: string, options: string[], multiSelect?: boolean) => {
		const response = await requestUserQuestion(question, options, multiSelect);
		return {
			selected: response.selected,
			customInput: response.customInput,
			cancelled: response.cancelled,
		};
	};
}

type ExecuteToolCallLike = (
	toolCall: ToolCall,
	abortSignal?: AbortSignal,
	onTokenUpdate?: (tokenCount: number) => void,
	onSubAgentMessage?: (message: SubAgentMessage) => void,
	requestToolConfirmation?: ToolConfirmationCallback,
	isToolAutoApproved?: ToolApprovalChecker,
	yoloMode?: boolean,
	addToAlwaysApproved?: AddToAlwaysApprovedCallback,
	onUserInteractionNeeded?: UserInteractionCallback,
	toolSnapshotKey?: string,
) => Promise<{
	content: string;
	historyContent?: string;
	previewContent?: string;
}>;

export async function executeTeammateRegularToolCall(options: {
	toolCall: ToolCall;
	toolArgs: Record<string, any>;
	worktreePath: string;
	toolPlaneKey: string;
	abortSignal?: AbortSignal;
	onMessage?: TeammateExecutionOptions['onMessage'];
	userQuestionAdapter?: ReturnType<typeof createTeammateUserQuestionAdapter>;
	executeToolCall: ExecuteToolCallLike;
	rewriteToolArgsForWorktreeImpl?: typeof rewriteToolArgsForWorktree;
}): Promise<{
	message: ChatMessage;
	emitContent: string;
}> {
	const rewriteToolArgs =
		options.rewriteToolArgsForWorktreeImpl || rewriteToolArgsForWorktree;

	try {
		const rewrittenArgsResult = rewriteToolArgs(
			options.toolCall.function.name,
			options.toolArgs,
			options.worktreePath,
			options.toolPlaneKey,
		);
		if (rewrittenArgsResult.error) {
			return {
				message: {
					role: 'tool',
					tool_call_id: options.toolCall.id,
					content: `Error: ${rewrittenArgsResult.error}`,
				},
				emitContent: `Error: ${rewrittenArgsResult.error}`,
			};
		}

		const rewrittenCall: ToolCall = {
			...options.toolCall,
			type: options.toolCall.type,
			function: {
				...options.toolCall.function,
				arguments: JSON.stringify(rewrittenArgsResult.args),
			},
		};
		const result = await options.executeToolCall(
			rewrittenCall,
			options.abortSignal,
			undefined,
			options.onMessage,
			undefined,
			undefined,
			undefined,
			undefined,
			options.userQuestionAdapter,
			options.toolPlaneKey,
		);

		return {
			message: {
				role: 'tool',
				tool_call_id: options.toolCall.id,
				content: result.content,
				historyContent: result.historyContent,
				previewContent: result.previewContent,
			} as ChatMessage,
			emitContent: result.content,
		};
	} catch (error: any) {
		return {
			message: {
				role: 'tool',
				tool_call_id: options.toolCall.id,
				content: `Error: ${error.message}`,
			},
			emitContent: `Error: ${error.message}`,
		};
	}
}

function emitTeammateToolResult(options: {
	onMessage?: TeammateExecutionOptions['onMessage'];
	memberId: string;
	memberName: string;
	toolCallId: string;
	toolName: string;
	content: string;
}): void {
	if (!options.onMessage) {
		return;
	}

	options.onMessage({
		type: 'sub_agent_message',
		agentId: `teammate-${options.memberId}`,
		agentName: options.memberName,
		message: {
			type: 'tool_result',
			tool_call_id: options.toolCallId,
			tool_name: options.toolName,
			content: options.content,
		},
	});
}

function appendTeammateToolFeedback(options: {
	messages: ChatMessage[];
	toolCallId: string;
	content: string;
	onMessage?: TeammateExecutionOptions['onMessage'];
	memberId: string;
	memberName: string;
	toolName: string;
}): void {
	options.messages.push({
		role: 'tool',
		tool_call_id: options.toolCallId,
		content: options.content,
	});
	emitTeammateToolResult({
		onMessage: options.onMessage,
		memberId: options.memberId,
		memberName: options.memberName,
		toolCallId: options.toolCallId,
		toolName: options.toolName,
		content: options.content,
	});
}

function appendMalformedTeammateToolArgsError(options: {
	messages: ChatMessage[];
	toolCall: ToolCall;
	error: string;
	onMessage?: TeammateExecutionOptions['onMessage'];
	memberId: string;
	memberName: string;
}): void {
	appendTeammateToolFeedback({
		messages: options.messages,
		toolCallId: options.toolCall.id,
		content: `Error: ${options.error}`,
		onMessage: options.onMessage,
		memberId: options.memberId,
		memberName: options.memberName,
		toolName: options.toolCall.function.name,
	});
}

const PLAN_APPROVAL_PROTECTED_LOCAL_TOOLS = new Set([
	'filesystem-create',
	'filesystem-edit',
	'terminal-execute',
	'todo-add',
	'todo-update',
	'todo-delete',
	'notebook-add',
	'notebook-update',
	'notebook-delete',
]);

export function isPlanApprovalProtectedTool(
	toolName: string,
	binding?: ToolExecutionBinding,
): boolean {
	if (PLAN_APPROVAL_PROTECTED_LOCAL_TOOLS.has(toolName)) {
		return true;
	}

	return binding?.kind === 'local'
		? PLAN_APPROVAL_PROTECTED_LOCAL_TOOLS.has(binding.toolName)
		: false;
}

export async function executeTeammate(
	memberId: string,
	memberName: string,
	prompt: string,
	worktreePath: string,
	teamName: string,
	role: string | undefined,
	options: TeammateExecutionOptions,
): Promise<TeammateExecutionResult> {
	const {
		onMessage,
		abortSignal,
		requestToolConfirmation,
		isToolAutoApproved,
		yoloMode,
		addToAlwaysApproved,
		requestUserQuestion,
		requirePlanApproval,
	} = options;

	const instanceId = `teammate-${memberId}-${Date.now()}`;

	// Register with team tracker
	teamTracker.register({
		instanceId,
		memberId,
		memberName,
		role,
		worktreePath,
		teamName,
		prompt,
		startedAt: new Date(),
	});

	// Update team config member status
	const {updateMember} = await import('../team/teamConfig.js');
	updateMember(teamName, memberId, {instanceId, status: 'active'});

	try {
		const {getOpenAiConfig} = await import('../config/apiConfig.js');
		const {sessionManager} = await import('../session/sessionManager.js');
		const {createStreamingChatCompletion} = await import('../../api/chat.js');
		const {createStreamingAnthropicCompletion} = await import(
			// @ts-ignore - generated at build time
			'../../api/anthropic.js'
		);
		const {createStreamingGeminiCompletion} = await import(
			'../../api/gemini.js'
		);
		const {createStreamingResponse} = await import('../../api/responses.js');
		const {resolveVcpModeRequest} = await import(
			'../session/vcpCompatibility/mode.js'
		);
		const {
			shouldCompressSubAgentContext,
			compressSubAgentContext,
			getContextPercentage,
			countMessagesTokens,
		} = await import('../core/subAgentContextCompressor.js');
		const {listTasks} = await import('../team/teamTaskList.js');
		const {executeToolCall} = await import('./toolExecutor.js');

		const config = getOpenAiConfig();
		const currentSession = sessionManager.getCurrentSession();
		const preparedToolPlane = await prepareToolPlane({
			config,
			sessionKey: instanceId,
			syntheticTools: buildTeammateSyntheticTools({
				requirePlanApproval,
			}),
		});
		const toolPlaneKey = preparedToolPlane.toolPlaneKey;
		const allowedTools: MCPTool[] = [...preparedToolPlane.tools];
		const userQuestionAdapter =
			createTeammateUserQuestionAdapter(requestUserQuestion);

		// Build initial prompt with team context
		const otherTeammates = teamTracker
			.getRunningTeammates()
			.filter(t => t.instanceId !== instanceId);

		const tasks = listTasks(teamName);
		let teamContext = `\n\n## Team Context
You are teammate "${memberName}" in team "${teamName}".
Your working directory (Git worktree): ${worktreePath}
${role ? `Your role: ${role}` : ''}

### Worktree Path Rules (ENFORCED)
- ALL file operations are restricted to YOUR worktree: \`${worktreePath}\`
- Use **relative paths** (e.g., \`src/utils/foo.ts\`) — they are automatically resolved to your worktree.
- You CANNOT read or write files in the main workspace or other teammates' worktrees.
- When users or task descriptions mention file paths, treat them as relative to your worktree.
- \`terminal-execute\` commands always run inside your worktree directory.
- \`git push\` is forbidden — the lead handles all pushes after merging.

### Other Teammates`;

		if (otherTeammates.length > 0) {
			teamContext +=
				'\n' +
				otherTeammates
					.map(
						t =>
							`- ${t.memberName}${t.role ? ` (${t.role})` : ''} [ID: ${
								t.memberId
							}]`,
					)
					.join('\n');
		} else {
			teamContext += '\nNo other teammates are currently active.';
		}

		teamContext += '\n\n### Shared Task List';
		if (tasks.length > 0) {
			teamContext +=
				'\n' +
				tasks
					.map(t => {
						const deps = t.dependencies?.length
							? ` (depends on: ${t.dependencies.join(', ')})`
							: '';
						const assignee = t.assigneeName
							? ` [assigned to: ${t.assigneeName}]`
							: '';
						return `- [${t.status}] ${t.id}: ${t.title}${deps}${assignee}`;
					})
					.join('\n');
		} else {
			teamContext += '\nNo tasks defined yet.';
		}

		teamContext += `\n\n### Available Tools
- \`message_teammate\`: Send a message to another teammate or the lead
- \`claim_task\`: Claim a pending task from the task list
- \`complete_task\`: Mark a task as completed
- \`list_team_tasks\`: View the current task list
- \`wait_for_messages\`: **MUST call when all current work is done.** Blocks efficiently until new messages arrive. Provide a summary of completed work.

### Rules
- You do NOT shut yourself down — the team lead controls your lifecycle.
- **NEVER run \`git push\`.** All pushes are handled by the lead after merging.
- **ALL file paths must be relative to your worktree** (\`${worktreePath}\`). Absolute paths pointing to the main workspace will be automatically remapped. Paths outside both your worktree and the main workspace will be rejected.
- **When you finish all assigned work, you MUST call \`wait_for_messages\` with a summary.** This notifies the lead and efficiently blocks until new instructions arrive. Do NOT end your turn without calling \`wait_for_messages\`.`;

		if (requirePlanApproval) {
			teamContext += `\n- \`request_plan_approval\`: Submit your plan to the lead for approval (REQUIRED before making changes)`;
			teamContext += `\n\n**IMPORTANT**: You are in plan-approval mode. You must submit your plan via \`request_plan_approval\` and wait for approval before making any file changes.`;
		}

		const finalPrompt = `${prompt}${teamContext}`;

		const messages: ChatMessage[] = [{role: 'user', content: finalPrompt}];

		let finalResponse = '';
		let totalUsage: TokenUsage | undefined;
		let latestTotalTokens = 0;
		let planApproved = !requirePlanApproval; // Skip approval if not required

		// eslint-disable-next-line no-constant-condition
		while (true) {
			if (abortSignal?.aborted) {
				return {
					success: false,
					result: finalResponse,
					error: 'Teammate execution aborted',
				};
			}

			await compressionCoordinator.waitUntilFree(instanceId);

			// Dequeue messages from lead or other teammates
			const teammateMessages = teamTracker.dequeueTeammateMessages(instanceId);
			for (const msg of teammateMessages) {
				messages.push({
					role: 'user',
					content: `[Message from ${msg.fromMemberName}]\n${msg.content}`,
				});

				if (onMessage) {
					onMessage({
						type: 'sub_agent_message',
						agentId: `teammate-${memberId}`,
						agentName: memberName,
						message: {
							type: 'inter_agent_received',
							fromAgentId: msg.fromMemberId,
							fromAgentName: msg.fromMemberName,
							content: msg.content,
						},
					});
				}
			}

			// API call
			const model = config.advancedModel || 'gpt-5';
			const projectMessagesForModel = () =>
				projectTeammateMessagesForModel(config, messages);
			const projectedMessages = projectMessagesForModel();
			const stream = createTeammateProviderStream({
				config,
				model,
				allowedTools,
				messages: projectedMessages,
				currentSessionId: currentSession?.id,
				abortSignal,
				resolveVcpModeRequest,
				streamFactories: {
					createStreamingChatCompletion,
					createStreamingAnthropicCompletion,
					createStreamingGeminiCompletion,
					createStreamingResponse,
				},
			});

			let currentContent = '';
			let toolCalls: any[] = [];
			let currentThinking:
				| {type: 'thinking'; thinking: string; signature?: string}
				| undefined;
			let currentReasoningContent: string | undefined;
			let currentReasoning:
				| {summary?: any; content?: any; encrypted_content?: string}
				| undefined;

			for await (const event of stream) {
				if (onMessage) {
					onMessage({
						type: 'sub_agent_message',
						agentId: `teammate-${memberId}`,
						agentName: memberName,
						message: event,
					});
				}

				if (event.type === 'usage' && event.usage) {
					const eu = event.usage;
					latestTotalTokens =
						eu.total_tokens ||
						(eu.prompt_tokens || 0) + (eu.completion_tokens || 0);

					if (!totalUsage) {
						totalUsage = {
							inputTokens: eu.prompt_tokens || 0,
							outputTokens: eu.completion_tokens || 0,
							cacheCreationInputTokens: eu.cache_creation_input_tokens,
							cacheReadInputTokens: eu.cache_read_input_tokens,
						};
					} else {
						totalUsage.inputTokens += eu.prompt_tokens || 0;
						totalUsage.outputTokens += eu.completion_tokens || 0;
					}

					if (onMessage && config.maxContextTokens && latestTotalTokens > 0) {
						const ctxPct = getContextPercentage(
							latestTotalTokens,
							config.maxContextTokens,
						);
						onMessage({
							type: 'sub_agent_message',
							agentId: `teammate-${memberId}`,
							agentName: memberName,
							message: {
								type: 'context_usage',
								percentage: Math.max(1, Math.round(ctxPct)),
								inputTokens: latestTotalTokens,
								maxTokens: config.maxContextTokens,
							},
						});
					}
				}

				if (event.type === 'content' && event.content) {
					currentContent += event.content;
				} else if (event.type === 'tool_calls' && event.tool_calls) {
					toolCalls = event.tool_calls;
				} else if (event.type === 'reasoning_data' && 'reasoning' in event) {
					currentReasoning = event.reasoning as typeof currentReasoning;
				} else if (event.type === 'done') {
					if ('thinking' in event && event.thinking) {
						currentThinking = event.thinking as typeof currentThinking;
					}
					if ('reasoning_content' in event && event.reasoning_content) {
						currentReasoningContent = event.reasoning_content as string;
					}
				}
			}

			// Tiktoken fallback when API doesn't return usage
			if (latestTotalTokens === 0 && config.maxContextTokens) {
				latestTotalTokens = countMessagesTokens(projectMessagesForModel());
				if (onMessage && latestTotalTokens > 0) {
					const ctxPct = getContextPercentage(
						latestTotalTokens,
						config.maxContextTokens,
					);
					onMessage({
						type: 'sub_agent_message',
						agentId: `teammate-${memberId}`,
						agentName: memberName,
						message: {
							type: 'context_usage',
							percentage: Math.max(1, Math.round(ctxPct)),
							inputTokens: latestTotalTokens,
							maxTokens: config.maxContextTokens,
						},
					});
				}
			}

			// Build assistant message
			if (currentContent || toolCalls.length > 0) {
				const assistantMessage: ChatMessage = {
					role: 'assistant',
					content: currentContent || '',
				};
				if (currentThinking) assistantMessage.thinking = currentThinking;
				if (currentReasoningContent)
					(assistantMessage as any).reasoning_content = currentReasoningContent;
				if (currentReasoning)
					(assistantMessage as any).reasoning = currentReasoning;
				if (toolCalls.length > 0) assistantMessage.tool_calls = toolCalls;
				messages.push(assistantMessage);
				finalResponse = currentContent;
			}

			// Context compression
			let justCompressed = false;
			if (latestTotalTokens > 0 && config.maxContextTokens) {
				if (
					shouldCompressSubAgentContext(
						latestTotalTokens,
						config.maxContextTokens,
					)
				) {
					const ctxPercentage = getContextPercentage(
						latestTotalTokens,
						config.maxContextTokens,
					);

					if (onMessage) {
						onMessage({
							type: 'sub_agent_message',
							agentId: `teammate-${memberId}`,
							agentName: memberName,
							message: {
								type: 'context_compressing',
								percentage: Math.round(ctxPercentage),
							},
						});
					}

					await compressionCoordinator.acquireLock(instanceId);
					try {
						const compressionResult = await compressSubAgentContext(
							messages,
							latestTotalTokens,
							config.maxContextTokens,
							{
								model,
								requestMethod: config.requestMethod,
								maxTokens: config.maxTokens,
							},
						);
						if (compressionResult.compressed) {
							messages.length = 0;
							messages.push(...compressionResult.messages);
							justCompressed = true;
							if (compressionResult.afterTokensEstimate) {
								latestTotalTokens = compressionResult.afterTokensEstimate;
							}

							if (onMessage) {
								onMessage({
									type: 'sub_agent_message',
									agentId: `teammate-${memberId}`,
									agentName: memberName,
									message: {
										type: 'context_compressed',
										beforeTokens: compressionResult.beforeTokens,
										afterTokensEstimate: compressionResult.afterTokensEstimate,
									},
								});
							}

							console.log(
								`[Teammate:${memberName}] Context compressed: ` +
									`${compressionResult.beforeTokens} 鈫?~${compressionResult.afterTokensEstimate} tokens`,
							);
						}
					} catch (compressError) {
						console.error(
							`[Teammate:${memberName}] Context compression failed:`,
							compressError,
						);
					} finally {
						compressionCoordinator.releaseLock(instanceId);
					}
				}
			}

			if (justCompressed && toolCalls.length === 0) {
				while (
					messages.length > 0 &&
					messages[messages.length - 1]?.role === 'assistant'
				) {
					messages.pop();
				}
				messages.push({
					role: 'user',
					content:
						'[System] Context has been auto-compressed. Your task is NOT finished. Continue working.',
				});
				continue;
			}

			// No tool calls = AI forgot to call wait_for_messages. Prompt it to do so.
			if (toolCalls.length === 0) {
				messages.push({
					role: 'user',
					content:
						'[System] Your work appears complete, but you did not call `wait_for_messages`. You MUST call `wait_for_messages` with a summary instead of ending your turn. This keeps you available for follow-up instructions from the lead or other teammates.',
				});
				continue;
			}

			// Handle synthetic team tools internally
			const {syntheticCalls, regularCalls, waitCall, otherSyntheticCalls} =
				partitionTeammateToolCalls(toolCalls);

			// Process non-blocking synthetic tools first
			for (const tc of otherSyntheticCalls) {
				const parsedArgs = parseTeammateToolArgsResult(tc);
				if (!parsedArgs.ok) {
					appendMalformedTeammateToolArgsError({
						messages,
						toolCall: tc,
						error: parsedArgs.error,
						onMessage,
						memberId,
						memberName,
					});
					continue;
				}

				let resultContent = '';
				try {
					resultContent = dispatchTeammateSyntheticToolCall({
						toolName: tc.function.name,
						args: parsedArgs.args,
						teamName,
						memberId,
						memberName,
						instanceId,
					});
				} catch (error: any) {
					resultContent = `Failed to execute ${tc.function.name}: ${error.message}`;
				}

				messages.push({
					role: 'tool' as const,
					tool_call_id: tc.id,
					content: resultContent,
				});
				emitTeammateToolResult({
					onMessage,
					memberId,
					memberName,
					toolCallId: tc.id,
					toolName: tc.function.name,
					content: resultContent,
				});
			}

			// Handle wait_for_messages: notify lead, mark standby, then block until messages arrive
			if (waitCall) {
				const parsedWaitArgs = parseTeammateToolArgsResult(waitCall);
				if (!parsedWaitArgs.ok) {
					appendMalformedTeammateToolArgsError({
						messages,
						toolCall: waitCall,
						error: parsedWaitArgs.error,
						onMessage,
						memberId,
						memberName,
					});
					continue;
				}

				const summary = parsedWaitArgs.args['summary'] || 'Work completed.';

				// Mark as standby so wait_for_teammates knows this teammate is idle
				teamTracker.setStandby(instanceId);

				teamTracker.sendMessageToLead(
					instanceId,
					`[Standby] ${memberName} has completed current work. Summary: ${summary}`,
				);

				if (onMessage) {
					onMessage({
						type: 'sub_agent_message',
						agentId: `teammate-${memberId}`,
						agentName: memberName,
						message: {type: 'status', status: 'standby'} as any,
					});
				}

				// Block until messages arrive or aborted
				let receivedMessages: typeof teammateMessages = [];
				while (!abortSignal?.aborted) {
					const incoming = teamTracker.dequeueTeammateMessages(instanceId);
					if (incoming.length > 0) {
						receivedMessages = incoming;
						break;
					}
					await new Promise(resolve => setTimeout(resolve, 500));
				}

				// Clear standby — teammate is resuming or exiting
				teamTracker.clearStandby(instanceId);

				if (abortSignal?.aborted) {
					messages.push({
						role: 'tool' as const,
						tool_call_id: waitCall.id,
						content: 'Session terminated by team lead.',
					});
					emitTeammateToolResult({
						onMessage,
						memberId,
						memberName,
						toolCallId: waitCall.id,
						toolName: waitCall.function.name,
						content: 'Session terminated by team lead.',
					});
					break;
				}

				const msgSummary = receivedMessages
					.map(m => `[${m.fromMemberName}]: ${m.content}`)
					.join('\n');
				messages.push({
					role: 'tool' as const,
					tool_call_id: waitCall.id,
					content: `Received ${receivedMessages.length} message(s):\n${msgSummary}`,
				});
				emitTeammateToolResult({
					onMessage,
					memberId,
					memberName,
					toolCallId: waitCall.id,
					toolName: waitCall.function.name,
					content: `Received ${receivedMessages.length} message(s):\n${msgSummary}`,
				});

				// Skip regular tool calls this iteration — the AI should process the messages first
				continue;
			}

			// Process regular MCP tool calls
			if (regularCalls.length > 0) {
				const executeRegularToolCall = (
					toolCall: ToolCall,
					toolArgs: Record<string, any>,
				) =>
					executeTeammateRegularToolCall({
						toolCall,
						toolArgs,
						worktreePath,
						toolPlaneKey,
						abortSignal,
						onMessage,
						userQuestionAdapter,
						executeToolCall,
					});
				const emitRegularToolResult = (toolCall: ToolCall, content: string) => {
					emitTeammateToolResult({
						onMessage,
						memberId,
						memberName,
						toolCallId: toolCall.id,
						toolName: toolCall.function.name,
						content,
					});
				};

				// Plan approval gate: block file-modifying tools until approved
				if (!planApproved) {
					const {blockedCalls, executableCalls} =
						partitionPlanApprovalRegularCalls({
							toolCalls: regularCalls,
							toolPlaneKey,
							isPlanApprovalProtectedTool,
						});

					if (blockedCalls.length > 0) {
						for (const toolCall of blockedCalls) {
							appendTeammateToolFeedback({
								messages,
								toolCallId: toolCall.id,
								content:
									'Error: Plan approval required before making changes. Use request_plan_approval first.',
								onMessage,
								memberId,
								memberName,
								toolName: toolCall.function.name,
							});
						}

						// Only execute non-blocked regular calls
						if (executableCalls.length === 0 && syntheticCalls.length > 0) {
							continue;
						}

						// Fall through to execute non-blocked calls
						for (const toolCall of executableCalls) {
							const parsedArgs = parseTeammateToolArgsResult(toolCall);
							if (!parsedArgs.ok) {
								appendTeammateToolFeedback({
									messages,
									toolCallId: toolCall.id,
									content: `Error: ${parsedArgs.error}`,
									onMessage,
									memberId,
									memberName,
									toolName: toolCall.function.name,
								});
								continue;
							}

							await executeAndRecordTeammateRegularToolCall({
								toolCall,
								toolArgs: parsedArgs.args,
								messages,
								executeRegularToolCall,
								emitToolResult: content =>
									emitRegularToolResult(toolCall, content),
							});
						}

						continue;
					}
				}

				for (const toolCall of regularCalls) {
					const parsedArgs = parseTeammateToolArgsResult(toolCall);
					if (!parsedArgs.ok) {
						appendTeammateToolFeedback({
							messages,
							toolCallId: toolCall.id,
							content: `Error: ${parsedArgs.error}`,
							onMessage,
							memberId,
							memberName,
							toolName: toolCall.function.name,
						});
						continue;
					}

					const toolArgs = parsedArgs.args;
					const approval = await resolveTeammateRegularToolApproval({
						toolCall,
						toolArgs,
						requestToolConfirmation,
						isToolAutoApproved,
						yoloMode,
						addToAlwaysApproved,
					});
					if (!approval.approved) {
						const feedback =
							'feedback' in approval
								? approval.feedback
								: 'Tool execution denied by user.';
						appendTeammateToolFeedback({
							messages,
							toolCallId: toolCall.id,
							content: feedback,
							onMessage,
							memberId,
							memberName,
							toolName: toolCall.function.name,
						});
						continue;
					}

					await executeAndRecordTeammateRegularToolCall({
						toolCall,
						toolArgs,
						messages,
						executeRegularToolCall,
						emitToolResult: content => emitRegularToolResult(toolCall, content),
					});
				}
			}

			// If plan approval was requested and approved, mark it
			const approvalCheck = teamTracker
				.getPendingApprovals()
				.find(a => a.fromInstanceId === instanceId && a.status === 'approved');
			if (approvalCheck) {
				planApproved = true;
			}
		}

		// Notify lead that this teammate is done
		teamTracker.storeResult({
			instanceId,
			memberId,
			memberName,
			success: true,
			result: finalResponse,
			completedAt: new Date(),
		});

		if (onMessage) {
			onMessage({
				type: 'sub_agent_message',
				agentId: `teammate-${memberId}`,
				agentName: memberName,
				message: {type: 'done'},
			});
		}

		return {
			success: true,
			result: finalResponse,
			usage: totalUsage,
		};
	} catch (error: any) {
		teamTracker.storeResult({
			instanceId,
			memberId,
			memberName,
			success: false,
			result: '',
			error: error.message,
			completedAt: new Date(),
		});

		return {
			success: false,
			result: '',
			error: error.message,
		};
	} finally {
		try {
			const [
				{clearToolExecutionBindingsSession},
				{clearBridgeToolSnapshotSession},
			] = await Promise.all([
				import('../session/vcpCompatibility/toolExecutionBinding.js'),
				import('../session/vcpCompatibility/toolSnapshot.js'),
			]);
			clearToolExecutionBindingsSession(instanceId);
			clearBridgeToolSnapshotSession(instanceId);
		} catch {
			/* best effort */
		}

		// Auto-commit any uncommitted work before unregistering
		try {
			const {autoCommitWorktreeChanges} = await import(
				'../team/teamWorktree.js'
			);
			autoCommitWorktreeChanges(worktreePath, memberName);
		} catch {
			/* best effort */
		}

		updateMember(teamName, memberId, {
			status: 'shutdown',
			shutdownAt: new Date().toISOString(),
		});
		teamTracker.unregister(instanceId);
	}
}
