import test from 'ava';

import {processStreamRound} from './streamProcessor.js';

async function* createFakeStream(chunks: any[]) {
	for (const chunk of chunks) {
		yield chunk;
	}
}

function createStateSetter<T>(initial: T) {
	let state = initial;
	return {
		get value() {
			return state;
		},
		setter(update: T | ((prev: T) => T)) {
			state =
				typeof update === 'function'
					? (update as (prev: T) => T)(state)
					: update;
		},
	};
}

function createConversationOptions() {
	return {
		userContent: '测试',
		editorContext: undefined,
		imageContents: undefined,
		controller: new AbortController(),
		messages: [],
		saveMessage: async () => undefined,
		requestToolConfirmation: async () => ({approved: true}),
		requestUserQuestion: async () => ({selected: ''}),
		isToolAutoApproved: () => true,
		addMultipleToAlwaysApproved: () => undefined,
		yoloModeRef: {current: false},
		setContextUsage: () => undefined,
	} as any;
}

test('process stream round suppresses VCP protocol shells in main assistant streaming UI', async t => {
	const messageState = createStateSetter<any[]>([]);
	const tokenState = createStateSetter(0);
	const contextUsageState = createStateSetter<any>(null);
	const controller = new AbortController();

	const result = await processStreamRound({
		config: {
			streamingDisplay: true,
		},
		model: 'gpt-5',
		conversationMessages: [],
		activeTools: [],
		controller,
		encoder: {
			encode(text: string) {
				return Array.from(text).map((_, index) => index);
			},
		},
		setStreamTokenCount: tokenState.setter as any,
		setMessages: messageState.setter as any,
		setContextUsage: contextUsageState.setter as any,
		options: createConversationOptions(),
		createStreamGeneratorImpl: () =>
			createFakeStream([
				{type: 'content', content: '前文\n<<<[TOOL_REQUEST]>>>\n'},
				{type: 'content', content: 'tool_name:「始」LightMemo「末」\n'},
				{type: 'content', content: '<<<[END_TOOL_REQUEST]>>>\n后文'},
				{type: 'done'},
			]) as any,
	});

	t.true(result.streamedContent.includes('<<<[TOOL_REQUEST]>>>'));
	t.deepEqual(
		messageState.value.map(message => message.content),
		['前文', '后文'],
	);
});

test('process stream round keeps VCP-looking protocol samples inside fenced code blocks', async t => {
	const messageState = createStateSetter<any[]>([]);
	const tokenState = createStateSetter(0);
	const contextUsageState = createStateSetter<any>(null);
	const controller = new AbortController();

	await processStreamRound({
		config: {
			streamingDisplay: true,
		},
		model: 'gpt-5',
		conversationMessages: [],
		activeTools: [],
		controller,
		encoder: {
			encode(text: string) {
				return Array.from(text).map((_, index) => index);
			},
		},
		setStreamTokenCount: tokenState.setter as any,
		setMessages: messageState.setter as any,
		setContextUsage: contextUsageState.setter as any,
		options: createConversationOptions(),
		createStreamGeneratorImpl: () =>
			createFakeStream([
				{type: 'content', content: '```text\n'},
				{type: 'content', content: '<<<[TOOL_REQUEST]>>>\n'},
				{type: 'content', content: 'tool_name:「始」LightMemo「末」\n'},
				{type: 'content', content: '<<<[END_TOOL_REQUEST]>>>\n'},
				{type: 'content', content: '```\n后文'},
				{type: 'done'},
			]) as any,
	});

	t.true(
		messageState.value.some(message =>
			String(message.content || '').includes('<<<[TOOL_REQUEST]>>>'),
		),
	);
	t.true(
		messageState.value.some(message => String(message.content || '').includes('后文')),
	);
});
