import type {ToolExecutionBinding} from '../session/vcpCompatibility/toolExecutionBinding.js';

function isSnowSyntheticTool(toolName: string): boolean {
	return (
		toolName.startsWith('subagent-') ||
		toolName.startsWith('team-') ||
		toolName === 'tool_search'
	);
}

export function shouldBuildStructuredToolArtifacts(options: {
	toolName: string;
	executionBinding?: ToolExecutionBinding;
}): boolean {
	if (isSnowSyntheticTool(options.toolName)) {
		return false;
	}

	return options.executionBinding?.kind === 'bridge';
}

export function shouldRefreshStructuredToolArtifacts(options: {
	toolName: string;
	executionBinding?: ToolExecutionBinding;
	result: {
		historyContent?: string;
		previewContent?: string;
	};
}): boolean {
	return (
		shouldBuildStructuredToolArtifacts(options) ||
		Boolean(options.result.historyContent || options.result.previewContent)
	);
}
