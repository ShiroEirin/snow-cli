function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function normalizeBridgePhaseValue(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}

	const normalizedValue = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
	return normalizedValue || undefined;
}

export function mergeBridgeIngressPayload(
	basePayload: Record<string, unknown>,
	segment: Record<string, unknown>,
): Record<string, unknown> {
	const mergedPayload: Record<string, unknown> = {
		...basePayload,
		...segment,
	};
	delete mergedPayload['accepted'];
	delete mergedPayload['final'];
	delete mergedPayload['finalResult'];

	for (const sidecarKey of ['historyContent', 'previewContent', 'statusEvents']) {
		if (
			mergedPayload[sidecarKey] === undefined &&
			basePayload[sidecarKey] !== undefined
		) {
			mergedPayload[sidecarKey] = basePayload[sidecarKey];
		}
	}

	return mergedPayload;
}

export function normalizeBridgeIngressPayload(payload: unknown): unknown {
	if (!isRecord(payload)) {
		return payload;
	}

	let normalizedPayload: Record<string, unknown> = {...payload};
	const finalSegment = isRecord(payload['final'])
		? payload['final']
		: isRecord(payload['finalResult'])
		? payload['finalResult']
		: undefined;
	const acceptedSegment = isRecord(payload['accepted'])
		? payload['accepted']
		: undefined;

	if (finalSegment) {
		normalizedPayload = mergeBridgeIngressPayload(normalizedPayload, finalSegment);
	} else if (acceptedSegment) {
		normalizedPayload = mergeBridgeIngressPayload(
			normalizedPayload,
			acceptedSegment,
		);
	}

	const phaseHints = [
		finalSegment ? 'final' : undefined,
		payload['accepted'] === true || acceptedSegment ? 'accepted' : undefined,
		normalizedPayload['phase'],
		normalizedPayload['stage'],
		normalizedPayload['state'],
		normalizedPayload['kind'],
		normalizedPayload['status'],
	];
	const normalizedPhase =
		phaseHints
			.map(hint => normalizeBridgePhaseValue(hint))
			.find(Boolean) || undefined;

	const asyncStatus = isRecord(normalizedPayload['asyncStatus'])
		? {...normalizedPayload['asyncStatus']}
		: {};
	const taskId =
		String(
			normalizedPayload['taskId'] ||
				asyncStatus['taskId'] ||
				'',
		).trim() || undefined;

	const isAcceptedIngress =
		normalizedPhase === 'accepted' ||
		normalizedPhase === 'queued' ||
		normalizedPhase === 'submitted';
	const isFinalIngress =
		normalizedPhase === 'final' ||
		normalizedPhase === 'result' ||
		normalizedPhase === 'completed' ||
		normalizedPhase === 'done';

	if (isAcceptedIngress) {
		normalizedPayload = {
			...normalizedPayload,
			status: 'accepted',
			asyncStatus: {
				...asyncStatus,
				enabled: true,
				state: 'accepted',
				event:
					normalizeBridgePhaseValue(asyncStatus['event']) === 'result'
						? 'lifecycle'
						: asyncStatus['event'] || 'lifecycle',
				...(taskId ? {taskId} : {}),
			},
		};
	}

	if (isFinalIngress) {
		const hasError = normalizedPayload['error'] !== undefined;
		normalizedPayload = {
			...normalizedPayload,
			status: hasError ? 'error' : 'success',
			asyncStatus: {
				...asyncStatus,
				enabled:
					asyncStatus['enabled'] === undefined
						? Boolean(taskId)
						: asyncStatus['enabled'],
				state: hasError ? 'error' : 'completed',
				event: 'result',
				...(taskId ? {taskId} : {}),
			},
		};
	}

	return normalizedPayload;
}

export function extractToolResultSidecar(result: any): {
	historyContent?: string;
	previewContent?: string;
} {
	if (!result || typeof result !== 'object') {
		return {};
	}

	return {
		...(typeof result.historyContent === 'string' && result.historyContent.trim()
			? {historyContent: result.historyContent}
			: {}),
		...(typeof result.previewContent === 'string' && result.previewContent.trim()
			? {previewContent: result.previewContent}
			: {}),
	};
}
