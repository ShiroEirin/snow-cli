import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

import {
	buildSubagentModeScenarios,
	buildTeamModeScenarios,
	extractScenarioResultFromSession,
	loadBaseConfig,
	parseArguments,
	resolveCliEntrypoint,
	resolveModes,
	resolveReadTarget,
	resolveRuntimeWorkDir,
	validateBridgeSearchToolResult,
	waitForScenarioResultFromSession,
} from '../vcp-blackbox.mjs';

test('resolveRuntimeWorkDir defaults to project root instead of caller cwd', () => {
	const workDir = resolveRuntimeWorkDir({
		projectRoot: '/repo/snow-cli',
		invocationCwd: '/repo',
	});

	assert.equal(workDir, resolve('/repo/snow-cli'));
});

test('loadBaseConfig falls back to active profile when config.json is missing', () => {
	const homeDir = mkdtempSync(join(os.tmpdir(), 'vcp-blackbox-home-'));
	const snowDir = join(homeDir, '.snow');
	mkdirSync(join(snowDir, 'profiles'), {recursive: true});
	writeFileSync(
		join(snowDir, 'active-profile.json'),
		JSON.stringify({activeProfile: 'audit'}, null, 2),
		'utf8',
	);
	writeFileSync(
		join(snowDir, 'profiles', 'audit.json'),
		JSON.stringify(
			{
				snowcfg: {
					apiKey: 'profile-key',
					toolTransport: 'hybrid',
				},
			},
			null,
			2,
		),
		'utf8',
	);

	const result = loadBaseConfig({homeDir});

	assert.equal(result.configSource, 'profile:audit');
	assert.equal(result.snowConfig.apiKey, 'profile-key');
	assert.equal(result.snowConfig.toolTransport, 'hybrid');
	assert.equal(result.sourceSnowDir, snowDir);
});

test('resolveReadTarget returns an absolute probe path', () => {
	const workDir = mkdtempSync(join(os.tmpdir(), 'vcp-blackbox-workdir-'));
	const targetDir = join(workDir, 'snow-cli', 'source');
	mkdirSync(targetDir, {recursive: true});
	writeFileSync(join(targetDir, 'cli.tsx'), '#!/usr/bin/env node', 'utf8');

	const resolvedTarget = resolveReadTarget(workDir);

	assert.equal(
		resolvedTarget.replaceAll('\\', '/'),
		join(workDir, 'snow-cli', 'source', 'cli.tsx').replaceAll('\\', '/'),
	);
});

test('resolveReadTarget honors an explicit probe file', () => {
	const workDir = mkdtempSync(join(os.tmpdir(), 'vcp-blackbox-explicit-probe-'));
	writeFileSync(join(workDir, 'main.py'), 'import tkinter as tk', 'utf8');

	const resolvedTarget = resolveReadTarget(workDir, 'main.py');

	assert.equal(
		resolvedTarget.replaceAll('\\', '/'),
		join(workDir, 'main.py').replaceAll('\\', '/'),
	);
});

test('resolveReadTarget keeps team probe files inside the repository', () => {
	const workDir = mkdtempSync(join(os.tmpdir(), 'vcp-blackbox-team-probe-'));
	const outsideProbe = join(workDir, '..', 'outside.py');
	writeFileSync(resolve(outsideProbe), 'print("outside")', 'utf8');

	assert.throws(
		() =>
			resolveReadTarget(workDir, '../outside.py', {
				restrictToWorkDir: true,
				targetLabel: 'team probe file',
			}),
		/must stay within the repository/,
	);

	assert.throws(
		() =>
			resolveReadTarget(workDir, resolve(outsideProbe), {
				restrictToWorkDir: true,
				targetLabel: 'team probe file',
			}),
		/absolute paths are not allowed/,
	);
});

test('parseArguments accepts suite and probe options', () => {
	const options = parseArguments([
		'--suite',
		'team',
		'--mode',
		'local',
		'--probe-file',
		'main.py',
		'--probe-expected',
		'import tkinter as tk',
	]);

	assert.equal(options.suite, 'team');
	assert.deepEqual(options.modes, ['local']);
	assert.equal(options.probeFile, 'main.py');
	assert.equal(options.probeExpected, 'import tkinter as tk');
});

test('subagent scenario validation accepts a clean internal filesystem-read path', () => {
	const scenario = buildSubagentModeScenarios('import tkinter as tk').local[0];
	scenario.expectedProbePath = 'D:/repo/main.py';
	scenario.expectedProbeRoot = 'D:/repo';
	const result = scenario.validateMessages({
		messages: [
			{
				role: 'assistant',
				tool_calls: [
					{
						id: 'subagent-call',
						function: {
							name: 'subagent-agent_explore',
							arguments: '{"prompt":"read the file"}',
						},
					},
				],
			},
			{
				role: 'assistant',
				subAgentInternal: true,
				tool_calls: [
					{
						id: 'internal-read',
						function: {
							name: 'filesystem-read',
							arguments: '{"filePath":"D:/repo/main.py"}',
						},
					},
				],
			},
			{
				role: 'tool',
				tool_call_id: 'internal-read',
				content: '{"content":"import tkinter as tk"}',
			},
			{
				role: 'tool',
				tool_call_id: 'subagent-call',
				content: '{"success":true,"result":"import tkinter as tk"}',
			},
			{
				role: 'assistant',
				content: 'import tkinter as tk',
			},
		],
		previousMessageCount: 0,
		scenario,
	});

	assert.equal(result.expectedTool, 'subagent-agent_explore');
	assert.equal(result.finalAssistantPreview, 'import tkinter as tk');
	assert.equal(result.toolResultPreview, 'import tkinter as tk');
});

test('subagent scenario validation rejects leaked top-level filesystem-read fallback', () => {
	const scenario = buildSubagentModeScenarios('import tkinter as tk').local[0];
	scenario.expectedProbePath = 'D:/repo/main.py';
	scenario.expectedProbeRoot = 'D:/repo';

	assert.throws(
		() =>
			scenario.validateMessages({
				messages: [
					{
						role: 'assistant',
						tool_calls: [
							{
								id: 'subagent-call',
								function: {
									name: 'subagent-agent_explore',
									arguments: '{"prompt":"read the file"}',
								},
							},
						],
					},
					{
						role: 'assistant',
						subAgentInternal: true,
						tool_calls: [
							{
								id: 'internal-read',
								function: {
									name: 'filesystem-read',
									arguments: '{"filePath":"D:/repo/main.py"}',
								},
							},
						],
					},
					{
						role: 'tool',
						tool_call_id: 'internal-read',
						content: '{"content":"import tkinter as tk"}',
					},
					{
						role: 'tool',
						tool_call_id: 'subagent-call',
						content: '{"success":true,"result":"not the expected answer"}',
					},
					{
						role: 'assistant',
						tool_calls: [
							{
								id: 'main-read',
								function: {
									name: 'filesystem-read',
									arguments: '{"filePath":"D:/repo/main.py"}',
								},
							},
						],
					},
					{
						role: 'tool',
						tool_call_id: 'main-read',
						content: '{"content":"import tkinter as tk"}',
					},
					{
						role: 'assistant',
						content: 'import tkinter as tk',
					},
				],
				previousMessageCount: 0,
				scenario,
			}),
		/extra top-level tool calls/,
	);
});

test('subagent scenario validation rejects an internal filesystem-read on the wrong path', () => {
	const scenario = buildSubagentModeScenarios('import tkinter as tk').local[0];
	scenario.expectedProbePath = 'D:/repo/main.py';
	scenario.expectedProbeRoot = 'D:/repo';

	assert.throws(
		() =>
			scenario.validateMessages({
				messages: [
					{
						role: 'assistant',
						tool_calls: [
							{
								id: 'subagent-call',
								function: {
									name: 'subagent-agent_explore',
									arguments: '{"prompt":"read the file"}',
								},
							},
						],
					},
					{
						role: 'assistant',
						subAgentInternal: true,
						tool_calls: [
							{
								id: 'internal-read',
								function: {
									name: 'filesystem-read',
									arguments: '{"filePath":"D:/repo/other.py"}',
								},
							},
						],
					},
					{
						role: 'tool',
						tool_call_id: 'internal-read',
						content: '{"content":"import tkinter as tk"}',
					},
					{
						role: 'tool',
						tool_call_id: 'subagent-call',
						content: '{"success":true,"result":"import tkinter as tk"}',
					},
					{
						role: 'assistant',
						content: 'import tkinter as tk',
					},
				],
				previousMessageCount: 0,
				scenario,
			}),
		/did not target the probe file/,
	);
});

test('subagent scenario validation rejects an internal filesystem-read with the wrong first line', () => {
	const scenario = buildSubagentModeScenarios('import tkinter as tk').local[0];
	scenario.expectedProbePath = 'D:/repo/main.py';
	scenario.expectedProbeRoot = 'D:/repo';

	assert.throws(
		() =>
			scenario.validateMessages({
				messages: [
					{
						role: 'assistant',
						tool_calls: [
							{
								id: 'subagent-call',
								function: {
									name: 'subagent-agent_explore',
									arguments: '{"prompt":"read the file"}',
								},
							},
						],
					},
					{
						role: 'assistant',
						subAgentInternal: true,
						tool_calls: [
							{
								id: 'internal-read',
								function: {
									name: 'filesystem-read',
									arguments: '{"filePath":"D:/repo/main.py"}',
								},
							},
						],
					},
					{
						role: 'tool',
						tool_call_id: 'internal-read',
						content: '{"content":"print(123)"}',
					},
					{
						role: 'tool',
						tool_call_id: 'subagent-call',
						content: '{"success":true,"result":"import tkinter as tk"}',
					},
					{
						role: 'assistant',
						content: 'import tkinter as tk',
					},
				],
				previousMessageCount: 0,
				scenario,
			}),
		/did not match the expected first line/,
	);
});

test('subagent scenario validation accepts a relative probe path inside the same workdir', () => {
	const scenario = buildSubagentModeScenarios('import tkinter as tk').local[0];
	scenario.expectedProbePath = 'D:/repo/main.py';
	scenario.expectedProbeRoot = 'D:/repo';

	const result = scenario.validateMessages({
		messages: [
			{
				role: 'assistant',
				tool_calls: [
					{
						id: 'subagent-call',
						function: {
							name: 'subagent-agent_explore',
							arguments: '{"prompt":"read the file"}',
						},
					},
				],
			},
			{
				role: 'assistant',
				subAgentInternal: true,
				tool_calls: [
					{
						id: 'internal-read',
						function: {
							name: 'filesystem-read',
							arguments: '{"filePath":"main.py"}',
						},
					},
				],
			},
			{
				role: 'tool',
				tool_call_id: 'internal-read',
				content: '{"content":"1:7b→import tkinter as tk"}',
			},
			{
				role: 'tool',
				tool_call_id: 'subagent-call',
				content: '{"success":true,"result":"import tkinter as tk"}',
			},
			{
				role: 'assistant',
				content: 'import tkinter as tk',
			},
		],
		previousMessageCount: 0,
		scenario,
	});

	assert.equal(result.finalAssistantPreview, 'import tkinter as tk');
});

test('resolveModes enables bridge coverage when bridgeWsUrl is configured', () => {
	assert.deepEqual(
		resolveModes(
			{
				bridgeWsUrl: 'wss://bridge.example.com/vcp-distributed-server/VCP_Key=Snow',
			},
			[],
		),
		['local', 'bridge', 'hybrid'],
	);
});

test('team scenarios expose a top-level expectedTool for timeout reporting', () => {
	const scenario = buildTeamModeScenarios('#!/usr/bin/env node').local[0];

	assert.equal(scenario.expectedTool, 'team-spawn_teammate');
});

test('team scenario validation ignores sub-agent internal tool calls', () => {
	const scenario = buildTeamModeScenarios('import tkinter as tk').local[0];
	const result = scenario.validateMessages({
		messages: [
			{
				role: 'assistant',
				tool_calls: [
					{
						id: 'team-spawn',
						function: {name: 'team-spawn_teammate', arguments: '{}'},
					},
				],
			},
			{
				role: 'tool',
				tool_call_id: 'team-spawn',
				content: '{"success":true}',
			},
			{
				role: 'assistant',
				tool_calls: [
					{
						id: 'team-wait',
						function: {name: 'team-wait_for_teammates', arguments: '{}'},
					},
				],
			},
			{
				role: 'assistant',
				subAgentInternal: true,
				tool_calls: [
					{
						id: 'subagent-read',
						function: {name: 'filesystem-read', arguments: '{}'},
					},
				],
			},
			{
				role: 'tool',
				tool_call_id: 'team-wait',
				content: '{"success":true}',
			},
			{
				role: 'assistant',
				tool_calls: [
					{
						id: 'team-shutdown',
						function: {name: 'team-shutdown_teammate', arguments: '{}'},
					},
				],
			},
			{
				role: 'tool',
				tool_call_id: 'team-shutdown',
				content: '{"success":true}',
			},
			{
				role: 'assistant',
				tool_calls: [
					{
						id: 'team-merge',
						function: {name: 'team-merge_all_teammate_work', arguments: '{}'},
					},
				],
			},
			{
				role: 'tool',
				tool_call_id: 'team-merge',
				content: '{"success":true}',
			},
			{
				role: 'assistant',
				tool_calls: [
					{
						id: 'team-cleanup',
						function: {name: 'team-cleanup_team', arguments: '{}'},
					},
				],
			},
			{
				role: 'tool',
				tool_call_id: 'team-cleanup',
				content: '{"success":true}',
			},
			{
				role: 'assistant',
				tool_calls: [
					{
						id: 'main-read',
						function: {name: 'filesystem-read', arguments: '{}'},
					},
				],
			},
			{
				role: 'tool',
				tool_call_id: 'main-read',
				content: '{"content":"import tkinter as tk"}',
			},
			{
				role: 'assistant',
				content: 'import tkinter as tk',
			},
		],
		previousMessageCount: 0,
		scenario,
	});

	assert.equal(result.expectedTool, 'team-spawn_teammate');
	assert.equal(result.finalAssistantPreview, 'import tkinter as tk');
});

test('team scenario validation rejects unexpected extra top-level tool calls', () => {
	const scenario = buildTeamModeScenarios('import tkinter as tk').local[0];

	assert.throws(
		() =>
			scenario.validateMessages({
				messages: [
					{
						role: 'assistant',
						tool_calls: [
							{
								id: 'pre-read',
								function: {name: 'filesystem-read', arguments: '{}'},
							},
						],
					},
					{
						role: 'tool',
						tool_call_id: 'pre-read',
						content: '{"content":"import tkinter as tk"}',
					},
					{
						role: 'assistant',
						tool_calls: [
							{
								id: 'team-spawn',
								function: {name: 'team-spawn_teammate', arguments: '{}'},
							},
						],
					},
					{
						role: 'tool',
						tool_call_id: 'team-spawn',
						content: '{"success":true}',
					},
					{
						role: 'assistant',
						tool_calls: [
							{
								id: 'team-wait',
								function: {name: 'team-wait_for_teammates', arguments: '{}'},
							},
						],
					},
					{
						role: 'tool',
						tool_call_id: 'team-wait',
						content: '{"success":true}',
					},
					{
						role: 'assistant',
						tool_calls: [
							{
								id: 'team-shutdown',
								function: {name: 'team-shutdown_teammate', arguments: '{}'},
							},
						],
					},
					{
						role: 'tool',
						tool_call_id: 'team-shutdown',
						content: '{"success":true}',
					},
					{
						role: 'assistant',
						tool_calls: [
							{
								id: 'team-merge',
								function: {name: 'team-merge_all_teammate_work', arguments: '{}'},
							},
						],
					},
					{
						role: 'tool',
						tool_call_id: 'team-merge',
						content: '{"success":true}',
					},
					{
						role: 'assistant',
						tool_calls: [
							{
								id: 'team-cleanup',
								function: {name: 'team-cleanup_team', arguments: '{}'},
							},
						],
					},
					{
						role: 'tool',
						tool_call_id: 'team-cleanup',
						content: '{"success":true}',
					},
					{
						role: 'assistant',
						tool_calls: [
							{
								id: 'main-read',
								function: {name: 'filesystem-read', arguments: '{}'},
							},
						],
					},
					{
						role: 'tool',
						tool_call_id: 'main-read',
						content: '{"content":"import tkinter as tk"}',
					},
					{
						role: 'assistant',
						content: 'import tkinter as tk',
					},
				],
				previousMessageCount: 0,
				scenario,
			}),
		/Unexpected top-level tool call count/,
	);
});

test('resolveCliEntrypoint resolves the ts-node loader from the project root', () => {
	const projectRoot = mkdtempSync(join(os.tmpdir(), 'vcp-blackbox-entrypoint-'));
	const sourceDir = join(projectRoot, 'source');
	const loaderPath = join(
		projectRoot,
		'node_modules',
		'ts-node',
		'esm',
		'transpile-only.mjs',
	);
	mkdirSync(sourceDir, {recursive: true});
	mkdirSync(join(projectRoot, 'node_modules', 'ts-node', 'esm'), {
		recursive: true,
	});
	writeFileSync(join(sourceDir, 'cli.tsx'), 'console.log("snow");\n', 'utf8');
	writeFileSync(loaderPath, 'export {};\n', 'utf8');

	const entrypoint = resolveCliEntrypoint({
		projectRoot,
		resolveLoader: () => loaderPath,
	});

	assert.deepEqual(entrypoint.args, [
		'--loader',
		pathToFileURL(loaderPath).href,
		join(projectRoot, 'source', 'cli.tsx'),
	]);
	assert.match(entrypoint.label, /source\/cli\.tsx via /);
});

test('extractScenarioResultFromSession requires a final assistant reply', () => {
	const scenario = {
		name: 'filesystem-read',
		expectedTool: 'filesystem-read',
		expectedToolResultIncludes: '#!/usr/bin/env node',
		expectedAssistantIncludes: '#!/usr/bin/env node',
	};

	const result = extractScenarioResultFromSession({
		messages: [
			{
				role: 'assistant',
				content: '',
				tool_calls: [
					{
						id: 'call-1',
						function: {
							name: 'filesystem-read',
							arguments: '{"path":"source/cli.tsx"}',
						},
					},
				],
			},
			{
				role: 'tool',
				tool_call_id: 'call-1',
				content: JSON.stringify({content: '#!/usr/bin/env node\nimport x'}),
			},
			{
				role: 'assistant',
				content: '#!/usr/bin/env node',
			},
		],
		scenario,
		previousMessageCount: 0,
	});

	assert.equal(result.finalAssistantPreview, '#!/usr/bin/env node');
});

test('extractScenarioResultFromSession ignores hidden sub-agent assistant messages', () => {
	const scenario = {
		name: 'filesystem-read',
		expectedTool: 'filesystem-read',
		expectedToolResultIncludes: '#!/usr/bin/env node',
		expectedAssistantIncludes: 'visible final answer',
	};

	const result = extractScenarioResultFromSession({
		messages: [
			{
				role: 'assistant',
				content: '',
				tool_calls: [
					{
						id: 'call-1',
						function: {
							name: 'filesystem-read',
							arguments: '{"path":"source/cli.tsx"}',
						},
					},
				],
			},
			{
				role: 'tool',
				tool_call_id: 'call-1',
				content: JSON.stringify({content: '#!/usr/bin/env node\nimport x'}),
			},
			{
				role: 'assistant',
				subAgentInternal: true,
				content: '#!/usr/bin/env node',
			},
			{
				role: 'assistant',
				subAgentContent: true,
				content: '#!/usr/bin/env node',
			},
			{
				role: 'assistant',
				content: 'visible final answer',
			},
		],
		scenario,
		previousMessageCount: 0,
	});

	assert.equal(result.finalAssistantPreview, 'visible final answer');
});

test('extractScenarioResultFromSession rejects missing final assistant reply', () => {
	const scenario = {
		name: 'filesystem-read',
		expectedTool: 'filesystem-read',
		expectedToolResultIncludes: '#!/usr/bin/env node',
		expectedAssistantIncludes: '#!/usr/bin/env node',
	};

	assert.throws(
		() =>
			extractScenarioResultFromSession({
				messages: [
					{
						role: 'assistant',
						content: '',
						tool_calls: [
							{
								id: 'call-1',
								function: {
									name: 'filesystem-read',
									arguments: '{"path":"source/cli.tsx"}',
								},
							},
						],
					},
					{
						role: 'tool',
						tool_call_id: 'call-1',
						content: JSON.stringify({content: '#!/usr/bin/env node\nimport x'}),
					},
				],
				scenario,
				previousMessageCount: 0,
			}),
		/Expected final assistant reply/,
	);
});

test('extractScenarioResultFromSession rejects duplicate tool calls', () => {
	const scenario = {
		name: 'filesystem-read',
		expectedTool: 'filesystem-read',
		expectedToolResultIncludes: '#!/usr/bin/env node',
		expectedAssistantIncludes: '#!/usr/bin/env node',
	};

	assert.throws(
		() =>
			extractScenarioResultFromSession({
				messages: [
					{
						role: 'assistant',
						content: '',
						tool_calls: [
							{
								id: 'call-1',
								function: {
									name: 'filesystem-read',
									arguments: '{"path":"source/cli.tsx"}',
								},
							},
							{
								id: 'call-2',
								function: {
									name: 'filesystem-read',
									arguments: '{"path":"source/cli.tsx"}',
								},
							},
						],
					},
					{
						role: 'tool',
						tool_call_id: 'call-1',
						content: JSON.stringify({content: '#!/usr/bin/env node\nimport x'}),
					},
					{
						role: 'assistant',
						content: '#!/usr/bin/env node',
					},
				],
				scenario,
				previousMessageCount: 0,
			}),
		/exactly one "filesystem-read" tool call/,
	);
});

test('extractScenarioResultFromSession accepts bridge tool result matches inside parsed JSON fields', () => {
	const scenario = {
		name: 'bridge-search',
		expectedTool: 'vcp-servercodesearcher-searchcode',
		validateToolResult: validateBridgeSearchToolResult,
	};

	const result = extractScenarioResultFromSession({
		messages: [
			{
				role: 'assistant',
				content: '',
				tool_calls: [
					{
						id: 'call-1',
						function: {
							name: 'vcp-servercodesearcher-searchcode',
							arguments: '{"query":"SnowBridge"}',
						},
					},
				],
			},
			{
				role: 'tool',
				tool_call_id: 'call-1',
				content: JSON.stringify([
					{
						file_path: '.helloagents\\modules\\plugin-system.md',
						line_number: 2,
					},
				]),
			},
			{
				role: 'assistant',
				content: '.helloagents\\modules\\plugin-system.md',
			},
		],
		scenario,
		previousMessageCount: 0,
	});

	assert.equal(
		result.finalAssistantPreview,
		'.helloagents\\modules\\plugin-system.md',
	);
});

test('extractScenarioResultFromSession rejects leaked protocol content in final assistant reply', () => {
	const scenario = {
		name: 'filesystem-read',
		expectedTool: 'filesystem-read',
		expectedToolResultIncludes: '#!/usr/bin/env node',
		expectedAssistantIncludes: '#!/usr/bin/env node',
	};

	assert.throws(
		() =>
			extractScenarioResultFromSession({
				messages: [
					{
						role: 'assistant',
						content: '',
						tool_calls: [
							{
								id: 'call-1',
								function: {
									name: 'filesystem-read',
									arguments: '{"path":"source/cli.tsx"}',
								},
							},
						],
					},
					{
						role: 'tool',
						tool_call_id: 'call-1',
						content: JSON.stringify({content: '#!/usr/bin/env node\nimport x'}),
					},
					{
						role: 'assistant',
						content: '#!/usr/bin/env node\n</think>',
					},
				],
				scenario,
				previousMessageCount: 0,
			}),
		/leaked hidden\/protocol content/,
	);
});

test('extractScenarioResultFromSession accepts slash-normalized bridge assistant replies', () => {
	const scenario = {
		name: 'bridge-search',
		expectedTool: 'vcp-servercodesearcher-searchcode',
		validateToolResult: validateBridgeSearchToolResult,
	};

	const result = extractScenarioResultFromSession({
		messages: [
			{
				role: 'assistant',
				content: '',
				tool_calls: [
					{
						id: 'call-1',
						function: {
							name: 'vcp-servercodesearcher-searchcode',
							arguments: '{"query":"SnowBridge"}',
						},
					},
				],
			},
			{
				role: 'tool',
				tool_call_id: 'call-1',
				content:
					'[{"file_path":".helloagents\\\\modules\\\\plugin-system.md","line_number":2}]',
			},
			{
				role: 'assistant',
				content: '.helloagents\\modules\\plugin-system.md',
			},
		],
		scenario,
		previousMessageCount: 0,
	});

	assert.equal(
		result.finalAssistantPreview,
		'.helloagents\\modules\\plugin-system.md',
	);
});

test('validateBridgeSearchToolResult rejects empty bridge search matches', () => {
	assert.throws(
		() =>
			validateBridgeSearchToolResult({
				parsedToolResult: {
					status: 'success',
					result: [],
				},
			}),
		/did not contain a matched file path/,
	);
});

test('waitForScenarioResultFromSession retries until final assistant reply is persisted', async () => {
	const scenario = {
		name: 'bridge-search',
		expectedTool: 'vcp-servercodesearcher-searchcode',
		validateToolResult: validateBridgeSearchToolResult,
	};
	const messages = [
		{
			role: 'assistant',
			content: '',
			tool_calls: [
				{
					id: 'call-1',
					function: {
						name: 'vcp-servercodesearcher-searchcode',
						arguments: '{"query":"SnowBridge"}',
					},
				},
			],
		},
		{
			role: 'tool',
			tool_call_id: 'call-1',
			content: JSON.stringify([
				{
					file_path: '.helloagents\\modules\\plugin-system.md',
					line_number: 2,
				},
			]),
		},
	];

	setTimeout(() => {
		messages.push({
			role: 'assistant',
			content: '.helloagents\\modules\\plugin-system.md',
		});
	}, 50);

	const result = await waitForScenarioResultFromSession({
		scenario,
		previousMessageCount: 0,
		timeoutMs: 1000,
		pollIntervalMs: 10,
		readMessages: () => messages,
	});

	assert.equal(
		result.finalAssistantPreview,
		'.helloagents\\modules\\plugin-system.md',
	);
});
