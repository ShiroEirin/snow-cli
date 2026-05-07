import type {ChatCompletionTool, ChatMessage} from '../../../api/types.js';
import {buildToolCallNameMap} from './shared.js';

export type OpenAIContentPart = {
	type: 'text' | 'image_url';
	text?: string;
	image_url?: {url: string};
};

export function adaptToolsToOpenAI(
	tools?: ChatCompletionTool[],
): ChatCompletionTool[] | undefined {
	return tools;
}

export function buildOpenAIToolMessageNameMap(
	messages: ChatMessage[],
): Map<string, string> {
	return buildToolCallNameMap(messages);
}

export function resolveOpenAIToolMessageName(
	message: Pick<ChatMessage, 'name' | 'tool_call_id'>,
	toolCallNameMap?: Map<string, string>,
): string | undefined {
	if (message.name) {
		return message.name;
	}

	if (!message.tool_call_id) {
		return undefined;
	}

	return toolCallNameMap?.get(message.tool_call_id);
}

export function buildOpenAIToolResultContent(
	message: Pick<ChatMessage, 'content' | 'images'>,
): string | OpenAIContentPart[] {
	if (!message.images || message.images.length === 0) {
		return message.content;
	}

	const content: OpenAIContentPart[] = [];
	if (message.content) {
		content.push({
			type: 'text',
			text: message.content,
		});
	}

	for (const image of message.images) {
		const imageUrl =
			/^data:/i.test(image.data) || /^https?:\/\//i.test(image.data)
				? image.data
				: `data:${image.mimeType};base64,${image.data}`;
		content.push({
			type: 'image_url',
			image_url: {
				url: imageUrl,
			},
		});
	}

	return content;
}
