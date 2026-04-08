import test from 'ava';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

import {getSystemPromptForMode} from '../../prompt/systemPrompt.js';
import {resolveCompressionSystemPrompt} from './contextCompressor.js';

function readContextCompressorSource(): string {
	return readFileSync(
		fileURLToPath(new URL('./contextCompressor.ts', import.meta.url)),
		'utf8',
	);
}

test('resolveCompressionSystemPrompt falls back to normal prompt', t => {
	const prompt = resolveCompressionSystemPrompt({
		planMode: false,
		vulnerabilityHuntingMode: false,
		teamMode: false,
	});

	t.is(prompt, getSystemPromptForMode(false, false, false, false));
});

test('resolveCompressionSystemPrompt honors team mode override', t => {
	const prompt = resolveCompressionSystemPrompt({
		planMode: false,
		vulnerabilityHuntingMode: false,
		teamMode: true,
	});

	t.is(prompt, getSystemPromptForMode(false, false, false, true));
});

test('contextCompressor depends on the thin VCP compatibility adapter only', t => {
	const source = readContextCompressorSource();

	t.true(source.includes("from './vcpCompatibilityAdapter.js'"));
	t.false(source.includes("from '../session/vcpCompatibility/display.js'"));
	t.false(source.includes("from '../session/vcpCompatibility/mode.js'"));
});
