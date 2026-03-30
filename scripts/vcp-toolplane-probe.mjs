import process from 'node:process';
import {performance} from 'node:perf_hooks';
import {
	clearConfigCache,
	getOpenAiConfig,
} from '../source/utils/config/apiConfig.ts';
import {clearMCPToolsCache} from '../source/utils/execution/mcpToolsManager.ts';
import {prepareToolPlane} from '../source/utils/session/vcpCompatibility/toolPlaneFacade.ts';
import {snowBridgeClient} from '../source/utils/session/vcpCompatibility/bridgeClient.ts';

const LEGACY_PATTERNS = [
	/TOOL_REQUEST/i,
	/tool_name\s*[=:]/i,
	/<<<\[/,
	/^\**\s*(?:调用示例|调用格式|示例)(?:\s*[（(][^)）]+[)）])?\s*[:：]/im,
	/「始」|「末」/,
];
const VALID_MODES = new Set(['local', 'bridge', 'hybrid']);
const DEFAULT_PERF_ITERATIONS = 3;

function parseArguments(argv) {
	const options = {
		perf: false,
		modes: [],
		iterations: DEFAULT_PERF_ITERATIONS,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === '--perf') {
			options.perf = true;
			continue;
		}

		if (arg === '--mode') {
			const mode = argv[index + 1];
			if (!VALID_MODES.has(mode)) {
				throw new Error(`Unsupported --mode value: ${mode || '(empty)'}`);
			}

			options.modes.push(mode);
			index += 1;
			continue;
		}

		if (arg === '--modes') {
			const values = String(argv[index + 1] || '')
				.split(',')
				.map(value => value.trim())
				.filter(Boolean);
			for (const value of values) {
				if (!VALID_MODES.has(value)) {
					throw new Error(`Unsupported --modes value: ${value}`);
				}
				options.modes.push(value);
			}

			index += 1;
			continue;
		}

		if (arg === '--iterations') {
			const value = Number.parseInt(argv[index + 1] || '', 10);
			if (!Number.isInteger(value) || value <= 0) {
				throw new Error(`Invalid --iterations value: ${argv[index + 1] || '(empty)'}`);
			}

			options.iterations = value;
			index += 1;
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	return options;
}

function resolveModes(baseConfig, requestedModes) {
	if (requestedModes.length > 0) {
		return Array.from(new Set(requestedModes));
	}

	if (baseConfig.bridgeVcpKey?.trim()) {
		return ['local', 'bridge', 'hybrid'];
	}

	return ['local'];
}

function buildModeConfig(baseConfig, mode) {
	return {
		...baseConfig,
		toolTransport: mode,
	};
}

function validateModeConfig(config, mode) {
	if ((mode === 'bridge' || mode === 'hybrid') && !config.bridgeVcpKey?.trim()) {
		throw new Error(
			`Mode "${mode}" requires bridgeVcpKey in ~/.snow/config.json or the active profile.`,
		);
	}
}

function roundElapsedMs(value) {
	return Math.round(value * 100) / 100;
}

function summarizeToolPlane(mode, phase, elapsedMs, plane) {
	const toolNames = plane.tools.map(tool => tool.function.name);
	const duplicateCount = toolNames.length - new Set(toolNames).size;
	const legacyTools = plane.tools
		.map(tool => {
			const matchedPattern = LEGACY_PATTERNS.find(pattern =>
				pattern.test(tool.function.description || ''),
			);
			if (!matchedPattern) {
				return null;
			}

			return {
				name: tool.function.name,
				pattern: matchedPattern.source,
			};
		})
		.filter(Boolean);

	return {
		entry: 'toolplane-probe',
		mode,
		phase,
		elapsedMs: roundElapsedMs(elapsedMs),
		count: plane.tools.length,
		duplicates: duplicateCount,
		legacy: legacyTools.length,
		legacyTools,
		toolPlaneKey: plane.toolPlaneKey,
	};
}

async function resetModeState(config, mode) {
	if (mode === 'local' || mode === 'hybrid') {
		clearMCPToolsCache();
	}

	if (mode === 'bridge' || mode === 'hybrid') {
		snowBridgeClient.clearManifestCache(config);
		snowBridgeClient.disconnect();
	}
}

async function executeMode(config, mode, phase) {
	const sessionKey = `vcp-toolplane-probe:${mode}:${phase}:${Date.now()}`;
	const startedAt = performance.now();
	const plane = await prepareToolPlane({
		config,
		sessionKey,
	});

	return summarizeToolPlane(mode, phase, performance.now() - startedAt, plane);
}

function buildFailures(results) {
	const failures = [];

	for (const result of results) {
		if (result.count <= 0) {
			failures.push(`${result.mode}/${result.phase}: tool count is 0`);
		}

		if (result.duplicates > 0) {
			failures.push(
				`${result.mode}/${result.phase}: duplicate tool count = ${result.duplicates}`,
			);
		}

		if (result.legacy > 0) {
			failures.push(
				`${result.mode}/${result.phase}: legacy protocol pollution = ${result.legacy}`,
			);
		}
	}

	return failures;
}

function summarizePerformance(results) {
	const grouped = new Map();
	for (const result of results) {
		const modeResults = grouped.get(result.mode) || [];
		modeResults.push(result);
		grouped.set(result.mode, modeResults);
	}

	return Array.from(grouped.entries()).map(([mode, entries]) => {
		const cold = entries.find(entry => entry.phase === 'cold');
		const warmEntries = entries.filter(entry => entry.phase !== 'cold');
		const warmAverageMs =
			warmEntries.length === 0
				? 0
				: roundElapsedMs(
						warmEntries.reduce((sum, entry) => sum + entry.elapsedMs, 0) /
							warmEntries.length,
					);

		return {
			mode,
			toolCount: entries[0]?.count || 0,
			coldElapsedMs: cold?.elapsedMs || 0,
			warmAverageMs,
			warmRuns: warmEntries.length,
		};
	});
}

async function run() {
	clearConfigCache();
	const baseConfig = getOpenAiConfig();
	const options = parseArguments(process.argv.slice(2));
	const modes = resolveModes(baseConfig, options.modes);
	const results = [];

	for (const mode of modes) {
		const config = buildModeConfig(baseConfig, mode);
		validateModeConfig(config, mode);

		if (options.perf) {
			await resetModeState(config, mode);
			results.push(await executeMode(config, mode, 'cold'));
			for (let index = 1; index <= options.iterations; index += 1) {
				results.push(await executeMode(config, mode, `warm-${index}`));
			}
			continue;
		}

		await resetModeState(config, mode);
		results.push(await executeMode(config, mode, 'baseline'));
	}

	const failures = buildFailures(results);
	const payload = {
		config: {
			entry: 'toolplane-probe',
			baseUrl: baseConfig.baseUrl,
			backendMode: baseConfig.backendMode,
			requestMethod: baseConfig.requestMethod,
			modes,
			perf: options.perf,
			iterations: options.perf ? options.iterations : 1,
		},
		results,
		...(options.perf
			? {
					performanceSummary: summarizePerformance(results),
				}
			: {}),
		...(failures.length > 0 ? {failures} : {}),
	};

	console.log(JSON.stringify(payload, null, 2));
	process.exitCode = failures.length > 0 ? 1 : 0;
}

try {
	await run();
} catch (error) {
	console.error(
		JSON.stringify(
			{
				error: error instanceof Error ? error.message : String(error),
			},
			null,
			2,
		),
	);
	process.exitCode = 1;
} finally {
	snowBridgeClient.disconnect();
}
