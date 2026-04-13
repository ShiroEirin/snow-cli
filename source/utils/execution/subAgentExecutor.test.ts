import anyTest from 'ava';

const test = anyTest as any;

import {
	formatSubAgentUserQuestionResult,
	isToolAllowedForSubAgent,
	shouldScopeSubAgentExecutionBindings,
	shouldUseSubAgentToolPlane,
	summarizeSpawnedSubAgentResult,
} from './subAgentExecutor.js';

test('allow built-in tools by exact and prefix match', (t: any) => {
	t.true(
		isToolAllowedForSubAgent('filesystem-read', ['filesystem']),
	);
	t.true(
		isToolAllowedForSubAgent('askuser-ask_question', ['askuser-ask_question']),
	);
	t.false(
		isToolAllowedForSubAgent('terminal-execute', ['filesystem']),
	);
});

test('allow external tools by exact name and legacy unqualified suffix', (t: any) => {
	t.true(
		isToolAllowedForSubAgent('vcp-search-findnote', ['vcp-search-findnote']),
	);
	t.true(
		isToolAllowedForSubAgent('vcp-search-findnote', ['findnote']),
	);
	t.false(
		isToolAllowedForSubAgent('vcp-search-findnote', ['readnote']),
	);
});

test('subagent askuser cancelled responses stay in error channel', (t: any) => {
	t.is(
		formatSubAgentUserQuestionResult({
			selected: 'cancel',
			customInput: 'cancelled by runtime blackbox',
			cancelled: true,
		}),
		'Error: User cancelled the question interaction',
	);
});

test('subagent askuser successful responses keep structured payload', (t: any) => {
	t.is(
		formatSubAgentUserQuestionResult({
			selected: 'yes',
			customInput: 'ship it',
		}),
		JSON.stringify({
			answer: 'yes: ship it',
			selected: 'yes',
			customInput: 'ship it',
		}),
	);
});

test('subagent tool plane stays disabled for vcp local-tools mode', (t: any) => {
	t.false(
		shouldUseSubAgentToolPlane({
			backendMode: 'vcp',
			toolTransport: 'local',
		}),
	);
});

test('subagent tool plane stays enabled for bridge and hybrid modes', (t: any) => {
	t.true(
		shouldUseSubAgentToolPlane({
			backendMode: 'vcp',
			toolTransport: 'bridge',
		}),
	);
	t.true(
		shouldUseSubAgentToolPlane({
			backendMode: 'vcp',
			toolTransport: 'hybrid',
		}),
	);
});

test('subagent execution bindings stay scoped for vcp local-tools mode', (t: any) => {
	t.true(
		shouldScopeSubAgentExecutionBindings({
			backendMode: 'vcp',
		}),
	);
	t.false(
		shouldScopeSubAgentExecutionBindings({
			backendMode: 'native',
		}),
	);
});

test('spawned sub-agent summaries stay raw for local-style context handoff', (t: any) => {
	t.is(
		summarizeSpawnedSubAgentResult(
			{
				success: true,
				result: 'full child result',
			},
			{
				maxLength: 4,
				projectForContext: false,
			},
		),
		'full child result',
	);
});

test('spawned sub-agent summaries still clip projected contexts', (t: any) => {
	t.is(
		summarizeSpawnedSubAgentResult(
			{
				success: true,
				result: 'abcdef',
			},
			{
				maxLength: 4,
				projectForContext: true,
			},
		),
		'abcd...',
	);
});
