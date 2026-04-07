import type {ChatMessage} from '../../../api/chat.js';
import type {VcpOutboundTransform} from './types.js';

const RECENT_RAW_ASSISTANT_TOOL_MESSAGES = 6;
const MAX_PROJECTED_LINES = 18;
const MAX_PROJECTED_CHARS = 1400;

function stripAnsiCodes(text: string): string {
	return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function stripLegacyProtocolMarkers(text: string): string {
	return text
		.replace(/\[系统邀请指令:[^\]]*\]/g, '')
		.replace(/\[\[(?:SYSTEM|PROMPT|TOOL|DISPLAY)[^\]]*\]\]/gi, '')
		.replace(/<\/?(?:think|thinking|analysis|tool_result|assistant_response)>/gi, '')
		.replace(/^\s*(?:tool_name|tool_call_id|parallel_group)\s*:\s*.+$/gim, '');
}

function stripHtmlShell(text: string): string {
	return text.replace(/<\/?[A-Za-z][^>\n]{0,200}>/g, ' ');
}

function normalizeWhitespace(text: string): string {
	return text
		.replace(/\r\n?/g, '\n')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.replace(/[ \t]{2,}/g, ' ')
		.trim();
}

export function sanitizeOutboundProjectionText(text: string): string {
	return normalizeWhitespace(
		stripHtmlShell(stripLegacyProtocolMarkers(stripAnsiCodes(String(text || '')))),
	);
}

export function projectOutboundMessageContent(text: string): string {
	const sanitizedText = sanitizeOutboundProjectionText(text);
	if (!sanitizedText) {
		return sanitizedText;
	}

	const lines = sanitizedText.split('\n').filter(Boolean);
	const clippedByLines = lines.slice(0, MAX_PROJECTED_LINES).join('\n');
	if (
		lines.length <= MAX_PROJECTED_LINES &&
		clippedByLines.length <= MAX_PROJECTED_CHARS
	) {
		return clippedByLines;
	}

	const truncatedText = clippedByLines.slice(0, MAX_PROJECTED_CHARS).trimEnd();
	const omittedLineCount = Math.max(0, lines.length - MAX_PROJECTED_LINES);
	const omittedCharCount = Math.max(0, sanitizedText.length - truncatedText.length);

	return [
		truncatedText,
		`[projected older context omitted: ${omittedLineCount} line(s), ${omittedCharCount} char(s)]`,
	]
		.filter(Boolean)
		.join('\n');
}

function shouldProjectMessage(
	message: ChatMessage,
	index: number,
	recentRawIndexes: Set<number>,
): boolean {
	if (recentRawIndexes.has(index)) {
		return false;
	}

	return message.role === 'assistant' || message.role === 'tool';
}

function resolveProjectionSource(message: ChatMessage): string {
	if (
		message.role === 'tool' &&
		typeof message.historyContent === 'string' &&
		message.historyContent.trim()
	) {
		return message.historyContent;
	}

	return message.content;
}

export function applyOutboundProjectionBridge(
	messages: ChatMessage[],
): ChatMessage[] {
	const assistantToolIndexes = messages.reduce<number[]>((indexes, message, index) => {
		if (message.role === 'assistant' || message.role === 'tool') {
			indexes.push(index);
		}

		return indexes;
	}, []);
	if (assistantToolIndexes.length <= RECENT_RAW_ASSISTANT_TOOL_MESSAGES) {
		return messages;
	}

	const recentRawIndexes = new Set(
		assistantToolIndexes.slice(-RECENT_RAW_ASSISTANT_TOOL_MESSAGES),
	);
	let changed = false;
	const transformedMessages = messages.map((message, index) => {
		if (!shouldProjectMessage(message, index, recentRawIndexes)) {
			return message;
		}

		const projectedContent = projectOutboundMessageContent(
			resolveProjectionSource(message),
		);
		if (!projectedContent || projectedContent === message.content) {
			return message;
		}

		changed = true;
		return {
			...message,
			content: projectedContent,
			...(message.role === 'tool' ? {historyContent: projectedContent} : {}),
		};
	});

	return changed ? transformedMessages : messages;
}

export const vcpOutboundProjectionTransform: VcpOutboundTransform = {
	shouldApply({config, messages, allowProjectionBridge = true}) {
		return (
			allowProjectionBridge &&
			config.backendMode === 'vcp' &&
			config.requestMethod === 'chat' &&
			messages.length > RECENT_RAW_ASSISTANT_TOOL_MESSAGES
		);
	},
	apply({messages}) {
		return applyOutboundProjectionBridge(messages);
	},
};
