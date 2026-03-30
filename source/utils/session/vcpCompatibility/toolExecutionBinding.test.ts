import anyTest from 'ava';

const test = anyTest as any;

import {
	coerceBridgeExecutionArguments,
	clearToolExecutionBindings,
	clearToolExecutionBindingsSession,
	getToolExecutionBinding,
	rotateToolExecutionBindingsSession,
} from './toolExecutionBinding.js';

test.afterEach(() => {
	clearToolExecutionBindings('__default__');
	clearToolExecutionBindings('plane-a');
	clearToolExecutionBindings('plane-b');
	clearToolExecutionBindingsSession('chat-session');
});

test('resolve execution binding from explicit tool plane key', (t: any) => {
	rotateToolExecutionBindingsSession({
		sessionKey: 'chat-session',
		nextToolPlaneKey: 'plane-a',
		bindings: [
			{
				kind: 'bridge',
				toolName: 'vcp-fileoperator-readfile',
				pluginName: 'FileOperator',
				displayName: 'FileOperator',
				commandName: 'ReadFile',
				stringifyArgumentNames: [],
			},
		],
	});

	t.deepEqual(
		getToolExecutionBinding('vcp-fileoperator-readfile', 'plane-a'),
		{
			kind: 'bridge',
			toolName: 'vcp-fileoperator-readfile',
			pluginName: 'FileOperator',
			displayName: 'FileOperator',
			commandName: 'ReadFile',
			stringifyArgumentNames: [],
		},
	);
});

test('resolve execution binding from latest session plane key fallback', (t: any) => {
	rotateToolExecutionBindingsSession({
		sessionKey: 'chat-session',
		nextToolPlaneKey: 'plane-b',
		bindings: [
			{
				kind: 'bridge',
				toolName: 'vcp-codesearcher-searchcode',
				pluginName: 'CodeSearcher',
				displayName: 'CodeSearcher',
				commandName: 'SearchCode',
				stringifyArgumentNames: [],
			},
		],
	});

	t.deepEqual(
		getToolExecutionBinding('vcp-codesearcher-searchcode', 'chat-session'),
		{
			kind: 'bridge',
			toolName: 'vcp-codesearcher-searchcode',
			pluginName: 'CodeSearcher',
			displayName: 'CodeSearcher',
			commandName: 'SearchCode',
			stringifyArgumentNames: [],
		},
	);
});

test('drop stale session fallback after explicit plane cleanup', (t: any) => {
	rotateToolExecutionBindingsSession({
		sessionKey: 'chat-session',
		nextToolPlaneKey: 'plane-b',
		bindings: [
			{
				kind: 'bridge',
				toolName: 'vcp-codesearcher-searchcode',
				pluginName: 'CodeSearcher',
				displayName: 'CodeSearcher',
				commandName: 'SearchCode',
				stringifyArgumentNames: [],
			},
		],
	});

	clearToolExecutionBindings('plane-b');

	t.is(
		getToolExecutionBinding('vcp-codesearcher-searchcode', 'chat-session'),
		undefined,
	);
});

test('coerce description-derived bridge arguments to strings before execution', (t: any) => {
	const normalizedArgs = coerceBridgeExecutionArguments(
		{
			query: 'router',
			context_lines: 2,
			case_sensitive: false,
			filters: ['ts', 'tsx'],
		},
		{
			kind: 'bridge',
			toolName: 'vcp-codesearcher-searchcode',
			pluginName: 'CodeSearcher',
			displayName: 'CodeSearcher',
			commandName: 'SearchCode',
			stringifyArgumentNames: ['context_lines', 'case_sensitive', 'filters'],
		},
	);

	t.deepEqual(normalizedArgs, {
		query: 'router',
		context_lines: '2',
		case_sensitive: 'false',
		filters: '["ts","tsx"]',
	});
});

test('leave structured bridge arguments untouched when no stringify contract exists', (t: any) => {
	const originalArgs = {
		query: 'router',
		context_lines: 2,
		case_sensitive: false,
	};
	const normalizedArgs = coerceBridgeExecutionArguments(originalArgs, {
		kind: 'bridge',
		toolName: 'vcp-codesearcher-searchcode',
		pluginName: 'CodeSearcher',
		displayName: 'CodeSearcher',
		commandName: 'SearchCode',
		stringifyArgumentNames: [],
	});

	t.deepEqual(normalizedArgs, originalArgs);
});
