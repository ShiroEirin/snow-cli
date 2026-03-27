import test from 'ava';
import {
	adaptToolsToGemini,
	buildGeminiAssistantParts,
	buildGeminiStreamToolCall,
	buildGeminiToolMessageNameMap,
	buildGeminiToolResponseParts,
	toGeminiImagePart,
} from './geminiAdapter.js';

test('adaptToolsToGemini converts function tools to Gemini schema', t => {
	const tools = adaptToolsToGemini([
		{
			type: 'function',
			function: {
				name: 'filesystem-read',
				description: 'Read file',
				parameters: {
					type: 'object',
					properties: {
						filePath: {type: 'string'},
					},
					required: ['filePath'],
				},
			},
		},
	]);

	t.is(tools?.[0]?.functionDeclarations[0]?.name, 'filesystem-read');
	t.deepEqual(tools?.[0]?.functionDeclarations[0]?.parametersJsonSchema, {
		type: 'object',
		properties: {
			filePath: {type: 'string'},
		},
		required: ['filePath'],
	});
});

test('buildGeminiAssistantParts keeps thinking before function calls', t => {
	const parts = buildGeminiAssistantParts({
		content: 'checking',
		thinking: {
			type: 'thinking',
			thinking: 'internal trace',
		},
		tool_calls: [
			{
				id: 'call-1',
				type: 'function',
				function: {
					name: 'filesystem-read',
					arguments: '{"filePath":"README.md"}',
				},
				thoughtSignature: 'sig-1',
			},
		],
	});

	t.deepEqual(parts[0], {
		thought: true,
		text: 'internal trace',
	});
	t.deepEqual(parts[1], {
		text: 'checking',
	});
	t.deepEqual(parts[2], {
		functionCall: {
			name: 'filesystem-read',
			args: {filePath: 'README.md'},
		},
		thoughtSignature: 'sig-1',
	});
});

test('buildGeminiToolResponseParts resolves names and unwraps double encoded json', t => {
	const toolCallNameMap = buildGeminiToolMessageNameMap([
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
	]);

	const parts = buildGeminiToolResponseParts(
		[
			{
				tool_call_id: 'call-1',
				content: '"{\\"text\\":\\"ok\\"}"',
				images: [
					{
						type: 'image',
						data: 'Zm9v',
						mimeType: 'image/png',
					},
				],
			},
		],
		toolCallNameMap,
	);

	t.deepEqual(parts[0], {
		functionResponse: {
			name: 'filesystem-read',
			response: {text: 'ok'},
		},
	});
	t.true('inlineData' in parts[1]!);
});

test('buildGeminiStreamToolCall reuses shared thought signature', t => {
	const first = buildGeminiStreamToolCall(
		{
			functionCall: {
				name: 'tool-a',
				args: {value: 1},
			},
			thoughtSignature: 'sig-1',
		},
		0,
	);
	const second = buildGeminiStreamToolCall(
		{
			functionCall: {
				name: 'tool-b',
				args: {value: 2},
			},
		},
		1,
		first.sharedThoughtSignature,
	);

	t.is(first.toolCall.thoughtSignature, 'sig-1');
	t.is(second.toolCall.thoughtSignature, 'sig-1');
});

test('toGeminiImagePart preserves remote image urls', t => {
	t.deepEqual(
		toGeminiImagePart({
			type: 'image',
			data: 'https://example.com/image.png',
			mimeType: 'image/png',
		}),
		{
			fileData: {
				mimeType: 'image/png',
				fileUri: 'https://example.com/image.png',
			},
		},
	);
});
