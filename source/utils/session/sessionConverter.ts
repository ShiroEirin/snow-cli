import type {ChatMessage} from '../../api/chat.js';
import type {Message} from '../../ui/components/chat/MessageList.js';
import {formatToolCallMessage} from '../ui/messageFormatter.js';
import {isToolNeedTwoStepDisplay} from '../config/toolDisplayConfig.js';
import {buildToolResultView} from './toolResultView.js';
import {buildToolLifecycleSideband} from './vcpCompatibility/toolLifecycleSideband.js';

type SessionToolCall = NonNullable<ChatMessage['tool_calls']>[number];

type SessionToolResultMessage = ChatMessage & {
	role: 'tool';
	tool_call_id: string;
};

type DiffToolArguments = {
	oldContent?: string;
	newContent?: string;
	filename?: string;
	completeOldContent?: string;
	completeNewContent?: string;
	contextStartLine?: number;
	batchResults?: any[];
	isBatch?: boolean;
};

type IndexedToolCallMeta = {
	toolCall: SessionToolCall;
	toolArgs: Record<string, any>;
	toolDisplay: ReturnType<typeof formatToolCallMessage>;
	isTimeConsuming: boolean;
	parallelGroupId?: string;
};

/**
 * Clean thinking content by removing XML-like tags
 * Some third-party APIs (e.g., DeepSeek R1) may include <think></think> or <thinking></thinking> tags
 */
function cleanThinkingContent(content: string): string {
	return content.replace(/\s*<\/?think(?:ing)?>\s*/gi, '').trim();
}

function parseToolArguments(argumentsText: string): Record<string, any> {
	try {
		return JSON.parse(argumentsText);
	} catch {
		return {};
	}
}

function getToolStatusDetail(
	message: Pick<ChatMessage, 'toolStatusDetail'>,
): string | undefined {
	return typeof message.toolStatusDetail === 'string'
		? message.toolStatusDetail
		: undefined;
}

function buildDisplayArgsText(toolCall: SessionToolCall): string {
	const toolDisplay = formatToolCallMessage(toolCall);
	if (toolCall.function.name === 'terminal-execute') {
		const toolArgs = parseToolArguments(toolCall.function.arguments);
		if (toolArgs['command']) {
			return ` "${toolArgs['command']}"`;
		}
	}

	if (toolDisplay.args.length === 0) {
		return '';
	}

	const params = toolDisplay.args
		.map(arg => `${arg.key}: ${arg.value}`)
		.join(', ');
	return params ? ` (${params})` : '';
}

/**
 * Convert API format session messages to UI format messages
 * Process messages in order to maintain correct sequence
 */
export function convertSessionMessagesToUI(
	sessionMessages: ChatMessage[],
): Message[] {
	const uiMessages: Message[] = [];
	const resolvedToolCallIds = new Set(
		sessionMessages
			.filter(msg => msg?.role === 'tool' && msg.tool_call_id && !msg.subAgentInternal)
			.map(msg => msg.tool_call_id as string),
	);
	const resolvedSubAgentToolCallIds = new Set(
		sessionMessages
			.filter(msg => msg?.role === 'tool' && msg.tool_call_id && msg.subAgentInternal)
			.map(msg => msg.tool_call_id as string),
	);
	const indexedRegularToolCalls = new Map<string, IndexedToolCallMeta>();
	const indexedSubAgentToolCalls = new Map<string, IndexedToolCallMeta>();

	for (let index = 0; index < sessionMessages.length; index++) {
		const message = sessionMessages[index];
		if (
			message?.role !== 'assistant' ||
			!message.tool_calls ||
			message.tool_calls.length === 0
		) {
			continue;
		}

		const hasMultipleTools = message.tool_calls.length > 1;
		const hasNonTimeConsumingTool = message.tool_calls.some(
			toolCall => !isToolNeedTwoStepDisplay(toolCall.function.name),
		);
		const parallelGroupId =
			!message.subAgentInternal && hasMultipleTools && hasNonTimeConsumingTool
				? `parallel-${index}`
				: undefined;

		for (const toolCall of message.tool_calls) {
			const meta: IndexedToolCallMeta = {
				toolCall,
				toolArgs: parseToolArguments(toolCall.function.arguments),
				toolDisplay: formatToolCallMessage(toolCall),
				isTimeConsuming: isToolNeedTwoStepDisplay(toolCall.function.name),
				...(!isToolNeedTwoStepDisplay(toolCall.function.name) && parallelGroupId
					? {parallelGroupId}
					: {}),
			};

			if (message.subAgentInternal) {
				indexedSubAgentToolCalls.set(toolCall.id, meta);
			} else {
				indexedRegularToolCalls.set(toolCall.id, meta);
			}
		}
	}

	// Track which tool_calls have been processed
	const processedToolCalls = new Set<string>();

	// Helper function to extract thinking content from all sources
	const extractThinkingFromMessage = (msg: any): string | undefined => {
		let content: string | undefined;
		// 1. Anthropic Extended Thinking
		if (msg.thinking?.thinking) {
			content = msg.thinking.thinking;
		}
		// 2. Responses API reasoning summary
		else if (msg.reasoning?.summary && Array.isArray(msg.reasoning.summary)) {
			content = msg.reasoning.summary
				.map((item: any) => item.text)
				.filter(Boolean)
				.join('\n');
		}
		// 3. DeepSeek R1 reasoning content
		else if (
			msg.reasoning_content &&
			typeof msg.reasoning_content === 'string'
		) {
			content = msg.reasoning_content;
		}

		return content ? cleanThinkingContent(content) : undefined;
	};

	for (let i = 0; i < sessionMessages.length; i++) {
		const msg = sessionMessages[i];
		if (!msg) continue;

		if (
			msg.subAgentInternal &&
			msg.subAgentContent &&
			msg.role === 'assistant'
		) {
			uiMessages.push({
				role: 'subagent',
				content: msg.content,
				streaming: false,
				thinking: extractThinkingFromMessage(msg),
				subAgentInternal: true,
				subAgentContent: true,
				subAgent: msg.subAgent,
			});
			continue;
		}

		// Handle sub-agent internal tool call messages
		if (msg.subAgentInternal && msg.role === 'assistant' && msg.tool_calls) {
			const timeConsumingTools = msg.tool_calls.filter(
				tc =>
					isToolNeedTwoStepDisplay(tc.function.name) &&
					!resolvedSubAgentToolCallIds.has(tc.id),
			);
			const quickTools = msg.tool_calls.filter(
				tc => !isToolNeedTwoStepDisplay(tc.function.name),
			);
			const pendingQuickToolIds = quickTools
				.filter(tc => !resolvedSubAgentToolCallIds.has(tc.id))
				.map(tc => tc.id);

			// Display time-consuming tools individually
			for (const toolCall of timeConsumingTools) {
				const toolMeta = indexedSubAgentToolCalls.get(toolCall.id);
				const toolDisplay = toolMeta?.toolDisplay || formatToolCallMessage(toolCall);
				const toolArgs = toolMeta?.toolArgs || parseToolArguments(toolCall.function.arguments);
				const paramDisplay = buildDisplayArgsText(toolCall);

				uiMessages.push({
					role: 'subagent',
					content: '',
					streaming: false,
					toolCall: {
						name: toolCall.function.name,
						arguments: toolArgs,
					},
					toolName: toolCall.function.name,
					toolCallId: toolCall.id,
					toolPending: true,
					messageStatus: 'pending',
					toolStatusDetail: buildToolLifecycleSideband({
						toolName: toolDisplay.toolName,
						messageStatus: 'pending',
						detail: paramDisplay ? paramDisplay.trim() : undefined,
					}),
					subAgentInternal: true,
				});
				processedToolCalls.add(toolCall.id);
			}

			// Display quick tools in compact mode
			if (quickTools.length > 0) {
				// Find agent name from next tool result message
				let agentName = 'Sub-Agent';
				for (let j = i + 1; j < sessionMessages.length; j++) {
					const nextMsg = sessionMessages[j];
					if (nextMsg && nextMsg.subAgentInternal && nextMsg.role === 'tool') {
						// Try to find agent name from context
						// For now, use a default name
						break;
					}
				}

				const toolLines = quickTools.map((tc, index: number) => {
					const display =
						indexedSubAgentToolCalls.get(tc.id)?.toolDisplay ||
						formatToolCallMessage(tc);
					const isLast = index === quickTools.length - 1;
					const prefix = isLast ? '└─' : '├─';

					// Build parameter display
					const params = display.args
						.map((arg: any) => `${arg.key}: ${arg.value}`)
						.join(', ');

					return `\n  \x1b[2m${prefix} ${display.toolName}${
						params ? ` (${params})` : ''
					}\x1b[0m`;
				});

				uiMessages.push({
					role: 'subagent',
					content: `\x1b[38;2;184;122;206m⚇ ${agentName}${toolLines.join(
						'',
					)}\x1b[0m`,
					streaming: false,
					subAgentInternal: true,
					pendingToolIds: pendingQuickToolIds,
				});

				for (const tc of quickTools) {
					processedToolCalls.add(tc.id);
				}
			}
			continue;
		}

		// Handle sub-agent internal tool result messages
		if (msg.subAgentInternal && msg.role === 'tool' && msg.tool_call_id) {
			const status =
				msg.messageStatus ??
				(msg.content.startsWith('Error:') ? 'error' : 'success');
			const isError = status === 'error';

			// Find tool name from previous assistant message
			const toolMeta = indexedSubAgentToolCalls.get(msg.tool_call_id);
			const toolName = toolMeta?.toolCall.function.name || 'tool';
			const isTimeConsumingTool = toolMeta?.isTimeConsuming || false;

			// For time-consuming tools, always show result with full details
			if (isTimeConsumingTool) {
				const toolResultView = buildToolResultView({
					toolName,
					content: msg.content,
					historyContent: msg.historyContent,
					previewContent: msg.previewContent,
					isError,
				});

				let terminalResultData:
					| {
							stdout?: string;
							stderr?: string;
							exitCode?: number;
							command?: string;
					  }
					| undefined;

				// Extract terminal result data
				if (toolName === 'terminal-execute' && !isError) {
					try {
						const resultData = JSON.parse(msg.content);
						if (
							resultData.stdout !== undefined ||
							resultData.stderr !== undefined
						) {
							terminalResultData = {
								stdout: resultData.stdout,
								stderr: resultData.stderr,
								exitCode: resultData.exitCode,
								command: resultData.command,
							};
						}
					} catch (e) {
						// Ignore parse errors
					}
				}

				// Extract filesystem diff data
				let fileToolData:
					| {
							name: string;
							arguments: Record<string, any>;
					  }
					| undefined;
				if (
					!isError &&
					(toolName === 'filesystem-create' ||
						toolName === 'filesystem-edit' ||
						toolName === 'filesystem-replaceedit')
				) {
					const preExtractedEditDiffData = (msg as any).editDiffData;
					if (
						preExtractedEditDiffData &&
						(typeof preExtractedEditDiffData.oldContent === 'string' ||
							Array.isArray(preExtractedEditDiffData.batchResults))
					) {
						fileToolData = {
							name: toolName,
							arguments: preExtractedEditDiffData,
						};
					}
					try {
						const resultData = JSON.parse(msg.content);

						if (resultData.content) {
							fileToolData = {
								name: toolName,
								arguments: {
									content: resultData.content,
									path: resultData.path || resultData.filename,
								},
							};
						} else if (resultData.oldContent && resultData.newContent) {
							fileToolData = {
								name: toolName,
								arguments: {
									oldContent: resultData.oldContent,
									newContent: resultData.newContent,
									filename:
										resultData.filePath ||
										resultData.path ||
										resultData.filename,
									completeOldContent: resultData.completeOldContent,
									completeNewContent: resultData.completeNewContent,
									contextStartLine: resultData.contextStartLine,
								},
							};
						} else if (
							resultData.batchResults &&
							Array.isArray(resultData.batchResults)
						) {
							fileToolData = {
								name: toolName,
								arguments: {
									isBatch: true,
									batchResults: resultData.batchResults,
								},
							};
						}
					} catch (e) {
						// Ignore parse errors
					}
				}

				uiMessages.push({
					role: 'subagent',
					content: '',
					streaming: false,
					toolName: toolResultView.toolName,
					toolCallId: msg.tool_call_id,
					toolResult: !isError ? msg.content : undefined,
					toolResultPreview: !isError
						? toolResultView.previewContent
						: undefined,
					terminalResult: terminalResultData,
					toolCall: terminalResultData
						? {
								name: toolName,
								arguments: terminalResultData,
						  }
						: fileToolData
						? fileToolData
						: undefined,
					messageStatus: status,
					toolStatusDetail: buildToolLifecycleSideband({
						toolName: toolResultView.toolName,
						messageStatus: status,
						detail: getToolStatusDetail(msg),
					}),
					subAgentInternal: true,
				});
			} else {
				// For quick tools, only show errors
				// Success results are handled by updating pendingToolIds in the compact message
				if (isError) {
					// UI only shows simple failure message, detailed error is sent to AI
					uiMessages.push({
						role: 'subagent',
						content: '',
						streaming: false,
						toolName,
						toolCallId: msg.tool_call_id,
						messageStatus: 'error',
						toolStatusDetail: buildToolLifecycleSideband({
							toolName,
							messageStatus: 'error',
						}),
						subAgentInternal: true,
					});
				}
				// Note: Success results for quick tools are not shown individually
				// They are represented by the completion checkmark on the compact "Quick Tools" message
			}
			continue;
		}

		// Handle regular assistant messages with tool_calls
		if (
			msg.role === 'assistant' &&
			msg.tool_calls &&
			msg.tool_calls.length > 0 &&
			!msg.subAgentInternal
		) {
			// If there's thinking content or text content before tool calls, display it first
			const thinkingContent = extractThinkingFromMessage(msg);
			if ((msg.content && msg.content.trim()) || thinkingContent) {
				uiMessages.push({
					role: 'assistant',
					content: msg.content?.trim() || '',
					streaming: false,
					thinking: thinkingContent,
				});
			}

			for (const toolCall of msg.tool_calls) {
				// Skip if already processed
				if (processedToolCalls.has(toolCall.id)) continue;

				const toolMeta = indexedRegularToolCalls.get(toolCall.id);
				const toolDisplay = toolMeta?.toolDisplay || formatToolCallMessage(toolCall);
				const toolArgs = toolMeta?.toolArgs || parseToolArguments(toolCall.function.arguments);

				// Only add "in progress" message for tools that need two-step display
				const needTwoSteps = toolMeta?.isTimeConsuming ?? isToolNeedTwoStepDisplay(toolCall.function.name);
				if (needTwoSteps && !resolvedToolCallIds.has(toolCall.id)) {
					// Add tool call message (in progress)
					uiMessages.push({
						role: 'assistant',
						content: '',
						streaming: false,
						toolCall: {
							name: toolCall.function.name,
							arguments: toolArgs,
						},
						toolDisplay,
						toolName: toolCall.function.name,
						toolCallId: toolCall.id,
						toolStatusDetail: buildToolLifecycleSideband({
							toolName: toolDisplay.toolName,
							messageStatus: 'pending',
						}),
						toolPending: true,
						messageStatus: 'pending',
					});
				}

				processedToolCalls.add(toolCall.id);
			}
			continue;
		}

		// Handle regular tool result messages (non-subagent)
		if (msg.role === 'tool' && msg.tool_call_id && !msg.subAgentInternal) {
			const toolMessage = msg as SessionToolResultMessage;
			const isRejectedWithReply = msg.content.includes(
				'Tool execution rejected by user:',
			);
			const status =
				msg.messageStatus ??
				(msg.content.startsWith('Error:') || isRejectedWithReply
					? 'error'
					: 'success');
			const isError = status === 'error';

			// UI only shows simple failure message, detailed error is sent to AI via msg.content
			let statusText = getToolStatusDetail(toolMessage) || '';
			// Keep rejection reason display for user feedback (not error details)
			if (isRejectedWithReply) {
				// Extract rejection reason
				const reason =
					msg.content.split('Tool execution rejected by user:')[1]?.trim() ||
					'';
				statusText = reason ? `Rejection reason: ${reason}` : statusText;
			}

			const toolMeta = indexedRegularToolCalls.get(msg.tool_call_id);
			let toolName = toolMeta?.toolCall.function.name || 'tool';
			let toolArgs: Record<string, any> = {...(toolMeta?.toolArgs || {})};
			let editDiffData: DiffToolArguments | undefined;
			let terminalResultData:
				| {
						stdout?: string;
						stderr?: string;
						exitCode?: number;
						command?: string;
				  }
				| undefined;

			if (
				(toolName === 'filesystem-edit' ||
					toolName === 'filesystem-replaceedit') &&
				!isError &&
				(msg as any).editDiffData &&
				(typeof (msg as any).editDiffData.oldContent === 'string' ||
					Array.isArray((msg as any).editDiffData.batchResults))
			) {
				editDiffData = (msg as any).editDiffData;
				toolArgs = {...toolArgs, ...(msg as any).editDiffData};
			}

			// Extract edit diff data
			if (
				(toolName === 'filesystem-edit' ||
					toolName === 'filesystem-replaceedit') &&
				!isError
			) {
				try {
					const resultData = JSON.parse(msg.content);
					// Handle single file edit
					if (resultData.oldContent && resultData.newContent) {
						editDiffData = {
							oldContent: resultData.oldContent,
							newContent: resultData.newContent,
							filename: resultData.filePath || toolArgs['filePath'],
							completeOldContent: resultData.completeOldContent,
							completeNewContent: resultData.completeNewContent,
							contextStartLine: resultData.contextStartLine,
						};
						toolArgs['oldContent'] = resultData.oldContent;
						toolArgs['newContent'] = resultData.newContent;
						toolArgs['filename'] =
							resultData.filePath || toolArgs['filePath'];
						toolArgs['completeOldContent'] =
							resultData.completeOldContent;
						toolArgs['completeNewContent'] =
							resultData.completeNewContent;
						toolArgs['contextStartLine'] = resultData.contextStartLine;
					}
					// Handle batch edit
					else if (resultData.results && Array.isArray(resultData.results)) {
						editDiffData = {
							batchResults: resultData.results,
							isBatch: true,
						};
						toolArgs['batchResults'] = resultData.results;
						toolArgs['isBatch'] = true;
					}
				} catch {
					// Ignore parse errors
				}
			}

			// Extract terminal result data
			if (toolName === 'terminal-execute' && !isError) {
				try {
					const resultData = JSON.parse(msg.content);
					if (
						resultData.stdout !== undefined ||
						resultData.stderr !== undefined
					) {
						terminalResultData = {
							stdout: resultData.stdout,
							stderr: resultData.stderr,
							exitCode: resultData.exitCode,
							command: toolArgs['command'],
						};
					}
				} catch {
					// Ignore parse errors
				}
			}

			const parallelGroupId = toolMeta?.parallelGroupId;
			const isNonTimeConsuming =
				!(toolMeta?.isTimeConsuming ?? isToolNeedTwoStepDisplay(toolName));
			const toolResultView = buildToolResultView({
				toolName,
				content: msg.content,
				historyContent: msg.historyContent,
				previewContent: msg.previewContent,
				isError,
			});

			uiMessages.push({
				role: 'assistant',
				content: '',
				streaming: false,
				toolName: toolResultView.toolName,
				toolCallId: msg.tool_call_id,
				toolResult: !isError ? msg.content : undefined,
				toolResultPreview: !isError ? toolResultView.previewContent : undefined,
				toolCall:
					editDiffData || terminalResultData
						? {
								name: toolName,
								arguments: toolArgs,
						  }
						: undefined,
				terminalResult: terminalResultData,
				messageStatus: status,
				// Add toolDisplay for non-time-consuming tools
				toolDisplay:
					isNonTimeConsuming && !editDiffData
						? formatToolCallMessage({
								id: msg.tool_call_id || '',
								type: 'function' as const,
								function: {
									name: toolName,
									arguments: JSON.stringify(toolArgs),
								},
						  })
						: undefined,
				toolStatusDetail: buildToolLifecycleSideband({
					toolName: toolResultView.toolName,
					messageStatus: status,
					detail: statusText,
				}),
				// Mark parallel group for non-time-consuming tools
				parallelGroup:
					isNonTimeConsuming && parallelGroupId ? parallelGroupId : undefined,
			});
			continue;
		}

		// Handle regular user and assistant messages
		if (msg.role === 'user' || msg.role === 'assistant') {
			uiMessages.push({
				role: msg.role,
				content: msg.content,
				streaming: false,
				images: msg.images,
				thinking: extractThinkingFromMessage(msg),
				editorContext: msg.role === 'user' ? msg.editorContext : undefined,
			});
			continue;
		}
	}

	return uiMessages;
}
