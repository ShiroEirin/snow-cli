import test from 'ava';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

import {
	createCompatibilityStreamingSuppressor,
	formatCompatibilityContentForTranscript,
	resolveCompatibilityRequestMethod,
	stripCompatibilityDisplayBlocks,
} from './vcpCompatibilityAdapter.js';

function readSource(relativePath: string): string {
	return readFileSync(
		fileURLToPath(new URL(relativePath, import.meta.url)),
		'utf8',
	);
}

test('format compatibility transcript preserves existing VCP transcript summaries', t => {
	const input = `Before
<<<[TOOL_REQUEST]>>>
tool_name=LightMemo
<<<[END_TOOL_REQUEST]>>>
After`;

	const transcript = formatCompatibilityContentForTranscript(input);

	t.true(transcript.includes('Before'));
	t.true(transcript.includes('VCP-ToolRequest'));
	t.true(transcript.includes('tool_name=LightMemo'));
	t.true(transcript.includes('After'));
});

test('strip compatibility display blocks preserves visible content', t => {
	const input = `Before
<<<[TOOL_REQUEST]>>>
tool_name=LightMemo
<<<[END_TOOL_REQUEST]>>>
After`;

	t.is(
		stripCompatibilityDisplayBlocks(input),
		`Before

After`,
	);
});

test('compatibility streaming suppressor preserves VCP shell suppression and reset semantics', t => {
	const suppressor = createCompatibilityStreamingSuppressor();

	t.true(suppressor.shouldSuppress('<<<[TOOL_REQUEST]>>>'));
	t.true(suppressor.shouldSuppress('tool_name=LightMemo'));
	t.true(suppressor.shouldSuppress('<<<[END_TOOL_REQUEST]>>>'));
	t.false(suppressor.shouldSuppress('After'));
	suppressor.reset();
	t.false(suppressor.shouldSuppress('Plain text'));
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

test('conversation streaming core keeps VCP display imports behind compatibility adapter seam', t => {
	const streamProcessorSource = readSource(
		'../../hooks/conversation/core/streamProcessor.ts',
	);
	const subAgentSource = readSource(
		'../../hooks/conversation/core/subAgentMessageHandler.ts',
	);

	for (const source of [streamProcessorSource, subAgentSource]) {
		t.true(
			source.includes("from '../../../utils/core/vcpCompatibilityAdapter.js'"),
		);
		t.false(
			source.includes(
				"from '../../../utils/session/vcpCompatibility/display.js'",
			),
		);
	}
});
