import {stripVcpDisplayBlocks} from '../../../utils/session/vcpCompatibility/display.js';

const THINK_TAG_REGEX = /<\/?think(?:ing)?>/gi;

function stripThinkingLeaks(content: string): string {
	let cleaned = '';
	let cursor = 0;
	let depth = 0;
	let match: RegExpExecArray | null;

	THINK_TAG_REGEX.lastIndex = 0;

	while ((match = THINK_TAG_REGEX.exec(content)) !== null) {
		const tag = match[0] || '';
		const isClosingTag = tag.startsWith('</');

		if (isClosingTag) {
			if (depth > 0) {
				depth--;
				if (depth === 0) {
					cursor = THINK_TAG_REGEX.lastIndex;
				}
				continue;
			}

			// A stray closing tag means the preceding segment leaked from hidden thinking.
			cursor = THINK_TAG_REGEX.lastIndex;
			continue;
		}

		if (depth === 0) {
			cleaned += content.slice(cursor, match.index);
		}

		depth++;
	}

	if (depth === 0 && cursor < content.length) {
		cleaned += content.slice(cursor);
	}

	return cleaned;
}

export function sanitizeAssistantContent(content: string): string {
	if (!content) {
		return '';
	}

	return stripThinkingLeaks(stripVcpDisplayBlocks(content))
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n[ \t]*\n+/g, '\n')
		.trim();
}
