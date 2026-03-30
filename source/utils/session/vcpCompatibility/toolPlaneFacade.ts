import {
	collectAllMCPTools,
	getMCPServicesInfo,
	type MCPServiceTools,
	type MCPTool,
} from '../../execution/mcpToolsManager.js';
import type {ApiConfig} from '../../config/apiConfig.js';
import {snowBridgeClient} from './bridgeClient.js';
import {
	buildSessionBridgeToolSnapshot,
	clearBridgeToolSnapshotSession,
	type SessionBridgeToolSnapshot,
} from './toolSnapshot.js';
import {
	resolveToolRegistry,
	resolveToolTransport,
} from './toolRouteArbiter.js';
import {
	clearToolExecutionBindingsSession,
	rotateToolExecutionBindingsSession,
} from './toolExecutionBinding.js';
import {logger} from '../../core/logger.js';

export type PreparedToolPlane = {
	tools: MCPTool[];
	servicesInfo: MCPServiceTools[];
	duplicateToolNames: string[];
	toolPlaneKey: string;
};

type LocalToolPlane = {
	localTools: MCPTool[];
	localServicesInfo: MCPServiceTools[];
};

const EMPTY_LOCAL_TOOL_PLANE: LocalToolPlane = {
	localTools: [],
	localServicesInfo: [],
};

function resolveFallbackToolPlaneKey(sessionKey?: string): string {
	return sessionKey?.trim() || '__default__';
}

export async function prepareToolPlane(options: {
	config: ApiConfig;
	sessionKey?: string;
}): Promise<PreparedToolPlane> {
	const transport = resolveToolTransport(options.config);
	const shouldLoadBridge = transport === 'bridge' || transport === 'hybrid';
	const shouldLoadLocal = transport === 'local' || transport === 'hybrid';
	let bridgeSnapshot: SessionBridgeToolSnapshot | undefined;

	if (!shouldLoadBridge) {
		clearBridgeToolSnapshotSession(options.sessionKey);
	}

	const bridgeSnapshotPromise = shouldLoadBridge
		? snowBridgeClient
				.getManifest(options.config)
				.then(manifest =>
					buildSessionBridgeToolSnapshot(options.sessionKey, manifest),
				)
		: Promise.resolve<SessionBridgeToolSnapshot | undefined>(undefined);
	const localToolPlanePromise = shouldLoadLocal
		? Promise.all([collectAllMCPTools(), getMCPServicesInfo()]).then(
				([localTools, localServicesInfo]): LocalToolPlane => ({
					localTools,
					localServicesInfo,
				}),
			)
		: Promise.resolve(EMPTY_LOCAL_TOOL_PLANE);

	const [bridgeResult, localResult] = await Promise.allSettled([
		bridgeSnapshotPromise,
		localToolPlanePromise,
	]);

	if (localResult.status === 'rejected') {
		throw localResult.reason;
	}

	if (bridgeResult.status === 'fulfilled') {
		bridgeSnapshot = bridgeResult.value;
	} else if (shouldLoadBridge) {
		clearBridgeToolSnapshotSession(options.sessionKey);
		clearToolExecutionBindingsSession(options.sessionKey);

		if (transport === 'bridge') {
			throw bridgeResult.reason;
		}

		logger.warn(
			'[VCPTools] SnowBridge manifest load failed in hybrid mode, fallback to local tools only:',
			bridgeResult.reason,
		);
	}

	const {localTools, localServicesInfo} = localResult.value;

	const registry = resolveToolRegistry({
		config: options.config,
		localTools,
		localServicesInfo,
		bridgeSnapshot,
	});
	const toolPlaneKey = rotateToolExecutionBindingsSession({
		sessionKey: options.sessionKey,
		nextToolPlaneKey:
			bridgeSnapshot?.snapshotKey ||
			resolveFallbackToolPlaneKey(options.sessionKey),
		bindings: registry.executionBindings,
	});

	return {
		tools: registry.tools,
		servicesInfo: registry.servicesInfo,
		duplicateToolNames: registry.duplicateToolNames,
		toolPlaneKey,
	};
}
