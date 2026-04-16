import anyTest from 'ava';

const test = anyTest as any;

import {
	createTeammateUserQuestionAdapter,
	executeTeammateRegularToolCall,
	isPlanApprovalProtectedTool,
	projectTeammateMessagesForModel,
} from './teamExecutor.js';
import {
	createTeammateProviderStream,
	prepareTeammateProviderRequest,
} from './teamExecutorProvider.js';
import {
	executeAndRecordTeammateRegularToolCall,
	parseTeammateToolArgs,
	parseTeammateToolArgsResult,
	partitionPlanApprovalRegularCalls,
	resolveTeammateRegularToolApproval,
} from './teamExecutorRegularCalls.js';
import {
	buildTeammateSyntheticTools,
	dispatchTeammateSyntheticToolCall,
	partitionTeammateToolCalls,
} from './teammateSyntheticTools.js';

test('teammate askuser adapter preserves cancelled responses', async (t: any) => {
	const adapter = createTeammateUserQuestionAdapter(
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

test('plan approval blocks real local mutating tools', (t: any) => {
	t.true(isPlanApprovalProtectedTool('filesystem-edit'));
	t.false(isPlanApprovalProtectedTool('filesystem-edit_search'));
	t.true(isPlanApprovalProtectedTool('terminal-execute'));
	t.true(
		isPlanApprovalProtectedTool('custom-tool', {
			kind: 'local',
			toolName: 'filesystem-create',
		}),
	);
});

test('plan approval keeps read-only and bridge tools outside the block list', (t: any) => {
	t.false(isPlanApprovalProtectedTool('filesystem-read'));
	t.false(
		isPlanApprovalProtectedTool('vcp-search-findnote', {
			kind: 'bridge',
			toolName: 'vcp-search-findnote',
			pluginName: 'Search',
			displayName: 'Search',
			commandName: 'FindNote',
		}),
	);
});

test('plan approval blocks mutating manage actions but keeps read actions executable', (t: any) => {
	const toolCalls = [
		{
			id: 'todo-get',
			type: 'function',
			function: {
				name: 'todo-manage',
				arguments: JSON.stringify({action: 'get'}),
			},
		},
		{
			id: 'todo-update',
			type: 'function',
			function: {
				name: 'todo-manage',
				arguments: JSON.stringify({action: 'update', todoId: 'task-1'}),
			},
		},
		{
			id: 'notebook-query',
			type: 'function',
			function: {
				name: 'notebook-manage',
				arguments: JSON.stringify({action: 'query', filePathPattern: 'src'}),
			},
		},
		{
			id: 'notebook-delete',
			type: 'function',
			function: {
				name: 'notebook-manage',
				arguments: JSON.stringify({action: 'delete', notebookId: 'nb-1'}),
			},
		},
		{
			id: 'legacy-add',
			type: 'function',
			function: {
				name: 'todo-add',
				arguments: JSON.stringify({content: 'legacy'}),
			},
		},
	];

	const partitioned = partitionPlanApprovalRegularCalls({
		toolCalls: toolCalls as any,
		toolPlaneKey: 'plane-key-1',
		isPlanApprovalProtectedTool,
		getToolExecutionBindingImpl: toolName =>
			({
				kind: 'local',
				toolName,
			}) as any,
	});

	t.deepEqual(
		partitioned.blockedCalls.map(toolCall => toolCall.id),
		['todo-update', 'notebook-delete', 'legacy-add'],
	);
	t.deepEqual(
		partitioned.executableCalls.map(toolCall => toolCall.id),
		['todo-get', 'notebook-query'],
	);
});

test('teammate synthetic tools keep stable order and gate plan approval tool', (t: any) => {
	const defaultToolNames = buildTeammateSyntheticTools().map(
		tool => tool.function.name,
	);
	const gatedToolNames = buildTeammateSyntheticTools({
		requirePlanApproval: true,
	}).map(tool => tool.function.name);

	t.deepEqual(defaultToolNames, [
		'message_teammate',
		'claim_task',
		'complete_task',
		'list_team_tasks',
		'wait_for_messages',
	]);
	t.deepEqual(gatedToolNames, [...defaultToolNames, 'request_plan_approval']);
});

test('partitionTeammateToolCalls separates wait and regular calls', (t: any) => {
	const toolCalls = [
		{id: '1', function: {name: 'message_teammate'}},
		{id: '2', function: {name: 'filesystem-read'}},
		{id: '3', function: {name: 'wait_for_messages'}},
		{id: '4', function: {name: 'claim_task'}},
	];

	const partitioned = partitionTeammateToolCalls(toolCalls as any);

	t.deepEqual(
		partitioned.syntheticCalls.map(toolCall => toolCall.function.name),
		['message_teammate', 'wait_for_messages', 'claim_task'],
	);
	t.deepEqual(
		partitioned.otherSyntheticCalls.map(toolCall => toolCall.function.name),
		['message_teammate', 'claim_task'],
	);
	t.deepEqual(
		partitioned.regularCalls.map(toolCall => toolCall.function.name),
		['filesystem-read'],
	);
	t.is(partitioned.waitCall?.id, '3');
});

test('dispatchTeammateSyntheticToolCall supports injected dependencies', (t: any) => {
	const recordedLeadMessages: string[] = [];
	const recordedApprovals: string[] = [];

	const leadResult = dispatchTeammateSyntheticToolCall({
		toolName: 'message_teammate',
		args: {target: 'lead', content: 'Need review'},
		teamName: 'alpha',
		memberId: 'm-1',
		memberName: 'Alice',
		instanceId: 'inst-1',
		dependencies: {
			sendMessageToLead: (instanceId, content) => {
				recordedLeadMessages.push(`${instanceId}:${content}`);
				return true;
			},
		},
	});
	const approvalResult = dispatchTeammateSyntheticToolCall({
		toolName: 'request_plan_approval',
		args: {plan: '## plan'},
		teamName: 'alpha',
		memberId: 'm-1',
		memberName: 'Alice',
		instanceId: 'inst-1',
		dependencies: {
			requestPlanApproval: (instanceId, plan) => {
				recordedApprovals.push(`${instanceId}:${plan}`);
			},
		},
	});

	t.is(leadResult, 'Message sent to team lead.');
	t.is(
		approvalResult,
		'Plan submitted for approval. Waiting for lead response...',
	);
	t.deepEqual(recordedLeadMessages, ['inst-1:Need review']);
	t.deepEqual(recordedApprovals, ['inst-1:## plan']);
});

test('executeTeammateRegularToolCall forwards toolPlaneKey to binding-sensitive helpers', async (t: any) => {
	const observed: {
		rewrite?: {
			toolName: string;
			worktreePath: string;
			toolPlaneKey?: string;
		};
		execute?: {
			toolSnapshotKey?: string;
			args: Record<string, any>;
		};
	} = {};

	const result = await executeTeammateRegularToolCall({
		toolCall: {
			id: 'tool-1',
			type: 'function',
			function: {
				name: 'filesystem-read',
				arguments: '{"filePath":"src/demo.ts"}',
			},
		},
		toolArgs: {filePath: 'src/demo.ts'},
		worktreePath: 'H:/tmp/worktree',
		toolPlaneKey: 'plane-key-1',
		executeToolCall: async (
			toolCall,
			_abortSignal,
			_onTokenUpdate,
			_onSubAgentMessage,
			_requestToolConfirmation,
			_isToolAutoApproved,
			_yoloMode,
			_addToAlwaysApproved,
			_onUserInteractionNeeded,
			toolSnapshotKey,
		) => {
			observed.execute = {
				toolSnapshotKey,
				args: JSON.parse(toolCall.function.arguments),
			};
			return {
				content: 'ok',
				historyContent: 'history',
				previewContent: 'preview',
			};
		},
		rewriteToolArgsForWorktreeImpl: (
			toolName,
			args,
			worktreePath,
			toolPlaneKey,
		) => {
			observed.rewrite = {
				toolName,
				worktreePath,
				toolPlaneKey,
			};
			return {
				args: {
					...args,
					filePath: 'H:/tmp/worktree/src/demo.ts',
				},
			};
		},
	});

	t.deepEqual(observed.rewrite, {
		toolName: 'filesystem-read',
		worktreePath: 'H:/tmp/worktree',
		toolPlaneKey: 'plane-key-1',
	});
	t.deepEqual(observed.execute, {
		toolSnapshotKey: 'plane-key-1',
		args: {
			filePath: 'H:/tmp/worktree/src/demo.ts',
		},
	});
	t.deepEqual(result, {
		message: {
			role: 'tool',
			tool_call_id: 'tool-1',
			content: 'ok',
			historyContent: 'history',
			previewContent: 'preview',
		},
		emitContent: 'ok',
	});
});

test('prepareTeammateProviderRequest resolves provider before outbound transforms', (t: any) => {
	const prepared = prepareTeammateProviderRequest({
		config: {
			requestMethod: 'chat',
		} as any,
		model: 'gpt-5',
		allowedTools: [{type: 'function', function: {name: 'filesystem-read'}}] as any,
		messages: [{role: 'user', content: 'hello'}],
		resolveVcpModeRequest: (_config, _args) => ({
			enabled: true,
			requestMethod: 'responses',
			tools: [
				{type: 'function', function: {name: 'filesystem-read'}},
			] as any,
			toolChoice: 'auto',
		}),
	});

	t.is(prepared.resolvedRequest.requestMethod, 'responses');
	t.deepEqual(prepared.transformedMessages, [{role: 'user', content: 'hello'}]);
});

test('createTeammateProviderStream dispatches provider-specific payloads', (t: any) => {
	const observed: {
		chat?: any;
		anthropic?: any;
		gemini?: any;
		responses?: any;
	} = {};

	createTeammateProviderStream({
		config: {
			requestMethod: 'chat',
			maxTokens: 2048,
		} as any,
		model: 'claude',
		allowedTools: [{type: 'function', function: {name: 'filesystem-read'}}] as any,
		messages: [{role: 'user', content: 'hello'}],
		currentSessionId: 'session-1',
		resolveVcpModeRequest: (_config, _args) => ({
			enabled: true,
			requestMethod: 'anthropic',
			tools: [
				{type: 'function', function: {name: 'filesystem-read'}},
			] as any,
			toolChoice: 'auto',
		}),
		streamFactories: {
			createStreamingChatCompletion: options => {
				observed.chat = options;
				return [] as any;
			},
			createStreamingAnthropicCompletion: options => {
				observed.anthropic = options;
				return [] as any;
			},
			createStreamingGeminiCompletion: options => {
				observed.gemini = options;
				return [] as any;
			},
			createStreamingResponse: options => {
				observed.responses = options;
				return [] as any;
			},
		},
	});

	createTeammateProviderStream({
		config: {
			requestMethod: 'chat',
			maxTokens: 2048,
		} as any,
		model: 'gpt-5',
		allowedTools: [{type: 'function', function: {name: 'filesystem-read'}}] as any,
		messages: [{role: 'user', content: 'hello'}],
		currentSessionId: 'session-2',
		resolveVcpModeRequest: (_config, _args) => ({
			enabled: true,
			requestMethod: 'responses',
			tools: [
				{type: 'function', function: {name: 'filesystem-read'}},
			] as any,
			toolChoice: 'required',
		}),
		streamFactories: {
			createStreamingChatCompletion: options => {
				observed.chat = options;
				return [] as any;
			},
			createStreamingAnthropicCompletion: options => {
				observed.anthropic = options;
				return [] as any;
			},
			createStreamingGeminiCompletion: options => {
				observed.gemini = options;
				return [] as any;
			},
			createStreamingResponse: options => {
				observed.responses = options;
				return [] as any;
			},
		},
	});

	t.deepEqual(observed.anthropic, {
		model: 'claude',
		messages: [{role: 'user', content: 'hello'}],
		temperature: 0,
		max_tokens: 2048,
		tools: [{type: 'function', function: {name: 'filesystem-read'}}],
		sessionId: 'session-1',
	});
	t.deepEqual(observed.responses, {
		model: 'gpt-5',
		messages: [{role: 'user', content: 'hello'}],
		temperature: 0,
		tools: [{type: 'function', function: {name: 'filesystem-read'}}],
		tool_choice: 'required',
		prompt_cache_key: 'session-2',
	});

	createTeammateProviderStream({
		config: {
			requestMethod: 'chat',
			maxTokens: 2048,
		} as any,
		model: 'gemini-2.5-pro',
		allowedTools: [{type: 'function', function: {name: 'filesystem-read'}}] as any,
		messages: [{role: 'user', content: 'hello'}],
		resolveVcpModeRequest: () => ({
			enabled: true,
			requestMethod: 'gemini',
			tools: [{type: 'function', function: {name: 'filesystem-read'}}] as any,
			toolChoice: 'auto',
		}),
		streamFactories: {
			createStreamingChatCompletion: options => {
				observed.chat = options;
				return [] as any;
			},
			createStreamingAnthropicCompletion: options => {
				observed.anthropic = options;
				return [] as any;
			},
			createStreamingGeminiCompletion: options => {
				observed.gemini = options;
				return [] as any;
			},
			createStreamingResponse: options => {
				observed.responses = options;
				return [] as any;
			},
		},
	});

	createTeammateProviderStream({
		config: {
			requestMethod: 'chat',
			maxTokens: 2048,
		} as any,
		model: 'gpt-5-chat',
		allowedTools: [{type: 'function', function: {name: 'filesystem-read'}}] as any,
		messages: [{role: 'user', content: 'hello'}],
		resolveVcpModeRequest: () => ({
			enabled: true,
			requestMethod: 'chat',
			tools: [{type: 'function', function: {name: 'filesystem-read'}}] as any,
			toolChoice: 'auto',
		}),
		streamFactories: {
			createStreamingChatCompletion: options => {
				observed.chat = options;
				return [] as any;
			},
			createStreamingAnthropicCompletion: options => {
				observed.anthropic = options;
				return [] as any;
			},
			createStreamingGeminiCompletion: options => {
				observed.gemini = options;
				return [] as any;
			},
			createStreamingResponse: options => {
				observed.responses = options;
				return [] as any;
			},
		},
	});

	t.deepEqual(observed.gemini, {
		model: 'gemini-2.5-pro',
		messages: [{role: 'user', content: 'hello'}],
		temperature: 0,
		tools: [{type: 'function', function: {name: 'filesystem-read'}}],
	});
	t.deepEqual(observed.chat, {
		model: 'gpt-5-chat',
		messages: [{role: 'user', content: 'hello'}],
		temperature: 0,
		tools: [{type: 'function', function: {name: 'filesystem-read'}}],
		tool_choice: 'auto',
	});
});

test('regular teammate helpers keep approval and execution behavior stable', async (t: any) => {
	const toolCall = {
		id: 'tool-1',
		type: 'function',
		function: {
			name: 'filesystem-edit',
			arguments: '{"filePath":"src/demo.ts"}',
		},
	} as const;
	const alwaysApproved: string[] = [];
	const messages: any[] = [];
	const emitted: string[] = [];

	t.deepEqual(parseTeammateToolArgs(toolCall), {filePath: 'src/demo.ts'});
	t.deepEqual(parseTeammateToolArgsResult(toolCall), {
		ok: true,
		args: {filePath: 'src/demo.ts'},
	});
	t.deepEqual(
		parseTeammateToolArgsResult({
			function: {
				name: 'filesystem-edit',
				arguments: '{"filePath":"src/demo.ts"',
			},
		} as any),
		{
			ok: false,
			args: {},
			error:
				'Invalid tool arguments JSON for filesystem-edit. Refusing to execute a malformed payload.',
		},
	);
	t.deepEqual(
		partitionPlanApprovalRegularCalls({
			toolCalls: [toolCall as any],
			toolPlaneKey: 'plane-key-1',
			isPlanApprovalProtectedTool,
			getToolExecutionBindingImpl: () =>
				({
					kind: 'local',
					toolName: 'filesystem-edit',
				}) as any,
		}),
		{
			blockedCalls: [toolCall],
			executableCalls: [],
		},
	);
	t.deepEqual(
		await resolveTeammateRegularToolApproval({
			toolCall: toolCall as any,
			toolArgs: {filePath: 'src/demo.ts'},
			requestToolConfirmation: async () => 'approve_always',
			addToAlwaysApproved: toolName => {
				alwaysApproved.push(toolName);
			},
		}),
		{approved: true},
	);
	t.deepEqual(alwaysApproved, ['filesystem-edit']);
	t.deepEqual(
		await resolveTeammateRegularToolApproval({
			toolCall: toolCall as any,
			toolArgs: {filePath: 'src/demo.ts'},
			requestToolConfirmation: async () => ({
				type: 'reject_with_reply',
				reason: 'Need review first',
			}),
		}),
		{
			approved: false,
			feedback: 'Need review first',
		},
	);

	await executeAndRecordTeammateRegularToolCall({
		toolCall: toolCall as any,
		toolArgs: {filePath: 'src/demo.ts'},
		messages,
		executeRegularToolCall: async (_toolCall, _toolArgs) => ({
			message: {
				role: 'tool',
				tool_call_id: 'tool-1',
				content: 'ok',
			},
			emitContent: 'ok',
		}),
		emitToolResult: content => {
			emitted.push(content);
		},
	});

	t.deepEqual(messages, [
		{
			role: 'tool',
			tool_call_id: 'tool-1',
			content: 'ok',
		},
	]);
t.deepEqual(emitted, ['ok']);
});

test('projectTeammateMessagesForModel keeps local vcp teammate history raw', (t: any) => {
	const messages = [
		{
			role: 'tool' as const,
			content: `${'line\n'.repeat(24)}tail`,
			historyContent: `${'line\n'.repeat(24)}tail`,
		},
	];

	const localProjected = projectTeammateMessagesForModel(
		{backendMode: 'vcp', toolTransport: 'local'},
		messages as any,
	);
	const bridgeProjected = projectTeammateMessagesForModel(
		{backendMode: 'vcp', toolTransport: 'bridge'},
		messages as any,
	);

	t.is(localProjected[0]?.content, messages[0]?.content);
	t.true(
		bridgeProjected[0]?.content.includes('[projected tool context truncated]'),
	);
});
