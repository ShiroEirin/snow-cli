import type {MCPTool} from './mcpToolsManager.js';
import {teamTracker} from './teamTracker.js';
import {claimTask, completeTask, listTasks} from '../team/teamTaskList.js';

export const WAIT_FOR_MESSAGES_TOOL_NAME = 'wait_for_messages';

export const TEAMMATE_SYNTHETIC_TOOL_NAMES = new Set([
	'message_teammate',
	'claim_task',
	'complete_task',
	'list_team_tasks',
	'request_plan_approval',
	WAIT_FOR_MESSAGES_TOOL_NAME,
]);

type TeammateToolCallLike = {
	id?: string;
	function: {
		name: string;
	};
};

type ListedTeamTask = {
	id: string;
	title: string;
	status: string;
	dependencies?: string[];
	assigneeName?: string;
};

type ClaimedTeamTask = {
	id: string;
	title: string;
};

type ResolvedTeammate = {
	instanceId: string;
	memberName: string;
};

export type TeammateSyntheticDispatchDependencies = {
	sendMessageToLead: (instanceId: string, content: string) => boolean;
	findByMemberName: (target: string) => ResolvedTeammate | undefined;
	findByMemberId: (target: string) => ResolvedTeammate | undefined;
	getTeammate: (target: string) => ResolvedTeammate | undefined;
	sendMessageToTeammate: (
		instanceId: string,
		targetInstanceId: string,
		content: string,
	) => boolean;
	claimTask: (
		teamName: string,
		taskId: string,
		memberId: string,
		memberName: string,
	) => ClaimedTeamTask | undefined;
	completeTask: (
		teamName: string,
		taskId: string,
	) => ClaimedTeamTask | undefined;
	listTasks: (teamName: string) => ListedTeamTask[];
	setCurrentTask: (instanceId: string, taskId?: string) => void;
	requestPlanApproval: (instanceId: string, plan: string) => void;
};

const DEFAULT_SYNTHETIC_DISPATCH_DEPENDENCIES: TeammateSyntheticDispatchDependencies =
	{
		sendMessageToLead: (instanceId, content) =>
			teamTracker.sendMessageToLead(instanceId, content),
		findByMemberName: target => teamTracker.findByMemberName(target),
		findByMemberId: target => teamTracker.findByMemberId(target),
		getTeammate: target => teamTracker.getTeammate(target),
		sendMessageToTeammate: (instanceId, targetInstanceId, content) =>
			teamTracker.sendMessageToTeammate(instanceId, targetInstanceId, content),
		claimTask: (teamName, taskId, memberId, memberName) =>
			claimTask(teamName, taskId, memberId, memberName) || undefined,
		completeTask: (teamName, taskId) => completeTask(teamName, taskId) || undefined,
		listTasks: teamName => listTasks(teamName),
		setCurrentTask: (instanceId, taskId) =>
			teamTracker.setCurrentTask(instanceId, taskId),
		requestPlanApproval: (instanceId, plan) =>
			teamTracker.requestPlanApproval(instanceId, plan),
	};

export function partitionTeammateToolCalls<T extends TeammateToolCallLike>(
	toolCalls: readonly T[],
): {
	syntheticCalls: T[];
	regularCalls: T[];
	waitCall?: T;
	otherSyntheticCalls: T[];
} {
	const syntheticCalls: T[] = [];
	const regularCalls: T[] = [];
	let waitCall: T | undefined;
	const otherSyntheticCalls: T[] = [];

	for (const toolCall of toolCalls) {
		if (!TEAMMATE_SYNTHETIC_TOOL_NAMES.has(toolCall.function.name)) {
			regularCalls.push(toolCall);
			continue;
		}

		syntheticCalls.push(toolCall);
		if (toolCall.function.name === WAIT_FOR_MESSAGES_TOOL_NAME) {
			waitCall = toolCall;
			continue;
		}

		otherSyntheticCalls.push(toolCall);
	}

	return {
		syntheticCalls,
		regularCalls,
		waitCall,
		otherSyntheticCalls,
	};
}

export function dispatchTeammateSyntheticToolCall(options: {
	toolName: string;
	args: Record<string, any>;
	teamName: string;
	memberId: string;
	memberName: string;
	instanceId: string;
	dependencies?: Partial<TeammateSyntheticDispatchDependencies>;
}): string {
	const dependencies: TeammateSyntheticDispatchDependencies = {
		...DEFAULT_SYNTHETIC_DISPATCH_DEPENDENCIES,
		...options.dependencies,
	};

	switch (options.toolName) {
		case 'message_teammate': {
			const target = String(options.args['target'] || '');
			const content = String(options.args['content'] || '');

			if (target === 'lead' || target === 'Team Lead') {
				const sent = dependencies.sendMessageToLead(options.instanceId, content);
				return sent
					? 'Message sent to team lead.'
					: 'Failed to send message to team lead.';
			}

			const targetTeammate =
				dependencies.findByMemberName(target) ||
				dependencies.findByMemberId(target) ||
				dependencies.getTeammate(target);

			if (!targetTeammate) {
				return `Teammate "${target}" not found. Use list_team_tasks to see current teammates.`;
			}

			const sent = dependencies.sendMessageToTeammate(
				options.instanceId,
				targetTeammate.instanceId,
				content,
			);
			return sent
				? `Message sent to ${targetTeammate.memberName}.`
				: `Failed to send message to ${target}.`;
		}

		case 'claim_task': {
			const task = dependencies.claimTask(
				options.teamName,
				options.args['task_id'],
				options.memberId,
				options.memberName,
			);
			if (!task) {
				return `Task "${options.args['task_id']}" not found.`;
			}

			dependencies.setCurrentTask(options.instanceId, task.id);
			return `Successfully claimed task "${task.title}" (${task.id}).`;
		}

		case 'complete_task': {
			const task = dependencies.completeTask(
				options.teamName,
				options.args['task_id'],
			);
			if (!task) {
				return `Task "${options.args['task_id']}" not found.`;
			}

			dependencies.setCurrentTask(options.instanceId, undefined);
			dependencies.sendMessageToLead(
				options.instanceId,
				`Task completed: "${task.title}" (${task.id})`,
			);
			return `Task "${task.title}" marked as completed.`;
		}

		case 'list_team_tasks': {
			const currentTasks = dependencies.listTasks(options.teamName);
			if (currentTasks.length === 0) {
				return 'No tasks in the task list.';
			}

			return currentTasks
				.map(task => {
					const deps = task.dependencies?.length
						? ` (deps: ${task.dependencies.join(', ')})`
						: '';
					const assignee = task.assigneeName ? ` [${task.assigneeName}]` : '';
					return `[${task.status}] ${task.id}: ${task.title}${assignee}${deps}`;
				})
				.join('\n');
		}

		case 'request_plan_approval':
			dependencies.requestPlanApproval(
				options.instanceId,
				String(options.args['plan'] || ''),
			);
			return 'Plan submitted for approval. Waiting for lead response...';
		default:
			return `Unsupported synthetic teammate tool: ${options.toolName}`;
	}
}

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
