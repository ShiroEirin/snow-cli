import {
	collectAllMCPTools,
	getMCPServicesInfo,
	type MCPServiceTools,
	type MCPTool,
} from '../../execution/mcpToolsManager.js';
import type {ApiConfig} from '../../config/apiConfig.js';
import {
	snowBridgeClient,
	type BridgeManifestToolFilters,
} from './bridgeClient.js';
import {
	buildSessionBridgeToolSnapshot,
	clearBridgeToolSnapshotSession,
	type SessionBridgeToolSnapshot,
} from './toolSnapshot.js';
import {
	buildToolPlaneRuntimeState,
	resolveToolRegistry,
	resolveToolTransport,
	type ToolPlaneRuntimeState,
} from './toolRouteArbiter.js';
import {
	clearToolExecutionBindingsSession,
	rotateToolExecutionBindingsSession,
} from './toolExecutionBinding.js';
import {DEFAULT_TOOL_PLANE_KEY} from './constants.js';
import {logger} from '../../core/logger.js';

export type PreparedToolPlane = {
	tools: MCPTool[];
	servicesInfo: MCPServiceTools[];
	duplicateToolNames: string[];
	toolPlaneKey: string;
	runtimeState: ToolPlaneRuntimeState;
};

type LocalToolPlane = {
	localTools: MCPTool[];
	localServicesInfo: MCPServiceTools[];
};

const EMPTY_LOCAL_TOOL_PLANE: LocalToolPlane = {
	localTools: [],
	localServicesInfo: [],
};

export function buildBridgeManifestToolFilters(options: {
	config?: Pick<ApiConfig, 'bridgeToolProfile'>;
	transport: ReturnType<typeof resolveToolTransport>;
	localTools: MCPTool[];
}): BridgeManifestToolFilters | undefined {
	const profileName = String(options.config?.bridgeToolProfile || '').trim();
	const excludeExactToolNames =
		options.transport === 'hybrid' && options.localTools.length > 0
			? Array.from(
					new Set(
						options.localTools
							.map(tool => tool.function.name.trim())
							.filter(Boolean),
					),
			  ).sort((left, right) => left.localeCompare(right))
			: [];

	if (!profileName && excludeExactToolNames.length === 0) {
		return undefined;
	}

	return {
		...(profileName ? {profileName} : {}),
		excludeExactToolNames,
	};
}

export function buildPreparedToolPlaneRuntimeState(options: {
	config: Pick<ApiConfig, 'toolTransport'>;
	registry: Pick<ReturnType<typeof resolveToolRegistry>, 'retainedToolCounts'>;
	localDiscoveredToolCount: number;
	bridgeDiscoveredToolCount: number;
	bridgeLoadFailed?: boolean;
}): ToolPlaneRuntimeState {
	return buildToolPlaneRuntimeState({
		config: options.config,
		localDiscoveredToolCount: options.localDiscoveredToolCount,
		localRetainedToolCount: options.registry.retainedToolCounts.local,
		bridgeDiscoveredToolCount: options.bridgeDiscoveredToolCount,
		bridgeRetainedToolCount: options.registry.retainedToolCounts.bridge,
		bridgeLoadFailed: options.bridgeLoadFailed,
	});
}

function resolveFallbackToolPlaneKey(sessionKey?: string): string {
	return sessionKey?.trim() || DEFAULT_TOOL_PLANE_KEY;
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

	const {localTools, localServicesInfo} = localResult.value;

	const registry = resolveToolRegistry({
		config: options.config,
		localTools,
		localServicesInfo,
		bridgeSnapshot,
	});
	const runtimeState = buildPreparedToolPlaneRuntimeState({
		config: options.config,
		registry,
		localDiscoveredToolCount: localTools.length,
		bridgeDiscoveredToolCount: bridgeSnapshot?.modelTools.length || 0,
		bridgeLoadFailed:
			shouldLoadBridge && bridgeResult.status === 'rejected',
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
		runtimeState,
	};
}
