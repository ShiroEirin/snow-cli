import test from 'ava';

import {
	assertVcpHttpSystemPromptSafe,
	resolveBuiltinSystemPrompt,
} from './systemPromptPolicy.js';

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

	t.true(prompt.includes('VCP-compatible chat backend'));
	t.true(prompt.includes('Use ONLY the tools that are actually exposed'));
	t.true(prompt.includes('In Local tools mode, prefer Snow local/MCP tools'));
	t.false(prompt.includes('## Core Principles'));
});

test('keep full native prompt outside vcp local tool mode', t => {
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

	t.false(prompt.includes('In Local tools mode, prefer Snow local/MCP tools'));
	t.true(prompt.length > 1000);
});

test('reject VCPToolBox text-protocol placeholders in VCP HTTP prompts', t => {
	const error = t.throws(() => {
		assertVcpHttpSystemPromptSafe(
			{
				backendMode: 'vcp',
			},
			['custom prompt {{VarToolList}}'],
		);
	});

	t.true(
		error?.message.includes('VCPToolBox text-protocol placeholders'),
	);
});

test('reject numbered SarPrompt placeholders in VCP HTTP prompts', t => {
	const error = t.throws(() => {
		assertVcpHttpSystemPromptSafe(
			{
				backendMode: 'vcp',
			},
			[
				[
					{text: 'custom prompt {{SarPrompt1}}'},
					{text: 'custom prompt {{ SarPrompt2 }}'},
				],
			],
		);
	});

	t.true(
		error?.message.includes('VCPToolBox text-protocol placeholders'),
	);
});
test('allow the same placeholder text outside VCP mode', t => {
	t.notThrows(() => {
		assertVcpHttpSystemPromptSafe(
			{
				backendMode: 'native',
			},
			['custom prompt {{SarPrompt}}'],
		);
	});
});
