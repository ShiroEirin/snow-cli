import type {ChatCompletionTool} from '../../api/types.js';
import type {
	SnowToolSpec,
	ToolRegistryConflict,
	ToolRegistrySnapshot,
} from './types.js';

function normalizeToolIdSegment(value: string): string {
	return (
		String(value || '')
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, '_')
			.replace(/^_+|_+$/g, '') || 'tool'
	);
}

function ensureUniqueKey(
	baseKey: string,
	seenKeys: Set<string>,
): string {
	if (!seenKeys.has(baseKey)) {
		seenKeys.add(baseKey);
		return baseKey;
	}

	let suffix = 2;
	while (seenKeys.has(`${baseKey}_${suffix}`)) {
		suffix += 1;
	}

	const uniqueKey = `${baseKey}_${suffix}`;
	seenKeys.add(uniqueKey);
	return uniqueKey;
}

export function createSnowToolId(spec: {
	owner: SnowToolSpec['owner'];
	serviceName: string;
	originName: string;
}): string {
	return [
		normalizeToolIdSegment(spec.owner),
		normalizeToolIdSegment(spec.serviceName),
		normalizeToolIdSegment(spec.originName),
	].join(':');
}

export function toChatCompletionTool(spec: SnowToolSpec): ChatCompletionTool {
	return {
		type: 'function',
		function: {
			name: spec.publicName,
			description: spec.description,
			parameters: spec.inputSchema,
		},
	};
}

export function buildToolRegistrySnapshot(
	specs: SnowToolSpec[],
): ToolRegistrySnapshot {
	const toolsById = new Map<string, SnowToolSpec>();
	const toolsByPublicName = new Map<string, SnowToolSpec>();
	const seenToolIds = new Set<string>();
	const seenPublicNames = new Set<string>();
	const conflictBuckets = new Map<string, SnowToolSpec[]>();
	const normalizedTools: SnowToolSpec[] = [];

	for (const spec of specs) {
		const baseToolId =
			spec.toolId ||
			createSnowToolId({
				owner: spec.owner,
				serviceName: spec.serviceName,
				originName: spec.originName,
			});
		const toolId = ensureUniqueKey(baseToolId, seenToolIds);
		const requestedPublicName =
			String(spec.publicName || spec.originName || '').trim() || toolId;
		const publicName = ensureUniqueKey(
			requestedPublicName,
			seenPublicNames,
		);
		const normalizedSpec: SnowToolSpec = {
			...spec,
			toolId,
			publicName,
			aliases:
				requestedPublicName === publicName
					? spec.aliases
					: Array.from(
							new Set([...(spec.aliases || []), requestedPublicName]),
						),
		};

		normalizedTools.push(normalizedSpec);
		toolsById.set(toolId, normalizedSpec);
		toolsByPublicName.set(publicName, normalizedSpec);

		if (!conflictBuckets.has(requestedPublicName)) {
			conflictBuckets.set(requestedPublicName, []);
		}

		conflictBuckets.get(requestedPublicName)?.push(normalizedSpec);
	}

	const conflicts: ToolRegistryConflict[] = [];
	for (const [publicName, bucket] of conflictBuckets.entries()) {
		if (bucket.length < 2) {
			continue;
		}

		conflicts.push({
			publicName,
			toolIds: bucket.map(spec => spec.toolId),
			resolvedNames: bucket.map(spec => spec.publicName),
		});
	}

	return {
		tools: normalizedTools,
		publicTools: normalizedTools.map(toChatCompletionTool),
		toolsById,
		toolsByPublicName,
		conflicts,
	};
}
