export type BridgeStatusSummary = {
	status: string;
	state: string;
	event?: string;
	detail: string;
	isTerminal: boolean;
};

function normalizeBridgeStatusValue(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}

	const normalized = value.trim().toLowerCase();
	return normalized || undefined;
}

function formatBridgeStatusLabel(value: string): string {
	return value
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map(segment => segment[0]?.toUpperCase() + segment.slice(1))
		.join(' ');
}

function buildBridgeStatusDetail(summary: {
	state: string;
	event?: string;
}): string {
	const stateLabel = formatBridgeStatusLabel(summary.state);
	const eventLabel = summary.event
		? formatBridgeStatusLabel(summary.event)
		: undefined;
	return eventLabel
		? `SnowBridge: ${stateLabel} (${eventLabel})`
		: `SnowBridge: ${stateLabel}`;
}

export function summarizeBridgeStatusPayload(
	payload: unknown,
): BridgeStatusSummary | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const candidate = payload as {
		status?: unknown;
		asyncStatus?: {
			state?: unknown;
			event?: unknown;
		};
	};
	const status = normalizeBridgeStatusValue(candidate.status) || 'unknown';
	const state =
		normalizeBridgeStatusValue(candidate.asyncStatus?.state) ||
		(status === 'success' ? 'completed' : status);
	const event = normalizeBridgeStatusValue(candidate.asyncStatus?.event);

	return {
		status,
		state,
		...(event ? {event} : {}),
		detail: buildBridgeStatusDetail({state, event}),
		isTerminal:
			state === 'completed' ||
			state === 'success' ||
			state === 'error' ||
			status === 'success' ||
			status === 'error',
	};
}
