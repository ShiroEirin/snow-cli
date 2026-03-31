import anyTest from 'ava';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

const test = anyTest as any;

import {
	createTeamUserQuestionAdapter,
	executeToolCall,
	type ToolCall,
} from './toolExecutor.js';
import {
	clearToolExecutionBindings,
	registerToolExecutionBindings,
} from '../session/vcpCompatibility/toolExecutionBinding.js';

let toolPlaneSequence = 0;

function registerLocalToolBindings(toolNames: string[]): string {
	const toolPlaneKey = `tool-executor-test-${++toolPlaneSequence}`;
	registerToolExecutionBindings(
		toolPlaneKey,
		toolNames.map(toolName => ({
			kind: 'local' as const,
			toolName,
		})),
	);
	return toolPlaneKey;
}

function executeToolCallWithBindings(
	toolCall: ToolCall,
	toolPlaneKey: string,
) {
	return executeToolCall(
		toolCall,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		toolPlaneKey,
	);
}

test('team askuser adapter preserves cancelled responses', async (t: any) => {
	const adapter = createTeamUserQuestionAdapter(
		async (_question, _options, _multiSelect) => ({
			selected: 'skip',
			customInput: 'user cancelled from main session',
			cancelled: true,
		}),
	);

	const response = await adapter?.('Continue?', ['yes', 'no'], false);

	t.deepEqual(response, {
		selected: 'skip',
		customInput: 'user cancelled from main session',
		cancelled: true,
	});
});

test('tool_search bypasses regular execution binding lookup', async (t: any) => {
	const toolCall: ToolCall = {
		id: 'tool-search-call',
		type: 'function',
		function: {
			name: 'tool_search',
			arguments: JSON.stringify({query: 'subagent filesystem'}),
		},
	};

	const result = await executeToolCall(toolCall);

	t.is(result.tool_call_id, 'tool-search-call');
	t.false(result.content.startsWith('Error:'));
	t.true(result.content.includes('subagent filesystem'));
});

test('invalid concatenated tool arguments fail instead of truncating payload', async (t: any) => {
	const toolCall: ToolCall = {
		id: 'bad-json-call',
		type: 'function',
		function: {
			name: 'filesystem-read',
			arguments: '{"filePath":"D:/repo/a.txt"}{"filePath":"D:/repo/b.txt"}',
		},
	};

	const result = await executeToolCall(toolCall);

	t.true(
		result.content.includes(
			'Error: Invalid tool arguments JSON for filesystem-read. Refusing to execute a malformed payload.',
		),
	);
});

test.serial(
	'filesystem-edit keeps the native line-range contract',
	async (t: any) => {
		const tempDir = mkdtempSync(join(tmpdir(), 'snow-tool-edit-'));
		const filePath = join(tempDir, 'native-edit.ts');
		const toolPlaneKey = registerLocalToolBindings(['filesystem-edit']);
		writeFileSync(filePath, 'line1\nline2\nline3\n', 'utf8');

		try {
			const lineEditCall: ToolCall = {
				id: 'native-line-edit',
				type: 'function',
				function: {
					name: 'filesystem-edit',
					arguments: JSON.stringify({
						filePath,
						startLine: 2,
						endLine: 2,
						newContent: 'LINE2',
					}),
				},
			};

			const lineEditResult = await executeToolCallWithBindings(
				lineEditCall,
				toolPlaneKey,
			);
			t.false(lineEditResult.content.startsWith('Error:'));
			t.true(readFileSync(filePath, 'utf8').includes('LINE2'));

			const hashlineStyleCall: ToolCall = {
				id: 'hashline-should-fail',
				type: 'function',
				function: {
					name: 'filesystem-edit',
					arguments: JSON.stringify({
						filePath,
						operations: [
							{
								type: 'replace',
								startAnchor: '2:deadbeef',
								content: 'SHOULD_NOT_APPLY',
							},
						],
					}),
				},
			};

			const hashlineStyleResult = await executeToolCallWithBindings(
				hashlineStyleCall,
				toolPlaneKey,
			);
			t.true(
				hashlineStyleResult.content.includes(
					'Missing required parameters for filesystem-edit tool.',
				),
			);
			t.true(
				hashlineStyleResult.content.includes(
					"'startLine', 'endLine', and 'newContent' are required.",
				),
			);
			t.false(readFileSync(filePath, 'utf8').includes('SHOULD_NOT_APPLY'));
		} finally {
			clearToolExecutionBindings(toolPlaneKey);
			rmSync(tempDir, {recursive: true, force: true});
		}
	},
);

test.serial(
	'filesystem-edit_search remains available with the native search/replace contract',
	async (t: any) => {
		const tempDir = mkdtempSync(join(tmpdir(), 'snow-tool-search-'));
		const filePath = join(tempDir, 'native-edit-search.ts');
		const toolPlaneKey = registerLocalToolBindings(['filesystem-edit_search']);
		writeFileSync(filePath, 'alpha\nbeta\nalpha\n', 'utf8');

		try {
			const toolCall: ToolCall = {
				id: 'native-edit-search',
				type: 'function',
				function: {
					name: 'filesystem-edit_search',
					arguments: JSON.stringify({
						filePath,
						searchContent: 'beta',
						replaceContent: 'BETA',
					}),
				},
			};

			const result = await executeToolCallWithBindings(toolCall, toolPlaneKey);
			t.false(result.content.startsWith('Error:'));
			t.is(readFileSync(filePath, 'utf8'), 'alpha\nBETA\nalpha\n');
		} finally {
			clearToolExecutionBindings(toolPlaneKey);
			rmSync(tempDir, {recursive: true, force: true});
		}
	},
);
