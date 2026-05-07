import {parseJsonWithFix} from '../../../utils/core/retryUtils.js';
import type {ChatMessage} from '../../../api/types.js';

export function buildToolCallNameMap(messages: ChatMessage[]): Map<string, string> {
	const toolCallNameMap = new Map<string, string>();

	for (const message of messages) {
		if (message.role !== 'assistant' || !message.tool_calls) {
			continue;
		}

		for (const toolCall of message.tool_calls) {
			if (!toolCall?.id || !toolCall.function?.name) {
				continue;
			}

			toolCallNameMap.set(toolCall.id, toolCall.function.name);
		}
	}

	return toolCallNameMap;
}

export function parseToolCallArguments(
	toolName: string,
	argumentsText: string,
): unknown {
	const trimmedArguments = argumentsText?.trim() || '';
	if (!trimmedArguments) {
		return {};
	}

	const parseResult = parseJsonWithFix(trimmedArguments, {
		toolName,
		fallbackValue: {},
		logWarning: false,
		logError: false,
	});

	return parseResult.data;
}
