import test from 'ava';
import {
	toSnowToolCall,
	withToolResultMetadata,
} from './toolExecutor.js';

test('toSnowToolCall keeps canonical tool identity fields', t => {
	const call = toSnowToolCall({
		id: 'call-1',
		toolId: 'tool-123',
		publicName: 'filesystem-read',
		rawName: 'filesystem-read',
		type: 'function',
		function: {
			name: 'filesystem-read',
			arguments: '{"filePath":"README.md"}',
		},
	});

	t.deepEqual(call, {
		id: 'call-1',
		toolId: 'tool-123',
		publicName: 'filesystem-read',
		rawName: 'filesystem-read',
		argumentsText: '{"filePath":"README.md"}',
		thoughtSignature: undefined,
	});
});

test('withToolResultMetadata preserves toolId and canonical names for session replay', t => {
	const result = withToolResultMetadata(
		{
			id: 'call-1',
			toolId: 'tool-123',
			publicName: 'filesystem-read',
			rawName: 'filesystem-read',
			function: {
				name: 'filesystem-read',
				arguments: '{}',
			},
		},
		{
			tool_call_id: 'call-1',
			role: 'tool',
			content: 'ok',
		},
	);

	t.is(result.toolId, 'tool-123');
	t.is(result.publicName, 'filesystem-read');
	t.is(result.rawName, 'filesystem-read');
	t.is(result.name, 'filesystem-read');
});
