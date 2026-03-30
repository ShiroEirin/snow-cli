import test from 'ava';
import {resolveCompressionSystemPrompt} from './contextCompressor.js';

test('resolveCompressionSystemPrompt falls back to normal prompt', t => {
	const prompt = resolveCompressionSystemPrompt({
		planMode: false,
		vulnerabilityHuntingMode: false,
		teamMode: false,
	});

	t.notRegex(prompt, /Agent Team Mode/i);
	t.regex(prompt, /intelligent command-line assistant/i);
});

test('resolveCompressionSystemPrompt honors team mode override', t => {
	const prompt = resolveCompressionSystemPrompt({
		planMode: false,
		vulnerabilityHuntingMode: false,
		teamMode: true,
	});

	t.regex(prompt, /Agent Team Mode/i);
	t.regex(prompt, /Team Lead/i);
});
