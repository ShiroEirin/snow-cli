import {randomUUID} from 'node:crypto';
import type {MCPServiceTools} from '../../execution/mcpToolsManager.js';
import {
	translateBridgeManifestToToolPlane,
	type BridgeManifestResponse,
	type BridgeModelToolDescriptor,
} from './bridgeManifestTranslator.js';
import type {BridgeToolExecutionBinding} from './toolExecutionBinding.js';
import {SessionLeaseStore} from './sessionLeaseStore.js';
import {DEFAULT_BRIDGE_SNAPSHOT_KEY} from './constants.js';

export type BridgeToolSnapshot = {
	modelTools: BridgeModelToolDescriptor[];
	servicesInfo: MCPServiceTools[];
	bindings: BridgeToolExecutionBinding[];
};

export type SessionBridgeToolSnapshot = BridgeToolSnapshot & {
	snapshotKey: string;
};

const BRIDGE_SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;
const BRIDGE_SNAPSHOT_SWEEP_INTERVAL_MS = 10 * 60 * 1000;

const snapshotLeaseStore = new SessionLeaseStore<string>({
	defaultKey: DEFAULT_BRIDGE_SNAPSHOT_KEY,
	ttlMs: BRIDGE_SNAPSHOT_TTL_MS,
	sweepIntervalMs: BRIDGE_SNAPSHOT_SWEEP_INTERVAL_MS,
});

export function clearBridgeToolSnapshotSession(sessionKey?: string): void {
	snapshotLeaseStore.clearSession(sessionKey);
}

export function buildBridgeToolSnapshot(
	_snapshotKey: string | undefined,
	manifest: BridgeManifestResponse,
): BridgeToolSnapshot {
	const toolPlane = translateBridgeManifestToToolPlane(manifest);

	return {
		modelTools: toolPlane.modelTools,
		servicesInfo: toolPlane.servicesInfo,
		bindings: toolPlane.bindings,
	};
}

export function buildSessionBridgeToolSnapshot(
	sessionKey: string | undefined,
	manifest: BridgeManifestResponse,
): SessionBridgeToolSnapshot {
	const normalizedSessionKey = sessionKey?.trim() || DEFAULT_BRIDGE_SNAPSHOT_KEY;
	const snapshotKey = `${normalizedSessionKey}:${randomUUID()}`;
	const snapshot = buildBridgeToolSnapshot(snapshotKey, manifest);
	snapshotLeaseStore.rotateSession({
		sessionKey: normalizedSessionKey,
		nextResourceKey: snapshotKey,
		value: snapshotKey,
	});

	return {
		snapshotKey,
		...snapshot,
	};
}
