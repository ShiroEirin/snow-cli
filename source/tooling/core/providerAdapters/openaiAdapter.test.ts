import test from 'ava';
import type {ChatMessage} from '../../../api/types.js';
import {
	buildOpenAIToolMessageNameMap,
	buildOpenAIToolResultContent,
	resolveOpenAIToolMessageName,
} from './openaiAdapter.js';

test('buildOpenAIToolMessageNameMap resolves tool names by tool_call_id', t => {
	const messages: ChatMessage[] = [
		{
			role: 'assistant',
			content: '',
			tool_calls: [
				{
					id: 'call-1',
					type: 'function',
					function: {
						name: 'filesystem-read',
						arguments: '{}',
					},
				},
			],
		},
	];

	const toolCallNameMap = buildOpenAIToolMessageNameMap(messages);
	t.is(
		resolveOpenAIToolMessageName(
			{
				tool_call_id: 'call-1',
			},
			toolCallNameMap,
		),
		'filesystem-read',
	);
});

test('buildOpenAIToolResultContent keeps multimodal tool results in OpenAI shape', t => {
	const content = buildOpenAIToolResultContent({
		content: 'tool output',
		images: [
			{
				type: 'image',
				data: 'abc123',
				mimeType: 'image/png',
			},
		],
	});

	t.true(Array.isArray(content));
	if (Array.isArray(content)) {
		t.is(content[0]?.type, 'text');
		t.is(content[1]?.type, 'image_url');
		t.true(String(content[1]?.image_url?.url).startsWith('data:image/png;base64,'));
	}
});
