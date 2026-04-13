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

function resolvePreparedToolPlaneLoadFlags(
	config: PreparedToolPlaneConfig,
): {
	transport: ReturnType<typeof resolveToolTransport>;
	shouldLoadBridge: boolean;
	shouldLoadLocal: boolean;
} {
	const transport = resolveToolTransport(config);
	return {
		transport,
		shouldLoadBridge: transport === 'bridge' || transport === 'hybrid',
		shouldLoadLocal: transport === 'local' || transport === 'hybrid',
	};
}

function loadLocalToolPlane(
	shouldLoadLocal: boolean,
): Promise<LocalToolPlane> {
	if (!shouldLoadLocal) {
		return Promise.resolve(EMPTY_LOCAL_TOOL_PLANE);
	}

	return Promise.all([collectAllMCPTools(), getMCPServicesInfo()]).then(
		([localTools, localServicesInfo]): LocalToolPlane => ({
			localTools,
			localServicesInfo,
		}),
	);
}

function loadBridgeSnapshot(options: {
	config: PreparedToolPlaneConfig;
	sessionKey?: string;
	transport: ReturnType<typeof resolveToolTransport>;
	shouldLoadBridge: boolean;
	localToolPlanePromise: Promise<LocalToolPlane>;
}): Promise<SessionBridgeToolSnapshot | undefined> {
	if (!options.shouldLoadBridge) {
		return Promise.resolve(undefined);
	}

	return options.localToolPlanePromise
		.then(localToolPlane =>
			snowBridgeClient.getManifest(options.config, {
				toolFilters: buildBridgeManifestToolFilters({
					config: options.config,
					transport: options.transport,
					localTools: localToolPlane.localTools,
				}),
			}),
		)
		.then(manifest =>
			buildSessionBridgeToolSnapshot(options.sessionKey, manifest),
		);
}

function handleBridgeSnapshotFailure(options: {
	sessionKey?: string;
	transport: ReturnType<typeof resolveToolTransport>;
	bridgeError: unknown;
}): never | void {
	clearBridgeToolSnapshotSession(options.sessionKey);
	clearToolExecutionBindingsSession(options.sessionKey);

	if (options.transport === 'bridge') {
		throw options.bridgeError;
	}

	logger.warn(
		'[VCPTools] SnowBridge manifest load failed in hybrid mode, fallback to local tools only:',
		options.bridgeError,
	);
}

export async function loadPreparedToolPlaneSources(options: {
	config: PreparedToolPlaneConfig;
	sessionKey?: string;
}): Promise<{
	localTools: MCPTool[];
	localServicesInfo: MCPServiceTools[];
	bridgeSnapshot?: SessionBridgeToolSnapshot;
	bridgeLoadFailed: boolean;
}> {
	const {transport, shouldLoadBridge, shouldLoadLocal} =
		resolvePreparedToolPlaneLoadFlags(options.config);
	let bridgeSnapshot: SessionBridgeToolSnapshot | undefined;

	if (!shouldLoadBridge) {
		clearBridgeToolSnapshotSession(options.sessionKey);
	}

	const localToolPlanePromise = loadLocalToolPlane(shouldLoadLocal);
	const bridgeSnapshotPromise = loadBridgeSnapshot({
		config: options.config,
		sessionKey: options.sessionKey,
		transport,
		shouldLoadBridge,
		localToolPlanePromise,
	});

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
		handleBridgeSnapshotFailure({
			sessionKey: options.sessionKey,
			transport,
			bridgeError: bridgeResult.reason,
		});
	}

	return {
		localTools: localResult.value.localTools,
		localServicesInfo: localResult.value.localServicesInfo,
		bridgeSnapshot,
		bridgeLoadFailed: shouldLoadBridge && bridgeResult.status === 'rejected',
	};
}
