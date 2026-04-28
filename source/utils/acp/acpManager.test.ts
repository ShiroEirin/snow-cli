import test from 'ava';
import type {ChatMessage} from '../../api/chat.js';
import type {ApiConfig} from '../config/apiConfig.js';
import type {MCPTool} from '../execution/mcpToolsManager.js';
import {
	buildAcpStreamRequestContext,
	createAcpVcpDisplaySanitizer,
} from './acpManager.js';

const createConfig = (overrides: Partial<ApiConfig> = {}): ApiConfig => ({
	baseUrl: 'http://localhost:5890/v1',
	apiKey: 'test-key',
	requestMethod: 'chat',
	backendMode: 'native',
	toolTransport: 'local',
	...overrides,
});

const createTool = (name = 'terminal-execute'): MCPTool => ({
	type: 'function',
	function: {
		name,
		description: 'Run a command',
		parameters: {
			type: 'object',
			properties: {
				command: {type: 'string'},
			},
		},
	},
});

for (const requestMethod of ['responses', 'anthropic', 'gemini'] as const) {
	test(`buildAcpStreamRequestContext routes VCP ${requestMethod} through chat`, t => {
		const tool = createTool();
		const context = buildAcpStreamRequestContext({
			config: createConfig({
				backendMode: 'vcp',
				requestMethod,
				toolTransport: 'hybrid',
			}),
			model: 'claude-sonnet-4-20250514',
			messages: [{role: 'user', content: 'hello'}],
			tools: [tool],
		});

		t.true(context.resolvedRequest.enabled);
		t.is(context.resolvedRequest.requestMethod, 'chat');
		t.is(context.resolvedRequest.tools?.[0]?.function.name, tool.function.name);
	});
}

test('buildAcpStreamRequestContext keeps native request method unchanged', t => {
	const messages: ChatMessage[] = [
		{role: 'user', content: '继续 {{VCP::Time}}'},
	];
	const context = buildAcpStreamRequestContext({
		config: createConfig({
			backendMode: 'native',
			requestMethod: 'responses',
		}),
		model: 'gpt-5',
		messages,
		tools: [],
	});

	t.false(context.resolvedRequest.enabled);
	t.is(context.resolvedRequest.requestMethod, 'responses');
	t.is(context.transformedMessages, messages);
});

test('buildAcpStreamRequestContext applies VCP outbound transforms after request resolution', t => {
	const messages: ChatMessage[] = [
		{role: 'user', content: '昨天查过日志'},
		{role: 'assistant', content: '已记录。'},
		{role: 'user', content: '继续 {{VCP::Time}} 检索'},
	];
	const context = buildAcpStreamRequestContext({
		config: createConfig({
			backendMode: 'vcp',
			requestMethod: 'responses',
			enableVcpTimeBridge: true,
		}),
		model: 'gpt-5',
		messages,
		tools: [],
	});
	const lastMessage = context.transformedMessages.at(-1);

	t.is(context.resolvedRequest.requestMethod, 'chat');
	t.not(context.transformedMessages, messages);
	t.true(String(lastMessage?.content).includes('补充时间上下文'));
	t.false(String(messages.at(-1)?.content).includes('补充时间上下文'));
});

test('createAcpVcpDisplaySanitizer suppresses VCP protocol display shells', t => {
	const sanitizer = createAcpVcpDisplaySanitizer();
	const output =
		[
			'前文\n<<<[TOOL_',
			'REQUEST]>>>\ntool_name:「始」LightMemo「末」\n',
			'<<<[END_TOOL_REQUEST]>>>\n后文\n<<<DailyNoteStart>>>\n',
			'Maid: Nova\nDate: 2026-03-21\nContent: hidden\n',
			'<<<DailyNoteEnd>>>\n结尾',
		]
			.map(chunk => sanitizer.push(chunk))
			.join('') + sanitizer.flush();

	t.true(output.includes('前文'));
	t.true(output.includes('后文'));
	t.true(output.includes('结尾'));
	t.false(output.includes('TOOL_REQUEST'));
	t.false(output.includes('DailyNote'));
	t.false(output.includes('LightMemo'));
	t.false(output.includes('hidden'));
});

test('createAcpVcpDisplaySanitizer streams safe text chunks without waiting for newlines', t => {
	const sanitizer = createAcpVcpDisplaySanitizer();

	t.is(sanitizer.push('Hel'), 'Hel');
	t.is(sanitizer.push('lo '), 'lo ');
	t.is(sanitizer.push('world'), 'world');
	t.is(sanitizer.flush(), '');
});

test('createAcpVcpDisplaySanitizer holds split protocol marker prefixes while streaming text', t => {
	const sanitizer = createAcpVcpDisplaySanitizer();
	const chunks = [
		sanitizer.push('Visible <<<[TOOL_'),
		sanitizer.push('REQUEST]>>>hidden payload'),
		sanitizer.push('\n<<<[END_TOOL_REQUEST]>>>\nDone'),
		sanitizer.flush(),
	];
	const output = chunks.join('');

	t.is(chunks[0], 'Visible ');
	t.is(chunks[1], '');
	t.true(output.includes('Visible '));
	t.true(output.includes('Done'));
	t.false(output.includes('TOOL_REQUEST'));
	t.false(output.includes('hidden payload'));
});

test('createAcpVcpDisplaySanitizer suppresses inline protocol blocks without dropping suffix text', t => {
	const sanitizer = createAcpVcpDisplaySanitizer();
	const output = sanitizer.push(
		'A <<<[TOOL_REQUEST]>>>secret<<<[END_TOOL_REQUEST]>>> B',
	);

	t.is(output, 'A  B');
	t.is(sanitizer.flush(), '');
});

test('createAcpVcpDisplaySanitizer suppresses protocol blocks after visible inline prefixes', t => {
	const sanitizer = createAcpVcpDisplaySanitizer();
	const output =
		sanitizer.push(
			'Visible <<<[TOOL_REQUEST]>>>hidden\n<<<[END_TOOL_REQUEST]>>>\nDone',
		) + sanitizer.flush();

	t.true(output.includes('Visible '));
	t.true(output.includes('Done'));
	t.false(output.includes('TOOL_REQUEST'));
	t.false(output.includes('hidden'));
});

test('createAcpVcpDisplaySanitizer releases false positive marker prefixes', t => {
	const sanitizer = createAcpVcpDisplaySanitizer();

	t.is(sanitizer.push('Visible <<<[TOOL_'), 'Visible ');
	t.is(sanitizer.push('abc'), '<<<[TOOL_abc');
	t.is(sanitizer.flush(), '');
});

test('createAcpVcpDisplaySanitizer drops dangling protocol marker prefixes on flush', t => {
	const sanitizer = createAcpVcpDisplaySanitizer();

	t.is(sanitizer.push('Visible <<<[TOOL_'), 'Visible ');
	t.is(sanitizer.flush(), '');
});

test('createAcpVcpDisplaySanitizer holds whitespace-only marker prefixes', t => {
	const sanitizer = createAcpVcpDisplaySanitizer();

	t.is(sanitizer.push('   <<<[TOOL_'), '');
	t.is(sanitizer.flush(), '');
});
