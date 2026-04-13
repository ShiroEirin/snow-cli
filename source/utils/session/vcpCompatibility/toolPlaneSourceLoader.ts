import {
	collectAllMCPTools,
	getMCPServicesInfo,
	type MCPServiceTools,
	type MCPTool,
} from '../../execution/mcpToolsManager.js';
import type {
	SnowBridgeApiConfig,
	VcpApiConfig,
} from '../../config/apiConfig.js';
import {logger} from '../../core/logger.js';
import {snowBridgeClient} from './bridgeClient.js';
import {
	buildSessionBridgeToolSnapshot,
	clearBridgeToolSnapshotSession,
	type SessionBridgeToolSnapshot,
} from './toolSnapshot.js';
import {clearToolExecutionBindingsSession} from './toolExecutionBinding.js';
import {buildBridgeManifestToolFilters} from './toolPlaneFilters.js';
import {resolveToolTransport} from './toolRouteArbiter.js';

type LocalToolPlane = {
	localTools: MCPTool[];
	localServicesInfo: MCPServiceTools[];
};

const EMPTY_LOCAL_TOOL_PLANE: LocalToolPlane = {
	localTools: [],
	localServicesInfo: [],
};

type PreparedToolPlaneConfig = SnowBridgeApiConfig &
	Pick<VcpApiConfig, 'bridgeToolProfile'>;

export async function loadPreparedToolPlaneSources(options: {
	config: PreparedToolPlaneConfig;
	sessionKey?: string;
}): Promise<{
	localTools: MCPTool[];
	localServicesInfo: MCPServiceTools[];
	bridgeSnapshot?: SessionBridgeToolSnapshot;
	bridgeLoadFailed: boolean;
}> {
	const transport = resolveToolTransport(options.config);
	const shouldLoadBridge = transport === 'bridge' || transport === 'hybrid';
	const shouldLoadLocal = transport === 'local' || transport === 'hybrid';
	let bridgeSnapshot: SessionBridgeToolSnapshot | undefined;

	if (!shouldLoadBridge) {
		clearBridgeToolSnapshotSession(options.sessionKey);
	}

	const localToolsPromise = shouldLoadLocal
		? collectAllMCPTools()
		: Promise.resolve<MCPTool[]>([]);
	const localServicesInfoPromise = shouldLoadLocal
		? getMCPServicesInfo()
		: Promise.resolve<MCPServiceTools[]>([]);
	const bridgeSnapshotPromise = shouldLoadBridge
		? localToolsPromise
				.then(localTools =>
					snowBridgeClient.getManifest(options.config, {
						toolFilters: buildBridgeManifestToolFilters({
							config: options.config,
							transport,
							localTools,
						}),
					}),
				)
				.then(manifest =>
					buildSessionBridgeToolSnapshot(options.sessionKey, manifest),
				)
		: Promise.resolve<SessionBridgeToolSnapshot | undefined>(undefined);
	const localToolPlanePromise = shouldLoadLocal
		? Promise.all([localToolsPromise, localServicesInfoPromise]).then(
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

	return {
		localTools: localResult.value.localTools,
		localServicesInfo: localResult.value.localServicesInfo,
		bridgeSnapshot,
		bridgeLoadFailed: shouldLoadBridge && bridgeResult.status === 'rejected',
	};
}
