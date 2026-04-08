import anyTest from 'ava';

const test = anyTest as any;

import {
	createTeammateUserQuestionAdapter,
	isPlanApprovalProtectedTool,
} from './teamExecutor.js';
import {buildTeammateSyntheticTools} from './teammateSyntheticTools.js';

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
	t.true(isPlanApprovalProtectedTool('filesystem-edit_search'));
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
