import anyTest from 'ava';

const test = anyTest as any;

import {
	buildBridgeToolSnapshot,
	buildSessionBridgeToolSnapshot,
	clearBridgeToolSnapshotSession,
} from './toolSnapshot.js';

test.afterEach(() => {
	clearBridgeToolSnapshotSession('chat-session');
});

test('build bridge tool snapshot from manifest structured parameters', (t: any) => {
	const snapshot = buildBridgeToolSnapshot(undefined, {
		plugins: [
			{
				name: 'FileOperator',
				displayName: 'FileOperator',
				description: 'File operations',
				bridgeCommands: [
					{
						commandName: 'ReadFile',
						description: 'Read a file from the workspace.',
						parameters: [
							{
								name: 'filePath',
								type: 'string',
								required: true,
								description: 'Absolute file path.',
							},
						],
						example: '',
					},
				],
			},
		],
	});

	const parameters = snapshot.modelTools[0]?.function.parameters as
		| Record<string, any>
		| undefined;
	t.is(snapshot.modelTools.length, 1);
	t.is(snapshot.servicesInfo.length, 1);
	t.is(snapshot.bindings.length, 1);
	t.is(snapshot.modelTools[0]?.function.name, 'vcp-fileoperator-readfile');
	t.is(snapshot.bindings[0]?.toolName, 'vcp-fileoperator-readfile');
	t.true(
		Object.prototype.hasOwnProperty.call(
			parameters?.['properties'] || {},
			'filePath',
		),
	);
	t.false(
		Object.prototype.hasOwnProperty.call(
			parameters?.['properties'] || {},
			'command',
		),
	);
	t.deepEqual(parameters?.['required'], ['filePath']);
	t.is(parameters?.['properties']?.['filePath']?.type, 'string');
});

test('ignore legacy protocol hints embedded in bridge descriptions', (t: any) => {
	const snapshot = buildBridgeToolSnapshot(undefined, {
		plugins: [
			{
				name: 'CodeSearcher',
				displayName: 'CodeSearcher',
				description: 'Search project code.',
				bridgeCommands: [
					{
						commandName: 'SearchCode',
						description: `Search source tree.
TOOL_REQUEST
tool_name:「始」
Example: <<<[TOOL_REQUEST]>>>`,
						parameters: [],
						example: 'tool_name:「始」',
					},
				],
			},
		],
	});

	const functionDescription = snapshot.modelTools[0]?.function.description || '';
	const parameters = snapshot.modelTools[0]?.function.parameters as
		| Record<string, any>
		| undefined;
	t.false(functionDescription.includes('TOOL_REQUEST'));
	t.false(functionDescription.includes('tool_name'));
	t.false(functionDescription.includes('Example:'));
	t.deepEqual(Object.keys(parameters?.['properties'] || {}), []);
	t.deepEqual(parameters?.['required'], []);
	t.true(parameters?.['additionalProperties']);
});

test('preserve typed and required parameter metadata when manifest provides schema', (t: any) => {
	const snapshot = buildBridgeToolSnapshot(undefined, {
		plugins: [
			{
				name: 'CodeSearcher',
				displayName: 'CodeSearcher',
				description: 'Code search',
				bridgeCommands: [
					{
						commandName: 'SearchCode',
						description: 'Search source tree',
						parameters: [
							{name: 'query', type: 'string', required: true},
							{name: 'context_lines', type: 'integer', required: false},
							{name: 'case_sensitive', type: 'boolean', required: false},
						],
						example: '',
					},
				],
			},
		],
	});

	const parameters = snapshot.modelTools[0]?.function.parameters as
		| Record<string, any>
		| undefined;
	t.deepEqual(parameters?.['required'], ['query']);
	t.is(parameters?.['properties']?.['query']?.type, 'string');
	t.is(parameters?.['properties']?.['context_lines']?.type, 'number');
	t.is(parameters?.['properties']?.['case_sensitive']?.type, 'boolean');
	t.false(parameters?.['additionalProperties']);
	t.deepEqual(snapshot.bindings[0]?.stringifyArgumentNames || [], []);
});

test('recover parameter schema from description bullets when structured parameters are absent', (t: any) => {
	const snapshot = buildBridgeToolSnapshot(undefined, {
		plugins: [
			{
				name: 'CodeSearcher',
				displayName: 'CodeSearcher',
				description: 'Code search',
				bridgeCommands: [
					{
						commandName: 'SearchCode',
						description: `Search source tree.
参数:
- command (字符串, 必需): 'search_code'
- query (字符串, 必需): Search query text.
- context_lines (数字, 可选): Number of context lines to include.
- case_sensitive (布尔值, 可选): Whether matching is case sensitive.
调用格式:
<<<[TOOL_REQUEST]>>>
tool_name:「始」CodeSearcher「末」
<<<[END_TOOL_REQUEST]>>>`,
						parameters: [],
						example: 'tool_name:「始」CodeSearcher「末」',
					},
				],
			},
		],
	});

	const parameters = snapshot.modelTools[0]?.function.parameters as
		| Record<string, any>
		| undefined;
	t.deepEqual(parameters?.['required'], ['query']);
	t.false(
		Object.prototype.hasOwnProperty.call(
			parameters?.['properties'] || {},
			'command',
		),
	);
	t.is(parameters?.['properties']?.['query']?.type, 'string');
	t.is(parameters?.['properties']?.['context_lines']?.type, 'number');
	t.is(parameters?.['properties']?.['case_sensitive']?.type, 'boolean');
	t.true(parameters?.['additionalProperties']);
	t.deepEqual(
		snapshot.bindings[0]?.stringifyArgumentNames,
		['query', 'context_lines', 'case_sensitive'],
	);
});

test('bridge snapshots stay isolated per translation result', (t: any) => {
	const firstSnapshot = buildBridgeToolSnapshot('session-a', {
		plugins: [
			{
				name: 'FileOperator',
				displayName: 'FileOperator',
				description: 'File operations',
				bridgeCommands: [
					{
						commandName: 'ReadFile',
						description: 'Read a file.',
						parameters: [],
						example: '',
					},
				],
			},
		],
	});

	const secondSnapshot = buildBridgeToolSnapshot('session-b', {
		plugins: [
			{
				name: 'CodeSearcher',
				displayName: 'CodeSearcher',
				description: 'Code search',
				bridgeCommands: [
					{
						commandName: 'SearchCode',
						description: 'Search source tree',
						parameters: [],
						example: '',
					},
				],
			},
		],
	});

	t.deepEqual(
		firstSnapshot.bindings.map(binding => binding.toolName),
		['vcp-fileoperator-readfile'],
	);
	t.deepEqual(
		secondSnapshot.bindings.map(binding => binding.toolName),
		['vcp-codesearcher-searchcode'],
	);
});

test('rotate bridge snapshots per session turn with fresh translated output', (t: any) => {
	const firstTurn = buildSessionBridgeToolSnapshot('chat-session', {
		plugins: [
			{
				name: 'FileOperator',
				displayName: 'FileOperator',
				description: 'File operations',
				bridgeCommands: [
					{
						commandName: 'ReadFile',
						description: 'Read a file.',
						parameters: [],
						example: '',
					},
				],
			},
		],
	});

	const secondTurn = buildSessionBridgeToolSnapshot('chat-session', {
		plugins: [
			{
				name: 'CodeSearcher',
				displayName: 'CodeSearcher',
				description: 'Code search',
				bridgeCommands: [
					{
						commandName: 'SearchCode',
						description: 'Search source tree.',
						parameters: [],
						example: '',
					},
				],
			},
		],
	});

	t.not(firstTurn.snapshotKey, secondTurn.snapshotKey);
	t.deepEqual(
		firstTurn.bindings.map(binding => binding.toolName),
		['vcp-fileoperator-readfile'],
	);
	t.deepEqual(
		secondTurn.bindings.map(binding => binding.toolName),
		['vcp-codesearcher-searchcode'],
	);
});

test('bridge snapshots keep manifest metadata on the seam', (t: any) => {
	const snapshot = buildBridgeToolSnapshot('session-a', {
		revision: 'rev-100',
		reloadedAt: '2026-04-04T10:01:02.000Z',
		plugins: [
			{
				name: 'FileOperator',
				displayName: 'FileOperator',
				description: 'File operations',
				requiresApproval: true,
				approvalTimeoutMs: 30_000,
				bridgeCommands: [
					{
						commandName: 'ReadFile',
						description: 'Read a file.',
						parameters: [],
					},
				],
			},
		],
	});

	t.deepEqual(snapshot.metadata, {
		revision: 'rev-100',
		reloadedAt: '2026-04-04T10:01:02.000Z',
	});
	t.deepEqual(snapshot.modelTools[0]?.metadata, {
		revision: 'rev-100',
		reloadedAt: '2026-04-04T10:01:02.000Z',
		requiresApproval: true,
		approvalTimeoutMs: 30_000,
	});
});

test('session bridge snapshot key is revision aware', (t: any) => {
	const firstSnapshot = buildSessionBridgeToolSnapshot('chat-session', {
		revision: 'rev-a',
		plugins: [
			{
				name: 'FileOperator',
				displayName: 'FileOperator',
				description: 'File operations',
				bridgeCommands: [
					{
						commandName: 'ReadFile',
						description: 'Read a file.',
						parameters: [],
					},
				],
			},
		],
	});
	const repeatedSnapshot = buildSessionBridgeToolSnapshot('chat-session', {
		revision: 'rev-a',
		plugins: [
			{
				name: 'FileOperator',
				displayName: 'FileOperator',
				description: 'File operations',
				bridgeCommands: [
					{
						commandName: 'ReadFile',
						description: 'Read a file.',
						parameters: [],
					},
				],
			},
		],
	});
	const nextRevisionSnapshot = buildSessionBridgeToolSnapshot('chat-session', {
		revision: 'rev-b',
		plugins: [
			{
				name: 'FileOperator',
				displayName: 'FileOperator',
				description: 'File operations',
				bridgeCommands: [
					{
						commandName: 'ReadFile',
						description: 'Read a file.',
						parameters: [],
					},
				],
			},
		],
	});

	t.is(firstSnapshot.snapshotKey, repeatedSnapshot.snapshotKey);
	t.not(firstSnapshot.snapshotKey, nextRevisionSnapshot.snapshotKey);
});
