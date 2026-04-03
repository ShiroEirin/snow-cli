import type {
	BackendMode,
	ToolTransport,
} from '../../../../utils/config/apiConfig.js';

type IndicatorCopy = {
	label: string;
	local: string;
	bridge: string;
	hybrid: string;
};

type IndicatorOptions = {
	backendMode?: BackendMode;
	toolTransport?: ToolTransport;
};

export type VcpToolPlaneIndicator = {
	simpleText: string;
	detailedText: string;
};

function resolveToolTransportLabel(
	toolTransport: ToolTransport | undefined,
	copy: IndicatorCopy,
): string {
	switch (toolTransport) {
		case 'bridge': {
			return copy.bridge;
		}
		case 'hybrid': {
			return copy.hybrid;
		}
		case 'local':
		default: {
			return copy.local;
		}
	}
}

export function buildVcpToolPlaneIndicator(
	options: IndicatorOptions,
	copy: IndicatorCopy,
): VcpToolPlaneIndicator | undefined {
	if (options.backendMode !== 'vcp') {
		return undefined;
	}

	const transportLabel = resolveToolTransportLabel(options.toolTransport, copy);
	const normalizedLabel = copy.label.replace(/[:：]\s*$/, '');

	return {
		simpleText: `🧰 ${transportLabel}`,
		detailedText: `🧰 ${normalizedLabel}: ${transportLabel}`,
	};
}
