import {parseJsonWithFix} from '../../../utils/core/retryUtils.js';
import type {
	ChatCompletionTool,
	ChatMessage,
	ImageContent,
	ToolCall,
} from '../../../api/types.js';
import {buildToolCallNameMap, parseToolCallArguments} from './shared.js';

export interface GeminiToolDeclaration {
	name: string;
	description: string;
	parametersJsonSchema: {
		type: 'object';
		properties: Record<string, unknown>;
		required: string[];
	};
}

export interface GeminiToolBundle {
	functionDeclarations: GeminiToolDeclaration[];
}

export type GeminiImagePart =
	| {inlineData: {mimeType: string; data: string}}
	| {fileData: {mimeType: string; fileUri: string}};

export type GeminiFunctionCallPart = {
	functionCall: {
		name: string;
		args: unknown;
	};
	thoughtSignature?: string;
};

export type GeminiFunctionResponsePart = {
	functionResponse: {
		name: string;
		response: Record<string, unknown>;
	};
};

export function adaptToolsToGemini(
	tools?: ChatCompletionTool[],
): GeminiToolBundle[] | undefined {
	if (!tools || tools.length === 0) {
		return undefined;
	}

	const functionDeclarations = tools
		.filter(tool => tool.type === 'function' && 'function' in tool)
		.map(tool => {
			const parameters = tool.function.parameters as
				| {
						properties?: Record<string, unknown>;
						required?: string[];
				  }
				| undefined;

			return {
				name: tool.function.name,
				description: tool.function.description || '',
				parametersJsonSchema: {
					type: 'object' as const,
					properties: parameters?.properties || {},
					required: parameters?.required || [],
				},
			};
		});

	return [{functionDeclarations}];
}

export function toGeminiImagePart(image: ImageContent): GeminiImagePart | null {
	const data = image.data?.trim() || '';
	if (!data) {
		return null;
	}

	if (/^https?:\/\//i.test(data)) {
		return {
			fileData: {
				mimeType: image.mimeType?.trim() || 'image/png',
				fileUri: data,
			},
		};
	}

	const dataUrlMatch = data.match(/^data:([^;]+);base64,(.+)$/);
	if (dataUrlMatch) {
		return {
			inlineData: {
				mimeType: dataUrlMatch[1] || image.mimeType || 'image/png',
				data: image.data,
			},
		};
	}

	const mimeType = image.mimeType?.trim() || 'image/png';
	return {
		inlineData: {
			mimeType,
			data: `data:${mimeType};base64,${data}`,
		},
	};
}

export function buildGeminiToolMessageNameMap(
	messages: ChatMessage[],
): Map<string, string> {
	return buildToolCallNameMap(messages);
}

export function buildGeminiAssistantParts(
	message: Pick<ChatMessage, 'content' | 'thinking' | 'tool_calls'>,
): Array<{text?: string; thought?: boolean} | GeminiFunctionCallPart> {
	const parts: Array<{text?: string; thought?: boolean} | GeminiFunctionCallPart> =
		[];

	if (message.thinking) {
		parts.push({
			thought: true,
			text: message.thinking.thinking,
		});
	}

	if (message.content) {
		parts.push({text: message.content});
	}

	for (const toolCall of message.tool_calls || []) {
		const part: GeminiFunctionCallPart = {
			functionCall: {
				name: toolCall.function.name,
				args: parseToolCallArguments(
					toolCall.function.name,
					toolCall.function.arguments,
				),
			},
		};

		const signature =
			toolCall.thoughtSignature || (toolCall as ToolCall & {thought_signature?: string}).thought_signature;
		if (signature) {
			part.thoughtSignature = signature;
		}

		parts.push(part);
	}

	return parts;
}

export function buildGeminiToolResponseParts(
	messages: Array<Pick<ChatMessage, 'content' | 'images' | 'tool_call_id'>>,
	toolCallNameMap: Map<string, string>,
): Array<GeminiFunctionResponsePart | GeminiImagePart> {
	const parts: Array<GeminiFunctionResponsePart | GeminiImagePart> = [];

	for (const message of messages) {
		const functionName =
			toolCallNameMap.get(message.tool_call_id || '') || 'unknown_function';

		parts.push({
			functionResponse: {
				name: functionName,
				response: buildGeminiToolResponsePayload(message.content),
			},
		});

		for (const image of message.images || []) {
			const imagePart = toGeminiImagePart(image);
			if (imagePart) {
				parts.push(imagePart);
			}
		}
	}

	return parts;
}

export function buildGeminiStreamToolCall(
	part: {
		functionCall: {
			name: string;
			args?: unknown;
		};
		thoughtSignature?: string;
		thought_signature?: string;
	},
	toolCallIndex: number,
	sharedThoughtSignature?: string,
): {
	toolCall: ToolCall & {thoughtSignature?: string};
	sharedThoughtSignature?: string;
} {
	const partSignature = part.thoughtSignature || part.thought_signature;
	const resolvedThoughtSignature = partSignature || sharedThoughtSignature;

	return {
		toolCall: {
			id: `call_${toolCallIndex}`,
			type: 'function',
			function: {
				name: part.functionCall.name,
				arguments: JSON.stringify(part.functionCall.args || {}),
			},
			...(resolvedThoughtSignature
				? {thoughtSignature: resolvedThoughtSignature}
				: {}),
		},
		sharedThoughtSignature: resolvedThoughtSignature,
	};
}

function buildGeminiToolResponsePayload(
	content: string,
): Record<string, unknown> {
	if (!content) {
		return {};
	}

	let contentToParse = content;
	const firstParseResult = parseJsonWithFix(contentToParse, {
		toolName: 'Gemini tool response (first parse)',
		logWarning: false,
		logError: false,
	});

	if (firstParseResult.success && typeof firstParseResult.data === 'string') {
		contentToParse = firstParseResult.data;
	}

	const finalParseResult = parseJsonWithFix(contentToParse, {
		toolName: 'Gemini tool response (final parse)',
		logWarning: false,
		logError: false,
	});

	if (finalParseResult.success) {
		const parsed = finalParseResult.data;
		if (
			typeof parsed === 'object' &&
			parsed !== null &&
			!Array.isArray(parsed)
		) {
			return parsed as Record<string, unknown>;
		}

		return {content: parsed};
	}

	return {content: contentToParse};
}
