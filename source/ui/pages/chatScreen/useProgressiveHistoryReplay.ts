import {useEffect, useMemo, useRef, useState} from 'react';
import type {Message} from '../../components/chat/MessageList.js';

type ProgressiveReplayOptions = {
	initialVisibleCount?: number;
	batchSize?: number;
	delayMs?: number;
	threshold?: number;
};

const DEFAULT_INITIAL_VISIBLE_COUNT = 60;
const DEFAULT_BATCH_SIZE = 40;
const DEFAULT_DELAY_MS = 16;
const DEFAULT_THRESHOLD = 120;

function normalizePositiveInteger(
	value: number | undefined,
	fallbackValue: number,
): number {
	return value !== undefined && Number.isInteger(value) && value > 0
		? value
		: fallbackValue;
}

export function getInitialProgressiveReplayStart(
	totalMessages: number,
	options: ProgressiveReplayOptions = {},
): number {
	const threshold = normalizePositiveInteger(
		options.threshold,
		DEFAULT_THRESHOLD,
	);
	const initialVisibleCount = normalizePositiveInteger(
		options.initialVisibleCount,
		DEFAULT_INITIAL_VISIBLE_COUNT,
	);

	if (totalMessages <= threshold) {
		return 0;
	}

	return Math.max(0, totalMessages - initialVisibleCount);
}

export function advanceProgressiveReplayStart(
	currentStart: number,
	options: ProgressiveReplayOptions = {},
): number {
	const batchSize = normalizePositiveInteger(
		options.batchSize,
		DEFAULT_BATCH_SIZE,
	);
	return Math.max(0, currentStart - batchSize);
}

export function shouldResetProgressiveReplay(
	previousMessages: Message[],
	nextMessages: Message[],
): boolean {
	if (nextMessages.length === 0) {
		return false;
	}

	if (previousMessages.length === 0) {
		return true;
	}

	if (nextMessages.length < previousMessages.length) {
		return true;
	}

	return previousMessages[0] !== nextMessages[0];
}

export function useProgressiveHistoryReplay(
	messages: Message[],
	options: ProgressiveReplayOptions = {},
): {
	visibleMessages: Message[];
	isReplayingHistory: boolean;
	hiddenMessageCount: number;
} {
	const threshold = normalizePositiveInteger(
		options.threshold,
		DEFAULT_THRESHOLD,
	);
	const initialVisibleCount = normalizePositiveInteger(
		options.initialVisibleCount,
		DEFAULT_INITIAL_VISIBLE_COUNT,
	);
	const batchSize = normalizePositiveInteger(
		options.batchSize,
		DEFAULT_BATCH_SIZE,
	);
	const delayMs = normalizePositiveInteger(options.delayMs, DEFAULT_DELAY_MS);
	const normalizedOptions = useMemo(
		() => ({
			threshold,
			initialVisibleCount,
			batchSize,
			delayMs,
		}),
		[batchSize, delayMs, initialVisibleCount, threshold],
	);
	const previousMessagesRef = useRef<Message[]>(messages);
	const [visibleStart, setVisibleStart] = useState(() =>
		getInitialProgressiveReplayStart(messages.length, normalizedOptions),
	);

	useEffect(() => {
		const previousMessages = previousMessagesRef.current;
		const initialStart = getInitialProgressiveReplayStart(
			messages.length,
			normalizedOptions,
		);

		if (shouldResetProgressiveReplay(previousMessages, messages)) {
			setVisibleStart(initialStart);
		}

		previousMessagesRef.current = messages;
	}, [messages, normalizedOptions]);

	useEffect(() => {
		if (visibleStart <= 0) {
			return;
		}

		const timer = setTimeout(() => {
			setVisibleStart(currentStart =>
				advanceProgressiveReplayStart(currentStart, normalizedOptions),
			);
		}, delayMs);

		return () => {
			clearTimeout(timer);
		};
	}, [delayMs, normalizedOptions, visibleStart]);

	const visibleMessages = useMemo(
		() => messages.slice(visibleStart),
		[messages, visibleStart],
	);

	return {
		visibleMessages,
		isReplayingHistory: visibleStart > 0,
		hiddenMessageCount: visibleStart,
	};
}
