import type {
	SnowToolCall,
	SnowToolOwner,
	SnowToolSpec,
	ToolRegistrySnapshot,
} from './types.js';

export type SnowToolExecutor = (
	spec: SnowToolSpec,
	call: SnowToolCall,
	args: unknown,
	context: {abortSignal?: AbortSignal; registry: ToolRegistrySnapshot},
) => Promise<unknown>;

export type SnowToolExecutorMap = Partial<
	Record<SnowToolOwner, SnowToolExecutor>
>;

export function resolveSnowToolSpec(
	registry: ToolRegistrySnapshot,
	call: Pick<SnowToolCall, 'toolId' | 'publicName' | 'rawName'>,
): SnowToolSpec | undefined {
	if (call.toolId) {
		const byId = registry.toolsById.get(call.toolId);
		if (byId) {
			return byId;
		}
	}

	const requestedName = String(
		call.publicName || call.rawName || '',
	).trim();
	if (!requestedName) {
		return undefined;
	}

	const byPublicName = registry.toolsByPublicName.get(requestedName);
	if (byPublicName) {
		return byPublicName;
	}

	return registry.tools.find(spec => spec.aliases?.includes(requestedName));
}

export async function tryRouteSnowToolCall(
	registry: ToolRegistrySnapshot,
	call: SnowToolCall,
	args: unknown,
	executors: SnowToolExecutorMap,
	context: {abortSignal?: AbortSignal} = {},
): Promise<
	| {matched: false}
	| {matched: true; spec: SnowToolSpec; result: unknown}
> {
	const spec = resolveSnowToolSpec(registry, call);
	if (!spec) {
		return {matched: false};
	}

	const executor = executors[spec.owner];
	if (!executor) {
		throw new Error(
			`No executor registered for tool owner "${spec.owner}" (${spec.publicName}).`,
		);
	}

	const result = await executor(spec, call, args, {
		abortSignal: context.abortSignal,
		registry,
	});

	return {matched: true, spec, result};
}
