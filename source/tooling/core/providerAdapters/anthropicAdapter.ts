import type {ChatCompletionTool, ChatMessage, ImageContent} from '../../../api/types.js';
import {parseToolCallArguments} from './shared.js';

export interface AnthropicTool {
	name: string;
	description: string;
	input_schema: any;
	cache_control?: {type: 'ephemeral'; ttl?: '5m' | '1h'};
}

export function adaptToolsToAnthropic(
	tools?: ChatCompletionTool[],
): AnthropicTool[] | undefined {
	if (!tools || tools.length === 0) {
		return undefined;
	}

	return tools
		.filter(tool => tool.type === 'function' && 'function' in tool)
		.map(tool => ({
			name: tool.function.name,
			description: tool.function.description || '',
			input_schema: tool.function.parameters as any,
		}));
}

export function toAnthropicImageSource(image: ImageContent):
	| {type: 'base64'; media_type: string; data: string}
	| {type: 'url'; url: string}
	| null {
	const data = image.data?.trim() || '';
	if (!data) {
		return null;
	}

	if (/^https?:\/\//i.test(data)) {
		return {
			type: 'url',
			url: data,
		};
	}

	const dataUrlMatch = data.match(/^data:([^;]+);base64,(.+)$/);
	if (dataUrlMatch) {
		return {
			type: 'base64',
			media_type: dataUrlMatch[1] || image.mimeType || 'image/png',
			data: dataUrlMatch[2] || '',
		};
	}

	return {
		type: 'base64',
		media_type: image.mimeType?.trim() || 'image/png',
		data,
	};
}

export function buildAnthropicToolUseBlocks(
	message: Pick<ChatMessage, 'tool_calls'>,
): any[] {
	if (!message.tool_calls || message.tool_calls.length === 0) {
		return [];
	}

	return message.tool_calls.map(toolCall => ({
		type: 'tool_use',
		id: toolCall.id,
		name: toolCall.function.name,
		input: parseToolCallArguments(
			toolCall.function.name,
			toolCall.function.arguments,
		),
	}));
}

export function buildAnthropicToolResultBlock(
	message: Pick<ChatMessage, 'content' | 'images' | 'tool_call_id'>,
): {type: 'tool_result'; tool_use_id: string; content: string | any[]} {
	const content =
		message.images && message.images.length > 0
			? buildAnthropicToolResultContent(message.content, message.images)
			: message.content;

	return {
		type: 'tool_result',
		tool_use_id: message.tool_call_id || '',
		content,
	};
}

function buildAnthropicToolResultContent(
	textContent: string,
	images: ImageContent[],
): any[] {
	const content: any[] = [];
	if (textContent) {
		content.push({
			type: 'text',
			text: textContent,
		});
	}

	for (const image of images) {
		const imageSource = toAnthropicImageSource(image);
		if (!imageSource) {
			continue;
		}

		content.push({
			type: 'image',
			source:
				imageSource.type === 'url'
					? {
							type: 'url',
							url: imageSource.url,
					  }
					: imageSource,
		});
	}

	return content;
}
