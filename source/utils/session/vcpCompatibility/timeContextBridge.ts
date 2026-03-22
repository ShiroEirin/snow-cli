import type {ChatMessage} from '../../../api/chat.js';
import type {
	VcpCompatibilityConfig,
	VcpOutboundTransform,
	VcpOutboundTransformArgs,
} from './types.js';
import {isVcpSystemInvitationMessage} from './protocol.js';

export type VcpTimeBridgeConfig = VcpCompatibilityConfig;

const TIME_PLACEHOLDER_PATTERNS = [
	/\[\[[^\]]*::Time[^\]]*\]\]/,
	/《《[^》]*::Time[^》]*》》/,
	/<<[^>]*::Time[^>]*>>/,
	/\{\{[^}]*::Time[^}]*\}\}/,
];

const HARD_CODED_TIME_ANCHORS = [
	'上个月初',
	'上个月中',
	'上个月末',
	'前一阵子',
	'大前天',
	'前几天',
	'上个月',
	'这个月',
	'今天',
	'昨天',
	'前天',
	'之前',
	'最近',
	'近期',
	'上周',
	'本周',
	'这周',
	'本月',
	'月初',
	'a while ago',
	'last month',
	'this month',
	'last week',
	'this week',
	'yesterday',
	'recently',
	'lately',
	'today',
];

const TIME_ANCHOR_PATTERNS = [
	/(\d+|[一二三四五六七八九十两])天前/,
	/上周([一二三四五六日天])/,
	/(\d+|[一二三四五六七八九十两])周前/,
	/(\d+|[一二三四五六七八九十两])个月前/,
	/(\d+)\s*days?\s*ago/i,
	/last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
	/(\d+)\s*weeks?\s*ago/i,
	/(\d+)\s*months?\s*ago/i,
];

const HISTORY_SCAN_LIMIT = 8;

const META_TIME_SYNTAX_HINT_PATTERN =
	/(语法|占位符|修饰符|modifier|placeholder|prompt|role\.md|syntax|是什么意思|怎么用|用法)/i;

const LOCALHOST_BASE_URL_PATTERN =
	/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/.*)?$/i;

const TIME_CONTINUATION_CUE_PATTERNS = [
	/继续/,
	/接着/,
	/接续/,
	/沿用/,
	/刚才/,
	/刚刚/,
	/前面/,
	/上次/,
	/当时/,
	/那次/,
	/那天/,
	/那周/,
	/那个月/,
	/那段(?:时间|日志|记录)?/,
	/同一(?:时间|时间线|时段|范围)/,
	/按刚才/,
	/按上次/,
	/还是按/,
	/\bcontinue\b/i,
	/\bgo on\b/i,
	/\bfollow[\s-]?up\b/i,
	/\bearlier\b/i,
	/\bprevious\b/i,
	/\bback then\b/i,
	/\bthat time\b/i,
	/\bsame (?:time|timeline|range|window)\b/i,
	/\bcarry(?: it)? over\b/i,
	/\bas before\b/i,
];

type ExpandedTimeWindowConfig = {
	anchor: string;
	windowLabel: string;
	explicitAnchors: readonly string[];
};

type FoundAnchor = {
	anchor: string;
	index: number;
	length: number;
};

type FoundExpandedTimeWindow = FoundAnchor & {
	config: ExpandedTimeWindowConfig;
};

const EXPANDED_TIME_WINDOW_CONFIGS: readonly ExpandedTimeWindowConfig[] = [
	{
		anchor: '最近',
		windowLabel: '近7天时间窗',
		explicitAnchors: [
			'今天',
			'昨天',
			'前天',
			'大前天',
			'4天前',
			'5天前',
			'6天前',
		],
	},
	{
		anchor: '近期',
		windowLabel: '近7天时间窗',
		explicitAnchors: [
			'今天',
			'昨天',
			'前天',
			'大前天',
			'4天前',
			'5天前',
			'6天前',
		],
	},
	{
		anchor: '前几天',
		windowLabel: '前2到6天时间窗',
		explicitAnchors: ['前天', '大前天', '4天前', '5天前', '6天前'],
	},
	{
		anchor: 'recently',
		windowLabel: 'recent 7-day window',
		explicitAnchors: [
			'today',
			'yesterday',
			'2 days ago',
			'3 days ago',
			'4 days ago',
			'5 days ago',
			'6 days ago',
		],
	},
	{
		anchor: 'lately',
		windowLabel: 'recent 7-day window',
		explicitAnchors: [
			'today',
			'yesterday',
			'2 days ago',
			'3 days ago',
			'4 days ago',
			'5 days ago',
			'6 days ago',
		],
	},
];

function getTextContent(message: ChatMessage): string {
	return typeof message.content === 'string' ? message.content : '';
}

function escapeForRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasPlaceholder(text: string): boolean {
	return TIME_PLACEHOLDER_PATTERNS.some(pattern => pattern.test(text));
}

function isSystemInvitationUserMessage(content: string): boolean {
	return isVcpSystemInvitationMessage(content);
}

function isValidUserHistoryMessage(message: ChatMessage): boolean {
	if (message.role !== 'user') {
		return false;
	}

	const content = getTextContent(message).trim();
	return content.length > 0 && !isSystemInvitationUserMessage(content);
}

function isValidAssistantHistoryMessage(message: ChatMessage): boolean {
	return (
		message.role === 'assistant' && getTextContent(message).trim().length > 0
	);
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

function findLastAssistantIndexBefore(
	messages: ChatMessage[],
	startIndex: number,
): number {
	for (let index = startIndex - 1; index >= 0; index--) {
		const message = messages[index];
		if (message && isValidAssistantHistoryMessage(message)) {
			return index;
		}
	}

	return -1;
}

function looksLikeTimeSyntaxDiscussion(text: string): boolean {
	return hasPlaceholder(text) && META_TIME_SYNTAX_HINT_PATTERN.test(text);
}

function looksLikeTimeContinuation(text: string): boolean {
	return TIME_CONTINUATION_CUE_PATTERNS.some(pattern => pattern.test(text));
}

function looksLikeVcpCompatibleEndpoint(baseUrl?: string): boolean {
	if (!baseUrl) {
		return false;
	}

	return LOCALHOST_BASE_URL_PATTERN.test(baseUrl);
}

function findPlainTextAnchors(text: string, anchor: string): FoundAnchor[] {
	const flags = /[A-Za-z]/.test(anchor) ? 'gi' : 'g';
	const pattern = new RegExp(escapeForRegex(anchor), flags);
	const matches: FoundAnchor[] = [];
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(text)) !== null) {
		matches.push({
			anchor: match[0],
			index: match.index,
			length: match[0].length,
		});
	}

	return matches;
}

function getExpandedTimeWindowConfig(
	anchor: string,
): ExpandedTimeWindowConfig | null {
	if (!anchor) {
		return null;
	}

	const normalizedAnchor = /[A-Za-z]/.test(anchor)
		? anchor.toLowerCase()
		: anchor;

	for (const config of EXPANDED_TIME_WINDOW_CONFIGS) {
		const normalizedConfigAnchor = /[A-Za-z]/.test(config.anchor)
			? config.anchor.toLowerCase()
			: config.anchor;
		if (normalizedConfigAnchor === normalizedAnchor) {
			return config;
		}
	}

	return null;
}

function findLatestExpandedTimeWindow(
	text: string,
): FoundExpandedTimeWindow | null {
	if (!text) {
		return null;
	}

	const foundWindows: FoundExpandedTimeWindow[] = [];

	for (const config of EXPANDED_TIME_WINDOW_CONFIGS) {
		const matches = findPlainTextAnchors(text, config.anchor);
		for (const match of matches) {
			foundWindows.push({
				...match,
				config,
			});
		}
	}

	if (foundWindows.length === 0) {
		return null;
	}

	foundWindows.sort((a, b) => {
		const endOffsetDelta = b.index + b.length - (a.index + a.length);
		return (
			endOffsetDelta ||
			b.length - a.length ||
			b.index - a.index ||
			b.anchor.localeCompare(a.anchor)
		);
	});

	return foundWindows[0] ?? null;
}

function joinExplicitAnchors(config: ExpandedTimeWindowConfig): string {
	const separator = /[A-Za-z]/.test(config.anchor) ? ', ' : '、';
	return config.explicitAnchors.join(separator);
}

function buildExpandedTimeWindowBridge(
	config: ExpandedTimeWindowConfig,
	mode: 'current' | 'carry',
): string {
	const anchors = joinExplicitAnchors(config);
	if (mode === 'carry') {
		return `补充时间上下文：本轮 ::Time 检索沿用上一轮的${config.windowLabel}：${anchors}。`;
	}

	return `补充时间上下文：本轮 ::Time 检索按${config.windowLabel}理解：${anchors}。`;
}

function buildExpandedTimeWindowTargetContent(text: string): string | null {
	const foundWindow = findLatestExpandedTimeWindow(text);
	if (!foundWindow) {
		return null;
	}

	const bridge = buildExpandedTimeWindowBridge(foundWindow.config, 'current');
	return `${text}\n\n${bridge}`.trim();
}

function findLatestUserTimeAnchorBeforeTarget(
	messages: ChatMessage[],
	targetUserIndex: number,
): string | null {
	let scannedUsers = 0;

	for (
		let index = targetUserIndex - 1;
		index >= 0 && scannedUsers < HISTORY_SCAN_LIMIT;
		index--
	) {
		const message = messages[index];
		if (!message || !isValidUserHistoryMessage(message)) {
			continue;
		}

		scannedUsers++;
		const anchor = extractLatestTimeAnchor(getTextContent(message));
		if (anchor) {
			return anchor;
		}
	}

	return null;
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

	const foundAnchors: FoundAnchor[] = [];

	for (const anchor of HARD_CODED_TIME_ANCHORS) {
		foundAnchors.push(...findPlainTextAnchors(text, anchor));
	}

	for (const pattern of TIME_ANCHOR_PATTERNS) {
		const flags = pattern.flags.includes('g')
			? pattern.flags
			: `${pattern.flags}g`;
		const globalPattern = new RegExp(pattern.source, flags);
		let match: RegExpExecArray | null;

		while ((match = globalPattern.exec(text)) !== null) {
			foundAnchors.push({
				anchor: match[0],
				index: match.index,
				length: match[0].length,
			});
		}
	}

	if (foundAnchors.length === 0) {
		return null;
	}

	foundAnchors.sort((a, b) => {
		const endOffsetDelta = b.index + b.length - (a.index + a.length);
		return (
			endOffsetDelta ||
			b.length - a.length ||
			b.index - a.index ||
			b.anchor.localeCompare(a.anchor)
		);
	});

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

	const lastAssistantIndex = findLastAssistantIndexBefore(
		messages,
		targetUserIndex,
	);
	if (lastAssistantIndex !== -1) {
		const lastAssistantAnchor = extractLatestTimeAnchor(
			getTextContent(messages[lastAssistantIndex]!),
		);
		if (lastAssistantAnchor) {
			return null;
		}
	}

	if (
		!hasPlaceholder(targetUserContent) &&
		!looksLikeTimeContinuation(targetUserContent)
	) {
		return null;
	}

	const previousUserAnchor = findLatestUserTimeAnchorBeforeTarget(
		messages,
		targetUserIndex,
	);
	if (!previousUserAnchor) {
		return null;
	}

	const expandedWindowConfig = getExpandedTimeWindowConfig(previousUserAnchor);
	if (expandedWindowConfig) {
		return buildExpandedTimeWindowBridge(expandedWindowConfig, 'carry');
	}

	return `补充时间上下文：本轮 ::Time 检索沿用上一轮用户提到的"${previousUserAnchor}"。`;
}

export function applyVcpTimeSyntaxBridge(messages: ChatMessage[]): ChatMessage[] {
	const targetUserIndex = findBridgeTargetUserIndex(messages);
	if (targetUserIndex === -1) {
		return messages;
	}

	const targetUser = messages[targetUserIndex];
	if (!targetUser || typeof targetUser.content !== 'string') {
		return messages;
	}

	const targetUserContent = targetUser.content.trim();
	if (!targetUserContent || looksLikeTimeSyntaxDiscussion(targetUserContent)) {
		return messages;
	}

	const expandedWindowContent =
		buildExpandedTimeWindowTargetContent(targetUserContent);
	if (expandedWindowContent) {
		const clonedMessages = messages.map(message => ({...message}));
		clonedMessages[targetUserIndex] = {
			...targetUser,
			content: expandedWindowContent,
		};
		return clonedMessages;
	}

	const bridge = buildVcpTimeBridge(messages);
	if (!bridge) {
		return messages;
	}

	const cloned = messages.map(message => ({...message}));
	const clonedTargetUser = cloned[targetUserIndex];
	if (!clonedTargetUser || typeof clonedTargetUser.content !== 'string') {
		return messages;
	}

	cloned[targetUserIndex] = {
		...clonedTargetUser,
		content: `${clonedTargetUser.content}\n\n${bridge}`.trim(),
	};

	return cloned;
}

export const vcpTimeContextTransform: VcpOutboundTransform = {
	shouldApply({
		config,
		messages,
		allowTimeBridge = true,
	}: VcpOutboundTransformArgs) {
		return allowTimeBridge && shouldApplyVcpTimeBridge(config, messages);
	},
	apply({messages}: VcpOutboundTransformArgs) {
		return applyVcpTimeSyntaxBridge(messages);
	},
};
