import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

import {
	extractScenarioResultFromSession,
	loadBaseConfig,
	parseArguments,
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
