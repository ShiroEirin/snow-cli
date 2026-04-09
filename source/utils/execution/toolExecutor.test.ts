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
	extractToolResultSidecar,
	normalizeBridgeIngressPayload,
	normalizeBridgePhaseValue,
} from './bridgeIngress.js';
import {buildToolHistoryArtifacts} from './toolHistoryArtifacts.js';
import {
	clearToolExecutionBindings,
	registerToolExecutionBindings,
} from '../session/vcpCompatibility/toolExecutionBinding.js';
import {snowBridgeClient} from '../session/vcpCompatibility/bridgeClient.js';
import {lineHash} from '../../mcp/utils/filesystem/hashline.utils.js';
import {teamService} from '../../mcp/team.js';
import {subAgentService} from '../../mcp/subagent.js';

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

test.serial('subagent tools reject empty prompt arguments before execution starts', async (t: any) => {
	const originalExecute = subAgentService.execute;
	let executeCalled = false;
	subAgentService.execute = (async () => {
		executeCalled = true;
		throw new Error('subAgentService.execute should not run for empty prompts');
	}) as typeof subAgentService.execute;

	try {
		const toolCall: ToolCall = {
			id: 'subagent-empty-prompt',
			type: 'function',
			function: {
				name: 'subagent-agent_explore',
				arguments: '{}',
			},
		};

		const result = await executeToolCall(toolCall);

		t.false(executeCalled);
		t.is(result.tool_call_id, 'subagent-empty-prompt');
		t.is(result.content, 'Error: Sub-agent prompt is required');
	} finally {
		subAgentService.execute = originalExecute;
	}
});

test('buildToolHistoryArtifacts split model history from UI preview summaries', (t: any) => {
	const artifacts = buildToolHistoryArtifacts(
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
	const historySummary = JSON.parse(artifacts.previewContent!);

	t.truthy(artifacts.previewContent);
	t.true(artifacts.historyContent.includes('"status":"success"'));
	t.true(artifacts.historyContent.includes('"asyncStatus"'));
	t.true(artifacts.historyContent.includes('Directory listing of `D:\\\\repo` (28 items)'));
	t.true(artifacts.historyContent.includes('[truncated'));
	t.false(artifacts.historyContent.includes('requestId'));
	t.false(artifacts.historyContent.includes('invocationId'));
	t.false(artifacts.historyContent.includes('"details"'));
	t.false(artifacts.historyContent.includes('"timestamp"'));
	t.is(historySummary.status, 'success');
	t.is(historySummary.asyncState, 'completed');
	t.true(historySummary.summary.includes('Directory listing of `D:\\repo` (28 items)'));
	t.true(historySummary.itemCount >= 20);
	t.true(Array.isArray(historySummary.topItems));
	t.true(historySummary.topItems.length > 0);
	t.true(historySummary.truncated);
	t.false('rawPayloadRef' in historySummary);
	t.not(artifacts.historyContent, artifacts.previewContent);
});

test('buildToolHistoryArtifacts keep plain-text history separate from preview schema', (t: any) => {
	const artifacts = buildToolHistoryArtifacts(
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
	const historySummary = JSON.parse(artifacts.previewContent!);

	t.true(artifacts.historyContent.includes('line01'));
	t.true(artifacts.historyContent.includes('line24'));
	t.false(artifacts.historyContent.includes('line25'));
	t.false(artifacts.historyContent.includes('line26'));
	t.true(artifacts.historyContent.includes('[truncated 2 more lines]'));
	t.is(historySummary.summary, 'line01');
	t.deepEqual(historySummary.topItems, ['line02', 'line03', 'line04']);
	t.true(historySummary.truncated);
	t.false('rawPayloadRef' in historySummary);
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

test('buildToolHistoryArtifacts promotes oversized collections into structured summary payloads', (t: any) => {
	const artifacts = buildToolHistoryArtifacts(
		{
			summary: 'Found files in repo',
			files: Array.from({length: 8}, (_value, index) => ({
				path: `src/file-${index}.ts`,
			})),
		},
		'fallback tool text',
	);

	t.truthy(artifacts.historySummary);
	t.truthy(artifacts.previewContent);
	t.is(artifacts.historySummary?.summary, 'Found files in repo');
	t.is(artifacts.historySummary?.itemCount, 8);
	t.deepEqual(artifacts.historySummary?.topItems, [
		'src/file-0.ts',
		'src/file-1.ts',
		'src/file-2.ts',
	]);
	t.false('rawPayloadRef' in (artifacts.historySummary || {}));
	t.true(artifacts.historyContent.includes('"path":"src/file-0.ts"'));
	t.false(artifacts.historyContent.includes('"itemCount":8'));
	t.true(artifacts.previewContent?.includes('"itemCount":8'));
});

test('buildToolHistoryArtifacts honors bridge-provided sidecar summaries', (t: any) => {
	const previewContent = JSON.stringify({
		summary: 'Found 12 search hits',
		status: 'success',
		itemCount: 12,
		topItems: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
		truncated: true,
	});
	const artifacts = buildToolHistoryArtifacts(
		{
			status: 'success',
			result: {
				results: Array.from({length: 12}, (_value, index) => ({
					path: `src/file-${index}.ts`,
				})),
			},
			historyContent: 'Search results compacted to top matches: src/a.ts, src/b.ts, src/c.ts',
			previewContent,
		},
		'fallback tool text',
	);

	t.is(
		artifacts.historyContent,
		'Search results compacted to top matches: src/a.ts, src/b.ts, src/c.ts',
	);
	t.is(artifacts.previewContent, previewContent);
	t.deepEqual(artifacts.historySummary, {
		summary: 'Found 12 search hits',
		status: 'success',
		itemCount: 12,
		topItems: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
		truncated: true,
	});
});

test('bridge ingress helpers normalize accepted payloads and preserve sidecars', (t: any) => {
	const normalizedPayload = normalizeBridgeIngressPayload({
		status: 'queued',
		historyContent: 'keep history sidecar',
		previewContent: '{"summary":"queued"}',
		accepted: {
			stage: 'Submitted',
			asyncStatus: {
				event: 'result',
			},
			taskId: 'task-accepted-1',
			result: {
				ok: true,
			},
		},
	}) as Record<string, any>;

	t.is(normalizeBridgePhaseValue('Final Result'), 'final_result');
	t.is(normalizedPayload['status'], 'accepted');
	t.deepEqual(normalizedPayload['asyncStatus'], {
		enabled: true,
		state: 'accepted',
		event: 'lifecycle',
		taskId: 'task-accepted-1',
	});
	t.is(normalizedPayload['historyContent'], 'keep history sidecar');
	t.is(normalizedPayload['previewContent'], '{"summary":"queued"}');
	t.false('accepted' in normalizedPayload);
	t.deepEqual(normalizedPayload['result'], {
		ok: true,
	});
});

test('extractToolResultSidecar only returns non-empty bridge sidecars', (t: any) => {
	t.deepEqual(
		extractToolResultSidecar({
			historyContent: 'history kept',
			previewContent: '   ',
		}),
		{
			historyContent: 'history kept',
		},
	);
	t.deepEqual(extractToolResultSidecar(null), {});
});

test('buildToolHistoryArtifacts omits image_url payloads from history sidecar', (t: any) => {
	const imageUrl = 'https://cdn.example.com/generated/chart.png?token=secret';
	const artifacts = buildToolHistoryArtifacts(
		{
			status: 'success',
			result: {
				content: [
					{
						type: 'text',
						text: 'Generated chart preview.',
					},
					{
						type: 'image_url',
						image_url: {url: imageUrl},
					},
				],
			},
		},
		JSON.stringify({
			status: 'success',
			result: {
				content: [
					{
						type: 'text',
						text: 'Generated chart preview.',
					},
					{
						type: 'image_url',
						image_url: {url: imageUrl},
					},
				],
			},
		}),
	);

	t.true(artifacts.historyContent.includes('Generated chart preview.'));
	t.true(artifacts.historyContent.includes('[1 image URL item omitted]'));
	t.false(artifacts.historyContent.includes(imageUrl));
});

test.serial(
	'executeToolCall prefers bridge-provided compact sidecars for history',
	async (t: any) => {
		const toolPlaneKey = `tool-executor-bridge-sidecar-${++toolPlaneSequence}`;
		const previewContent = JSON.stringify({
			summary: 'VSearch generated research report for "SnowBridge"',
			status: 'success',
			itemCount: 6,
			topItems: ['SnowBridge plugin', 'bridge contract', 'hybrid mode'],
			truncated: true,
		});
		const originalExecuteTool = snowBridgeClient.executeTool;
		registerToolExecutionBindings(toolPlaneKey, [
			{
				kind: 'bridge',
				toolName: 'vcp-vsearch',
				pluginName: 'VSearch',
				displayName: 'VSearch',
				commandName: 'Search',
			},
		]);

		snowBridgeClient.executeTool = (async () => ({
			status: 'success',
			result: {
				results: Array.from({length: 6}, (_value, index) => ({
					title: `keyword-${index}`,
					url: `https://example.com/${index}`,
				})),
			},
			historyContent:
				'VSearch generated research report for "SnowBridge"\nitemCount: 6\ntopItems:\n- SnowBridge plugin\n- bridge contract\n- hybrid mode\n[truncated raw result omitted]',
			previewContent,
		})) as typeof snowBridgeClient.executeTool;

		try {
			const result = await executeToolCallWithBindings(
				{
					id: 'bridge-sidecar-call',
					type: 'function',
					function: {
						name: 'vcp-vsearch',
						arguments: JSON.stringify({query: 'SnowBridge'}),
					},
				},
				toolPlaneKey,
			);

			t.is(
				result.historyContent,
				'VSearch generated research report for "SnowBridge"\nitemCount: 6\ntopItems:\n- SnowBridge plugin\n- bridge contract\n- hybrid mode\n[truncated raw result omitted]',
			);
			t.is(result.previewContent, previewContent);
			t.true(result.content.includes('"results"'));
		} finally {
			snowBridgeClient.executeTool = originalExecuteTool;
			clearToolExecutionBindings(toolPlaneKey);
		}
	},
);

test.serial(
	'executeToolCall keeps raw bridge image_url result while history sidecar omits url noise',
	async (t: any) => {
		const toolPlaneKey = `tool-executor-bridge-image-url-${++toolPlaneSequence}`;
		const imageUrl = 'https://cdn.example.com/generated/chart.png?token=secret';
		const originalExecuteTool = snowBridgeClient.executeTool;
		registerToolExecutionBindings(toolPlaneKey, [
			{
				kind: 'bridge',
				toolName: 'vcp-vision-preview',
				pluginName: 'VisionPreview',
				displayName: 'VisionPreview',
				commandName: 'Preview',
			},
		]);

		snowBridgeClient.executeTool = (async () => ({
			status: 'success',
			result: {
				content: [
					{
						type: 'text',
						text: 'Generated chart preview.',
					},
					{
						type: 'image_url',
						image_url: {url: imageUrl},
					},
				],
			},
		})) as typeof snowBridgeClient.executeTool;

		try {
			const result = await executeToolCallWithBindings(
				{
					id: 'bridge-image-url-call',
					type: 'function',
					function: {
						name: 'vcp-vision-preview',
						arguments: JSON.stringify({query: 'chart'}),
					},
				},
				toolPlaneKey,
			);

			t.true(result.content.includes(imageUrl));
			t.true(result.historyContent?.includes('Generated chart preview.') || false);
			t.true(
				result.historyContent?.includes('[1 image URL item omitted]') || false,
			);
			t.false(result.historyContent?.includes(imageUrl) || false);
			t.truthy(result.previewContent);
			t.true(result.previewContent?.includes('"summary"') || false);
			t.true(
				result.previewContent?.includes('[1 image URL item omitted]') || false,
			);
			t.false(result.previewContent?.includes(imageUrl) || false);
		} finally {
			snowBridgeClient.executeTool = originalExecuteTool;
			clearToolExecutionBindings(toolPlaneKey);
		}
	},
);

test.serial(
	'executeToolCall normalizes final bridge ingress envelopes into completed tool results',
	async (t: any) => {
		const toolPlaneKey = `tool-executor-bridge-final-ingress-${++toolPlaneSequence}`;
		const originalExecuteTool = snowBridgeClient.executeTool;
		registerToolExecutionBindings(toolPlaneKey, [
			{
				kind: 'bridge',
				toolName: 'vcp-async-bridge-tool',
				pluginName: 'AsyncBridgeTool',
				displayName: 'AsyncBridgeTool',
				commandName: 'Run',
			},
		]);

		snowBridgeClient.executeTool = (async () => ({
			status: 'accepted',
			asyncStatus: {
				enabled: true,
				state: 'accepted',
				event: 'lifecycle',
				taskId: 'task-99',
			},
			final: {
				status: 'final',
				result: {
					ok: true,
					taskId: 'task-99',
				},
				asyncStatus: {
					enabled: true,
					state: 'final',
					event: 'final',
					taskId: 'task-99',
				},
				historyContent: 'Task 99 completed with final payload',
				previewContent: '{"summary":"task finished"}',
			},
		})) as typeof snowBridgeClient.executeTool;

		try {
			const result = await executeToolCallWithBindings(
				{
					id: 'bridge-final-ingress-call',
					type: 'function',
					function: {
						name: 'vcp-async-bridge-tool',
						arguments: JSON.stringify({query: 'SnowBridge'}),
					},
				},
				toolPlaneKey,
			);

			t.true(result.content.includes('"status":"success"'));
			t.true(result.content.includes('"ok":true'));
			t.false(result.content.includes('"final":'));
			t.is(result.toolLifecycleState, 'completed');
			t.is(result.toolStatusDetail, 'SnowBridge: Completed (Result)');
			t.is(result.historyContent, 'Task 99 completed with final payload');
		} finally {
			snowBridgeClient.executeTool = originalExecuteTool;
			clearToolExecutionBindings(toolPlaneKey);
		}
	},
);

test.serial(
	'executeToolCall normalizes final bridge ingress envelopes into error tool results',
	async (t: any) => {
		const toolPlaneKey = `tool-executor-bridge-final-error-${++toolPlaneSequence}`;
		const originalExecuteTool = snowBridgeClient.executeTool;
		registerToolExecutionBindings(toolPlaneKey, [
			{
				kind: 'bridge',
				toolName: 'vcp-async-bridge-tool',
				pluginName: 'AsyncBridgeTool',
				displayName: 'AsyncBridgeTool',
				commandName: 'Run',
			},
		]);

		snowBridgeClient.executeTool = (async () => ({
			status: 'accepted',
			asyncStatus: {
				enabled: true,
				state: 'accepted',
				event: 'lifecycle',
				taskId: 'task-100',
			},
			final: {
				status: 'final',
				error: {
					message: 'bridge task failed',
				},
				asyncStatus: {
					enabled: true,
					state: 'error',
					event: 'final',
					taskId: 'task-100',
				},
				historyContent: 'Task 100 failed with final payload',
			},
		})) as typeof snowBridgeClient.executeTool;

		try {
			const result = await executeToolCallWithBindings(
				{
					id: 'bridge-final-error-call',
					type: 'function',
					function: {
						name: 'vcp-async-bridge-tool',
						arguments: JSON.stringify({query: 'SnowBridge'}),
					},
				},
				toolPlaneKey,
			);

			t.true(result.content.includes('"status":"error"'));
			t.true(result.content.includes('bridge task failed'));
			t.is(result.toolLifecycleState, 'error');
			t.is(result.toolStatusDetail, 'SnowBridge: Error (Result)');
			t.is(result.historyContent, 'Task 100 failed with final payload');
		} finally {
			snowBridgeClient.executeTool = originalExecuteTool;
			clearToolExecutionBindings(toolPlaneKey);
		}
	},
);

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
			t.truthy(result.previewContent);
			t.true(result.content.includes('"members"'));
			t.false(result.historyContent!.includes('"summary":"Team finished work"'));
			t.false(result.historyContent!.includes('"member-11"'));
			t.true(result.previewContent!.includes('"summary":"Team finished work"'));
			t.true(result.previewContent!.includes('"itemCount":12'));
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
