import type {
	VcpDailyNoteBlock,
	VcpDisplayBlock,
	VcpThoughtChainBlock,
	VcpToolRequestBlock,
	VcpToolResultBlock,
} from './displayParser.js';
import {
	containsVcpDisplayBlocks,
	parseVcpDisplayBlocks,
} from './displayParser.js';

function normalizeTextPart(text: string): string {
	return text.replace(/\n{3,}/g, '\n\n');
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

function buildThoughtChainLabel(block: VcpThoughtChainBlock): string {
	const baseLabel = block.kind === 'conventional' ? '思维链' : 'VCP元思考链';
	return block.title?.trim() ? `${baseLabel}：${block.title.trim()}` : baseLabel;
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
