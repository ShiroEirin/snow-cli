import anyTest from 'ava';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

const test = anyTest as any;

import {
	buildToolHistoryContent,
	createTeamUserQuestionAdapter,
	executeToolCall,
	type ToolResult,
	type ToolCall,
} from './toolExecutor.js';
import {
	clearToolExecutionBindings,
	registerToolExecutionBindings,
} from '../session/vcpCompatibility/toolExecutionBinding.js';
import {lineHash} from '../../mcp/utils/filesystem/hashline.utils.js';
import {teamService} from '../../mcp/team.js';

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

test('buildToolHistoryContent strips bridge envelope noise and large details', (t: any) => {
	const historyContent = buildToolHistoryContent(
		{
			requestId: 'request-1',
			invocationId: 'invoke-1',
			toolId: 'bridge-tool',
			toolName: 'ServerFileOperator',
			originName: 'ServerFileOperator',
			status: 'success',
			asyncStatus: {
				enabled: false,
				state: 'completed',
				event: 'result',
			},
			result: {
				content: [
					{
						type: 'text',
						text: [
							'Directory listing of `D:\\repo` (28 items)',
							'',
							'| 名称 | 类型 | 大小 |',
							'|---|---|---|',
							'| a | file | 1 |',
							'| b | file | 2 |',
							'| c | file | 3 |',
							'| d | file | 4 |',
							'| e | file | 5 |',
							'| f | file | 6 |',
							'| g | file | 7 |',
							'| h | file | 8 |',
							'| i | file | 9 |',
							'| j | file | 10 |',
							'| k | file | 11 |',
							'| l | file | 12 |',
							'| m | file | 13 |',
							'| n | file | 14 |',
							'| o | file | 15 |',
							'| p | file | 16 |',
							'| q | file | 17 |',
							'| r | file | 18 |',
							'| s | file | 19 |',
							'| t | file | 20 |',
							'| u | file | 21 |',
							'| v | file | 22 |',
							'| w | file | 23 |',
						].join('\n'),
					},
				],
				timestamp: '2026-04-01T15:18:25.747+08:00',
			},
			details: {
				items: Array.from({length: 20}, (_, index) => ({name: `file-${index}`})),
			},
		},
		'fallback tool text',
	);

	t.false(historyContent.includes('requestId'));
	t.false(historyContent.includes('invocationId'));
	t.false(historyContent.includes('"details"'));
	t.false(historyContent.includes('"timestamp"'));
	t.false(historyContent.includes('"type":"text"'));
	t.true(historyContent.includes('"status":"success"'));
	t.true(historyContent.includes('"asyncStatus"'));
	t.true(historyContent.includes('Directory listing of `D:\\\\repo` (28 items)'));
	t.true(historyContent.includes('[truncated'));
});

test('buildToolHistoryContent truncates oversized plain-text tool output', (t: any) => {
	const historyContent = buildToolHistoryContent(
		[
			'line01',
			'line02',
			'line03',
			'line04',
			'line05',
			'line06',
			'line07',
			'line08',
			'line09',
			'line10',
			'line11',
			'line12',
			'line13',
			'line14',
			'line15',
			'line16',
			'line17',
			'line18',
			'line19',
			'line20',
			'line21',
			'line22',
			'line23',
			'line24',
			'line25',
			'line26',
		].join('\n'),
		'fallback tool text',
	);

	t.true(historyContent.includes('line01'));
	t.true(historyContent.includes('line24'));
	t.false(historyContent.includes('line26'));
	t.true(historyContent.includes('[truncated 2 more lines]'));
});

test('buildToolHistoryContent strips appended notebook block from history text', (t: any) => {
	const historyContent = buildToolHistoryContent(
		[
			'📄 source/app.ts (lines 1-3/3)',
			'1:aa→const answer = 42;',
			'2:bb→console.log(answer);',
			'',
			'============================================================',
			'📝 CODE NOTEBOOKS (Latest 10):',
			'============================================================',
			'  1. [2026-04-02 18:30] Remember to inspect the startup path.',
			'  2. [2026-04-02 18:31] Prefer the native edit tool for this file.',
		].join('\n'),
		'fallback tool text',
	);

	t.true(historyContent.includes('📄 source/app.ts (lines 1-3/3)'));
	t.true(historyContent.includes('1:aa→const answer = 42;'));
	t.false(historyContent.includes('CODE NOTEBOOKS (Latest 10)'));
	t.false(historyContent.includes('Remember to inspect the startup path.'));
});

test('buildToolHistoryContent preserves ordinary text outside notebook block format', (t: any) => {
	const historyContent = buildToolHistoryContent(
		'Assistant note: CODE NOTEBOOKS (Latest 10): label mentioned inline only.',
		'fallback tool text',
	);

	t.is(
		historyContent,
		'Assistant note: CODE NOTEBOOKS (Latest 10): label mentioned inline only.',
	);
});

test.serial(
	'team top-level tool results carry summarized history sidecar',
	async (t: any) => {
		const originalExecute = teamService.execute;

		teamService.execute = (async () => ({
			success: true,
			summary: 'Team finished work',
			members: Array.from({length: 12}, (_, index) => ({
				id: `member-${index}`,
				status: index % 2 === 0 ? 'done' : 'pending',
			})),
		})) as typeof teamService.execute;

		try {
			const toolCall: ToolCall = {
				id: 'team-tool-call',
				type: 'function',
				function: {
					name: 'team-wait_for_teammates',
					arguments: JSON.stringify({teamName: 'alpha'}),
				},
			};

			const result = (await executeToolCall(toolCall)) as ToolResult;

			t.truthy(result.historyContent);
			t.true(result.content.includes('"members"'));
			t.true(result.historyContent!.includes('"summary":"Team finished work"'));
			t.false(result.historyContent!.includes('"member-11"'));
		} finally {
			teamService.execute = originalExecute;
		}
	},
);

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
