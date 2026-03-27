import anyTest from 'ava';

const test = anyTest as any;

import {
	buildBridgeToolSnapshot,
	buildSessionBridgeToolSnapshot,
	clearBridgeToolSnapshot,
	clearBridgeToolSnapshotSession,
	getBridgeToolByName,
} from './toolSnapshot.js';

test.afterEach(() => {
	clearBridgeToolSnapshot();
	clearBridgeToolSnapshot('session-a');
	clearBridgeToolSnapshot('session-b');
	clearBridgeToolSnapshotSession('chat-session');
});

test('build bridge tool snapshot from manifest commands', (t: any) => {
	const snapshot = buildBridgeToolSnapshot(undefined, {
		plugins: [
			{
				name: 'FileOperator',
				displayName: 'FileOperator',
				description: 'File operations',
				bridgeCommands: [
					{
						commandName: 'ReadFile',
						description:
							'Read a file.\n- filePath (string, required): target file path.',
						parameters: [],
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
	t.is(snapshot.modelTools[0]?.function.name, 'vcp-fileoperator-readfile');
	t.truthy(getBridgeToolByName('vcp-fileoperator-readfile'));
	t.true(
		Object.prototype.hasOwnProperty.call(
			parameters?.['properties'] || {},
			'filePath',
		),
	);
	t.deepEqual(parameters?.['required'], [
		'command',
		'filePath',
	]);
	t.is(parameters?.['properties']?.['filePath']?.type, 'string');
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
	t.deepEqual(parameters?.['required'], ['command', 'query']);
	t.is(parameters?.['properties']?.['query']?.type, 'string');
	t.is(parameters?.['properties']?.['context_lines']?.type, 'number');
	t.is(parameters?.['properties']?.['case_sensitive']?.type, 'boolean');
});

test('keep bridge snapshots isolated by session key', (t: any) => {
	buildBridgeToolSnapshot('session-a', {
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

	buildBridgeToolSnapshot('session-b', {
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

	t.truthy(getBridgeToolByName('vcp-fileoperator-readfile', 'session-a'));
	t.falsy(getBridgeToolByName('vcp-codesearcher-searchcode', 'session-a'));
	t.truthy(getBridgeToolByName('vcp-codesearcher-searchcode', 'session-b'));
	t.falsy(getBridgeToolByName('vcp-fileoperator-readfile', 'session-b'));
});

test('rotate bridge snapshots per session turn and evict stale turn binding', (t: any) => {
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
	t.falsy(
		getBridgeToolByName(
			'vcp-fileoperator-readfile',
			firstTurn.snapshotKey,
		),
	);
	t.truthy(
		getBridgeToolByName(
			'vcp-codesearcher-searchcode',
			secondTurn.snapshotKey,
		),
	);
});
