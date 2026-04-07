import {createHash} from 'node:crypto';
import type {MCPServiceTools} from '../../execution/mcpToolsManager.js';
import {
	normalizeBridgeManifestResponse,
	translateBridgeManifestToToolPlane,
	type BridgeMetadataSidecar,
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
	metadata?: BridgeMetadataSidecar;
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

function buildManifestSnapshotFingerprint(
	manifest: BridgeManifestResponse,
): string {
	const normalizedManifest = normalizeBridgeManifestResponse(manifest);
	const structuralShape = normalizedManifest.plugins.map(plugin => ({
		name: plugin.name,
		displayName: plugin.displayName,
		description: plugin.description,
		pluginType: plugin.pluginType,
		metadata: plugin.metadata,
		bridgeCommands: plugin.bridgeCommands.map(command => ({
			commandName: command.commandName,
			commandIdentifier: command.commandIdentifier,
			command: command.command,
			description: command.description,
			parameters: command.parameters,
			metadata: command.metadata,
		})),
	}));
	const fingerprintSource = JSON.stringify({
		metadata: normalizedManifest.metadata,
		structuralShape,
	});

	return createHash('sha1')
		.update(fingerprintSource)
		.digest('hex')
		.slice(0, 12);
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
		...(toolPlane.metadata ? {metadata: toolPlane.metadata} : {}),
	};
}

export function buildSessionBridgeToolSnapshot(
	sessionKey: string | undefined,
	manifest: BridgeManifestResponse,
): SessionBridgeToolSnapshot {
	const normalizedSessionKey = sessionKey?.trim() || DEFAULT_BRIDGE_SNAPSHOT_KEY;
	const snapshotKey = `${normalizedSessionKey}:${buildManifestSnapshotFingerprint(manifest)}`;
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
