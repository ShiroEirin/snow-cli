import {
	VCP_DAILY_NOTE_REGEX,
	VCP_ROLE_DIVIDER_REGEX,
	VCP_START_END_FIELD_REGEX,
	VCP_THOUGHT_CHAIN_REGEX,
	VCP_TOOL_REQUEST_REGEX,
	VCP_TOOL_RESULT_REGEX,
} from './protocol.js';

const CONVENTIONAL_THOUGHT_REGEX =
	/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi;
const FENCED_CODE_BLOCK_REGEX = /```[\s\S]*?```/g;

type MatchBuilder<T> = (match: RegExpExecArray) => T;

export type VcpDelimitedField = {
	key: string;
	value: string;
};

export type VcpThoughtChainKind = 'vcp' | 'conventional';

export type VcpThoughtChainBlock = {
	type: 'thoughtChain';
	kind: VcpThoughtChainKind;
	title?: string;
	content: string;
	lineCount: number;
};

export type VcpToolRequestBlock = {
	type: 'toolRequest';
	content: string;
	toolName?: string;
	fields: VcpDelimitedField[];
};

export type VcpToolResultBlock = {
	type: 'toolResult';
	content: string;
	toolName?: string;
	status: 'success' | 'error' | 'unknown';
	statusText: string;
};

export type VcpDailyNoteBlock = {
	type: 'dailyNote';
	content: string;
	maid?: string;
	date?: string;
};

export type VcpRoleDividerBlock = {
	type: 'roleDivider';
	role: 'system' | 'assistant' | 'user';
	isEnd: boolean;
};

export type VcpDisplayBlock =
	| VcpThoughtChainBlock
	| VcpToolRequestBlock
	| VcpToolResultBlock
	| VcpDailyNoteBlock
	| VcpRoleDividerBlock;

export type VcpDisplayPart =
	| {
			type: 'text';
			content: string;
	  }
	| {
			type: 'block';
			block: VcpDisplayBlock;
	  };

export type VcpDisplayParseResult = {
	mainText: string;
	blocks: VcpDisplayBlock[];
	parts: VcpDisplayPart[];
};

type BlockMatch = {
	start: number;
	end: number;
	block: VcpDisplayBlock;
};

type ProtectedRange = {
	start: number;
	end: number;
};

type ParsedToolResultFields = {
	content?: string;
	statusText?: string;
	toolName?: string;
};

function countDisplayLines(content: string): number {
	const trimmed = content.trim();
	if (!trimmed) {
		return 0;
	}

	return trimmed.split(/\r?\n/).length;
}

function normalizeTextPart(text: string): string {
	return text.replace(/\n{3,}/g, '\n\n');
}

function collectProtectedRanges(text: string): ProtectedRange[] {
	const ranges: ProtectedRange[] = [];
	const regex = new RegExp(
		FENCED_CODE_BLOCK_REGEX.source,
		FENCED_CODE_BLOCK_REGEX.flags.includes('g')
			? FENCED_CODE_BLOCK_REGEX.flags
			: `${FENCED_CODE_BLOCK_REGEX.flags}g`,
	);
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		const wholeMatch = match[0] || '';
		ranges.push({
			start: match.index,
			end: match.index + wholeMatch.length,
		});
	}

	return ranges;
}

function overlapsProtectedRange(
	start: number,
	end: number,
	protectedRanges: readonly ProtectedRange[],
): boolean {
	return protectedRanges.some(
		range => start < range.end && end > range.start,
	);
}

function trimTranscriptValue(value: string, maxLength = 400): string {
	const trimmed = value.trim();
	if (trimmed.length <= maxLength) {
		return trimmed;
	}

	return `${trimmed.slice(0, maxLength)}... [已截断 ${trimmed.length - maxLength} 字符]`;
}

function formatTranscriptField(
	key: string,
	value: string,
	maxLength = 400,
): string {
	const trimmedValue = trimTranscriptValue(value, maxLength);
	const lines = trimmedValue.split(/\r?\n/);
	const [firstLine = '', ...remainingLines] = lines;

	if (remainingLines.length === 0) {
		return `- ${key}: ${firstLine}`;
	}

	return [
		`- ${key}: ${firstLine}`,
		...remainingLines.map(line => `  ${line}`),
	].join('\n');
}

function collectRegexMatches<T extends VcpDisplayBlock>(
	text: string,
	regex: RegExp,
	buildBlock: MatchBuilder<T>,
	protectedRanges: readonly ProtectedRange[] = [],
): BlockMatch[] {
	const matches: BlockMatch[] = [];
	const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
	const globalRegex = new RegExp(regex.source, flags);
	let match: RegExpExecArray | null;

	while ((match = globalRegex.exec(text)) !== null) {
		const wholeMatch = match[0] || '';
		const start = match.index;
		const end = match.index + wholeMatch.length;
		if (overlapsProtectedRange(start, end, protectedRanges)) {
			continue;
		}

		matches.push({
			start,
			end,
			block: buildBlock(match),
		});
	}

	return matches;
}

function parseDelimitedFields(content: string): VcpDelimitedField[] {
	const fields: VcpDelimitedField[] = [];
	const regex = new RegExp(
		VCP_START_END_FIELD_REGEX.source,
		VCP_START_END_FIELD_REGEX.flags.includes('g')
			? VCP_START_END_FIELD_REGEX.flags
			: `${VCP_START_END_FIELD_REGEX.flags}g`,
	);
	let match: RegExpExecArray | null;

	while ((match = regex.exec(content)) !== null) {
		fields.push({
			key: (match[1] || '').trim(),
			value: (match[2] || '').trim(),
		});
	}

	return fields;
}

function parseToolResultFields(content: string): ParsedToolResultFields {
	const parsedFields: ParsedToolResultFields = {};
	const lines = content.split(/\r?\n/);
	let currentKey = '';
	let currentValue: string[] = [];

	const commitField = () => {
		if (!currentKey) {
			return;
		}

		const normalizedKey = currentKey.trim().toLowerCase();
		const value = currentValue.join('\n').trim();
		if (!value) {
			currentKey = '';
			currentValue = [];
			return;
		}

		switch (normalizedKey) {
			case '工具名称':
			case 'tool name':
			case 'tool_name': {
				parsedFields.toolName = value;
				break;
			}

			case '执行状态':
			case 'status': {
				parsedFields.statusText = value;
				break;
			}

			case '返回内容':
			case '返回结果':
			case '内容':
			case 'result':
			case 'output': {
				parsedFields.content = value;
				break;
			}

			default: {
				break;
			}
		}

		currentKey = '';
		currentValue = [];
	};

	for (const line of lines) {
		const fieldMatch = line.match(/^\s*-\s*([^:]+):\s*(.*)$/);
		if (fieldMatch) {
			commitField();
			currentKey = fieldMatch[1] || '';
			currentValue = [fieldMatch[2] || ''];
			continue;
		}

		if (currentKey) {
			currentValue.push(line);
		}
	}

	commitField();
	return parsedFields;
}

function buildThoughtChainBlock(
	kind: VcpThoughtChainKind,
	rawContent: string,
	title?: string,
): VcpThoughtChainBlock {
	const content = rawContent.trim();
	return {
		type: 'thoughtChain',
		kind,
		title: title?.trim() || undefined,
		content,
		lineCount: countDisplayLines(content),
	};
}

function buildToolRequestBlock(content: string): VcpToolRequestBlock {
	const trimmedContent = content.trim();
	const fields = parseDelimitedFields(trimmedContent);
	const toolName = fields.find(field => field.key === 'tool_name')?.value;

	return {
		type: 'toolRequest',
		content: trimmedContent,
		toolName: toolName?.trim() || undefined,
		fields,
	};
}

function buildToolResultBlock(content: string): VcpToolResultBlock {
	const trimmedContent = content.trim();
	const parsedFields = parseToolResultFields(trimmedContent);
	const toolName = parsedFields.toolName?.trim() || undefined;
	const statusText = parsedFields.statusText?.trim() || '';
	const resultContent = parsedFields.content?.trim() || trimmedContent;
	const normalizedStatusText = statusText.toLowerCase();
	const status = normalizedStatusText.includes('error') || statusText.includes('❌')
		? 'error'
		: normalizedStatusText.includes('success') || statusText.includes('✅')
			? 'success'
			: 'unknown';

	return {
		type: 'toolResult',
		content: resultContent,
		toolName,
		status,
		statusText,
	};
}

function buildDailyNoteBlock(content: string): VcpDailyNoteBlock {
	const trimmedContent = content.trim();
	const maid = trimmedContent.match(/^Maid:\s*(.+)$/m)?.[1]?.trim();
	const date = trimmedContent.match(/^Date:\s*(.+)$/m)?.[1]?.trim();
	const noteContent =
		trimmedContent.match(/^Content:\s*([\s\S]*)$/m)?.[1]?.trim() ||
		trimmedContent;

	return {
		type: 'dailyNote',
		content: noteContent,
		maid: maid || undefined,
		date: date || undefined,
	};
}

function buildRoleDividerBlock(match: RegExpExecArray): VcpRoleDividerBlock {
	return {
		type: 'roleDivider',
		role: ((match[2] || '').toLowerCase() as VcpRoleDividerBlock['role']) || 'user',
		isEnd: Boolean(match[1]),
	};
}

function buildThoughtChainLabel(block: VcpThoughtChainBlock): string {
	const baseLabel = block.kind === 'conventional' ? '思维链' : 'VCP元思考链';
	return block.title?.trim() ? `${baseLabel}：${block.title.trim()}` : baseLabel;
}

export function containsVcpDisplayBlocks(text: string): boolean {
	if (!text) {
		return false;
	}

	return (
		text.includes('<<<[TOOL_REQUEST]>>>') ||
		text.includes('<<<TOOL_REQUEST>>>') ||
		text.includes('[[VCP调用结果信息汇总:') ||
		text.includes('<<<DailyNoteStart>>>') ||
		text.includes('ROLE_DIVIDE_') ||
		text.includes('[--- VCP元思考链') ||
		/<think/i.test(text)
	);
}

export function parseVcpDisplayBlocks(text: string): VcpDisplayParseResult {
	if (!containsVcpDisplayBlocks(text)) {
		return {
			mainText: text,
			blocks: [],
			parts: [
				{
					type: 'text',
					content: text,
				},
			],
		};
	}

	const protectedRanges = collectProtectedRanges(text);
	const matches = [
		...collectRegexMatches(
			text,
			VCP_TOOL_REQUEST_REGEX,
			match => buildToolRequestBlock(match[1] || ''),
			protectedRanges,
		),
		...collectRegexMatches(
			text,
			VCP_TOOL_RESULT_REGEX,
			match => buildToolResultBlock(match[1] || ''),
			protectedRanges,
		),
		...collectRegexMatches(
			text,
			VCP_DAILY_NOTE_REGEX,
			match => buildDailyNoteBlock(match[1] || ''),
			protectedRanges,
		),
		...collectRegexMatches(
			text,
			VCP_THOUGHT_CHAIN_REGEX,
			match =>
				buildThoughtChainBlock('vcp', match[2] || '', match[1] || undefined),
			protectedRanges,
		),
		...collectRegexMatches(
			text,
			CONVENTIONAL_THOUGHT_REGEX,
			match => buildThoughtChainBlock('conventional', match[1] || ''),
			protectedRanges,
		),
		...collectRegexMatches(
			text,
			VCP_ROLE_DIVIDER_REGEX,
			match => buildRoleDividerBlock(match),
			protectedRanges,
		),
	].sort((left, right) => left.start - right.start || left.end - right.end);

	if (matches.length === 0) {
		return {
			mainText: text,
			blocks: [],
			parts: [
				{
					type: 'text',
					content: text,
				},
			],
		};
	}

	const parts: VcpDisplayPart[] = [];
	const blocks: VcpDisplayBlock[] = [];
	const mainTextParts: string[] = [];
	let cursor = 0;

	for (const match of matches) {
		if (match.start < cursor) {
			continue;
		}

		if (match.start > cursor) {
			const textPart = normalizeTextPart(text.slice(cursor, match.start));
			parts.push({
				type: 'text',
				content: textPart,
			});
			mainTextParts.push(textPart);
		}

		parts.push({
			type: 'block',
			block: match.block,
		});
		blocks.push(match.block);
		cursor = match.end;
	}

	if (cursor < text.length) {
		const trailingText = normalizeTextPart(text.slice(cursor));
		parts.push({
			type: 'text',
			content: trailingText,
		});
		mainTextParts.push(trailingText);
	}

	return {
		mainText: normalizeTextPart(mainTextParts.join('')).trim(),
		blocks,
		parts,
	};
}

export function stripVcpDisplayBlocks(text: string): string {
	return parseVcpDisplayBlocks(text).mainText;
}

export function formatVcpThoughtChainSummaryLabel(
	block: VcpThoughtChainBlock,
): string {
	return `[${buildThoughtChainLabel(block)} 已折叠，共 ${block.lineCount} 行]`;
}

export function formatVcpThoughtChainHeading(
	block: VcpThoughtChainBlock,
): string {
	return buildThoughtChainLabel(block);
}

export function formatVcpToolRequestLabel(block: VcpToolRequestBlock): string {
	return block.toolName ? `VCP-ToolRequest：${block.toolName}` : 'VCP-ToolRequest';
}

export function formatVcpToolResultLabel(block: VcpToolResultBlock): string {
	return block.toolName ? `VCP-ToolResult：${block.toolName}` : 'VCP-ToolResult';
}

export function formatVcpDailyNoteLabel(block: VcpDailyNoteBlock): string {
	const segments = [block.maid, block.date].filter(Boolean);
	return segments.length > 0
		? `VCP-DailyNote：${segments.join(' | ')}`
		: 'VCP-DailyNote';
}

export function summarizeVcpDisplayBlockForTranscript(
	block: VcpDisplayBlock,
): string | null {
	switch (block.type) {
		case 'roleDivider': {
			return null;
		}

		case 'thoughtChain': {
			return formatVcpThoughtChainSummaryLabel(block);
		}

		case 'toolRequest': {
			const lines = [formatVcpToolRequestLabel(block)];
			for (const field of block.fields) {
				lines.push(formatTranscriptField(field.key, field.value));
			}

			if (block.fields.length === 0 && block.content) {
				lines.push(trimTranscriptValue(block.content, 800));
			}

			return lines.join('\n');
		}

		case 'toolResult': {
			const status = block.statusText || block.status.toUpperCase();
			const lines = [formatVcpToolResultLabel(block), `- 状态: ${status}`];
			if (block.content) {
				lines.push(formatTranscriptField('内容', block.content, 800));
			}

			return lines.join('\n');
		}

		case 'dailyNote': {
			const lines = [formatVcpDailyNoteLabel(block)];
			if (block.maid) {
				lines.push(`- Maid: ${block.maid}`);
			}
			if (block.date) {
				lines.push(`- Date: ${block.date}`);
			}
			if (block.content) {
				lines.push(formatTranscriptField('Content', block.content, 800));
			}

			return lines.join('\n');
		}

		default: {
			return null;
		}
	}
}

export function formatVcpContentForTranscript(text: string): string {
	if (!containsVcpDisplayBlocks(text)) {
		return text;
	}

	const parsed = parseVcpDisplayBlocks(text);
	const contentParts: string[] = [];

	for (const part of parsed.parts) {
		if (part.type === 'text') {
			const normalized = normalizeTextPart(part.content).trim();
			if (normalized) {
				contentParts.push(normalized);
			}
			continue;
		}

		const blockSummary = summarizeVcpDisplayBlockForTranscript(part.block);
		if (blockSummary) {
			contentParts.push(blockSummary);
		}
	}

	return normalizeTextPart(contentParts.join('\n\n')).trim();
}
