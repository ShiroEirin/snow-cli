export interface ToolResultView {
	toolName: string;
	previewContent?: string;
}

interface BuildToolResultViewOptions {
	toolName: string;
	content: string;
	historyContent?: string;
	previewContent?: string;
	isError?: boolean;
}

const GENERIC_PREVIEW_TOOL_NAMES = new Set([
	'ide-get_diagnostics',
	'skill-execute',
	'terminal-execute',
	'filesystem-read',
	'filesystem-create',
	'filesystem-edit',
	'websearch-search',
	'websearch-fetch',
]);

function hasSpecializedPreview(toolName: string): boolean {
	return (
		toolName.startsWith('subagent-') ||
		toolName.startsWith('ace-') ||
		toolName.startsWith('todo-') ||
		GENERIC_PREVIEW_TOOL_NAMES.has(toolName)
	);
}

function shouldUseCompactPreview(toolName: string): boolean {
	if (toolName.startsWith('vcp-') || toolName.includes('bridge')) {
		return true;
	}

	return !hasSpecializedPreview(toolName);
}

/**
 * Build display-only tool result view data while preserving the original payload.
 */
export function buildToolResultView(
	options: BuildToolResultViewOptions,
): ToolResultView {
	const {
		toolName,
		content,
		historyContent,
		previewContent,
		isError = false,
	} = options;
	const normalizedPreviewContent =
		typeof previewContent === 'string' && previewContent.trim().length > 0
			? previewContent
			: typeof historyContent === 'string' && historyContent.trim().length > 0
			? historyContent
			: undefined;

	if (
		!isError &&
		normalizedPreviewContent &&
		normalizedPreviewContent !== content &&
		shouldUseCompactPreview(toolName)
	) {
		return {
			toolName,
			previewContent: normalizedPreviewContent,
		};
	}

	return {
		toolName,
	};
}
