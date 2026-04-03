import type {MultimodalContent} from '../../mcp/types/filesystem.types.js';

export interface ToolHistorySummary {
	summary: string;
	status?: string;
	asyncState?: string;
	itemCount?: number;
	topItems?: string[];
	truncated?: boolean;
	rawPayloadRef?: string; // Legacy sessions may still include this field.
}

export interface ToolHistoryArtifacts {
	historyContent: string;
	previewContent?: string;
	historySummary?: ToolHistorySummary;
}

const TOOL_HISTORY_MAX_LINES = 24;
const TOOL_HISTORY_MAX_CHARS = 1600;
const TOOL_HISTORY_MAX_ARRAY_ITEMS = 5;
const TOOL_HISTORY_MAX_DEPTH = 4;
const TOOL_HISTORY_TOP_ITEMS = 3;
const NOTEBOOK_HISTORY_BLOCK_PATTERN =
	/(?:\n\n|\n|^)={20,}\n(?:\p{Extended_Pictographic}\uFE0F?\s*)?CODE NOTEBOOKS \(Latest 10\):\n={20,}\n[\s\S]*$/u;
const TOOL_HISTORY_OMITTED_KEYS = new Set([
	'requestId',
	'invocationId',
	'toolId',
	'originName',
	'details',
	'timestamp',
	'historyContent',
	'previewContent',
	'historySummary',
]);
const PRIMARY_COLLECTION_KEYS = [
	'items',
	'results',
	'files',
	'entries',
	'matches',
	'hits',
	'documents',
	'rows',
	'records',
	'members',
	'data',
	'list',
];

function stripNotebookHistoryBlock(text: string): string {
	return text.replace(NOTEBOOK_HISTORY_BLOCK_PATTERN, '');
}

function trimSummaryText(text: string, maxChars = 220): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (normalized.length <= maxChars) {
		return normalized;
	}
	return `${normalized.slice(0, maxChars - 3).trimEnd()}...`;
}

function summarizeToolHistoryText(text: string): string {
	const normalized = stripNotebookHistoryBlock(text.replace(/\r\n?/g, '\n')).trim();
	if (!normalized) {
		return '';
	}

	const lines = normalized.split('\n');
	let summarized = normalized;

	if (lines.length > TOOL_HISTORY_MAX_LINES) {
		summarized =
			lines.slice(0, TOOL_HISTORY_MAX_LINES).join('\n') +
			`\n...[truncated ${lines.length - TOOL_HISTORY_MAX_LINES} more lines]`;
	}

	if (summarized.length > TOOL_HISTORY_MAX_CHARS) {
		const remainingChars = summarized.length - TOOL_HISTORY_MAX_CHARS;
		summarized =
			summarized.slice(0, TOOL_HISTORY_MAX_CHARS) +
			`...[truncated ${remainingChars} more chars]`;
	}

	return summarized;
}

function tryParseHistorySummary(
	previewContent: string,
): ToolHistorySummary | undefined {
	try {
		const parsed = JSON.parse(previewContent);
		if (
			parsed &&
			typeof parsed === 'object' &&
			typeof parsed.summary === 'string'
		) {
			return parsed as ToolHistorySummary;
		}
	} catch {
		// Ignore non-JSON display previews.
	}

	return undefined;
}

function extractExplicitHistoryArtifacts(
	result: any,
	fallbackTextContent: string,
): ToolHistoryArtifacts | undefined {
	if (!result || typeof result !== 'object' || Array.isArray(result)) {
		return undefined;
	}

	const historyContent =
		typeof (result as Record<string, unknown>)['historyContent'] === 'string'
			? summarizeToolHistoryText(
					String((result as Record<string, unknown>)['historyContent']),
			  )
			: undefined;
	const previewContent =
		typeof (result as Record<string, unknown>)['previewContent'] === 'string'
			? String((result as Record<string, unknown>)['previewContent'])
			: undefined;

	if (!historyContent && !previewContent) {
		return undefined;
	}

	const normalizedHistoryContent =
		historyContent || summarizeToolHistoryText(fallbackTextContent);
	const historySummary = previewContent
		? tryParseHistorySummary(previewContent)
		: undefined;

	return {
		historyContent: normalizedHistoryContent,
		...(previewContent ? {previewContent} : {}),
		...(historySummary ? {historySummary} : {}),
	};
}

function isMultimodalContent(value: any): value is MultimodalContent {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.every(
			(item: any) =>
				item &&
				typeof item === 'object' &&
				(item.type === 'text' || item.type === 'image'),
		)
	);
}

function extractHistoryTextFromContentItems(items: MultimodalContent): string {
	const parts: string[] = [];
	let imageCount = 0;

	for (const item of items) {
		if (item.type === 'text' && item.text) {
			parts.push(item.text);
			continue;
		}

		if (item.type === 'image') {
			imageCount++;
		}
	}

	if (imageCount > 0) {
		parts.push(`[${imageCount} image item${imageCount === 1 ? '' : 's'} omitted]`);
	}

	return summarizeToolHistoryText(parts.join('\n\n'));
}

function summarizeToolHistoryValue(value: any, depth = 0): any {
	if (value === null || value === undefined) {
		return value;
	}

	if (typeof value === 'string') {
		return summarizeToolHistoryText(value);
	}

	if (
		typeof value === 'number' ||
		typeof value === 'boolean' ||
		typeof value === 'bigint'
	) {
		return value;
	}

	if (depth >= TOOL_HISTORY_MAX_DEPTH) {
		if (Array.isArray(value)) {
			return `[Array(${value.length})]`;
		}

		if (typeof value === 'object') {
			return `[Object(${Object.keys(value).length} keys)]`;
		}
	}

	if (Array.isArray(value)) {
		const summarizedItems = value
			.slice(0, TOOL_HISTORY_MAX_ARRAY_ITEMS)
			.map(item => summarizeToolHistoryValue(item, depth + 1));

		if (value.length > TOOL_HISTORY_MAX_ARRAY_ITEMS) {
			summarizedItems.push(
				`[${value.length - TOOL_HISTORY_MAX_ARRAY_ITEMS} more items omitted]`,
			);
		}

		return summarizedItems;
	}

	if (typeof value === 'object') {
		const summarizedObject: Record<string, any> = {};
		const primaryCollection = depth === 0 ? extractPrimaryCollection(value) : undefined;
		const omitTopLevelSummary =
			depth === 0 &&
			Array.isArray(primaryCollection?.items) &&
			primaryCollection.items.length > TOOL_HISTORY_MAX_ARRAY_ITEMS;

		for (const [key, nestedValue] of Object.entries(value)) {
			if (TOOL_HISTORY_OMITTED_KEYS.has(key)) {
				continue;
			}

			if (omitTopLevelSummary && key === 'summary') {
				continue;
			}

			if (key === 'content' && isMultimodalContent(nestedValue)) {
				const flattenedContent = extractHistoryTextFromContentItems(nestedValue);
				if (flattenedContent) {
					summarizedObject[key] = flattenedContent;
				}
				continue;
			}

			if (
				key === 'asyncStatus' &&
				nestedValue &&
				typeof nestedValue === 'object' &&
				!Array.isArray(nestedValue)
			) {
				summarizedObject[key] = {
					enabled: (nestedValue as any).enabled,
					state: (nestedValue as any).state,
					event: (nestedValue as any).event,
				};
				continue;
			}

			const summarizedValue = summarizeToolHistoryValue(nestedValue, depth + 1);
			if (
				summarizedValue === '' ||
				summarizedValue === undefined ||
				(Array.isArray(summarizedValue) && summarizedValue.length === 0)
			) {
				continue;
			}

			summarizedObject[key] = summarizedValue;
		}

		return summarizedObject;
	}

	return String(value);
}

function extractPrimaryCollection(
	value: any,
): {label: string; items: any[]} | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}

	for (const key of PRIMARY_COLLECTION_KEYS) {
		if (Array.isArray((value as Record<string, any>)[key])) {
			return {
				label: key,
				items: (value as Record<string, any>)[key],
			};
		}
	}

	if ((value as Record<string, any>)['result']) {
		return extractPrimaryCollection((value as Record<string, any>)['result']);
	}

	return undefined;
}

function extractTopItemLabel(item: any): string | undefined {
	if (item === null || item === undefined) {
		return undefined;
	}

	if (typeof item === 'string') {
		return trimSummaryText(item, 120);
	}

	if (typeof item !== 'object') {
		return String(item);
	}

	for (const key of ['name', 'path', 'filePath', 'title', 'id', 'summary']) {
		const value = (item as Record<string, any>)[key];
		if (typeof value === 'string' && value.trim()) {
			return trimSummaryText(value, 120);
		}
	}

	const entries = Object.entries(item as Record<string, any>).slice(0, 2);
	if (entries.length === 0) {
		return undefined;
	}

	return trimSummaryText(
		entries.map(([key, value]) => `${key}=${String(value)}`).join(', '),
		120,
	);
}

function extractTopItemsFromText(text: string): string[] {
	const lines = text
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean);

	const tableRows = lines
		.filter(
			line =>
				line.startsWith('|') &&
				!line.includes('---') &&
				!/\|\s*(名称|name)\s*\|/i.test(line),
		)
		.map(line => line.split('|')[1]?.trim())
		.filter((line): line is string => Boolean(line));
	if (tableRows.length > 0) {
		return tableRows.slice(0, TOOL_HISTORY_TOP_ITEMS);
	}

	const bulletRows = lines
		.map(line => line.match(/^(?:[-*•]|\d+\.)\s+(.+)$/)?.[1]?.trim())
		.filter((line): line is string => Boolean(line));
	if (bulletRows.length > 0) {
		return bulletRows.slice(0, TOOL_HISTORY_TOP_ITEMS);
	}

	return lines
		.slice(1, 1 + TOOL_HISTORY_TOP_ITEMS)
		.map(line => trimSummaryText(line, 120));
}

function extractBestSummaryText(
	result: any,
	fallbackTextContent: string,
	historyContent: string,
): string {
	if (typeof result === 'string') {
		return trimSummaryText(result.split('\n').find(Boolean) || result);
	}

	if (isMultimodalContent(result)) {
		return trimSummaryText(
			extractHistoryTextFromContentItems(result).split('\n').find(Boolean) ||
				fallbackTextContent,
		);
	}

	if (result && typeof result === 'object') {
		for (const key of ['summary', 'message']) {
			const value = (result as Record<string, any>)[key];
			if (typeof value === 'string' && value.trim()) {
				return trimSummaryText(value);
			}
		}

		const nestedContent = (result as Record<string, any>)['content'];
		if (typeof nestedContent === 'string' && nestedContent.trim()) {
			return trimSummaryText(
				nestedContent.split('\n').find(Boolean) || nestedContent,
			);
		}

		if (isMultimodalContent(nestedContent)) {
			const flattened = extractHistoryTextFromContentItems(nestedContent);
			if (flattened) {
				return trimSummaryText(flattened.split('\n').find(Boolean) || flattened);
			}
		}

		const nestedResult = (result as Record<string, any>)['result'];
		if (nestedResult && typeof nestedResult === 'object') {
			return extractBestSummaryText(nestedResult, fallbackTextContent, historyContent);
		}
	}

	const firstHistoryLine = historyContent.split('\n').find(Boolean);
	if (firstHistoryLine) {
		return trimSummaryText(firstHistoryLine);
	}

	return trimSummaryText(fallbackTextContent);
}

function extractPreviewSourceText(
	result: any,
	historyContent: string,
): string {
	if (typeof result === 'string') {
		return result;
	}

	if (isMultimodalContent(result)) {
		return extractHistoryTextFromContentItems(result);
	}

	if (result && typeof result === 'object') {
		const nestedContent = (result as Record<string, any>)['content'];
		if (typeof nestedContent === 'string' && nestedContent.trim()) {
			return nestedContent;
		}

		if (isMultimodalContent(nestedContent)) {
			return extractHistoryTextFromContentItems(nestedContent);
		}

		const nestedResult = (result as Record<string, any>)['result'];
		if (nestedResult && typeof nestedResult === 'object') {
			return extractPreviewSourceText(nestedResult, historyContent);
		}
	}

	return historyContent;
}

function extractItemCount(summaryText: string): number | undefined {
	const match = summaryText.match(
		/\((\d+)\s+(?:item|items|files|results|matches|rows|records)\)/i,
	);
	if (match) {
		return Number(match[1]);
	}

	return undefined;
}

function buildToolHistorySummary(
	result: any,
	fallbackTextContent: string,
	historyContent: string,
): ToolHistorySummary | undefined {
	const truncated =
		historyContent.includes('[truncated') || historyContent.includes('omitted]');
	const collection = extractPrimaryCollection(result);
	const summary = extractBestSummaryText(result, fallbackTextContent, historyContent);
	const previewSourceText = extractPreviewSourceText(result, historyContent);
	const itemCount = collection?.items.length ?? extractItemCount(summary);
	const topItems = collection
		? collection.items
				.slice(0, TOOL_HISTORY_TOP_ITEMS)
				.map(extractTopItemLabel)
				.filter((item): item is string => Boolean(item))
		: extractTopItemsFromText(previewSourceText);
	const status =
		result && typeof result === 'object' && typeof result.status === 'string'
			? result.status
			: undefined;
	const asyncState =
		result &&
		typeof result === 'object' &&
		result.asyncStatus &&
		typeof result.asyncStatus === 'object' &&
		typeof result.asyncStatus.state === 'string'
			? result.asyncStatus.state
			: undefined;
	const shouldPromoteSummary =
		truncated ||
		(itemCount !== undefined && itemCount > TOOL_HISTORY_MAX_ARRAY_ITEMS);

	if (!shouldPromoteSummary) {
		return undefined;
	}

	return {
		summary,
		...(status ? {status} : {}),
		...(asyncState ? {asyncState} : {}),
		...(itemCount !== undefined ? {itemCount} : {}),
		...(topItems.length > 0 ? {topItems} : {}),
		...(truncated ? {truncated: true} : {}),
	};
}

export function buildToolHistoryArtifacts(
	result: any,
	fallbackTextContent: string,
): ToolHistoryArtifacts {
	const explicitArtifacts = extractExplicitHistoryArtifacts(
		result,
		fallbackTextContent,
	);
	if (explicitArtifacts) {
		return explicitArtifacts;
	}

	let historyContent: string;

	if (isMultimodalContent(result)) {
		historyContent = extractHistoryTextFromContentItems(result);
	} else if (typeof result === 'string') {
		historyContent = summarizeToolHistoryText(result);
	} else if (result === null || result === undefined) {
		historyContent = summarizeToolHistoryText(fallbackTextContent);
	} else if (typeof result !== 'object') {
		historyContent = summarizeToolHistoryText(String(result));
	} else {
		const summarizedValue = summarizeToolHistoryValue(result);
		if (
			summarizedValue &&
			typeof summarizedValue === 'object' &&
			!Array.isArray(summarizedValue) &&
			Object.keys(summarizedValue).length > 0
		) {
			historyContent = JSON.stringify(summarizedValue);
		} else if (Array.isArray(summarizedValue) && summarizedValue.length > 0) {
			historyContent = JSON.stringify(summarizedValue);
		} else {
			historyContent = summarizeToolHistoryText(fallbackTextContent);
		}
	}

	const historySummary = buildToolHistorySummary(
		result,
		fallbackTextContent,
		historyContent,
	);
	if (historySummary) {
		return {
			historyContent,
			previewContent: JSON.stringify(historySummary),
			historySummary,
		};
	}

	return {historyContent};
}

export function buildToolHistoryContent(
	result: any,
	fallbackTextContent: string,
): string {
	return buildToolHistoryArtifacts(result, fallbackTextContent).historyContent;
}
