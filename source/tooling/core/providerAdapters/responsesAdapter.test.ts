import test from 'ava';
import {
	adaptToolsToResponses,
	buildResponsesAssistantToolCallItems,
	buildResponsesToolResultItem,
	ensureResponsesStrictSchema,
	toResponsesImageUrl,
} from './responsesAdapter.js';

test('ensureResponsesStrictSchema adds additionalProperties to object schemas', t => {
	const schema = ensureResponsesStrictSchema({
		type: 'object',
		properties: {
			query: {type: 'string'},
		},
	});

	t.is(schema?.['additionalProperties'], false);
});

test('adaptToolsToResponses converts tool declaration shape', t => {
	const tools = adaptToolsToResponses([
		{
			type: 'function',
			function: {
				name: 'websearch-search',
				description: 'Search web',
				parameters: {
					type: 'object',
					properties: {
						query: {type: 'string'},
					},
				},
			},
		},
	]);

	t.is(tools?.[0]?.name, 'websearch-search');
	t.is(tools?.[0]?.parameters?.['additionalProperties'], false);
});

test('buildResponsesAssistantToolCallItems keeps call ids stable', t => {
	const items = buildResponsesAssistantToolCallItems({
		tool_calls: [
			{
				id: 'call-1',
				type: 'function',
				function: {
					name: 'todo-update',
					arguments: '{"id":"1"}',
				},
			},
		],
	});

	t.deepEqual(items[0], {
		type: 'function_call',
		name: 'todo-update',
		arguments: '{"id":"1"}',
		call_id: 'call-1',
	});
});

test('buildResponsesToolResultItem converts multimodal output', t => {
	const item = buildResponsesToolResultItem({
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

	t.true(Array.isArray(item.output));
});

test('toResponsesImageUrl wraps raw base64 data as data url', t => {
	t.true(
		toResponsesImageUrl({
			type: 'image',
			data: 'Zm9v',
			mimeType: 'image/png',
		}).startsWith('data:image/png;base64,'),
	);
});
