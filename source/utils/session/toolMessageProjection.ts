import type {BackendMode, ToolTransport} from '../config/apiConfig.js';

export function buildHistoryToolMessage<
	T extends {
		content: string;
		historyContent?: string;
	},
>(
	result: T,
	messageStatus?: 'pending' | 'success' | 'error',
) {
	return {
		...result,
		...(messageStatus ? {messageStatus} : {}),
	};
}

const MAX_PROJECTED_TOOL_LINES = 18;
const MAX_PROJECTED_TOOL_CHARS = 1400;
const MAX_TOTAL_PROJECTED_TOOL_CHARS = 6000;

function normalizeProjectionWhitespace(text: string): string {
	return text
		.replace(/\r\n?/g, '\n')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.replace(/[ \t]{2,}/g, ' ')
		.trim();
}

function clipProjectedToolContent(
	text: string,
	maxChars: number,
	maxLines: number,
	reason: string,
): string {
	const normalizedText = normalizeProjectionWhitespace(text);
	if (!normalizedText) {
		return normalizedText;
	}

	const lines = normalizedText.split('\n').filter(Boolean);
	let clippedText = lines.slice(0, maxLines).join('\n');
	if (clippedText.length > maxChars) {
		clippedText = clippedText.slice(0, maxChars).trimEnd();
	}

	if (
		lines.length <= maxLines &&
		clippedText.length === normalizedText.length
	) {
		return clippedText;
	}

	return `${clippedText}\n[${reason}]`;
}

function buildDuplicateProjectionNotice(duplicateCount: number): string {
	return duplicateCount > 1
		? `[duplicate tool context omitted ×${duplicateCount}]`
		: '[duplicate tool context omitted]';
}

function buildBudgetProjectionNotice(): string {
	return '[tool context omitted: projection budget exceeded]';
}

function normalizeProjectedToolMessageContent(content: string): string {
	return clipProjectedToolContent(
		content,
		MAX_PROJECTED_TOOL_CHARS,
		MAX_PROJECTED_TOOL_LINES,
		'projected tool context truncated',
	);
}

export function buildConversationToolMessage<
	T extends {
		role: string;
		content: string;
		historyContent?: string;
	},
>(
	result: T,
	messageStatus?: 'pending' | 'success' | 'error',
) {
	return projectToolMessageForContext({
		...result,
		...(messageStatus ? {messageStatus} : {}),
	});
}

export function projectToolMessageForContext<
	T extends {
		role: string;
		content: string;
		historyContent?: string;
	},
>(message: T): T {
	if (message.role !== 'tool') {
		return message;
	}

	const projectionSource = message.historyContent || message.content;
	const projectedContent = normalizeProjectedToolMessageContent(projectionSource);
	if (!projectedContent) {
		return message;
	}

	return {
		...message,
		content: projectedContent,
		...(message.historyContent || projectedContent !== message.content
			? {historyContent: projectedContent}
			: {}),
	};
}

export function projectToolMessagesForContext<
	T extends {
		role: string;
		content: string;
		historyContent?: string;
		tool_call_id?: string;
	},
>(messages: T[]): T[] {
	let remainingBudget = MAX_TOTAL_PROJECTED_TOOL_CHARS;
	const duplicateCounts = new Map<string, number>();

	return messages.map(message => {
		const projectedMessage = projectToolMessageForContext(message);
		if (projectedMessage.role !== 'tool') {
			return projectedMessage;
		}

		const normalizedContent = normalizeProjectionWhitespace(
			projectedMessage.content || '',
		);
		if (!normalizedContent) {
			return projectedMessage;
		}

		const duplicateKey = projectedMessage.tool_call_id
			? `${projectedMessage.tool_call_id}::${normalizedContent}`
			: normalizedContent;
		const duplicateCount = (duplicateCounts.get(duplicateKey) || 0) + 1;
		duplicateCounts.set(duplicateKey, duplicateCount);
		if (duplicateCount > 1) {
			const duplicateNotice = buildDuplicateProjectionNotice(duplicateCount);
			return {
				...projectedMessage,
				content: duplicateNotice,
				historyContent: duplicateNotice,
			};
		}

		if (remainingBudget <= 0) {
			const budgetNotice = buildBudgetProjectionNotice();
			return {
				...projectedMessage,
				content: budgetNotice,
				historyContent: budgetNotice,
			};
		}

		if (normalizedContent.length > remainingBudget) {
			const budgetClippedContent = clipProjectedToolContent(
				normalizedContent,
				remainingBudget,
				MAX_PROJECTED_TOOL_LINES,
				'tool context truncated by projection budget',
			);
			remainingBudget = 0;
			return {
				...projectedMessage,
				content: budgetClippedContent,
				historyContent: budgetClippedContent,
			};
		}

		remainingBudget -= normalizedContent.length;
		return projectedMessage;
	});
}

export function shouldProjectToolContext(config: {
	backendMode?: BackendMode;
	toolTransport?: ToolTransport;
}): boolean {
	return !(config.backendMode === 'vcp' && config.toolTransport === 'local');
}
