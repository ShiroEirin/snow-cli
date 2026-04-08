import type {MCPTool} from './mcpToolsManager.js';

export const WAIT_FOR_MESSAGES_TOOL_NAME = 'wait_for_messages';

export const TEAMMATE_SYNTHETIC_TOOL_NAMES = new Set([
	'message_teammate',
	'claim_task',
	'complete_task',
	'list_team_tasks',
	'request_plan_approval',
	WAIT_FOR_MESSAGES_TOOL_NAME,
]);

const MESSAGE_TEAMMATE_TOOL: MCPTool = {
	type: 'function',
	function: {
		name: 'message_teammate',
		description:
			'Send a message to another teammate or the team lead. Use to share findings, coordinate work, or request help.',
		parameters: {
			type: 'object',
			properties: {
				target: {
					type: 'string',
					description:
						'The name or member ID of the target teammate, or "lead" to message the team lead.',
				},
				content: {
					type: 'string',
					description: 'The message content to send.',
				},
			},
			required: ['target', 'content'],
		},
	},
};

const CLAIM_TASK_TOOL: MCPTool = {
	type: 'function',
	function: {
		name: 'claim_task',
		description:
			'Claim a pending task from the shared task list. The task must be pending and have no unresolved dependencies.',
		parameters: {
			type: 'object',
			properties: {
				task_id: {
					type: 'string',
					description: 'The ID of the task to claim.',
				},
			},
			required: ['task_id'],
		},
	},
};

const COMPLETE_TASK_TOOL: MCPTool = {
	type: 'function',
	function: {
		name: 'complete_task',
		description: 'Mark a task as completed after finishing the work.',
		parameters: {
			type: 'object',
			properties: {
				task_id: {
					type: 'string',
					description: 'The ID of the task to mark as completed.',
				},
			},
			required: ['task_id'],
		},
	},
};

const LIST_TEAM_TASKS_TOOL: MCPTool = {
	type: 'function',
	function: {
		name: 'list_team_tasks',
		description:
			'View all tasks in the shared task list with their status, assignees, and dependencies.',
		parameters: {
			type: 'object',
			properties: {},
			required: [],
		},
	},
};

const WAIT_FOR_MESSAGES_TOOL: MCPTool = {
	type: 'function',
	function: {
		name: WAIT_FOR_MESSAGES_TOOL_NAME,
		description:
			'Block and wait for incoming messages from the lead, user, or other teammates. Call this when you have finished all current work and are waiting for further instructions. This is efficient — no resources are consumed while waiting. Returns immediately if messages are already queued.',
		parameters: {
			type: 'object',
			properties: {
				summary: {
					type: 'string',
					description:
						'Brief summary of work completed so far, sent to the lead.',
				},
			},
			required: ['summary'],
		},
	},
};

const REQUEST_PLAN_APPROVAL_TOOL: MCPTool = {
	type: 'function',
	function: {
		name: 'request_plan_approval',
		description:
			'Submit your implementation plan to the team lead for review and approval. Required when the lead specified plan approval for this teammate.',
		parameters: {
			type: 'object',
			properties: {
				plan: {
					type: 'string',
					description: 'Your detailed implementation plan in markdown format.',
				},
			},
			required: ['plan'],
		},
	},
};

export function buildTeammateSyntheticTools(options?: {
	requirePlanApproval?: boolean;
}): MCPTool[] {
	const tools = [
		MESSAGE_TEAMMATE_TOOL,
		CLAIM_TASK_TOOL,
		COMPLETE_TASK_TOOL,
		LIST_TEAM_TASKS_TOOL,
		WAIT_FOR_MESSAGES_TOOL,
	];

	if (options?.requirePlanApproval) {
		tools.push(REQUEST_PLAN_APPROVAL_TOOL);
	}

	return [...tools];
}
