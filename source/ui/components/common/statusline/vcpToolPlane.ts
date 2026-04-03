import type {
	BackendMode,
	ToolTransport,
} from '../../../../utils/config/apiConfig.js';
import type {
	EffectiveToolPlane,
} from '../../../../utils/session/vcpCompatibility/toolRouteArbiter.js';
import type {PreparedToolPlane} from '../../../../utils/session/vcpCompatibility/toolPlaneFacade.js';

type ToolPlaneRuntimeState = PreparedToolPlane['runtimeState'];
type ToolPlaneRuntimeReasonCode = ToolPlaneRuntimeState['sidecar']['reasonCode'];

type IndicatorCopy = {
	label: string;
	local: string;
	bridge: string;
	hybrid: string;
};

type IndicatorOptions = {
	backendMode?: BackendMode;
	toolTransport?: ToolTransport;
	runtimeState?: ToolPlaneRuntimeState | null;
};

export type VcpToolPlaneIndicator = {
	simpleText: string;
	detailedText: string;
};

function resolveToolTransportLabel(
	toolTransport: EffectiveToolPlane | undefined,
	copy: IndicatorCopy,
): string {
	switch (toolTransport) {
		case 'bridge': {
			return copy.bridge;
		}
		case 'hybrid': {
			return copy.hybrid;
		}
		case 'none': {
			return 'Unavailable';
		}
		case 'local':
		default: {
			return copy.local;
		}
	}
}

function formatRuntimeReason(
	reasonCode: ToolPlaneRuntimeReasonCode,
): string | undefined {
	return reasonCode === 'configured' ? undefined : reasonCode;
}

export function buildVcpToolPlaneIndicator(
	options: IndicatorOptions,
	copy: IndicatorCopy,
): VcpToolPlaneIndicator | undefined {
	if (options.backendMode !== 'vcp') {
		return undefined;
	}

	const runtimeSnapshot =
		options.runtimeState?.snapshot &&
		(!options.toolTransport ||
			options.runtimeState.snapshot.configuredTransport ===
				options.toolTransport)
			? options.runtimeState.snapshot
			: undefined;
	const runtimeReason = formatRuntimeReason(
		runtimeSnapshot ? options.runtimeState?.sidecar.reasonCode || 'configured' : 'configured',
	);
	const effectiveTransport =
		runtimeSnapshot?.effectiveTransport || options.toolTransport;
	const configuredTransport =
		runtimeSnapshot?.configuredTransport || options.toolTransport;
	const transportLabel = resolveToolTransportLabel(effectiveTransport, copy);
	const normalizedLabel = copy.label.replace(/[:：]\s*$/, '');
	const configuredLabel = resolveToolTransportLabel(configuredTransport, copy);
	const detailSegments = [`🧰 ${normalizedLabel}: ${transportLabel}`];

	if (runtimeReason) {
		detailSegments.push(
			`configured=${configuredLabel}`,
			`reasonCode=${runtimeReason}`,
		);
	}

	return {
		simpleText: `🧰 ${transportLabel}`,
		detailedText: detailSegments.join(' · '),
	};
}
