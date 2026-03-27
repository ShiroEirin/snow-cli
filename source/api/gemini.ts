import {
	getOpenAiConfig,
	getCustomSystemPromptForConfig,
	getCustomHeadersForConfig,
} from '../utils/config/apiConfig.js';
import {getSystemPromptForMode} from '../prompt/systemPrompt.js';
import {
	withRetryGenerator,
	parseJsonWithFix,
} from '../utils/core/retryUtils.js';
import {
	createIdleTimeoutGuard,
	StreamIdleTimeoutError,
} from '../utils/core/streamGuards.js';
import type {ChatMessage, ChatCompletionTool, UsageInfo} from './types.js';
import {addProxyToFetchOptions} from '../utils/core/proxyUtils.js';
import {saveUsageToFile} from '../utils/core/usageLogger.js';
import {getVersionHeader} from '../utils/core/version.js';
import {
	adaptToolsToGemini,
	buildGeminiAssistantParts,
	buildGeminiStreamToolCall,
	buildGeminiToolMessageNameMap,
	buildGeminiToolResponseParts,
	toGeminiImagePart,
} from '../tooling/core/providerAdapters/geminiAdapter.js';

export interface GeminiOptions {
	model: string;
	messages: ChatMessage[];
	temperature?: number;
	tools?: ChatCompletionTool[];
	includeBuiltinSystemPrompt?: boolean; // 控制是否添加内置系统提示词（默认 true）
	disableThinking?: boolean; // 禁用思考功能（用于 agents 等场景，默认 false）
	planMode?: boolean; // 启用 Plan 模式（使用 Plan 模式系统提示词）
	vulnerabilityHuntingMode?: boolean; // 启用漏洞狩猎模式（使用漏洞狩猎模式系统提示词）
	toolSearchDisabled?: boolean; // 工具搜索已关闭（全量加载工具）
	// Sub-agent configuration overrides
	configProfile?: string; // 子代理配置文件名（覆盖模型等设置）
	customSystemPromptId?: string; // 自定义系统提示词 ID
	customHeaders?: Record<string, string>; // 自定义请求头
}

export interface GeminiStreamChunk {
	type:
		| 'content'
		| 'tool_calls'
		| 'tool_call_delta'
		| 'done'
		| 'usage'
		| 'reasoning_started'
		| 'reasoning_delta';
	content?: string;
	tool_calls?: Array<{
		id: string;
		type: 'function';
		function: {
			name: string;
			arguments: string;
		};
	}>;
	delta?: string;
	usage?: UsageInfo;
	thinking?: {
		type: 'thinking';
		thinking: string;
	};
}

// Deprecated: No longer used, kept for backward compatibility
// @ts-ignore - Variable kept for backward compatibility with resetGeminiClient export
let geminiConfig: {
	apiKey: string;
	baseUrl: string;
	customHeaders: Record<string, string>;
	geminiThinking?: {
		enabled: boolean;
		budget: number;
	};
} | null = null;
// Deprecated: Client reset is no longer needed with new config loading approach
export function resetGeminiClient(): void {
	geminiConfig = null;
}

/**
 * Convert our ChatMessage format to Gemini's format
 * @param messages - The messages to convert
 * @param includeBuiltinSystemPrompt - Whether to include builtin system prompt (default true)
 */
function convertToGeminiMessages(
	messages: ChatMessage[],
	includeBuiltinSystemPrompt: boolean = true,
	customSystemPromptOverride?: string[], // Allow override for sub-agents
	planMode: boolean = false, // When true, use Plan mode system prompt
	vulnerabilityHuntingMode: boolean = false, // When true, use Vulnerability Hunting mode system prompt
	toolSearchDisabled: boolean = false,
): {
	systemInstruction?: string[];
	contents: any[];
} {
	const customSystemPrompts = customSystemPromptOverride;
	let systemInstruction: string[] | undefined;
	const contents: any[] = [];
	const toolCallNameMap = buildGeminiToolMessageNameMap(messages);

	// Build tool_call_id to function_name mapping for parallel calls
	for (let i = 0; i < messages.length; i++) {
		const msg = messages[i];
		if (!msg) continue;

		// Extract system message as systemInstruction
		if (msg.role === 'system') {
			systemInstruction = [msg.content];
			continue;
		}

		// Handle tool calls in assistant messages - build mapping first
		if (
			msg.role === 'assistant' &&
			msg.tool_calls &&
			msg.tool_calls.length > 0
		) {
			contents.push({
				role: 'model',
				parts: buildGeminiAssistantParts(msg),
			});
			continue;
		}

		// Handle tool results - collect consecutive tool messages
		if (msg.role === 'tool') {
			// Collect all consecutive tool messages starting from current position
			const toolResponses: Array<
				Pick<ChatMessage, 'tool_call_id' | 'content' | 'images'>
			> = [];

			let j = i;
			while (j < messages.length && messages[j]?.role === 'tool') {
				const toolMsg = messages[j];
				if (toolMsg) {
					toolResponses.push({
						tool_call_id: toolMsg.tool_call_id || '',
						content: toolMsg.content || '',
						images: toolMsg.images,
					});
				}
				j++;
			}

			// Update loop index to skip processed tool messages
			i = j - 1;

			// Push single user message with all function responses
			contents.push({
				role: 'user',
				parts: buildGeminiToolResponseParts(toolResponses, toolCallNameMap),
			});
			continue;
		}

		// Build message parts for regular user/assistant messages
		const parts: any[] = [];

		// Add text content
		if (msg.content) {
			parts.push({text: msg.content});
		}

		// Add images for user messages
		if (msg.role === 'user' && msg.images && msg.images.length > 0) {
			for (const image of msg.images) {
				const imagePart = toGeminiImagePart(image);
				if (imagePart) {
					parts.push(imagePart);
				}
			}
		}

		// Add to contents
		const role = msg.role === 'assistant' ? 'model' : 'user';
		contents.push({role, parts});
	}

	// Handle system instruction
	// 如果配置了自定义系统提示词（最高优先级，始终添加）
	if (customSystemPrompts && customSystemPrompts.length > 0) {
		systemInstruction = customSystemPrompts;
		if (includeBuiltinSystemPrompt) {
			// Prepend default system prompt as first user message
			contents.unshift({
				role: 'user',
				parts: [
					{
						text: getSystemPromptForMode(
							planMode,
							vulnerabilityHuntingMode,
							toolSearchDisabled,
						),
					},
				],
			});
		}
	} else if (!systemInstruction && includeBuiltinSystemPrompt) {
		// 没有自定义系统提示词，但需要添加默认系统提示词
		systemInstruction = [
			getSystemPromptForMode(
				planMode,
				vulnerabilityHuntingMode,
				toolSearchDisabled,
			),
		];
	}

	return {systemInstruction, contents};
}

/**
 * Create streaming chat completion using Gemini API
 */
export async function* createStreamingGeminiCompletion(
	options: GeminiOptions,
	abortSignal?: AbortSignal,
	onRetry?: (error: Error, attempt: number, nextDelay: number) => void,
): AsyncGenerator<GeminiStreamChunk, void, unknown> {
	// Load configuration: if configProfile is specified, load it; otherwise use main config
	let config: ReturnType<typeof getOpenAiConfig>;
	if (options.configProfile) {
		try {
			const {loadProfile} = await import('../utils/config/configManager.js');
			const profileConfig = loadProfile(options.configProfile);
			if (profileConfig?.snowcfg) {
				config = profileConfig.snowcfg;
			} else {
				// Profile not found, fallback to main config
				config = getOpenAiConfig();
				const {logger} = await import('../utils/core/logger.js');
				logger.warn(
					`Profile ${options.configProfile} not found, using main config`,
				);
			}
		} catch (error) {
			// If loading profile fails, fallback to main config
			config = getOpenAiConfig();
			const {logger} = await import('../utils/core/logger.js');
			logger.warn(
				`Failed to load profile ${options.configProfile}, using main config:`,
				error,
			);
		}
	} else {
		// No configProfile specified, use main config
		config = getOpenAiConfig();
	}

	// Get system prompt (with custom override support)
	let customSystemPromptContent: string[] | undefined;
	if (options.customSystemPromptId) {
		const {getSystemPromptConfig} = await import(
			'../utils/config/apiConfig.js'
		);
		const systemPromptConfig = getSystemPromptConfig();
		const customPrompt = systemPromptConfig?.prompts.find(
			p => p.id === options.customSystemPromptId,
		);
		if (customPrompt?.content) {
			customSystemPromptContent = [customPrompt.content];
		}
	}

	// 如果没有显式的 customSystemPromptId，则按当前配置（含 profile 覆盖）解析
	customSystemPromptContent ||= getCustomSystemPromptForConfig(config);

	// 使用重试包装生成器
	yield* withRetryGenerator(
		async function* () {
			const {systemInstruction, contents} = convertToGeminiMessages(
				options.messages,
				options.includeBuiltinSystemPrompt !== false, // 默认为 true
				customSystemPromptContent, // 传递自定义系统提示词
				options.planMode || false, // Pass planMode to use correct system prompt
				options.vulnerabilityHuntingMode || false,
				options.toolSearchDisabled || false,
			);

			// Build request payload
			const requestBody: any = {
				contents,
				systemInstruction: systemInstruction
					? {parts: systemInstruction.map(text => ({text}))}
					: undefined,
			};

			// Add thinking configuration if enabled and not disabled
			// Only include generationConfig when thinking is enabled
			if (config.geminiThinking?.enabled && !options.disableThinking) {
				requestBody.generationConfig = {
					thinkingConfig: {
						thinkingBudget: config.geminiThinking.budget,
					},
				};
			}

			// Add tools if provided
			const geminiTools = adaptToolsToGemini(options.tools);
			if (geminiTools) {
				requestBody.tools = geminiTools;
			}

			// Extract model name from options.model (e.g., "gemini-pro" or "models/gemini-pro")
			const effectiveModel = options.model || config.advancedModel || '';
			const modelName = effectiveModel.startsWith('models/')
				? effectiveModel
				: `models/${effectiveModel}`;

			// Use configured baseUrl or default Gemini URL
			const baseUrl =
				config.baseUrl && config.baseUrl !== 'https://api.openai.com/v1'
					? config.baseUrl
					: 'https://generativelanguage.googleapis.com/v1beta';

			const urlObj = new URL(`${baseUrl}/${modelName}:streamGenerateContent`);
			urlObj.searchParams.set('alt', 'sse');
			const url = urlObj.toString();

			// Use custom headers from options if provided, otherwise get from current config (supports profile override)
			const customHeaders =
				options.customHeaders || getCustomHeadersForConfig(config);

			const fetchOptions = addProxyToFetchOptions(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${config.apiKey}`,
					'x-goog-api-key': config.apiKey,
					'x-snow': getVersionHeader(),
					...customHeaders,
				},
				body: JSON.stringify(requestBody),
				signal: abortSignal,
			});

			let response: Response;
			try {
				response = await fetch(url, fetchOptions);
			} catch (error) {
				// 捕获 fetch 底层错误（网络错误、连接超时等）
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				throw new Error(
					`Gemini API fetch failed: ${errorMessage}\n` +
						`URL: ${url}\n` +
						`Model: ${effectiveModel}\n` +
						`Error type: ${
							error instanceof TypeError
								? 'Network/Connection Error'
								: 'Unknown Error'
						}\n` +
						`Possible causes: Network unavailable, DNS resolution failed, proxy issues, or server unreachable`,
				);
			}

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`,
				);
			}

			if (!response.body) {
				throw new Error('No response body from Gemini API');
			}

			let contentBuffer = '';
			let thinkingTextBuffer = ''; // Accumulate thinking text content
			let sharedThoughtSignature: string | undefined; // Store first thoughtSignature for reuse
			let toolCallsBuffer: Array<{
				id: string;
				type: 'function';
				function: {
					name: string;
					arguments: string;
				};
				thoughtSignature?: string; // For Gemini thinking mode
			}> = [];
			let hasToolCalls = false;
			let toolCallIndex = 0;
			let totalTokens = {prompt: 0, completion: 0, total: 0};

			// Parse SSE stream
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			const idleTimeoutMs = (config.streamIdleTimeoutSec ?? 180) * 1000;
			// 创建空闲超时保护器
			const guard = createIdleTimeoutGuard({
				reader,
				idleTimeoutMs,
				onTimeout: () => {
					throw new StreamIdleTimeoutError(
						`No data received for ${idleTimeoutMs}ms`,
						idleTimeoutMs,
					);
				},
			});

			try {
				while (true) {
					if (abortSignal?.aborted) {
						guard.abandon();
						return;
					}

					const {done, value} = await reader.read();

					// 检查是否有超时错误需要在读取循环中抛出(确保被正确的 try/catch 捕获)
					const timeoutError = guard.getTimeoutError();
					if (timeoutError) {
						throw timeoutError;
					}

					// 检查是否已被丢弃(竞态条件防护)
					if (guard.isAbandoned()) {
						continue;
					}

					if (done) {
						// 连接异常中断时,残留半包不应被静默丢弃,应抛出可重试错误
						if (buffer.trim()) {
							// 连接异常中断,抛出明确错误
							const errorMsg = `[API_ERROR] [RETRIABLE] Gemini stream terminated unexpectedly with incomplete data`;
							const bufferPreview = buffer.substring(0, 100);
							throw new Error(`${errorMsg}: ${bufferPreview}...`);
						}
						break; // 正常结束
					}

					buffer += decoder.decode(value, {stream: true});
					const lines = buffer.split('\n');
					buffer = lines.pop() || '';

					for (const line of lines) {
						const trimmed = line.trim();
						if (!trimmed || trimmed.startsWith(':')) continue;

						if (trimmed === 'data: [DONE]' || trimmed === 'data:[DONE]') {
							break;
						}

						// 处理 "event: " 和 "event:" 两种格式
						if (trimmed.startsWith('event:')) {
							// 事件类型,后面会跟随数据
							continue;
						}

						// 处理 "data: " 和 "data:" 两种格式
						if (trimmed.startsWith('data:')) {
							const data = trimmed.startsWith('data: ')
								? trimmed.slice(6)
								: trimmed.slice(5);
							const parseResult = parseJsonWithFix(data, {
								toolName: 'Gemini SSE stream',
								logWarning: false,
								logError: true,
							});

							if (parseResult.success) {
								const chunk = parseResult.data;
								const hasBusinessDelta = !!chunk?.candidates?.some(
									(candidate: any) =>
										candidate?.content?.parts?.some((part: any) =>
											Boolean(part?.text || part?.functionCall),
										),
								);
								if (hasBusinessDelta) {
									guard.touch();
								}

								// Process candidates
								if (chunk.candidates && chunk.candidates.length > 0) {
									const candidate = chunk.candidates[0];
									if (candidate.content && candidate.content.parts) {
										for (const part of candidate.content.parts) {
											// Process thought content (Gemini thinking)
											// When part.thought === true, the text field contains thinking content
											if (part.thought === true && part.text) {
												thinkingTextBuffer += part.text;
												if (!guard.isAbandoned()) {
													yield {
														type: 'reasoning_delta',
														delta: part.text,
													};
												}
											}
											// Process regular text content (when thought is not true)
											else if (part.text) {
												contentBuffer += part.text;
												if (!guard.isAbandoned()) {
													yield {
														type: 'content',
														content: part.text,
													};
												}
											}

											// Process function calls
											if (part.functionCall) {
												hasToolCalls = true;
												const fc = part.functionCall;

												const builtToolCall = buildGeminiStreamToolCall(
													part,
													toolCallIndex++,
													sharedThoughtSignature,
												);
												sharedThoughtSignature =
													builtToolCall.sharedThoughtSignature;
												const toolCall = builtToolCall.toolCall;
												toolCallsBuffer.push(toolCall);

												// Yield delta for token counting
												const deltaText =
													fc.name + JSON.stringify(fc.args || {});
												yield {
													type: 'tool_call_delta',
													delta: deltaText,
												};
											}
										}
									}
								}

								// Track usage info
								if (chunk.usageMetadata) {
									totalTokens = {
										prompt: chunk.usageMetadata.promptTokenCount || 0,
										completion: chunk.usageMetadata.candidatesTokenCount || 0,
										total: chunk.usageMetadata.totalTokenCount || 0,
									};
								}
							}
						}
					}
				}
			} catch (error) {
				const {logger} = await import('../utils/core/logger.js');
				logger.error('Gemini SSE stream parsing error:', {
					error: error instanceof Error ? error.message : 'Unknown error',
					remainingBuffer: buffer.substring(0, 200),
				});
				throw error;
			} finally {
				guard.dispose();
			}

			// Yield tool calls if any
			if (hasToolCalls && toolCallsBuffer.length > 0) {
				yield {
					type: 'tool_calls',
					tool_calls: toolCallsBuffer,
				};
			}

			// Yield usage info
			if (totalTokens.total > 0) {
				const usageData = {
					prompt_tokens: totalTokens.prompt,
					completion_tokens: totalTokens.completion,
					total_tokens: totalTokens.total,
				};

				// Save usage to file system at API layer
				saveUsageToFile(options.model, usageData);

				yield {
					type: 'usage',
					usage: usageData,
				};
			}

			// Return complete thinking block if thinking content exists
			const thinkingBlock = thinkingTextBuffer
				? {
						type: 'thinking' as const,
						thinking: thinkingTextBuffer,
				  }
				: undefined;

			// Signal completion
			yield {
				type: 'done',
				thinking: thinkingBlock,
			};
		},
		{
			abortSignal,
			onRetry,
		},
	);
}
