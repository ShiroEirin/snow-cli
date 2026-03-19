/**
 * VCP Time Syntax Bridge for Snow CLI
 *
 * 功能：为 VCP 后端的 ::Time 修饰符提供时间锚点桥接。
 *
 * 设计约束：
 * - VCP 后端的 TimeExpressionParser 只看最后一条有效 user 和最后一条 assistant 消息。
 * - Snow 只能在请求发出前临时补足时间锚点，不能改写持久化会话。
 * - 桥接只追加到当前轮次最后一条 user 消息，不修改 system prompt。
 */

import type {ChatMessage} from '../../api/chat.js';

export type VcpTimeBridgeConfig = {
	requestMethod?: string;
	baseUrl?: string;
	enableVcpTimeBridge?: boolean;
};

const TIME_PLACEHOLDER_PATTERNS = [
	/\[\[[^\]]*::Time[^\]]*\]\]/,
	/《《[^》]*::Time[^》]*》》/,
	/<<[^>]*::Time[^>]*>>/,
	/\{\{[^}]*::Time[^}]*\}\}/,
];

const HARD_CODED_TIME_ANCHORS = [
	'今天',
	'昨天',
	'前天',
	'大前天',
	'最近',
	'近期',
	'上周',
	'这周',
	'本周',
	'上个月',
	'这个月',
	'本月',
	'today',
	'yesterday',
	'last week',
	'this week',
	'last month',
	'this month',
];

const TIME_ANCHOR_PATTERNS = [
	/(\d+|[一二三四五六七八九十两])天前/,
	/(\d+|[一二三四五六七八九十两])周前/,
	/(\d+|[一二三四五六七八九十两])个月前/,
	/上周[一二三四五六日天]/,
	/(\d+)\s*days?\s*ago/i,
	/(\d+)\s*weeks?\s*ago/i,
	/(\d+)\s*months?\s*ago/i,
	/last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
];

const HISTORY_SCAN_LIMIT = 8;

const VCP_SYSTEM_INVITATION_PREFIXES = [
	'[系统邀请指令:]',
	'[系统提示:]无内容',
];

const META_TIME_SYNTAX_HINT_PATTERN =
	/(语法|占位符|修饰符|modifier|placeholder|prompt|role\.md)/i;

const LOCALHOST_BASE_URL_PATTERN =
	/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/.*)?$/i;

function getTextContent(message: ChatMessage): string {
	return typeof message.content === 'string' ? message.content : '';
}

function hasPlaceholder(text: string): boolean {
	return TIME_PLACEHOLDER_PATTERNS.some(pattern => pattern.test(text));
}

function isSystemInvitationUserMessage(content: string): boolean {
	return VCP_SYSTEM_INVITATION_PREFIXES.some(prefix =>
		content.startsWith(prefix) || content.trim().startsWith(prefix),
	);
}

function isValidHistoryMessage(message: ChatMessage): boolean {
	if (message.role !== 'user' && message.role !== 'assistant') {
		return false;
	}

	const content = getTextContent(message).trim();
	if (!content) {
		return false;
	}

	if (message.role === 'user' && isSystemInvitationUserMessage(content)) {
		return false;
	}

	return true;
}

function findBridgeTargetUserIndex(messages: ChatMessage[]): number {
	if (messages.length === 0) {
		return -1;
	}

	const lastMessage = messages[messages.length - 1];
	if (!lastMessage || lastMessage.role !== 'user') {
		return -1;
	}

	const content = getTextContent(lastMessage).trim();
	if (!content || isSystemInvitationUserMessage(content)) {
		return -1;
	}

	return messages.length - 1;
}

function looksLikeTimeSyntaxDiscussion(text: string): boolean {
	return hasPlaceholder(text) && META_TIME_SYNTAX_HINT_PATTERN.test(text);
}

function looksLikeVcpCompatibleEndpoint(baseUrl?: string): boolean {
	if (!baseUrl) {
		return false;
	}

	return LOCALHOST_BASE_URL_PATTERN.test(baseUrl);
}

export function hasVcpTimeSyntax(messages: ChatMessage[]): boolean {
	return messages.some(message => {
		if (message.role !== 'system' && message.role !== 'user') {
			return false;
		}

		return hasPlaceholder(getTextContent(message));
	});
}

export function shouldApplyVcpTimeBridge(
	config: VcpTimeBridgeConfig,
	messages: ChatMessage[],
): boolean {
	if (config.requestMethod !== 'chat') {
		return false;
	}

	if (!hasVcpTimeSyntax(messages)) {
		return false;
	}

	if (findBridgeTargetUserIndex(messages) === -1) {
		return false;
	}

	if (config.enableVcpTimeBridge === false) {
		return false;
	}

	if (config.enableVcpTimeBridge === true) {
		return true;
	}

	return looksLikeVcpCompatibleEndpoint(config.baseUrl);
}

export function extractLatestTimeAnchor(text: string): string | null {
	if (!text) {
		return null;
	}

	const foundAnchors: Array<{anchor: string; index: number}> = [];

	for (const anchor of HARD_CODED_TIME_ANCHORS) {
		const index = text.lastIndexOf(anchor);
		if (index !== -1) {
			foundAnchors.push({anchor, index});
		}
	}

	for (const pattern of TIME_ANCHOR_PATTERNS) {
		const globalPattern = new RegExp(pattern.source, pattern.flags + 'g');
		let match: RegExpExecArray | null;

		while ((match = globalPattern.exec(text)) !== null) {
			foundAnchors.push({anchor: match[0], index: match.index});
		}
	}

	if (foundAnchors.length === 0) {
		return null;
	}

	foundAnchors.sort((a, b) => b.index - a.index);
	return foundAnchors[0]?.anchor ?? null;
}

export function buildVcpTimeBridge(messages: ChatMessage[]): string | null {
	const targetUserIndex = findBridgeTargetUserIndex(messages);
	if (targetUserIndex === -1) {
		return null;
	}

	const targetUserContent = getTextContent(messages[targetUserIndex]!).trim();
	if (!targetUserContent) {
		return null;
	}

	if (looksLikeTimeSyntaxDiscussion(targetUserContent)) {
		return null;
	}

	if (extractLatestTimeAnchor(targetUserContent)) {
		return null;
	}

	let scanned = 0;
	for (let i = targetUserIndex - 1; i >= 0 && scanned < HISTORY_SCAN_LIMIT; i--) {
		const message = messages[i];
		if (!message || !isValidHistoryMessage(message)) {
			continue;
		}

		scanned++;
		const anchor = extractLatestTimeAnchor(getTextContent(message));
		if (anchor) {
			return `补充时间上下文：本轮 ::Time 检索沿用"${anchor}"。`;
		}
	}

	return null;
}

export function applyVcpTimeSyntaxBridge(messages: ChatMessage[]): ChatMessage[] {
	const bridge = buildVcpTimeBridge(messages);
	if (!bridge) {
		return messages;
	}

	const targetUserIndex = findBridgeTargetUserIndex(messages);
	if (targetUserIndex === -1) {
		return messages;
	}

	const cloned = messages.map(message => ({...message}));
	const targetUser = cloned[targetUserIndex];
	if (!targetUser || typeof targetUser.content !== 'string') {
		return messages;
	}

	cloned[targetUserIndex] = {
		...targetUser,
		content: `${targetUser.content}\n\n${bridge}`.trim(),
	};

	return cloned;
}
