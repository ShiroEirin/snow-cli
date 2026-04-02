import process from 'node:process';
import os from 'node:os';
import net from 'node:net';
import {spawn, spawnSync} from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const VALID_MODES = new Set(['local', 'bridge', 'hybrid']);
const VALID_SUITES = new Set(['core', 'subagent', 'team']);
const OPTIONAL_SNOW_FILES = [
	'proxy-config.json',
	'mcp-config.json',
	'custom-headers.json',
	'system-prompt.json',
];
const REQUEST_TIMEOUT_MS = 180000;
const HEALTH_TIMEOUT_MS = 30000;
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SUITE = 'core';
const DEFAULT_BASE_CONFIG = {
	snowcfg: {
		baseUrl: 'https://api.openai.com/v1',
		apiKey: '',
		requestMethod: 'chat',
		backendMode: 'native',
		toolTransport: 'local',
		advancedModel: '',
		basicModel: '',
		maxContextTokens: 120000,
		maxTokens: 32000,
		anthropicBeta: false,
		streamIdleTimeoutSec: 180,
		editSimilarityThreshold: 0.75,
		streamingDisplay: false,
	},
};
const LOCAL_READ_PROBE = {
	query: 'source/cli.tsx',
	expectedContent: '#!/usr/bin/env node',
	fallbacks: [
		'source/cli.tsx',
		join('snow-cli', 'source', 'cli.tsx'),
	],
};
const BRIDGE_SEARCH_PROBE = {
	query: 'SnowBridge',
};

export function validateBridgeSearchToolResult(options = {}) {
	const {parsedToolResult} = options;
	const resultItems = Array.isArray(parsedToolResult)
		? parsedToolResult
		: Array.isArray(parsedToolResult?.result)
			? parsedToolResult.result
			: [];

	if (
		parsedToolResult &&
		!Array.isArray(parsedToolResult) &&
		parsedToolResult.status &&
		parsedToolResult.status !== 'success'
	) {
		throw new Error(
			`Bridge search tool returned non-success status: ${parsedToolResult.status}`,
		);
	}

	const firstResultPath = resultItems
		.map(item =>
			typeof item?.file_path === 'string'
				? item.file_path
				: typeof item?.path === 'string'
					? item.path
					: '',
		)
		.find(Boolean);

	if (!firstResultPath) {
		throw new Error(
			'Bridge search tool result did not contain a matched file path.',
		);
	}

	return {
		expectedAssistantIncludes: normalizeComparableText(firstResultPath),
	};
}

function buildCoreModeScenarios(expectedContent) {
	return {
		local: [
			{
				name: 'filesystem-read',
				buildPrompt: filePath =>
					`Call exactly the tool \`filesystem-read\` on the file \`${filePath}\`. After the tool returns, reply with the first line only.`,
				expectedTool: 'filesystem-read',
				expectedToolResultIncludes: expectedContent,
				expectedAssistantIncludes: expectedContent,
			},
		],
		bridge: [
			{
				name: 'bridge-search',
				validateToolResult: validateBridgeSearchToolResult,
				prompt:
					`Call exactly the tool \`vcp-servercodesearcher-searchcode\` to search this workspace for \`${BRIDGE_SEARCH_PROBE.query}\`. After the tool returns, reply with the first matched file path only.`,
				expectedTool: 'vcp-servercodesearcher-searchcode',
			},
		],
		hybrid: [
			{
				name: 'filesystem-read',
				buildPrompt: filePath =>
					`Call exactly the tool \`filesystem-read\` on the file \`${filePath}\`. After the tool returns, reply with the first line only.`,
				expectedTool: 'filesystem-read',
				expectedToolResultIncludes: expectedContent,
				expectedAssistantIncludes: expectedContent,
			},
			{
				name: 'bridge-search',
				validateToolResult: validateBridgeSearchToolResult,
				prompt:
					`Call exactly the tool \`vcp-servercodesearcher-searchcode\` to search this workspace for \`${BRIDGE_SEARCH_PROBE.query}\`. After the tool returns, reply with the first matched file path only.`,
				expectedTool: 'vcp-servercodesearcher-searchcode',
			},
		],
	};
}

function buildSubagentModeScenarios(expectedContent) {
	return {
		local: [
			{
				name: 'subagent-explore',
				buildPrompt: filePath =>
					`Call exactly the tool \`subagent-agent_explore\` with a prompt that tells the sub-agent to use \`filesystem-read\` on \`${filePath}\` and return only the first line. After the tool returns, reply with the first line only.`,
				expectedTool: 'subagent-agent_explore',
				expectedAssistantIncludes: expectedContent,
			},
		],
	};
}

function buildTeamModeScenarios(expectedContent) {
	return {
		local: [
			{
				name: 'team-runtime',
				buildPrompt: filePath =>
					[
						'You are validating Agent Team mode in this git repository.',
						'Follow this exact tool sequence:',
						'1. Call `team-spawn_teammate` with name `reader` and a prompt telling the teammate to read the file path below, then wait for further messages.',
						'2. Call `team-wait_for_teammates`.',
						'3. Call `team-shutdown_teammate` for `reader`.',
						'4. Call `team-merge_all_teammate_work` with strategy `auto`.',
						'5. Call `team-cleanup_team`.',
						'6. Call `filesystem-read` on the same file path.',
						'After all tools return, reply with the first line only.',
						`Target file: ${filePath}`,
					].join(' '),
				expectedAssistantIncludes: expectedContent,
				validateMessages: ({messages, previousMessageCount, scenario}) => {
					const collectedToolCalls = collectToolCalls(messages);
					const expectedSequence = [
						'team-spawn_teammate',
						'team-wait_for_teammates',
						'team-shutdown_teammate',
						'team-merge_all_teammate_work',
						'team-cleanup_team',
						'filesystem-read',
					];
					assertToolCallSequence(collectedToolCalls, expectedSequence);
					for (const entry of collectedToolCalls) {
						if (expectedSequence.includes(entry.toolCall.function.name)) {
							const toolResultMessage = messages.find(
								message => message.tool_call_id === entry.toolCall.id,
							);
							if (!toolResultMessage?.content) {
								throw new Error(
									`Expected tool result for "${entry.toolCall.function.name}" was not recorded in session history.`,
								);
							}

							if (String(toolResultMessage.content).startsWith('Error:')) {
								throw new Error(
									`Tool result for "${entry.toolCall.function.name}" failed: ${toolResultMessage.content}`,
								);
							}
						}
					}

					const finalAssistantContent = extractFinalAssistantContent({
						messages,
						expectedAssistantIncludes: scenario.expectedAssistantIncludes,
						expectedTool: 'filesystem-read',
					});
					return {
						scenario: scenario.name,
						expectedTool: 'team-spawn_teammate',
						toolCall: collectedToolCalls[0]?.toolCall,
						toolResultPreview: 'team sequence completed',
						finalAssistantPreview: finalAssistantContent.slice(0, 240),
						messageCount: previousMessageCount + messages.length,
					};
				},
			},
		],
	};
}

function getModeScenarios(options) {
	const expectedContent =
		options.probeExpected || LOCAL_READ_PROBE.expectedContent;
	switch (options.suite) {
		case 'subagent':
			return buildSubagentModeScenarios(expectedContent);
		case 'team':
			return buildTeamModeScenarios(expectedContent);
		case 'core':
		default:
			return buildCoreModeScenarios(expectedContent);
	}
}

function resolvePathFrom(baseDir, candidate) {
	return isAbsolute(candidate) ? resolve(candidate) : resolve(baseDir, candidate);
}

function readJsonFile(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function normalizeConfigShape(parsedConfig) {
	if (!parsedConfig || typeof parsedConfig !== 'object') {
		return structuredClone(DEFAULT_BASE_CONFIG);
	}

	return {
		...structuredClone(DEFAULT_BASE_CONFIG),
		...parsedConfig,
		snowcfg: {
			...structuredClone(DEFAULT_BASE_CONFIG).snowcfg,
			...(parsedConfig?.snowcfg || parsedConfig?.openai || {}),
		},
	};
}

function tryLoadProfileConfig(snowDir) {
	const activeProfilePath = join(snowDir, 'active-profile.json');
	const profileCandidates = [];

	if (existsSync(activeProfilePath)) {
		try {
			const activeProfile = String(
				readJsonFile(activeProfilePath)?.activeProfile || '',
			).trim();
			if (activeProfile) {
				profileCandidates.push(activeProfile);
			}
		} catch {}
	}

	profileCandidates.push('default');

	for (const profileName of new Set(profileCandidates)) {
		const profilePath = join(snowDir, 'profiles', `${profileName}.json`);
		if (!existsSync(profilePath)) {
			continue;
		}

		return {
			configPath: profilePath,
			configSource: `profile:${profileName}`,
			parsedConfig: normalizeConfigShape(readJsonFile(profilePath)),
			sourceSnowDir: snowDir,
		};
	}

	return null;
}

export function resolveRuntimeWorkDir(options = {}) {
	const {
		workDir,
		invocationCwd = process.cwd(),
		projectRoot = PROJECT_ROOT,
	} = options;
	const explicitWorkDir = workDir || process.env['VCP_BLACKBOX_WORKDIR'];
	if (explicitWorkDir) {
		return resolvePathFrom(invocationCwd, String(explicitWorkDir));
	}

	const anchoredProjectRoot = resolve(projectRoot);
	if (existsSync(join(anchoredProjectRoot, '.snow', 'settings.json'))) {
		return anchoredProjectRoot;
	}

	return anchoredProjectRoot;
}

export function resolveReadTarget(workDir, probeFile) {
	if (probeFile) {
		const explicitTarget = join(workDir, probeFile);
		if (!existsSync(explicitTarget)) {
			throw new Error(
				`Unable to resolve explicit probe target (${probeFile}) from runtime work dir: ${workDir}`,
			);
		}

		return explicitTarget.replaceAll('\\', '/');
	}

	for (const relativePath of LOCAL_READ_PROBE.fallbacks) {
		const absolutePath = join(workDir, relativePath);
		if (existsSync(absolutePath)) {
			return absolutePath.replaceAll('\\', '/');
		}
	}

	throw new Error(
		`Unable to resolve local filesystem probe target (${LOCAL_READ_PROBE.query}) from runtime work dir: ${workDir}`,
	);
}

function assertGitRepository(repoPath) {
	const result = spawnSync(
		'git',
		['-C', repoPath, 'rev-parse', '--is-inside-work-tree'],
		{encoding: 'utf8'},
	);
	if (result.status !== 0) {
		throw new Error(`Team blackbox requires a Git repository work dir: ${repoPath}`);
	}
}

function prepareScenarioWorkDir(options) {
	const {suite, workDir, tempRoot} = options;
	if (suite !== 'team') {
		return {
			runtimeWorkDir: workDir,
			templateRepo: undefined,
		};
	}

	assertGitRepository(workDir);
	const runtimeWorkDir = join(tempRoot, 'team-workspace');
	const cloneResult = spawnSync(
		'git',
		['clone', '--quiet', '--no-local', workDir, runtimeWorkDir],
		{encoding: 'utf8'},
	);
	if (cloneResult.status !== 0) {
		throw new Error(
			[
				`Failed to clone team blackbox workspace from ${workDir}.`,
				cloneResult.stderr?.trim(),
			]
				.filter(Boolean)
				.join('\n'),
		);
	}

	spawnSync(
		'git',
		['-C', runtimeWorkDir, 'config', 'user.name', 'Snow Blackbox'],
		{encoding: 'utf8'},
	);
	spawnSync(
		'git',
		['-C', runtimeWorkDir, 'config', 'user.email', 'snow-blackbox@example.local'],
		{encoding: 'utf8'},
	);

	const settingsDir = join(runtimeWorkDir, '.snow');
	mkdirSync(settingsDir, {recursive: true});
	writeFileSync(
		join(settingsDir, 'settings.json'),
		JSON.stringify({teamMode: true}, null, 2),
		'utf8',
	);

	return {
		runtimeWorkDir,
		templateRepo: workDir,
	};
}

function resolveCliEntrypoint() {
	const bundleEntry = join(PROJECT_ROOT, 'bundle', 'cli.mjs');
	if (existsSync(bundleEntry)) {
		return {
			command: process.execPath,
			args: [bundleEntry],
			label: 'bundle/cli.mjs',
		};
	}

	const distEntry = join(PROJECT_ROOT, 'dist', 'cli.js');
	if (existsSync(distEntry)) {
		return {
			command: process.execPath,
			args: [distEntry],
			label: 'dist/cli.js',
		};
	}

	const sourceEntry = join(PROJECT_ROOT, 'source', 'cli.tsx');
	if (existsSync(sourceEntry)) {
		return {
			command: process.execPath,
			args: ['--loader=ts-node/esm/transpile-only', sourceEntry],
			label: 'source/cli.tsx via ts-node/esm/transpile-only',
		};
	}

	throw new Error(
		[
			'Unable to resolve Snow CLI entrypoint.',
			`Checked: ${bundleEntry}`,
			`Checked: ${distEntry}`,
			`Checked: ${sourceEntry}`,
		].join('\n'),
	);
}

export function parseArguments(argv) {
	const options = {
		modes: [],
		suite: DEFAULT_SUITE,
		keepTemp: false,
		timeoutMs: REQUEST_TIMEOUT_MS,
		workDir: undefined,
		configPath: undefined,
		probeFile: undefined,
		probeExpected: undefined,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
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

		if (arg === '--keep-temp') {
			options.keepTemp = true;
			continue;
		}

		if (arg === '--suite') {
			const suite = argv[index + 1];
			if (!VALID_SUITES.has(suite)) {
				throw new Error(`Unsupported --suite value: ${suite || '(empty)'}`);
			}

			options.suite = suite;
			index += 1;
			continue;
		}

		if (arg === '--work-dir') {
			const workDir = argv[index + 1];
			if (!workDir) {
				throw new Error('Invalid --work-dir value: (empty)');
			}

			options.workDir = workDir;
			index += 1;
			continue;
		}

		if (arg === '--probe-file') {
			const probeFile = argv[index + 1];
			if (!probeFile) {
				throw new Error('Invalid --probe-file value: (empty)');
			}

			options.probeFile = probeFile;
			index += 1;
			continue;
		}

		if (arg === '--probe-expected') {
			const probeExpected = argv[index + 1];
			if (!probeExpected) {
				throw new Error('Invalid --probe-expected value: (empty)');
			}

			options.probeExpected = probeExpected;
			index += 1;
			continue;
		}

		if (arg === '--config') {
			const configPath = argv[index + 1];
			if (!configPath) {
				throw new Error('Invalid --config value: (empty)');
			}

			options.configPath = configPath;
			index += 1;
			continue;
		}

		if (arg === '--timeout-ms') {
			const timeoutMs = Number.parseInt(argv[index + 1] || '', 10);
			if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
				throw new Error(`Invalid --timeout-ms value: ${argv[index + 1] || '(empty)'}`);
			}

			options.timeoutMs = timeoutMs;
			index += 1;
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	return options;
}

export function loadBaseConfig(options = {}) {
	const {
		configPath,
		invocationCwd = process.cwd(),
		homeDir = os.homedir(),
	} = options;
	const explicitConfigPath = configPath || process.env['VCP_BLACKBOX_CONFIG'];
	if (explicitConfigPath) {
		const resolvedConfigPath = resolvePathFrom(
			invocationCwd,
			String(explicitConfigPath),
		);
		if (!existsSync(resolvedConfigPath)) {
			throw new Error(`Snow config not found: ${resolvedConfigPath}`);
		}

		const parsedConfig = normalizeConfigShape(readJsonFile(resolvedConfigPath));
		return {
			configPath: resolvedConfigPath,
			configSource: 'explicit',
			parsedConfig,
			snowConfig: parsedConfig.snowcfg || {},
			sourceSnowDir: dirname(resolvedConfigPath),
		};
	}

	const snowDir = join(homeDir, '.snow');
	const defaultConfigPath = join(snowDir, 'config.json');
	if (existsSync(defaultConfigPath)) {
		const parsedConfig = normalizeConfigShape(readJsonFile(defaultConfigPath));
		return {
			configPath: defaultConfigPath,
			configSource: 'home-config',
			parsedConfig,
			snowConfig: parsedConfig.snowcfg || {},
			sourceSnowDir: snowDir,
		};
	}

	const profileConfig = tryLoadProfileConfig(snowDir);
	if (profileConfig) {
		return {
			...profileConfig,
			snowConfig: profileConfig.parsedConfig.snowcfg || {},
		};
	}

	const parsedConfig = structuredClone(DEFAULT_BASE_CONFIG);
	return {
		configPath: null,
		configSource: 'default',
		parsedConfig,
		snowConfig: parsedConfig.snowcfg || {},
		sourceSnowDir: null,
	};
}

function resolveModes(snowConfig, requestedModes) {
	if (requestedModes.length > 0) {
		return Array.from(new Set(requestedModes));
	}

	if (snowConfig.bridgeVcpKey?.trim()) {
		return ['local', 'bridge', 'hybrid'];
	}

	return ['local'];
}

function resolveModesForSuite(suite, snowConfig, requestedModes) {
	if (suite === 'core') {
		return resolveModes(snowConfig, requestedModes);
	}

	if (requestedModes.length === 0) {
		return ['local'];
	}

	const uniqueModes = Array.from(new Set(requestedModes));
	if (uniqueModes.some(mode => mode !== 'local')) {
		throw new Error(`Suite "${suite}" only supports mode "local".`);
	}

	return uniqueModes;
}

function ensureModeSupported(snowConfig, mode) {
	const hasBridgeWsUrl =
		typeof snowConfig.bridgeWsUrl === 'string' &&
		snowConfig.bridgeWsUrl.trim().length > 0;
	if (
		(mode === 'bridge' || mode === 'hybrid') &&
		!hasBridgeWsUrl &&
		!snowConfig.bridgeVcpKey?.trim()
	) {
		throw new Error(
			`Mode "${mode}" requires bridgeVcpKey or bridgeWsUrl in the resolved Snow config.`,
		);
	}
}

function cloneConfigForMode(parsedConfig, mode) {
	return {
		...parsedConfig,
		snowcfg: {
			...(parsedConfig?.snowcfg || {}),
			toolTransport: mode,
		},
	};
}

function createIsolatedSnowHome(parsedConfig, mode, sourceSnowDir) {
	const tempRoot = mkdtempSync(join(os.tmpdir(), 'snow-runtime-blackbox-'));
	const tempSnowDir = join(tempRoot, '.snow');
	mkdirSync(tempSnowDir, {recursive: true});

	writeFileSync(
		join(tempSnowDir, 'config.json'),
		JSON.stringify(cloneConfigForMode(parsedConfig, mode), null, 2),
		'utf8',
	);

	if (sourceSnowDir) {
		for (const fileName of OPTIONAL_SNOW_FILES) {
			const sourcePath = join(sourceSnowDir, fileName);
			if (existsSync(sourcePath)) {
				copyFileSync(sourcePath, join(tempSnowDir, fileName));
			}
		}
	}

	return {
		tempRoot,
		tempSnowDir,
	};
}

function getFreePort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				server.close();
				reject(new Error('Failed to resolve a free port'));
				return;
			}

			const {port} = address;
			server.close(error => {
				if (error) {
					reject(error);
					return;
				}

				resolve(port);
			});
		});
		server.on('error', reject);
	});
}

async function waitForHealth(baseUrl, timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`${baseUrl}/health`);
			if (response.ok) {
				return;
			}
		} catch {}

		await sleep(500);
	}

	throw new Error(`Timed out waiting for SSE health at ${baseUrl}`);
}

function sleep(ms) {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

async function postJson(url, payload) {
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(payload),
	});

	const text = await response.text();
	let parsed;
	try {
		parsed = text ? JSON.parse(text) : {};
	} catch {
		parsed = {raw: text};
	}

	if (!response.ok) {
		throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
	}

	return parsed;
}

async function createEventStream(baseUrl) {
	const controller = new AbortController();
	const response = await fetch(`${baseUrl}/events`, {
		headers: {
			Accept: 'text/event-stream',
		},
		signal: controller.signal,
	});

	if (!response.ok || !response.body) {
		throw new Error(`Failed to open SSE stream: ${response.status} ${response.statusText}`);
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	const events = [];
	const waiters = [];
	let buffer = '';
	let streamError = null;
	let closed = false;

	const settleWaiters = () => {
		for (let index = waiters.length - 1; index >= 0; index -= 1) {
			const waiter = waiters[index];
			const matchedEvent = events.find((event, eventIndex) => {
				if (eventIndex < waiter.startIndex) {
					return false;
				}

				return waiter.predicate(event, eventIndex);
			});

			if (!matchedEvent) {
				continue;
			}

			clearTimeout(waiter.timeout);
			waiters.splice(index, 1);
			waiter.resolve(matchedEvent);
		}
	};

	const streamTask = (async () => {
		try {
			while (true) {
				const {done, value} = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, {stream: true});
				const frames = buffer.split('\n\n');
				buffer = frames.pop() || '';

				for (const frame of frames) {
					for (const line of frame.split('\n')) {
						const trimmed = line.trim();
						if (!trimmed.startsWith('data:')) {
							continue;
						}

						const payload = trimmed.slice(5).trim();
						if (!payload) {
							continue;
						}

						const event = JSON.parse(payload);
						events.push(event);
						settleWaiters();
					}
				}
			}
		} catch (error) {
			if (controller.signal.aborted) {
				return;
			}

			streamError = error instanceof Error ? error : new Error(String(error));
			for (const waiter of waiters.splice(0, waiters.length)) {
				clearTimeout(waiter.timeout);
				waiter.reject(streamError);
			}
		}
	})();

	const waitForEvent = (startIndex, predicate, timeoutMs) => {
		const matchedEvent = events.find((event, eventIndex) => {
			if (eventIndex < startIndex) {
				return false;
			}

			return predicate(event, eventIndex);
		});

		if (matchedEvent) {
			return Promise.resolve(matchedEvent);
		}

		if (streamError) {
			return Promise.reject(streamError);
		}

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				const waiterIndex = waiters.findIndex(waiter => waiter.timeout === timeout);
				if (waiterIndex >= 0) {
					waiters.splice(waiterIndex, 1);
				}

				reject(new Error(`Timed out waiting for SSE event after index ${startIndex}`));
			}, timeoutMs);

			waiters.push({
				startIndex,
				predicate,
				resolve,
				reject,
				timeout,
			});
		});
	};

	const close = async () => {
		if (closed) {
			return;
		}

		closed = true;
		for (const waiter of waiters.splice(0, waiters.length)) {
			clearTimeout(waiter.timeout);
			waiter.reject(new Error('SSE stream closed.'));
		}

		controller.abort();
		await Promise.race([
			reader.cancel().catch(() => {}),
			sleep(1000),
		]);

		try {
			await Promise.race([streamTask, sleep(1000)]);
		} catch {}
	};

	return {
		events,
		waitForEvent,
		close,
	};
}

function buildDaemonLogExcerpt(logFilePath) {
	if (!existsSync(logFilePath)) {
		return '';
	}

	const content = readFileSync(logFilePath, 'utf8');
	return content.split(/\r?\n/).slice(-20).join('\n');
}

async function stopChildProcess(child) {
	const waitForExit = async timeoutMs => {
		if (child.exitCode !== null) {
			return;
		}

		await Promise.race([
			new Promise(resolve => {
				child.once('exit', resolve);
			}),
			sleep(timeoutMs),
		]);
	};

	if (child.exitCode !== null) {
		return;
	}

	child.kill('SIGTERM');
	await waitForExit(5000);

	if (child.exitCode === null) {
		child.kill('SIGKILL');
		await waitForExit(5000);
	}

	child.stdout?.destroy();
	child.stderr?.destroy();
	child.stdin?.destroy();
}

function findSessionFilePath(tempRoot, sessionId) {
	const sessionRoot = join(tempRoot, '.snow', 'sessions');
	const pendingDirs = [sessionRoot];

	while (pendingDirs.length > 0) {
		const currentDir = pendingDirs.pop();
		if (!currentDir || !existsSync(currentDir)) {
			continue;
		}

		for (const entry of readdirSync(currentDir, {withFileTypes: true})) {
			const entryPath = join(currentDir, entry.name);
			if (entry.isDirectory()) {
				pendingDirs.push(entryPath);
				continue;
			}

			if (entry.isFile() && entry.name === `${sessionId}.json`) {
				return entryPath;
			}
		}
	}

	throw new Error(`Unable to locate session file for ${sessionId}`);
}

function readSessionMessages(tempRoot, sessionId) {
	const sessionPath = findSessionFilePath(tempRoot, sessionId);
	const session = JSON.parse(readFileSync(sessionPath, 'utf8'));
	return Array.isArray(session.messages) ? session.messages : [];
}

function normalizeComparableText(value) {
	return String(value).replaceAll('\\', '/');
}

function isRetryableScenarioExtractionError(error) {
	const message =
		error instanceof Error ? error.message : String(error || '');

	return [
		'Unexpected end of JSON input',
		'Unexpected non-whitespace character after JSON',
		'Unable to locate session file for',
		'Expected tool "',
		'Expected tool call sequence was not recorded',
		'Expected tool result for "',
		'Expected final assistant reply for "',
		'Final assistant reply for "',
	].some(fragment => message.includes(fragment));
}

function collectComparableStrings(value, bucket = []) {
	if (typeof value === 'string') {
		bucket.push(value);
		return bucket;
	}

	if (Array.isArray(value)) {
		for (const item of value) {
			collectComparableStrings(item, bucket);
		}

		return bucket;
	}

	if (value && typeof value === 'object') {
		for (const item of Object.values(value)) {
			collectComparableStrings(item, bucket);
		}
	}

	return bucket;
}

function collectToolCalls(messages) {
	const collectedToolCalls = [];
	for (const [messageIndex, message] of messages.entries()) {
		if (!Array.isArray(message.tool_calls)) {
			continue;
		}

		for (const toolCall of message.tool_calls) {
			collectedToolCalls.push({messageIndex, toolCall});
		}
	}

	return collectedToolCalls;
}

function assertToolCallSequence(collectedToolCalls, expectedSequence) {
	let cursor = 0;
	for (const entry of collectedToolCalls) {
		if (entry.toolCall.function.name === expectedSequence[cursor]) {
			cursor += 1;
		}
		if (cursor === expectedSequence.length) {
			return;
		}
	}

	throw new Error(
		`Expected tool call sequence was not recorded: ${expectedSequence.join(' -> ')}`,
	);
}

function extractFinalAssistantContent(options) {
	const {messages, expectedAssistantIncludes, expectedTool} = options;
	const finalAssistantMessage = messages
		.slice()
		.reverse()
		.find(message => {
			if (message?.role !== 'assistant') {
				return false;
			}

			if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
				return false;
			}

			return String(message.content || '').trim().length > 0;
		});
	if (!finalAssistantMessage) {
		throw new Error(
			`Expected final assistant reply for "${expectedTool}" was not recorded in session history.`,
		);
	}

	const finalAssistantContent = String(finalAssistantMessage.content || '').trim();
	if (
		expectedAssistantIncludes &&
		!normalizeComparableText(finalAssistantContent).includes(
			normalizeComparableText(expectedAssistantIncludes),
		)
	) {
		throw new Error(
			`Final assistant reply for "${expectedTool}" did not include expected text "${expectedAssistantIncludes}"`,
		);
	}

	if (
		/<\/?think(?:ing)?>/i.test(finalAssistantContent) ||
		/<<<\[?TOOL_REQUEST\]?>>>|tool_name\s*[:=]/i.test(finalAssistantContent)
	) {
		throw new Error(
			`Final assistant reply for "${expectedTool}" still contained leaked hidden/protocol content.`,
		);
	}

	return finalAssistantContent;
}

export function extractScenarioResultFromSession(options) {
	const {
		messages,
		scenario,
		previousMessageCount,
	} = options;
	const nextMessages = messages.slice(previousMessageCount);
	if (typeof scenario.validateMessages === 'function') {
		return scenario.validateMessages({
			messages: nextMessages,
			scenario,
			previousMessageCount,
		});
	}

	const matchedToolCalls = [];
	let toolCallMessageIndex = -1;

	for (const [messageIndex, message] of nextMessages.entries()) {
		if (!Array.isArray(message.tool_calls)) {
			continue;
		}

		const toolCalls = message.tool_calls.filter(
			toolCall => toolCall?.function?.name === scenario.expectedTool,
		);
		if (toolCalls.length > 0) {
			matchedToolCalls.push(...toolCalls);
			toolCallMessageIndex = messageIndex;
		}
	}

	const matchedToolCall = matchedToolCalls[0];
	if (!matchedToolCall) {
		throw new Error(
			`Expected tool "${scenario.expectedTool}" was not recorded in session history.`,
		);
	}

	if (matchedToolCalls.length > 1) {
		throw new Error(
			`Expected exactly one "${scenario.expectedTool}" tool call, but found ${matchedToolCalls.length}.`,
		);
	}

	const toolResultMessageIndex = nextMessages.findIndex(
		message => message.tool_call_id === matchedToolCall.id,
	);
	const toolResultMessage =
		toolResultMessageIndex >= 0 ? nextMessages[toolResultMessageIndex] : undefined;
	const rawToolResultContent = String(toolResultMessage?.content || '');
	let toolResultContent = rawToolResultContent;
	let toolResultComparableCandidates = [rawToolResultContent];
	let parsedToolResult;
	try {
		parsedToolResult = JSON.parse(rawToolResultContent);
		if (typeof parsedToolResult?.content === 'string') {
			toolResultContent = parsedToolResult.content;
		}

		toolResultComparableCandidates = [
			toolResultContent,
			...collectComparableStrings(parsedToolResult),
		];
	} catch {}

	if (!toolResultContent) {
		throw new Error(
			`Expected tool result for "${scenario.expectedTool}" was not recorded in session history.`,
		);
	}

	if (toolResultContent.startsWith('Error:')) {
		throw new Error(
			`Tool result for "${scenario.expectedTool}" failed: ${toolResultContent}`,
		);
	}

	if (
		scenario.expectedToolResultIncludes &&
		!toolResultComparableCandidates.some(candidate =>
			normalizeComparableText(candidate).includes(
				normalizeComparableText(scenario.expectedToolResultIncludes),
			),
		)
	) {
		throw new Error(
			`Tool result for "${scenario.expectedTool}" did not include expected text "${scenario.expectedToolResultIncludes}"`,
		);
	}

	const scenarioValidation =
		typeof scenario.validateToolResult === 'function'
			? scenario.validateToolResult({
				parsedToolResult,
				rawToolResultContent,
				toolResultComparableCandidates,
			}) || {}
			: {};

	const finalAssistantContent = extractFinalAssistantContent({
		messages: nextMessages.slice(
			Math.max(toolCallMessageIndex, toolResultMessageIndex) + 1,
		),
		expectedAssistantIncludes:
			scenarioValidation.expectedAssistantIncludes ||
			scenario.expectedAssistantIncludes,
		expectedTool: scenario.expectedTool,
	});

	return {
		scenario: scenario.name,
		expectedTool: scenario.expectedTool,
		toolCall: matchedToolCall,
		toolResultPreview: toolResultContent.slice(0, 240),
		finalAssistantPreview: finalAssistantContent.slice(0, 240),
		messageCount: messages.length,
	};
}

export async function waitForScenarioResultFromSession(options) {
	const {
		scenario,
		previousMessageCount,
		timeoutMs,
		readMessages,
		pollIntervalMs = 200,
	} = options;
	const deadline = Date.now() + timeoutMs;
	let lastError;

	while (Date.now() <= deadline) {
		try {
			return extractScenarioResultFromSession({
				messages: readMessages(),
				scenario,
				previousMessageCount,
			});
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			if (!isRetryableScenarioExtractionError(lastError)) {
				throw lastError;
			}
		}

		const remainingMs = deadline - Date.now();
		if (remainingMs <= 0) {
			break;
		}

		await sleep(Math.min(pollIntervalMs, remainingMs));
	}

	throw new Error(
		`Timed out waiting for persisted scenario result for "${scenario.expectedTool}": ${
			lastError?.message || 'unknown error'
		}`,
	);
}

async function captureScenarioResult(options) {
	const {
		eventStream,
		scenario,
		startIndex,
		timeoutMs,
		tempRoot,
		sessionId,
		previousMessageCount,
	} = options;
	await eventStream.waitForEvent(
		startIndex,
		event => event.type === 'complete',
		timeoutMs,
	);
	return waitForScenarioResultFromSession({
		scenario,
		previousMessageCount,
		timeoutMs: Math.min(timeoutMs, 10_000),
		readMessages: () => readSessionMessages(tempRoot, sessionId),
	});
}

async function runScenario(
	baseUrl,
	eventStream,
	scenario,
	sessionId,
	timeoutMs,
	tempRoot,
	previousMessageCount,
) {
	const startIndex = eventStream.events.length;
	await postJson(`${baseUrl}/message`, {
		type: 'chat',
		sessionId,
		yoloMode: true,
		content: scenario.prompt,
	});

	return captureScenarioResult({
		eventStream,
		scenario,
		startIndex,
		timeoutMs,
		tempRoot,
		sessionId,
		previousMessageCount,
	});
}

async function runMode(options) {
	const {
		mode,
		suite,
		parsedConfig,
		workDir,
		probeFile,
		probeExpected,
		timeoutMs,
		keepTemp,
		sourceSnowDir,
	} = options;
	const {tempRoot} = createIsolatedSnowHome(parsedConfig, mode, sourceSnowDir);
	const preparedWorkDir = prepareScenarioWorkDir({
		suite,
		workDir,
		tempRoot,
	});
	const runtimeWorkDir = preparedWorkDir.runtimeWorkDir;
	const readTarget = resolveReadTarget(runtimeWorkDir, probeFile);
	const modeScenarios = getModeScenarios({
		suite,
		probeExpected,
	});
	const suiteScenarios = modeScenarios[mode];
	if (!suiteScenarios || suiteScenarios.length === 0) {
		throw new Error(`Suite "${suite}" does not support mode "${mode}".`);
	}
	const entrypoint = resolveCliEntrypoint();
	const port = await getFreePort();
	const baseUrl = `http://127.0.0.1:${port}`;
	const logFilePath = join(tempRoot, 'sse-daemon.log');

	const child = spawn(
		entrypoint.command,
		[
			...entrypoint.args,
			'--sse',
			'--sse-daemon-mode',
			'--sse-port',
			String(port),
			'--work-dir',
			runtimeWorkDir,
		],
		{
			cwd: PROJECT_ROOT,
			env: {
				...process.env,
				FORCE_COLOR: '0',
				NO_COLOR: '1',
				HOME: tempRoot,
				USERPROFILE: tempRoot,
				SNOW_IGNORE_NODE_OPTIONS: '1',
				SSE_DAEMON_LOG_FILE: logFilePath,
			},
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);

	let stdout = '';
	let stderr = '';
	child.stdout.on('data', chunk => {
		stdout += chunk.toString();
	});
	child.stderr.on('data', chunk => {
		stderr += chunk.toString();
	});

	let eventStream;
	try {
		await waitForHealth(baseUrl, HEALTH_TIMEOUT_MS);
		eventStream = await createEventStream(baseUrl);
		await eventStream.waitForEvent(0, event => event.type === 'connected', 5000);

		const firstScenario = {
			...suiteScenarios[0],
			prompt: suiteScenarios[0].buildPrompt
				? suiteScenarios[0].buildPrompt(readTarget)
				: suiteScenarios[0].prompt,
		};
		const sessionStartIndex = eventStream.events.length;
		await postJson(`${baseUrl}/message`, {
			type: 'chat',
			yoloMode: true,
			content: firstScenario.prompt,
		});

		const sessionEvent = await eventStream.waitForEvent(
			sessionStartIndex,
			event => event.type === 'message' && event.data?.role === 'system' && event.data?.sessionId,
			timeoutMs,
		);
		const sessionId = sessionEvent.data.sessionId;

		const firstResult = await captureScenarioResult(
			{
				eventStream,
				scenario: firstScenario,
				startIndex: sessionStartIndex,
				timeoutMs,
				tempRoot,
				sessionId,
				previousMessageCount: 0,
			},
		);
		const scenarioResults = [firstResult];
		let previousMessageCount = firstResult.messageCount;

		for (const scenario of suiteScenarios.slice(1)) {
			const resolvedScenario = {
				...scenario,
				prompt: scenario.buildPrompt ? scenario.buildPrompt(readTarget) : scenario.prompt,
			};
			const scenarioResult = await runScenario(
				baseUrl,
				eventStream,
				resolvedScenario,
				sessionId,
				timeoutMs,
				tempRoot,
				previousMessageCount,
			);
			previousMessageCount = scenarioResult.messageCount;
			scenarioResults.push(scenarioResult);
		}

		return {
			entry: 'runtime-blackbox',
			cliEntrypoint: entrypoint.label,
			suite,
			mode,
			port,
			sessionId,
			workDir: runtimeWorkDir,
			probeFile: readTarget,
			templateRepo: preparedWorkDir.templateRepo,
			scenarioResults,
		};
	} catch (error) {
		const logExcerpt = buildDaemonLogExcerpt(logFilePath);
		throw new Error(
			[
				`Runtime blackbox failed for mode "${mode}": ${
					error instanceof Error ? error.message : String(error)
				}`,
				stdout ? `stdout:\n${stdout.trim()}` : '',
				stderr ? `stderr:\n${stderr.trim()}` : '',
				logExcerpt ? `daemon log tail:\n${logExcerpt}` : '',
			]
				.filter(Boolean)
				.join('\n\n'),
		);
	} finally {
		if (eventStream) {
			await eventStream.close();
		}
		await stopChildProcess(child);
		if (!keepTemp) {
			rmSync(tempRoot, {recursive: true, force: true});
		}
	}
}

async function run() {
	const options = parseArguments(process.argv.slice(2));
	const {parsedConfig, snowConfig, configSource, sourceSnowDir} = loadBaseConfig({
		configPath: options.configPath,
	});
	const modes = resolveModesForSuite(options.suite, snowConfig, options.modes);
	const workDir = resolveRuntimeWorkDir({workDir: options.workDir});
	const results = [];

	for (const mode of modes) {
		ensureModeSupported(snowConfig, mode);
		results.push(
			await runMode({
				mode,
				suite: options.suite,
				parsedConfig,
				workDir,
				probeFile: options.probeFile,
				probeExpected: options.probeExpected,
				sourceSnowDir,
				timeoutMs: options.timeoutMs,
				keepTemp: options.keepTemp,
			}),
		);
	}

	console.log(
		JSON.stringify(
			{
				config: {
					entry: 'runtime-blackbox',
				configSource,
				suite: options.suite,
				workDir,
				modes,
				timeoutMs: options.timeoutMs,
				probeFile: options.probeFile || null,
				probeExpected: options.probeExpected || null,
			},
				results,
			},
			null,
			2,
		),
	);
}

function isMainModule() {
	if (!process.argv[1]) {
		return false;
	}

	return pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isMainModule()) {
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
	}
}
