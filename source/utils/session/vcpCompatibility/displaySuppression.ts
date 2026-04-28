const ROLE_DIVIDER_LINE_REGEX =
	/^<<<\[(?:END_)?ROLE_DIVIDE_(?:SYSTEM|ASSISTANT|USER)\]>>>$/;
const TOOL_REQUEST_START_MARKERS = [
	'<<<[TOOL_REQUEST]>>>',
	'<<<TOOL_REQUEST>>>',
] as const;
const TOOL_REQUEST_END_MARKERS = [
	'<<<[END_TOOL_REQUEST]>>>',
	'<<<END_TOOL_REQUEST>>>',
] as const;

function startsWithAnyMarker(
	line: string,
	markers: readonly string[],
): boolean {
	const trimmedLine = line.trimStart();
	return markers.some(marker => trimmedLine.startsWith(marker));
}

function includesAnyMarker(line: string, markers: readonly string[]): boolean {
	return markers.some(marker => line.includes(marker));
}

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
			const shouldClose = includesAnyMarker(line, TOOL_REQUEST_END_MARKERS);
			return {
				suppress: true,
				nextState: shouldClose ? null : currentState,
			};
		}

		case 'toolResult': {
			return {
				suppress: true,
				nextState: trimmedLine.includes('VCP调用结果结束]]')
					? null
					: currentState,
			};
		}

		case 'dailyNote': {
			return {
				suppress: true,
				nextState: line.includes('<<<DailyNoteEnd>>>') ? null : currentState,
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

	if (startsWithAnyMarker(line, TOOL_REQUEST_START_MARKERS)) {
		const closesImmediately = includesAnyMarker(line, TOOL_REQUEST_END_MARKERS);
		return {
			suppress: true,
			nextState: closesImmediately ? null : 'toolRequest',
		};
	}

	if (trimmedLine.startsWith('<<<DailyNoteStart>>>')) {
		return {
			suppress: true,
			nextState: trimmedLine.includes('<<<DailyNoteEnd>>>')
				? null
				: 'dailyNote',
		};
	}

	if (line.trimStart().startsWith('[[VCP调用结果信息汇总:')) {
		return {
			suppress: true,
			nextState: trimmedLine.includes('VCP调用结果结束]]')
				? null
				: 'toolResult',
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
