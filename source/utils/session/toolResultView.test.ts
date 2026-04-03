import test from 'ava';

import {buildToolResultView} from './toolResultView.js';

test('buildToolResultView uses compact preview for bridge tools', t => {
	const result = buildToolResultView({
		toolName: 'vcp-bridge-tool',
		content: '{"content":"raw"}',
		historyContent: 'preview summary',
		isError: false,
	});

	t.is(result.toolName, 'vcp-bridge-tool');
	t.is(result.previewContent, 'preview summary');
});

test('buildToolResultView keeps specialized previews on raw payloads', t => {
	const result = buildToolResultView({
		toolName: 'filesystem-read',
		content: '{"content":"raw"}',
		historyContent: 'preview summary',
		isError: false,
	});

	t.is(result.previewContent, undefined);
});

test('buildToolResultView skips compact preview for errors', t => {
	const result = buildToolResultView({
		toolName: 'vcp-bridge-tool',
		content: 'Error: boom',
		historyContent: 'preview summary',
		isError: true,
	});

	t.is(result.previewContent, undefined);
});
