import test from 'ava';

import {resolveBuiltinSystemPrompt} from './systemPromptPolicy.js';

test('use minimal prompt for vcp local tool mode', t => {
	const prompt = resolveBuiltinSystemPrompt(
		{
			backendMode: 'vcp',
			toolTransport: 'local',
		},
		{
			planMode: false,
			vulnerabilityHuntingMode: false,
			toolSearchDisabled: false,
			teamMode: false,
		},
	);

	t.true(
		prompt.includes('You are Snow AI CLI, an intelligent command-line assistant.'),
	);
	t.true(prompt.includes('VCP-compatible chat backend'));
	t.true(prompt.includes('Use ONLY the tools that are actually exposed'));
	t.false(prompt.includes('## Core Principles'));
});

test('keep native prompt outside vcp local tool mode', t => {
	const prompt = resolveBuiltinSystemPrompt(
		{
			backendMode: 'native',
			toolTransport: 'local',
		},
		{
			planMode: false,
			vulnerabilityHuntingMode: false,
			toolSearchDisabled: false,
			teamMode: false,
		},
	);

	t.true(prompt.includes('You are Snow AI CLI, an intelligent command-line assistant.'));
});
