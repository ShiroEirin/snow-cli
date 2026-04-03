import type {BridgeStatusSummary} from './bridgeStatus.js';

export type ToolLifecycleMessageStatus = 'pending' | 'success' | 'error';

const TOOL_STATUS_ICON: Record<ToolLifecycleMessageStatus, string> = {
	pending: '⚡',
	success: '✓',
	error: '✗',
};

const BRIDGE_LIFECYCLE_ORDER: Record<string, number> = {
	pending: 0,
	queued: 1,
	accepted: 1,
	submitted: 1,
	running: 2,
	in_progress: 2,
	processing: 2,
	completed: 3,
	success: 3,
	error: 3,
	failed: 3,
	cancelled: 3,
};

function normalizeBridgeLifecycleState(value: string | undefined): string {
	return value?.trim().toLowerCase().replace(/[\s-]+/g, '_') || 'pending';
}

export function deriveBridgeLifecycleState(
	summary: Pick<BridgeStatusSummary, 'state' | 'status'>,
): string {
	const normalizedState = normalizeBridgeLifecycleState(summary.state);
	const normalizedStatus = normalizeBridgeLifecycleState(summary.status);
	const candidate = normalizedState === 'unknown' ? normalizedStatus : normalizedState;

	if (
		candidate === 'running' ||
		candidate === 'in_progress' ||
		candidate === 'processing'
	) {
		return 'running';
	}

	if (
		candidate === 'completed' ||
		candidate === 'success' ||
		candidate === 'done'
	) {
		return 'completed';
	}

	if (candidate === 'failed' || candidate === 'error') {
		return 'error';
	}

	if (candidate === 'cancelled' || candidate === 'canceled') {
		return 'cancelled';
	}

	if (candidate === 'queued' || candidate === 'accepted' || candidate === 'submitted') {
		return candidate;
	}

	return candidate || 'pending';
}

export function shouldAdvanceBridgeLifecycle(
	currentState: string | undefined,
	nextSummary: Pick<BridgeStatusSummary, 'state' | 'status'>,
): boolean {
	const current = normalizeBridgeLifecycleState(currentState);
	const next = deriveBridgeLifecycleState(nextSummary);

	const currentRank = BRIDGE_LIFECYCLE_ORDER[current] ?? 0;
	const nextRank = BRIDGE_LIFECYCLE_ORDER[next] ?? 0;

	if (currentRank >= 3) {
		return false;
	}

	return nextRank >= currentRank;
}

function normalizeSidebandLine(line: string): string {
	return line.trim();
}

export function buildToolLifecycleSideband(options: {
	toolName?: string;
	messageStatus?: ToolLifecycleMessageStatus;
	detail?: string;
	fallbackContent?: string;
}): string | undefined {
	const {
		toolName,
		messageStatus = 'success',
		detail,
		fallbackContent,
	} = options;

	const title =
		fallbackContent?.trim() ||
		(toolName ? `${TOOL_STATUS_ICON[messageStatus]} ${toolName}` : '');
	const detailLines = (detail || '')
		.split('\n')
		.map(normalizeSidebandLine)
		.filter(Boolean);

	if (!title && detailLines.length === 0) {
		return undefined;
	}

	const lines = title ? [title] : [];
	const normalizedTitle = title.trim();

	for (const line of detailLines) {
		if (line === normalizedTitle) {
			continue;
		}

		lines.push(line.startsWith('└─') || line.startsWith('├─') ? line : `└─ ${line}`);
	}

	return lines.join('\n');
}
