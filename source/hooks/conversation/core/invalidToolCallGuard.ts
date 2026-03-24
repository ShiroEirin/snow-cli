import type {ChatMessage} from '../../../api/chat.js';
import type {ToolCall} from '../../../utils/execution/toolExecutor.js';

export type InvalidToolCallIssue =
	| {
			toolCall: ToolCall;
			reason: 'concatenated_tools';
			splitToolNames: string[];
	  }
	| {
			toolCall: ToolCall;
			reason: 'unknown_tool';
	  };

function getConcatenatedToolNames(
	toolName: string,
	availableToolNames: string[],
): string[] | null {
	if (!toolName || availableToolNames.length < 2) {
		return null;
	}

	const memo = new Map<number, string[] | null>();

	const visit = (offset: number): string[] | null => {
		if (offset === toolName.length) {
			return [];
		}

		if (memo.has(offset)) {
			return memo.get(offset) ?? null;
		}

		for (const candidate of availableToolNames) {
			if (!toolName.startsWith(candidate, offset)) {
				continue;
			}

			const rest = visit(offset + candidate.length);
			if (rest) {
				const resolved = [candidate, ...rest];
				memo.set(offset, resolved);
				return resolved;
			}
		}

		memo.set(offset, null);
		return null;
	};

	const resolved = visit(0);
	return resolved && resolved.length >= 2 ? resolved : null;
}

export function detectInvalidToolCalls(
	receivedToolCalls: ToolCall[],
	availableToolNames: Iterable<string>,
): InvalidToolCallIssue[] {
	const normalizedToolNames = Array.from(
		new Set(
			Array.from(availableToolNames).filter(
				toolName => typeof toolName === 'string' && toolName.length > 0,
			),
		),
	).sort((left, right) => right.length - left.length);

	const knownToolNames = new Set(normalizedToolNames);
	const issues: InvalidToolCallIssue[] = [];

	for (const toolCall of receivedToolCalls) {
		const toolName = toolCall.function.name;
		if (knownToolNames.has(toolName)) {
			continue;
		}

		const splitToolNames = getConcatenatedToolNames(
			toolName,
			normalizedToolNames,
		);

		if (splitToolNames) {
			issues.push({
				toolCall,
				reason: 'concatenated_tools',
				splitToolNames,
			});
			continue;
		}

		issues.push({
			toolCall,
			reason: 'unknown_tool',
		});
	}

	return issues;
}

export function buildInvalidToolCallCorrectionMessage(
	issues: InvalidToolCallIssue[],
	options?: {
		repeatCount?: number;
	},
): ChatMessage {
	const repeatCount = options?.repeatCount ?? 0;
	const lines = issues.map(issue => {
		if (issue.reason === 'concatenated_tools') {
			return `- \`${issue.toolCall.function.name}\` 不是有效工具名；它看起来把多个工具拼接到了一起：${issue.splitToolNames
				.map(name => `\`${name}\``)
				.join(' + ')}。`;
		}

		return `- \`${issue.toolCall.function.name}\` 不在当前已加载工具列表中。`;
	});

	const repeatedConcatenatedToolNames = issues
		.filter(
			(issue): issue is Extract<InvalidToolCallIssue, {reason: 'concatenated_tools'}> =>
				issue.reason === 'concatenated_tools',
		)
		.flatMap(issue => issue.splitToolNames);

	const escalationLines =
		repeatCount > 0
			? [
					'你刚刚再次重发了同一个无效工具名，禁止继续输出这个假工具名。',
					repeatedConcatenatedToolNames.length > 0
						? `下一条 assistant 消息只能把这些工具分开调用：${Array.from(
								new Set(repeatedConcatenatedToolNames),
						  )
								.map(name => `\`${name}\``)
								.join('、')}。`
						: '下一条 assistant 消息只能调用当前已加载的真实工具名。',
					'这些工具已经在当前会话中可用，除非你确实缺少别的工具，否则不要重复调用 `tool_search`。',
			  ]
			: [];

	return {
		role: 'user',
		content: [
			repeatCount > 0 ? '[系统工具纠偏-强制]' : '[系统工具纠偏]',
			'上一轮工具调用已被本地兼容层拦截，未执行，也不会写入工具历史。',
			...lines,
			...escalationLines,
			'请只重新发送有效工具调用。',
			'如果需要并行调用多个工具，必须在同一 assistant 回合里发出多个独立 tool calls，不要把多个工具名拼成一个假名字。',
			'如果需要未加载的工具，先调用 `tool_search`。',
			'不要输出解释文本，直接重发有效工具调用。',
		].join('\n'),
		messageStatus: 'error',
	};
}

export function buildInvalidToolCallUiMessage(
	issues: InvalidToolCallIssue[],
): string {
	const summary = issues
		.map(issue => {
			if (issue.reason === 'concatenated_tools') {
				return `\`${issue.toolCall.function.name}\` -> ${issue.splitToolNames.join(
					' + ',
				)}`;
			}
			return `\`${issue.toolCall.function.name}\``;
		})
		.join('\n');

	return [
		'⚠ 检测到无效工具调用，已阻止本轮执行并要求模型重发。',
		summary,
	].join('\n');
}

export function countRecentInvalidToolCallCorrections(
	messages: Array<{role?: string; content?: string}>,
	issues: InvalidToolCallIssue[],
): number {
	if (issues.length === 0) {
		return 0;
	}

	return messages
		.slice(-8)
		.filter(message => {
			if (message.role !== 'user' || typeof message.content !== 'string') {
				return false;
			}

			if (
				!message.content.startsWith('[系统工具纠偏]') &&
				!message.content.startsWith('[系统工具纠偏-强制]')
			) {
				return false;
			}

			return issues.every(issue =>
				message.content!.includes(`\`${issue.toolCall.function.name}\``),
			);
		}).length;
}
