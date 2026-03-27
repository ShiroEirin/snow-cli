export const VCP_SYSTEM_INVITATION_PREFIXES = [
	'[系统邀请指令:]',
	'[系统提示:]无内容',
] as const;

export const VCP_GHOST_ANCHOR_REGEX = /\[@(!)?([^\]]+)\]/g;

export const VCP_THOUGHT_CHAIN_REGEX =
	/\[--- VCP元思考链(?::\s*"([^"]*)")?\s*---\]\s*([\s\S]*?)\s*\[--- 元思考链结束 ---\]/g;

export const VCP_TOOL_REQUEST_REGEX =
	/<<<\[?TOOL_REQUEST\]?>>>\s*([\s\S]*?)\s*<<<\[?END_TOOL_REQUEST\]?>>>/g;

export const VCP_DAILY_NOTE_REGEX =
	/<<<DailyNoteStart>>>\s*([\s\S]*?)\s*<<<DailyNoteEnd>>>/g;

export const VCP_TOOL_RESULT_REGEX =
	/\[\[VCP调用结果信息汇总:\s*([\s\S]*?)\s*VCP调用结果结束\]\]/g;

export const VCP_ROLE_DIVIDER_REGEX =
	/<<<\[(END_)?ROLE_DIVIDE_(SYSTEM|ASSISTANT|USER)\]>>>/g;

export const VCP_START_END_FIELD_REGEX =
	/([A-Za-z0-9_]+)\s*:\s*「始」([\s\S]*?)「末」\s*,?/g;

export const VCP_ROLE_DIVIDER_BLOCK_MARKERS = {
	system: {
		start: '<<<[ROLE_DIVIDE_SYSTEM]>>>',
		end: '<<<[END_ROLE_DIVIDE_SYSTEM]>>>',
	},
	assistant: {
		start: '<<<[ROLE_DIVIDE_ASSISTANT]>>>',
		end: '<<<[END_ROLE_DIVIDE_ASSISTANT]>>>',
	},
	user: {
		start: '<<<[ROLE_DIVIDE_USER]>>>',
		end: '<<<[END_ROLE_DIVIDE_USER]>>>',
	},
} as const;

export function isVcpSystemInvitationMessage(content: string): boolean {
	return VCP_SYSTEM_INVITATION_PREFIXES.some(
		prefix => content.startsWith(prefix) || content.trim().startsWith(prefix),
	);
}
