const ROLE_DIVIDER_LINE_REGEX =
	/^<<<\[(?:END_)?ROLE_DIVIDE_(?:SYSTEM|ASSISTANT|USER)\]>>>$/;

export type VcpStreamingSuppressionState =
	| 'toolRequest'
	| 'toolResult'
	| 'dailyNote'
	| 'thoughtChain'
	| null;

export function getVcpStreamingSuppressionDecision(
	line: string,
	currentState: VcpStreamingSuppressionState,
): {
	suppress: boolean;
	nextState: VcpStreamingSuppressionState;
} {
	const trimmedLine = line.trim();

	switch (currentState) {
		case 'toolRequest': {
			const shouldClose =
				trimmedLine.startsWith('<<<[END_TOOL_REQUEST]>>>') ||
				trimmedLine.startsWith('<<<END_TOOL_REQUEST>>>');
			return {
				suppress: true,
				nextState: shouldClose ? null : currentState,
			};
		}

		case 'toolResult': {
			return {
				suppress: true,
				nextState: trimmedLine.includes('VCP调用结果结束]]') ? null : currentState,
			};
		}

		case 'dailyNote': {
			return {
				suppress: true,
				nextState: trimmedLine.startsWith('<<<DailyNoteEnd>>>') ? null : currentState,
			};
		}

		case 'thoughtChain': {
			return {
				suppress: true,
				nextState: trimmedLine.includes('[--- 元思考链结束 ---]')
					? null
					: currentState,
			};
		}

		default: {
			break;
		}
	}

	if (ROLE_DIVIDER_LINE_REGEX.test(trimmedLine)) {
		return {
			suppress: true,
			nextState: null,
		};
	}

	if (
		trimmedLine.startsWith('<<<[TOOL_REQUEST]>>>') ||
		trimmedLine.startsWith('<<<TOOL_REQUEST>>>')
	) {
		const closesImmediately =
			trimmedLine.includes('<<<[END_TOOL_REQUEST]>>>') ||
			trimmedLine.includes('<<<END_TOOL_REQUEST>>>');
		return {
			suppress: true,
			nextState: closesImmediately ? null : 'toolRequest',
		};
	}

	if (trimmedLine.startsWith('<<<DailyNoteStart>>>')) {
		return {
			suppress: true,
			nextState: trimmedLine.includes('<<<DailyNoteEnd>>>') ? null : 'dailyNote',
		};
	}

	if (trimmedLine.includes('[[VCP调用结果信息汇总:')) {
		return {
			suppress: true,
			nextState: trimmedLine.includes('VCP调用结果结束]]') ? null : 'toolResult',
		};
	}

	if (trimmedLine.startsWith('[--- VCP元思考链')) {
		return {
			suppress: true,
			nextState: trimmedLine.includes('[--- 元思考链结束 ---]')
				? null
				: 'thoughtChain',
		};
	}

	return {
		suppress: false,
		nextState: null,
	};
}
