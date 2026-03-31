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
import {lineHash} from '../../mcp/utils/filesystem/hashline.utils.js';

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
	'filesystem-edit uses the current hashline operations contract',
	async (t: any) => {
		const tempDir = mkdtempSync(join(tmpdir(), 'snow-tool-edit-'));
		const filePath = join(tempDir, 'native-edit.ts');
		const toolPlaneKey = registerLocalToolBindings(['filesystem-edit']);
		writeFileSync(filePath, 'line1\nline2\nline3\n', 'utf8');
		const startAnchor = `2:${lineHash('line2')}`;

		try {
			const lineEditCall: ToolCall = {
				id: 'hashline-edit',
				type: 'function',
				function: {
					name: 'filesystem-edit',
					arguments: JSON.stringify({
						filePath,
						operations: [
							{
								type: 'replace',
								startAnchor,
								content: 'LINE2',
							},
						],
					}),
				},
			};

			const lineEditResult = await executeToolCallWithBindings(
				lineEditCall,
				toolPlaneKey,
			);
			t.false(lineEditResult.content.startsWith('Error:'));
			t.true(readFileSync(filePath, 'utf8').includes('LINE2'));

			const legacyLineRangeCall: ToolCall = {
				id: 'legacy-line-edit-should-fail',
				type: 'function',
				function: {
					name: 'filesystem-edit',
					arguments: JSON.stringify({
						filePath,
						startLine: 2,
						endLine: 2,
						newContent: 'SHOULD_NOT_APPLY',
					}),
				},
			};

			const legacyLineRangeResult = await executeToolCallWithBindings(
				legacyLineRangeCall,
				toolPlaneKey,
			);
			t.true(
				legacyLineRangeResult.content.includes(
					"Missing required parameter 'operations' for filesystem-edit tool.",
				),
			);
			t.true(
				legacyLineRangeResult.content.includes(
					'array of {type, startAnchor, endAnchor?, content?} operations',
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
	'filesystem-edit_search is no longer routed as an available native edit tool',
	async (t: any) => {
		const toolPlaneKey = registerLocalToolBindings(['filesystem-edit']);
		const filePath = join(tmpdir(), 'native-edit-search.ts');

		try {
			const toolCall: ToolCall = {
				id: 'native-edit-search-missing-binding',
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
			t.true(
				result.content.includes(
					'Error: Tool execution binding not found for filesystem-edit_search',
				),
			);
		} finally {
			clearToolExecutionBindings(toolPlaneKey);
		}
	},
);
