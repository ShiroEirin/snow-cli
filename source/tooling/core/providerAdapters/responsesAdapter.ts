import {parseJsonWithFix} from '../../../utils/core/retryUtils.js';
import type {ChatCompletionTool, ChatMessage, ImageContent} from '../../../api/types.js';

export function ensureResponsesStrictSchema(
	schema?: Record<string, any>,
): Record<string, any> | undefined {
	if (!schema) {
		return undefined;
	}

	const stringified = JSON.stringify(schema);
	const parseResult = parseJsonWithFix(stringified, {
		toolName: 'Schema deep copy',
		fallbackValue: schema,
		logWarning: true,
		logError: true,
	});
	const strictSchema = parseResult.data as Record<string, any>;

	if (strictSchema?.['type'] === 'object') {
		strictSchema['additionalProperties'] = false;

		if (strictSchema['properties']) {
			for (const key of Object.keys(strictSchema['properties'])) {
				const propertySchema = strictSchema['properties'][key];
				if (
					propertySchema['type'] === 'object' ||
					(Array.isArray(propertySchema['type']) &&
						propertySchema['type'].includes('object'))
				) {
					if (!('additionalProperties' in propertySchema)) {
						propertySchema['additionalProperties'] = false;
					}
				}
			}
		}

		if (
			strictSchema['properties'] &&
			Object.keys(strictSchema['properties']).length === 0 &&
			strictSchema['required']
		) {
			delete strictSchema['required'];
		}
	}

	return strictSchema;
}

export function adaptToolsToResponses(tools?: ChatCompletionTool[]):
	| Array<{
			type: 'function';
			name: string;
			description?: string;
			strict?: boolean;
			parameters?: Record<string, any>;
	  }>
	| undefined {
	if (!tools || tools.length === 0) {
		return undefined;
	}

	return tools.map(tool => ({
		type: 'function',
		name: tool.function.name,
		description: tool.function.description,
		strict: false,
		parameters: ensureResponsesStrictSchema(tool.function.parameters),
	}));
}

export function toResponsesImageUrl(image: ImageContent): string {
	const data = image.data?.trim() || '';
	if (!data) {
		return '';
	}

	if (/^https?:\/\//i.test(data) || /^data:/i.test(data)) {
		return data;
	}

	const mimeType = image.mimeType?.trim() || 'image/png';
	return `data:${mimeType};base64,${data}`;
}

export function buildResponsesAssistantToolCallItems(
	message: Pick<ChatMessage, 'tool_calls'>,
): Array<{
	type: 'function_call';
	name: string;
	arguments: string;
	call_id: string;
}> {
	if (!message.tool_calls || message.tool_calls.length === 0) {
		return [];
	}

	return message.tool_calls.map(toolCall => ({
		type: 'function_call',
		name: toolCall.function.name,
		arguments: toolCall.function.arguments,
		call_id: toolCall.id,
	}));
}

export function buildResponsesToolResultItem(
	message: Pick<ChatMessage, 'content' | 'images' | 'tool_call_id'>,
):
	| {type: 'function_call_output'; call_id: string; output: string}
	| {type: 'function_call_output'; call_id: string; output: any[]} {
	if (message.images && message.images.length > 0) {
		return {
			type: 'function_call_output',
			call_id: message.tool_call_id || '',
			output: buildResponsesToolResultContent(message.content, message.images),
		};
	}

	return {
		type: 'function_call_output',
		call_id: message.tool_call_id || '',
		output: message.content,
	};
}

function buildResponsesToolResultContent(
	textContent: string,
	images: ImageContent[],
): any[] {
	const output: any[] = [];
	if (textContent) {
		output.push({
			type: 'input_text',
			text: textContent,
		});
	}

	for (const image of images) {
		output.push({
			type: 'input_image',
			image_url: toResponsesImageUrl(image),
		});
	}

	return output;
}
