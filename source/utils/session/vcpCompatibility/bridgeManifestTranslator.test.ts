import anyTest from 'ava';

const test = anyTest as any;

import {translateBridgeManifestToToolPlane} from './bridgeManifestTranslator.js';

function getToolParameters(
	toolPlane: ReturnType<typeof translateBridgeManifestToToolPlane>,
) {
	return toolPlane.modelTools[0]?.function.parameters as
		| Record<string, any>
		| undefined;
}

test('translate markdown parameter bullets and strip legacy example blocks', (t: any) => {
	const toolPlane = translateBridgeManifestToToolPlane({
		plugins: [
			{
				name: 'ChromeBridge',
				displayName: 'Chrome Bridge',
				description: 'Hybrid browser bridge.',
				pluginType: 'hybridservice',
				bridgeCommands: [
					{
						command: 'type',
						description: `在指定的输入框中输入文本，并等待页面刷新后返回新的页面内容。
- \`command\`: 固定为 \`type\`。
- \`target\`: 输入框的标题或标识符 (例如, '搜索框', 'username')。
- \`text\`: 要输入的文本内容。

**调用示例:**
<<<[TOOL_REQUEST]>>>
tool_name: 「始」ChromeBridge「末」,
command: 「始」type「末」,
target: 「始」搜索框「末」,
text: 「始」VCP Agent是什么「末」
<<<[END_TOOL_REQUEST]>>>`,
						parameters: [],
					},
				],
			},
		],
	});

	const tool = toolPlane.modelTools[0];
	const parameters = getToolParameters(toolPlane);

	t.is(toolPlane.modelTools.length, 1);
	t.is(tool?.function.name, 'vcp-chromebridge-type');
	t.false(tool?.function.description.includes('TOOL_REQUEST'));
	t.false(
		Object.prototype.hasOwnProperty.call(
			parameters?.['properties'] || {},
			'command',
		),
	);
	t.true(
		Object.prototype.hasOwnProperty.call(
			parameters?.['properties'] || {},
			'target',
		),
	);
	t.true(
		Object.prototype.hasOwnProperty.call(
			parameters?.['properties'] || {},
			'text',
		),
	);
	t.deepEqual(parameters?.['required'], []);
	t.true(parameters?.['additionalProperties']);
});

test('keep comma separated list parameters as string when inferred from description', (t: any) => {
	const toolPlane = translateBridgeManifestToToolPlane({
		plugins: [
			{
				name: 'AgentDream',
				displayName: 'AgentDream',
				description: 'Dream operations.',
				pluginType: 'hybridservice',
				bridgeCommands: [
					{
						commandIdentifier: 'DreamInsight',
						description: `功能: 基于参考日记产生梦感悟，创建一篇全新的感悟日记。
参数:
- referenceDiaries (字符串, 必需): 触发感悟的参考日记URL列表，多个用逗号分隔。
- insightContent (字符串, 必需): 梦感悟的完整正文，末尾必须包含Tag行。`,
						parameters: [],
					},
				],
			},
		],
	});

	const parameters = getToolParameters(toolPlane);

	t.is(parameters?.['properties']?.['referenceDiaries']?.type, 'string');
	t.is(parameters?.['properties']?.['insightContent']?.type, 'string');
	t.deepEqual(parameters?.['required'], ['referenceDiaries', 'insightContent']);
});

test('skip unsupported plugin types from tool plane', (t: any) => {
	const toolPlane = translateBridgeManifestToToolPlane({
		plugins: [
			{
				name: 'WeatherReporter',
				displayName: 'Weather Reporter',
				description: 'Static weather info.',
				pluginType: 'static',
				bridgeCommands: [
					{
						commandName: 'noop',
						description: 'Should never become a tool.',
						parameters: [],
					},
				],
			},
			{
				name: 'FileOperator',
				displayName: 'FileOperator',
				description: 'File tools.',
				pluginType: 'synchronous',
				bridgeCommands: [
					{
						commandName: 'ReadFile',
						description:
							'Read file.\n参数:\n- filePath (字符串, 必需): Absolute file path.',
						parameters: [],
					},
				],
			},
		],
	});

	t.is(toolPlane.modelTools.length, 1);
	t.is(toolPlane.modelTools[0]?.function.name, 'vcp-fileoperator-readfile');
	t.is(toolPlane.servicesInfo.length, 1);
});

test('strip legacy tool_name examples from escaped newline descriptions', (t: any) => {
	const toolPlane = translateBridgeManifestToToolPlane({
		plugins: [
			{
				name: 'JapaneseHelper',
				displayName: 'Japanese Helper',
				description: 'Japanese study helper.',
				pluginType: 'hybridservice',
				bridgeCommands: [
					{
						commandIdentifier: 'JapaneseHelperLookup',
						description:
							'查词与消歧。\\\\n\\\\n参数:\\\\n- command (字符串, 必需): lookup_word 或 lookup_word_json\\\\n- word (字符串, 必需): 要查询的词\\\\n- online_mode (字符串, 可选): race 或 aggregate\\\\n\\\\n调用示例:\\\\ntool_name=JapaneseHelper, command=lookup_word, word=利害関係者, online_mode=aggregate',
						parameters: [],
					},
				],
			},
		],
	});

	const tool = toolPlane.modelTools[0];
	const parameters = getToolParameters(toolPlane);

	t.truthy(tool);
	t.false(tool?.function.description.includes('调用示例'));
	t.false(tool?.function.description.includes('tool_name='));
	t.false(tool?.function.description.includes('\\n'));
	t.false(
		Object.prototype.hasOwnProperty.call(
			parameters?.['properties'] || {},
			'command',
		),
	);
	t.deepEqual(Object.keys(parameters?.['properties'] || {}).sort(), [
		'online_mode',
		'word',
	]);
	t.deepEqual(parameters?.['required'], ['word']);
});

test('strip legacy example sections that include parenthesized labels', (t: any) => {
	const toolPlane = translateBridgeManifestToToolPlane({
		plugins: [
			{
				name: 'SunoGen',
				displayName: 'SunoGen',
				description: 'Music generation tools.',
				pluginType: 'hybridservice',
				bridgeCommands: [
					{
						command: 'generate_song',
						description: `调用 Suno API 生成一首歌曲。
参数:
- prompt (字符串, 必需): 歌词内容。
- title (字符串, 必需): 歌曲标题。

**调用示例 (歌词模式，不需要定义make_instrumental):**
<<<[TOOL_REQUEST]>>>
tool_name:「始」SunoGen「末」,
command:「始」generate_song「末」,
prompt:「始」Sunny days「末」,
title:「始」Sunny Days「末」
<<<[END_TOOL_REQUEST]>>>`,
						parameters: [],
					},
				],
			},
		],
	});

	const tool = toolPlane.modelTools[0];

	t.truthy(tool);
	t.false(tool?.function.description.includes('调用示例'));
	t.false(tool?.function.description.includes('TOOL_REQUEST'));
	t.false(tool?.function.description.includes('tool_name'));
	t.true(
		tool?.function.description.includes(
			'示例提示：歌词模式，不需要定义make_instrumental。',
		),
	);
});

test('skip transport-like description parameters without hiding real user params', (t: any) => {
	const toolPlane = translateBridgeManifestToToolPlane({
		plugins: [
			{
				name: 'HybridRouter',
				displayName: 'Hybrid Router',
				description: 'Route execution.',
				pluginType: 'hybridservice',
				bridgeCommands: [
					{
						commandName: 'RunRoute',
						description: `执行路由。
参数:
- commandIdentifier (字符串, 必需): RunRoute
- action (字符串, 必需): fixed to run_route
- route (字符串, 必需): 目标路由
- mode (字符串, 可选): local 或 bridge`,
						parameters: [],
					},
				],
			},
		],
	});

	const parameters = getToolParameters(toolPlane);

	t.deepEqual(Object.keys(parameters?.['properties'] || {}).sort(), [
		'mode',
		'route',
	]);
	t.like(parameters?.['properties']?.['mode'], {
		enum: ['local', 'bridge'],
	});
	t.deepEqual(parameters?.['required'], ['route']);
});

test('extract const schema from stable fixed-value hints without touching Snow core', (t: any) => {
	const toolPlane = translateBridgeManifestToToolPlane({
		plugins: [
			{
				name: 'MarkdownPublisher',
				displayName: 'Markdown Publisher',
				description: 'Publish markdown payloads.',
				pluginType: 'hybridservice',
				bridgeCommands: [
					{
						commandName: 'PublishPost',
						description: `发布文章。
参数:
- content (字符串, 必需): 文章内容。
- response_format (字符串, 可选): fixed to markdown`,
						parameters: [],
					},
				],
			},
		],
	});

	const parameters = getToolParameters(toolPlane);

	t.like(parameters?.['properties']?.['response_format'], {
		const: 'markdown',
		default: 'markdown',
	});
	t.deepEqual(parameters?.['required'], ['content']);
});

test('do not narrow generic must-be descriptions into const values', (t: any) => {
	const toolPlane = translateBridgeManifestToToolPlane({
		plugins: [
			{
				name: 'PathPublisher',
				displayName: 'Path Publisher',
				description: 'Publish files with validated modes.',
				pluginType: 'hybridservice',
				bridgeCommands: [
					{
						commandName: 'PublishPath',
						description: `发布文件。
参数:
- output_mode (字符串, 可选): must be a valid output mode
- file_path (字符串, 必需): must be absolute path
- response_format (字符串, 可选): fixed to markdown`,
						parameters: [],
					},
				],
			},
		],
	});

	const parameters = getToolParameters(toolPlane);

	t.false(
		Object.prototype.hasOwnProperty.call(
			parameters?.['properties']?.['output_mode'] || {},
			'const',
		),
	);
	t.false(
		Object.prototype.hasOwnProperty.call(
			parameters?.['properties']?.['file_path'] || {},
			'const',
		),
	);
	t.like(parameters?.['properties']?.['response_format'], {
		const: 'markdown',
		default: 'markdown',
	});
	t.deepEqual(parameters?.['required'], ['file_path']);
});

test('mark description-derived schema as strict when command forbids extra parameters', (t: any) => {
	const toolPlane = translateBridgeManifestToToolPlane({
		plugins: [
			{
				name: 'WanVideoGen',
				displayName: 'Wan Video Gen',
				description: 'Video generation tools.',
				pluginType: 'hybridservice',
				bridgeCommands: [
					{
						command: 'submit_video',
						description: `提交一个新的视频生成任务。
严格按照以下格式和参数顺序调用。
禁止包含任何其他参数。
参数:
- prompt (字符串, 必需): 视频提示词。
- mode (字符串, 必需): t2v 或 i2v。`,
						parameters: [],
					},
				],
			},
		],
	});

	const parameters = getToolParameters(toolPlane);

	t.false(parameters?.['additionalProperties']);
	t.like(parameters?.['properties']?.['mode'], {
		enum: ['t2v', 'i2v'],
	});
	t.deepEqual(parameters?.['required'], ['prompt', 'mode']);
});

test('preserve manifest metadata sidecar at the translator seam', (t: any) => {
	const toolPlane = translateBridgeManifestToToolPlane({
		revision: 'rev-42',
		reloadedAt: '2026-04-04T10:00:00.000Z',
		plugins: [
			{
				name: 'FileOperator',
				displayName: 'FileOperator',
				description: 'File tools.',
				requiresApproval: true,
				approvalTimeoutMs: 45_000,
				bridgeCommands: [
					{
						commandName: 'ReadFile',
						description: 'Read file.',
						parameters: [],
					},
				],
			},
		],
	});

	t.deepEqual(toolPlane.metadata, {
		revision: 'rev-42',
		reloadedAt: '2026-04-04T10:00:00.000Z',
	});
	t.deepEqual(toolPlane.modelTools[0]?.metadata, {
		revision: 'rev-42',
		reloadedAt: '2026-04-04T10:00:00.000Z',
		requiresApproval: true,
		approvalTimeoutMs: 45_000,
	});
});

test('command metadata sidecar overrides plugin approval hints without leaking into schema', (t: any) => {
	const toolPlane = translateBridgeManifestToToolPlane({
		plugins: [
			{
				name: 'ShellExec',
				displayName: 'ShellExec',
				description: 'Execute shell commands.',
				metadata: {
					requiresApproval: true,
					approvalTimeoutMs: 120_000,
				},
				bridgeCommands: [
					{
						commandName: 'ListFiles',
						description: 'List files.',
						parameters: [],
						sidecar: {
							requiresApproval: false,
							approvalTimeoutMs: 15_000,
						},
					},
				],
			},
		],
	});

	t.deepEqual(toolPlane.modelTools[0]?.metadata, {
		requiresApproval: false,
		approvalTimeoutMs: 15_000,
	});
	t.false(
		Object.prototype.hasOwnProperty.call(
			toolPlane.modelTools[0]?.function.parameters || {},
			'requiresApproval',
		),
	);
});

test('collect argument alias and file-url compatibility hints from structured bridge metadata', (t: any) => {
	const toolPlane = translateBridgeManifestToToolPlane({
		plugins: [
			{
				name: 'ImageComposer',
				displayName: 'Image Composer',
				description: 'Compose images.',
				pluginType: 'hybridservice',
				bridgeCommands: [
					{
						commandName: 'EditImage',
						description: 'Edit image with local-path compatibility.',
						parameters: [
							{
								name: 'imageUrl',
								description:
									'主图，支持 file:// 本地路径。别名: image_path。',
								required: true,
								type: 'string',
								binding: {
									aliases: ['fileUrl'],
									fileUrlCompatible: true,
								},
								metadata: {
									aliases: ['image_path'],
								},
							},
						],
					},
				],
			},
		],
	});

	t.deepEqual(toolPlane.bindings[0]?.argumentBindings, [
		{
			name: 'imageUrl',
			aliases: ['fileUrl', 'image_path'],
			fileUrlCompatible: true,
		},
	]);
});

test('infer argument alias and file-url compatibility from description-only bridge manifests', (t: any) => {
	const toolPlane = translateBridgeManifestToToolPlane({
		plugins: [
			{
				name: 'ImageComposer',
				displayName: 'Image Composer',
				description: 'Compose images.',
				pluginType: 'hybridservice',
				bridgeCommands: [
					{
						commandName: 'EditImage',
						description: `编辑图片。
参数:
- imageUrl/fileUrl (字符串, 必需): 主图。别名: image_path。支持 file:// 本地路径。
- prompt (字符串, 必需): 编辑指令。`,
						parameters: [],
					},
				],
			},
		],
	});

	const parameters = getToolParameters(toolPlane);

	t.deepEqual(Object.keys(parameters?.['properties'] || {}).sort(), [
		'imageUrl',
		'prompt',
	]);
	t.deepEqual(toolPlane.bindings[0]?.argumentBindings, [
		{
			name: 'imageUrl',
			aliases: ['fileUrl', 'image_path'],
			fileUrlCompatible: true,
		},
	]);
});
