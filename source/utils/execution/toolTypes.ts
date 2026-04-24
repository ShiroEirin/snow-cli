import type {ImageContent} from '../../api/types.js';
import type {BridgeStatusSummary} from '../session/vcpCompatibility/bridgeStatus.js';

export interface ToolResult {
	tool_call_id: string;
	role: 'tool';
	content: string;
	historyContent?: string;
	previewContent?: string;
	toolStatusDetail?: string;
	toolLifecycleState?: string;
	images?: ImageContent[];
	editDiffData?: Record<string, any>;
	messageStatus?: 'pending' | 'success' | 'error';
	hookFailed?: boolean;
	hookErrorDetails?: {
		type: 'warning' | 'error';
		exitCode: number;
		command: string;
		output?: string;
		error?: string;
	};
}

export type ToolLifecycleUpdate = BridgeStatusSummary & {
	toolCallId: string;
	toolName: string;
};