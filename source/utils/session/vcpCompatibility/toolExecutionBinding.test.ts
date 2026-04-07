import anyTest from 'ava';

const test = anyTest as any;

import {
	coerceBridgeExecutionArguments,
	clearToolExecutionBindings,
	clearToolExecutionBindingsSession,
	filterToolExecutionBindings,
	getToolExecutionBinding,
	normalizeBridgeArgumentAliases,
	rotateToolExecutionBindingsSession,
} from './toolExecutionBinding.js';
import {DEFAULT_TOOL_PLANE_KEY} from './constants.js';

test.afterEach(() => {
	clearToolExecutionBindings(DEFAULT_TOOL_PLANE_KEY);
	clearToolExecutionBindings('plane-a');
	clearToolExecutionBindings('plane-b');
	clearToolExecutionBindings('design-plane');
	clearToolExecutionBindings('review-plane');
	clearToolExecutionBindingsSession('chat-session');
	clearToolExecutionBindingsSession('design-session');
	clearToolExecutionBindingsSession('review-session');
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

test('resolve latest registered binding when teammate worktree rewrite has no explicit plane key', (t: any) => {
	rotateToolExecutionBindingsSession({
		sessionKey: 'chat-session',
		nextToolPlaneKey: 'plane-b',
		bindings: [
			{
				kind: 'bridge',
				toolName: 'vcp-imagecomposer-editimage',
				pluginName: 'ImageComposer',
				displayName: 'ImageComposer',
				commandName: 'EditImage',
				stringifyArgumentNames: [],
				argumentBindings: [
					{
						name: 'imageUrl',
						aliases: ['fileUrl'],
						fileUrlCompatible: true,
					},
				],
			},
		],
	});

	t.deepEqual(
		getToolExecutionBinding('vcp-imagecomposer-editimage'),
		{
			kind: 'bridge',
			toolName: 'vcp-imagecomposer-editimage',
			pluginName: 'ImageComposer',
			displayName: 'ImageComposer',
			commandName: 'EditImage',
			stringifyArgumentNames: [],
			argumentBindings: [
				{
					name: 'imageUrl',
					aliases: ['fileUrl'],
					fileUrlCompatible: true,
				},
			],
		},
	);
});

test('keep session-scoped bindings isolated across multiple planes for the same tool name', (t: any) => {
	rotateToolExecutionBindingsSession({
		sessionKey: 'design-session',
		nextToolPlaneKey: 'design-plane',
		bindings: [
			{
				kind: 'bridge',
				toolName: 'vcp-imagecomposer-editimage',
				pluginName: 'ImageComposer',
				displayName: 'ImageComposer',
				commandName: 'EditImage',
				stringifyArgumentNames: [],
				argumentBindings: [
					{
						name: 'imageUrl',
						aliases: ['fileUrl'],
						fileUrlCompatible: true,
					},
				],
			},
		],
	});
	rotateToolExecutionBindingsSession({
		sessionKey: 'review-session',
		nextToolPlaneKey: 'review-plane',
		bindings: [
			{
				kind: 'bridge',
				toolName: 'vcp-imagecomposer-editimage',
				pluginName: 'ImageComposer',
				displayName: 'ImageComposer',
				commandName: 'EditImage',
				stringifyArgumentNames: [],
				argumentBindings: [
					{
						name: 'sourceUrl',
						aliases: ['path'],
						fileUrlCompatible: true,
					},
				],
			},
		],
	});

	t.deepEqual(
		getToolExecutionBinding('vcp-imagecomposer-editimage', 'design-session'),
		{
			kind: 'bridge',
			toolName: 'vcp-imagecomposer-editimage',
			pluginName: 'ImageComposer',
			displayName: 'ImageComposer',
			commandName: 'EditImage',
			stringifyArgumentNames: [],
			argumentBindings: [
				{
					name: 'imageUrl',
					aliases: ['fileUrl'],
					fileUrlCompatible: true,
				},
			],
		},
	);
	t.deepEqual(
		getToolExecutionBinding('vcp-imagecomposer-editimage', 'review-session'),
		{
			kind: 'bridge',
			toolName: 'vcp-imagecomposer-editimage',
			pluginName: 'ImageComposer',
			displayName: 'ImageComposer',
			commandName: 'EditImage',
			stringifyArgumentNames: [],
			argumentBindings: [
				{
					name: 'sourceUrl',
					aliases: ['path'],
					fileUrlCompatible: true,
				},
			],
		},
	);
});

test('filter execution bindings down to the retained tool plane', (t: any) => {
	rotateToolExecutionBindingsSession({
		sessionKey: 'chat-session',
		nextToolPlaneKey: 'plane-b',
		bindings: [
			{
				kind: 'local',
				toolName: 'filesystem-read',
			},
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
		filterToolExecutionBindings(
			['vcp-codesearcher-searchcode', 'send_message_to_agent'],
			'plane-b',
		),
		[
			{
				kind: 'bridge',
				toolName: 'vcp-codesearcher-searchcode',
				pluginName: 'CodeSearcher',
				displayName: 'CodeSearcher',
				commandName: 'SearchCode',
				stringifyArgumentNames: [],
			},
		],
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

test('normalize bridge argument aliases and local file paths before execution', (t: any) => {
	const normalizedArgs = coerceBridgeExecutionArguments(
		{
			fileUrl: 'H:/repo/assets/cover.png',
			prompt: 'make it brighter',
		},
		{
			kind: 'bridge',
			toolName: 'vcp-imagecomposer-editimage',
			pluginName: 'ImageComposer',
			displayName: 'ImageComposer',
			commandName: 'EditImage',
			stringifyArgumentNames: [],
			argumentBindings: [
				{
					name: 'imageUrl',
					aliases: ['fileUrl', 'image_path'],
					fileUrlCompatible: true,
				},
			],
		},
	);

	t.false('fileUrl' in normalizedArgs);
	t.is(normalizedArgs['imageUrl'], 'file:///H:/repo/assets/cover.png');
	t.is(normalizedArgs['prompt'], 'make it brighter');
});

test('normalize bridge argument aliases without coercing file-url compatible values yet', (t: any) => {
	const normalizedArgs = normalizeBridgeArgumentAliases(
		{
			fileUrl: 'assets/cover.png',
			prompt: 'make it brighter',
		},
		{
			kind: 'bridge',
			toolName: 'vcp-imagecomposer-editimage',
			pluginName: 'ImageComposer',
			displayName: 'ImageComposer',
			commandName: 'EditImage',
			stringifyArgumentNames: [],
			argumentBindings: [
				{
					name: 'imageUrl',
					aliases: ['fileUrl', 'image_path'],
					fileUrlCompatible: true,
				},
			],
		},
	);

	t.false('fileUrl' in normalizedArgs);
	t.is(normalizedArgs['imageUrl'], 'assets/cover.png');
	t.is(normalizedArgs['prompt'], 'make it brighter');
});

test('apply alias normalization before description-derived stringify coercion', (t: any) => {
	const normalizedArgs = coerceBridgeExecutionArguments(
		{
			image_path: './fixtures/demo.png',
			options: {
				mode: 'fast',
			},
		},
		{
			kind: 'bridge',
			toolName: 'vcp-imagecomposer-editimage',
			pluginName: 'ImageComposer',
			displayName: 'ImageComposer',
			commandName: 'EditImage',
			stringifyArgumentNames: ['options'],
			argumentBindings: [
				{
					name: 'imageUrl',
					aliases: ['image_path'],
					fileUrlCompatible: true,
				},
			],
		},
	);

	t.is(
		normalizedArgs['imageUrl'],
		'file:///H:/github/VCP/snow-cli/fixtures/demo.png',
	);
	t.is(normalizedArgs['options'], '{"mode":"fast"}');
});

test('normalize nested file-url compatible objects without rewriting unrelated nested strings', (t: any) => {
	const normalizedArgs = coerceBridgeExecutionArguments(
		{
			payload: {
				imageUrl: './fixtures/demo.png',
				prompt: 'keep.colors.warm',
				items: [
					{
						filePath: '../assets/reference.png',
						label: 'reference.image',
					},
				],
			},
		},
		{
			kind: 'bridge',
			toolName: 'vcp-imagecomposer-editimage',
			pluginName: 'ImageComposer',
			displayName: 'ImageComposer',
			commandName: 'EditImage',
			stringifyArgumentNames: [],
			argumentBindings: [
				{
					name: 'payload',
					fileUrlCompatible: true,
				},
			],
		},
	);

	t.deepEqual(normalizedArgs, {
		payload: {
			imageUrl: 'file:///H:/github/VCP/snow-cli/fixtures/demo.png',
			prompt: 'keep.colors.warm',
			items: [
				{
					filePath: 'file:///H:/github/VCP/assets/reference.png',
					label: 'reference.image',
				},
			],
		},
	});
});
