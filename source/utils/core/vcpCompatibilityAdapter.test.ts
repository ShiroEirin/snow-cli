import test from 'ava';

import {
	formatCompatibilityContentForTranscript,
	resolveCompatibilityRequestMethod,
	stripCompatibilityDisplayBlocks,
} from './vcpCompatibilityAdapter.js';

test('format compatibility transcript preserves existing VCP transcript summaries', t => {
	const input = `继续检索
<<<[TOOL_REQUEST]>>>
tool_name:「始」LightMemo「末」
<<<[END_TOOL_REQUEST]>>>
最终结果`;

	const transcript = formatCompatibilityContentForTranscript(input);

	t.true(transcript.includes('继续检索'));
	t.true(transcript.includes('VCP-ToolRequest：LightMemo'));
	t.true(transcript.includes('最终结果'));
});

test('strip compatibility display blocks preserves visible content', t => {
	const input = `继续检索
<<<[TOOL_REQUEST]>>>
tool_name:「始」LightMemo「末」
<<<[END_TOOL_REQUEST]>>>
最终结果`;

	t.is(stripCompatibilityDisplayBlocks(input), '继续检索\n\n最终结果');
});

test('resolve compatibility request method keeps VCP compression routing behavior', t => {
	t.is(
		resolveCompatibilityRequestMethod(
			{
				baseUrl: 'https://vcp.example.com/v1',
				apiKey: 'test-key',
				requestMethod: 'responses',
				backendMode: 'vcp',
			},
			'gpt-5',
		),
		'chat',
	);

	t.is(
		resolveCompatibilityRequestMethod(
			{
				baseUrl: 'https://api.example.com/v1',
				apiKey: 'test-key',
				requestMethod: 'anthropic',
				backendMode: 'native',
			},
			'claude-3-7-sonnet',
		),
		'anthropic',
	);
});
