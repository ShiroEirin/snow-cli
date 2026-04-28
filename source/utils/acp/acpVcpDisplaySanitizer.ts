import {stripCompatibilityDisplayBlocks} from '../core/vcpCompatibilityAdapter.js';

export type AcpDisplaySanitizer = {
	push(chunk: string): string;
	flush(): string;
};

type AcpSuppressedBlock = {
	endMarkers: readonly string[];
};

type AcpDisplayStartMarker = {
	marker: string;
	endMarkers?: readonly string[];
};

const ACP_TOOL_REQUEST_END_MARKERS = [
	'<<<[END_TOOL_REQUEST]>>>',
	'<<<END_TOOL_REQUEST>>>',
] as const;
const ACP_DAILY_NOTE_END_MARKERS = ['<<<DailyNoteEnd>>>'] as const;
const ACP_TOOL_RESULT_END_MARKERS = ['VCP调用结果结束]]'] as const;
const ACP_THOUGHT_CHAIN_END_MARKERS = ['[--- 元思考链结束 ---]'] as const;

const ACP_VCP_DISPLAY_START_MARKERS: readonly AcpDisplayStartMarker[] = [
	{marker: '<<<[TOOL_REQUEST]>>>', endMarkers: ACP_TOOL_REQUEST_END_MARKERS},
	{marker: '<<<TOOL_REQUEST>>>', endMarkers: ACP_TOOL_REQUEST_END_MARKERS},
	{marker: '<<<DailyNoteStart>>>', endMarkers: ACP_DAILY_NOTE_END_MARKERS},
	{
		marker: '[[VCP调用结果信息汇总:',
		endMarkers: ACP_TOOL_RESULT_END_MARKERS,
	},
	{marker: '[--- VCP元思考链', endMarkers: ACP_THOUGHT_CHAIN_END_MARKERS},
	{marker: '<<<[ROLE_DIVIDE_SYSTEM]>>>'},
	{marker: '<<<[END_ROLE_DIVIDE_SYSTEM]>>>'},
	{marker: '<<<[ROLE_DIVIDE_ASSISTANT]>>>'},
	{marker: '<<<[END_ROLE_DIVIDE_ASSISTANT]>>>'},
	{marker: '<<<[ROLE_DIVIDE_USER]>>>'},
	{marker: '<<<[END_ROLE_DIVIDE_USER]>>>'},
];

const ACP_VCP_DISPLAY_MARKER_PREFIXES = ACP_VCP_DISPLAY_START_MARKERS.map(
	({marker}) => marker,
);

function findPendingVcpMarkerStart(text: string): number {
	for (let index = 0; index < text.length; index++) {
		const suffix = text.slice(index);
		const trimmedSuffix = suffix.trimStart();
		if (!trimmedSuffix) {
			continue;
		}

		if (
			ACP_VCP_DISPLAY_MARKER_PREFIXES.some(
				marker =>
					marker.startsWith(trimmedSuffix) || trimmedSuffix.startsWith(marker),
			)
		) {
			const leadingWhitespaceLength = suffix.length - trimmedSuffix.length;
			const markerStart = index + leadingWhitespaceLength;
			return text.slice(0, markerStart).trim() ? markerStart : index;
		}
	}

	return -1;
}

function findEarliestStartMarker(text: string):
	| {
			index: number;
			startMarker: AcpDisplayStartMarker;
	  }
	| undefined {
	let earliest:
		| {
				index: number;
				startMarker: AcpDisplayStartMarker;
		  }
		| undefined;

	for (const startMarker of ACP_VCP_DISPLAY_START_MARKERS) {
		const index = text.indexOf(startMarker.marker);
		if (index < 0) {
			continue;
		}

		if (!earliest || index < earliest.index) {
			earliest = {index, startMarker};
		}
	}

	return earliest;
}

function findEarliestEndMarker(
	text: string,
	endMarkers: readonly string[],
):
	| {
			index: number;
			marker: string;
	  }
	| undefined {
	let earliest:
		| {
				index: number;
				marker: string;
		  }
		| undefined;

	for (const marker of endMarkers) {
		const index = text.indexOf(marker);
		if (index < 0) {
			continue;
		}

		if (!earliest || index < earliest.index) {
			earliest = {index, marker};
		}
	}

	return earliest;
}

function findPendingEndMarkerSuffixStart(
	text: string,
	endMarkers: readonly string[],
): number {
	for (let index = 0; index < text.length; index++) {
		const suffix = text.slice(index);
		if (endMarkers.some(marker => marker.startsWith(suffix))) {
			return index;
		}
	}

	return -1;
}

function appendAcpVisibleText(output: string, text: string): string {
	return output + stripCompatibilityDisplayBlocks(text);
}

function sanitizeAcpDisplayBuffer(
	buffer: string,
	currentBlock: AcpSuppressedBlock | null,
	flush: boolean,
): {
	output: string;
	buffer: string;
	block: AcpSuppressedBlock | null;
} {
	let output = '';
	let remaining = buffer;
	let block = currentBlock;

	while (remaining) {
		if (block) {
			const endMarker = findEarliestEndMarker(remaining, block.endMarkers);
			if (endMarker) {
				remaining = remaining.slice(endMarker.index + endMarker.marker.length);
				block = null;
				continue;
			}

			if (flush) {
				return {output, buffer: '', block: null};
			}

			const pendingEndStart = findPendingEndMarkerSuffixStart(
				remaining,
				block.endMarkers,
			);
			return {
				output,
				buffer: pendingEndStart >= 0 ? remaining.slice(pendingEndStart) : '',
				block,
			};
		}

		const startMarker = findEarliestStartMarker(remaining);
		const pendingMarkerStart = findPendingVcpMarkerStart(remaining);
		if (
			startMarker &&
			(pendingMarkerStart < 0 || startMarker.index <= pendingMarkerStart)
		) {
			output = appendAcpVisibleText(
				output,
				remaining.slice(0, startMarker.index),
			);
			remaining = remaining.slice(
				startMarker.index + startMarker.startMarker.marker.length,
			);
			block = startMarker.startMarker.endMarkers
				? {endMarkers: startMarker.startMarker.endMarkers}
				: null;
			continue;
		}

		if (pendingMarkerStart >= 0) {
			output = appendAcpVisibleText(
				output,
				remaining.slice(0, pendingMarkerStart),
			);
			return {
				output,
				buffer: flush ? '' : remaining.slice(pendingMarkerStart),
				block,
			};
		}

		output = appendAcpVisibleText(output, remaining);
		return {output, buffer: '', block};
	}

	return {output, buffer: '', block};
}

export function createAcpVcpDisplaySanitizer(): AcpDisplaySanitizer {
	let suppressedBlock: AcpSuppressedBlock | null = null;
	let lineBuffer = '';

	return {
		push(chunk: string): string {
			const sanitized = sanitizeAcpDisplayBuffer(
				lineBuffer + chunk,
				suppressedBlock,
				false,
			);
			lineBuffer = sanitized.buffer;
			suppressedBlock = sanitized.block;
			return sanitized.output;
		},
		flush(): string {
			if (!lineBuffer && !suppressedBlock) {
				return '';
			}

			const sanitized = sanitizeAcpDisplayBuffer(
				lineBuffer,
				suppressedBlock,
				true,
			);
			lineBuffer = sanitized.buffer;
			suppressedBlock = sanitized.block;
			return sanitized.output;
		},
	};
}
