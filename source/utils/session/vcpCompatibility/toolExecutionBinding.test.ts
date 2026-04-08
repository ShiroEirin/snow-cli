import anyTest from 'ava';
import {resolve as resolvePath} from 'node:path';
import {pathToFileURL} from 'node:url';

const test = anyTest as any;

import {
	coerceBridgeExecutionArguments,
	clearToolExecutionBindings,
	clearToolExecutionBindingsSession,
	filterToolExecutionBindings,
	getToolExecutionBinding,
	normalizeBridgeArgumentAliases,
	registerToolExecutionBindings,
	rotateToolExecutionBindingsSession,
} from './toolExecutionBinding.js';
import {DEFAULT_TOOL_PLANE_KEY} from './constants.js';

const FIXTURES_DEMO_FILE_URL = pathToFileURL(
	resolvePath('fixtures/demo.png'),
).toString();
const ASSETS_REFERENCE_FILE_URL = pathToFileURL(
	resolvePath('../assets/reference.png'),
).toString();

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

test.serial('resolve execution binding from explicit tool plane key', (t: any) => {
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

test.serial('resolve execution binding from latest session plane key fallback', (t: any) => {
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

test.serial('drop stale session fallback after explicit plane cleanup', (t: any) => {
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

test.serial('resolve fallback binding from default tool plane when no explicit plane key exists', (t: any) => {
	registerToolExecutionBindings(undefined, [
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
	]);

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

test.serial('do not leak session scoped bindings into undefined key fallback lookups', (t: any) => {
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

	t.is(getToolExecutionBinding('vcp-imagecomposer-editimage'), undefined);
});

test.serial('keep session-scoped bindings isolated across multiple planes for the same tool name', (t: any) => {
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

test.serial('filter execution bindings down to the retained tool plane', (t: any) => {
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

test.serial('coerce description-derived bridge arguments to strings before execution', (t: any) => {
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

test.serial('leave structured bridge arguments untouched when no stringify contract exists', (t: any) => {
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

test.serial('normalize bridge argument aliases and local file paths before execution', (t: any) => {
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

test.serial('normalize bridge argument aliases without coercing file-url compatible values yet', (t: any) => {
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

test.serial('apply alias normalization before description-derived stringify coercion', (t: any) => {
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
		FIXTURES_DEMO_FILE_URL,
	);
	t.is(normalizedArgs['options'], '{"mode":"fast"}');
});

test.serial('normalize nested file-url compatible objects without rewriting unrelated nested strings', (t: any) => {
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
			imageUrl: FIXTURES_DEMO_FILE_URL,
			prompt: 'keep.colors.warm',
			items: [
				{
					filePath: ASSETS_REFERENCE_FILE_URL,
					label: 'reference.image',
				},
			],
		},
	});
});
