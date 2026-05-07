import test from 'ava';
import {
	adaptToolsToAnthropic,
	buildAnthropicToolResultBlock,
	buildAnthropicToolUseBlocks,
	toAnthropicImageSource,
} from './anthropicAdapter.js';

test('adaptToolsToAnthropic converts function tools to Anthropic schema', t => {
	const tools = adaptToolsToAnthropic([
		{
			type: 'function',
			function: {
				name: 'filesystem-read',
				description: 'Read files',
				parameters: {type: 'object'},
			},
		},
	]);

	t.is(tools?.[0]?.name, 'filesystem-read');
	t.deepEqual(tools?.[0]?.input_schema, {type: 'object'});
});

test('buildAnthropicToolUseBlocks parses tool call arguments safely', t => {
	const blocks = buildAnthropicToolUseBlocks({
		tool_calls: [
			{
				id: 'call-1',
				type: 'function',
				function: {
					name: 'filesystem-read',
					arguments: '{"filePath":"README.md"}',
				},
			},
		],
	});

	t.is(blocks[0]?.type, 'tool_use');
	t.deepEqual(blocks[0]?.input, {filePath: 'README.md'});
});

test('buildAnthropicToolResultBlock preserves text and image content', t => {
	const block = buildAnthropicToolResultBlock({
		content: 'ok',
		tool_call_id: 'call-1',
		images: [
			{
				type: 'image',
				data: 'Zm9v',
				mimeType: 'image/png',
			},
		],
	});

	t.is(block.type, 'tool_result');
	t.true(Array.isArray(block.content));
});

test('toAnthropicImageSource preserves remote urls', t => {
	t.deepEqual(
		toAnthropicImageSource({
			type: 'image',
			data: 'https://example.com/a.png',
			mimeType: 'image/png',
		}),
		{
			type: 'url',
			url: 'https://example.com/a.png',
		},
	);
});
