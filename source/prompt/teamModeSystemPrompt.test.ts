import test from 'ava';

import {getTeamModeSystemPrompt} from './teamModeSystemPrompt.js';

test('team mode prompt forbids lead-side search before first spawn', t => {
	const prompt = getTeamModeSystemPrompt(false);

	t.true(
		prompt.includes(
			'Do NOT call non-team tools before the first `team-spawn_teammate`',
		),
	);
	t.true(
		prompt.includes(
			'your FIRST assistant response should contain only the required `team-spawn_teammate` call(s)',
		),
	);
	t.true(
		prompt.includes(
			'Do NOT use lead-side code search before the first `team-spawn_teammate` unless a documented solo exception applies',
		),
	);
	t.false(prompt.includes('before spawning teammates or during synthesis'));
});

test('team mode prompt enforces exact final output discipline', t => {
	const prompt = getTeamModeSystemPrompt(false);

	t.true(
		prompt.includes(
			'return exactly that value with no label, markdown, backticks, code fence, or extra explanation',
		),
	);
});
