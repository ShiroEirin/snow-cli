import test from 'ava';

import {SubAgentUIHandler} from './subAgentMessageHandler.js';

function createEncoder() {
	return {
		encode(text: string) {
			return Array.from(text).map((_, index) => index);
		},
	};
}

function createSubAgentMessage(message: any) {
	return {
		type: 'sub_agent_message' as const,
		agentId: 'agent-1',
		agentName: 'worker',
		message,
	};
}

test('sub-agent streaming suppresses VCP protocol shells while preserving flush order', t => {
	const persistedMessages: any[] = [];
	const handler = new SubAgentUIHandler(
		createEncoder(),
		() => undefined,
		async message => {
			persistedMessages.push(message);
		},
		undefined,
		true,
	);

	let messages: any[] = [];
	messages = handler.handleMessage(
		messages,
		createSubAgentMessage({
			type: 'content',
			content: `1. item
<<<[TOOL_REQUEST]>>>
`,
		}),
	);
	messages = handler.handleMessage(
		messages,
		createSubAgentMessage({
			type: 'content',
			content: `tool_name=LightMemo
`,
		}),
	);
	messages = handler.handleMessage(
		messages,
		createSubAgentMessage({
			type: 'content',
			content: `<<<[END_TOOL_REQUEST]>>>
After`,
		}),
	);
	messages = handler.handleMessage(
		messages,
		createSubAgentMessage({type: 'done'}),
	);

	t.deepEqual(
		messages
			.filter(message => message.streamingLine)
			.map(message => message.content),
		['1. item', 'After'],
	);
	t.false(
		messages.some(message =>
			String(message.content ?? '').includes('<<<[TOOL_REQUEST]>>>'),
		),
	);
	t.is(persistedMessages.length, 1);
	t.true(
		String(persistedMessages[0]?.content ?? '').includes(
			'<<<[TOOL_REQUEST]>>>',
		),
	);
});
