import anyTest from 'ava';
import {pathToFileURL} from 'node:url';
import {resolve as resolvePath} from 'node:path';

const test = anyTest as any;

import {
	registerToolExecutionBindings,
	clearToolExecutionBindings,
	clearToolExecutionBindingsSession,
	rotateToolExecutionBindingsSession,
} from '../session/vcpCompatibility/toolExecutionBinding.js';
import {
	enforceWorktreePath,
	rewriteToolArgsForWorktree,
} from './teamWorktree.js';

const BRIDGE_TOOL_NAME = 'vcp-imagecomposer-editimage';

test.afterEach(() => {
	clearToolExecutionBindings();
	clearToolExecutionBindings('team-plane');
	clearToolExecutionBindings('design-plane');
	clearToolExecutionBindings('review-plane');
	clearToolExecutionBindingsSession('chat-session');
	clearToolExecutionBindingsSession('design-session');
	clearToolExecutionBindingsSession('review-session');
});

function registerImageComposerBinding(): void {
	registerToolExecutionBindings(undefined, [
		{
			kind: 'bridge',
			toolName: BRIDGE_TOOL_NAME,
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
	]);
}

test('remap main workspace absolute paths into teammate worktree on Windows-compatible paths', (t: any) => {
	const worktreePath = resolvePath(
		process.cwd(),
		'.snow',
		'worktrees',
		'design',
		'alice',
	);
	const mainWorkspaceFile = resolvePath(process.cwd(), 'assets', 'cover.png');

	t.is(
		enforceWorktreePath(mainWorkspaceFile, worktreePath),
		resolvePath(worktreePath, 'assets', 'cover.png'),
	);
});

test('rewrite bridge alias file paths against teammate worktree before bridge execution', (t: any) => {
	registerImageComposerBinding();
	const worktreePath = resolvePath(
		process.cwd(),
		'.snow',
		'worktrees',
		'design',
		'alice',
	);

	const result = rewriteToolArgsForWorktree(
		BRIDGE_TOOL_NAME,
		{
			fileUrl: 'assets/cover.png',
			prompt: 'make it brighter',
		},
		worktreePath,
	);

	t.falsy(result.error);
	t.false('fileUrl' in result.args);
	t.is(
		result.args.imageUrl,
		pathToFileURL(resolvePath(worktreePath, 'assets', 'cover.png')).toString(),
	);
	t.is(result.args.prompt, 'make it brighter');
});

test('rewrite bridge file URLs from the main workspace into teammate worktree file URLs', (t: any) => {
	registerImageComposerBinding();
	const worktreePath = resolvePath(
		process.cwd(),
		'.snow',
		'worktrees',
		'design',
		'alice',
	);
	const mainWorkspaceFileUrl = pathToFileURL(
		resolvePath(process.cwd(), 'assets', 'cover.png'),
	).toString();

	const result = rewriteToolArgsForWorktree(
		BRIDGE_TOOL_NAME,
		{
			image_path: mainWorkspaceFileUrl,
		},
		worktreePath,
	);

	t.falsy(result.error);
	t.false('image_path' in result.args);
	t.is(
		result.args.imageUrl,
		pathToFileURL(resolvePath(worktreePath, 'assets', 'cover.png')).toString(),
	);
});

test('rewrite bridge args against the provided session binding instead of the global fallback', (t: any) => {
	rotateToolExecutionBindingsSession({
		sessionKey: 'design-session',
		nextToolPlaneKey: 'design-plane',
		bindings: [
			{
				kind: 'bridge',
				toolName: BRIDGE_TOOL_NAME,
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
				toolName: BRIDGE_TOOL_NAME,
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

	const worktreePath = resolvePath(
		process.cwd(),
		'.snow',
		'worktrees',
		'design',
		'alice',
	);
	const result = rewriteToolArgsForWorktree(
		BRIDGE_TOOL_NAME,
		{
			fileUrl: 'assets/cover.png',
		},
		worktreePath,
		'design-session',
	);

	t.falsy(result.error);
	t.false('fileUrl' in result.args);
	t.is(
		result.args.imageUrl,
		pathToFileURL(resolvePath(worktreePath, 'assets', 'cover.png')).toString(),
	);
	t.is(result.args.sourceUrl, undefined);
});

test('rewrite nested bridge file-url fields without mutating unrelated nested strings', (t: any) => {
	registerToolExecutionBindings(undefined, [
		{
			kind: 'bridge',
			toolName: BRIDGE_TOOL_NAME,
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
	]);

	const worktreePath = resolvePath(
		process.cwd(),
		'.snow',
		'worktrees',
		'design',
		'alice',
	);
	const result = rewriteToolArgsForWorktree(
		BRIDGE_TOOL_NAME,
		{
			payload: {
				imageUrl: 'assets/cover.png',
				prompt: 'keep.colors.warm',
				items: [
					{
						filePath: './masks/base.png',
						label: 'reference.image',
					},
				],
			},
		},
		worktreePath,
	);

	t.falsy(result.error);
	t.deepEqual(result.args, {
		payload: {
			imageUrl: pathToFileURL(
				resolvePath(worktreePath, 'assets', 'cover.png'),
			).toString(),
			prompt: 'keep.colors.warm',
			items: [
				{
					filePath: pathToFileURL(
						resolvePath(worktreePath, 'masks', 'base.png'),
					).toString(),
					label: 'reference.image',
				},
			],
		},
	});
});
