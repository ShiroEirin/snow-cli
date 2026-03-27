import test from 'ava';

import {
	containsVcpDisplayBlocks,
	formatVcpContentForTranscript,
	formatVcpThoughtChainSummaryLabel,
	getVcpStreamingSuppressionDecision,
	parseVcpDisplayBlocks,
	stripVcpDisplayBlocks,
} from './display.js';

test('detect VCP display blocks with fast path while preserving plain text fallback', t => {
	t.true(
		containsVcpDisplayBlocks(
			'[--- VCP元思考链 ---]\n内容\n[--- 元思考链结束 ---]',
		),
	);
	t.true(
		containsVcpDisplayBlocks(
			'<<<[TOOL_REQUEST]>>>\ntool_name:「始」LightMemo「末」\n<<<[END_TOOL_REQUEST]>>>',
		),
	);
	t.true(
		containsVcpDisplayBlocks(
			'<<<TOOL_REQUEST>>>\ntool_name:「始」LightMemo「末」\n<<<END_TOOL_REQUEST>>>',
		),
	);
	t.false(containsVcpDisplayBlocks('普通正文，没有特殊块'));
});

test('parse VCP display blocks and preserve plain text order', t => {
	const input = `正文 A
<<<[ROLE_DIVIDE_USER]>>>
[[VCP调用结果信息汇总:
- 工具名称: LightMemo
- 执行状态: ✅ SUCCESS
- 返回内容: 找到了 3 条记录
VCP调用结果结束]]
<<<[END_ROLE_DIVIDE_USER]>>>
<<<[TOOL_REQUEST]>>>
tool_name:「始」LightMemo「末」,
query:「始」昨天的记录[@tag]「末」
<<<[END_TOOL_REQUEST]>>>
[--- VCP元思考链: "日记推理" ---]
先检查时间锚点
[--- 元思考链结束 ---]
<<<DailyNoteStart>>>
Maid: Nova
Date: 2026.03.21
Content: 记录了今天的兼容测试
<<<DailyNoteEnd>>>
正文 B`;

	const result = parseVcpDisplayBlocks(input);

	t.is(result.blocks.length, 6);
	t.true(result.mainText.includes('正文 A'));
	t.true(result.mainText.includes('正文 B'));

	const toolResult = result.blocks.find(block => block.type === 'toolResult');
	t.truthy(toolResult);
	if (toolResult?.type === 'toolResult') {
		t.is(toolResult.toolName, 'LightMemo');
		t.is(toolResult.status, 'success');
		t.true(toolResult.content.includes('找到了 3 条记录'));
	}

	const toolRequest = result.blocks.find(block => block.type === 'toolRequest');
	t.truthy(toolRequest);
	if (toolRequest?.type === 'toolRequest') {
		t.is(toolRequest.toolName, 'LightMemo');
		t.deepEqual(
			toolRequest.fields.map(field => field.key),
			['tool_name', 'query'],
		);
		t.true(toolRequest.fields[1]?.value.includes('[@tag]'));
	}

	const dailyNote = result.blocks.find(block => block.type === 'dailyNote');
	t.truthy(dailyNote);
	if (dailyNote?.type === 'dailyNote') {
		t.is(dailyNote.maid, 'Nova');
		t.is(dailyNote.date, '2026.03.21');
	}
});

test('parse VCP thought chain block and keep surrounding text', t => {
	const input = `检索结果如下：
[--- VCP元思考链: "日记推理" ---]
先回忆昨天的上下文
再决定是否继续检索
[--- 元思考链结束 ---]
最终标签是 [@tag] 和 [@!hard-tag]`;

	const result = parseVcpDisplayBlocks(input);
	const thoughtChain = result.blocks.find(
		block => block.type === 'thoughtChain',
	);

	t.truthy(thoughtChain);
	if (thoughtChain?.type === 'thoughtChain') {
		t.is(thoughtChain.title, '日记推理');
		t.is(thoughtChain.lineCount, 2);
		t.is(
			formatVcpThoughtChainSummaryLabel(thoughtChain),
			'[VCP元思考链：日记推理 已折叠，共 2 行]',
		);
	}

	t.true(result.mainText.includes('检索结果如下：'));
	t.true(result.mainText.includes('[@tag]'));
	t.true(result.mainText.includes('[@!hard-tag]'));
});

test('format transcript keeps useful VCP summaries and removes role divider noise', t => {
	const input = `继续检索
<<<[ROLE_DIVIDE_USER]>>>
[[VCP调用结果信息汇总:
- 工具名称: LightMemo
- 执行状态: ❌ ERROR
- 返回内容: 未找到匹配内容
VCP调用结果结束]]
<<<[END_ROLE_DIVIDE_USER]>>>
[--- VCP元思考链 ---]
这里是内部推理
[--- 元思考链结束 ---]`;

	const transcript = formatVcpContentForTranscript(input);

	t.true(transcript.includes('继续检索'));
	t.true(transcript.includes('VCP-ToolResult：LightMemo'));
	t.true(transcript.includes('未找到匹配内容'));
	t.true(transcript.includes('[VCP元思考链 已折叠，共 1 行]'));
	t.false(transcript.includes('ROLE_DIVIDE_USER'));
});

test('format transcript preserves ghost anchors outside blocks and summarizes notes', t => {
	const input = `正文[@tag]
<<<DailyNoteStart>>>
Maid: Nova
Date: 2026.03.21
Content: 这是日记正文
<<<DailyNoteEnd>>>
尾部[@!hard-tag]`;

	const transcript = formatVcpContentForTranscript(input);

	t.true(transcript.includes('正文[@tag]'));
	t.true(transcript.includes('VCP-DailyNote：Nova | 2026.03.21'));
	t.true(transcript.includes('- Content: 这是日记正文'));
	t.true(transcript.includes('尾部[@!hard-tag]'));
});

test('format transcript falls back to raw TOOL_REQUEST content when fields are not delimited', t => {
	const input = `前文
<<<[TOOL_REQUEST]>>>
tool_name=LightMemo
query=昨天的记录[@tag]
<<<[END_TOOL_REQUEST]>>>
后文`;

	const transcript = formatVcpContentForTranscript(input);

	t.true(transcript.includes('VCP-ToolRequest'));
	t.true(transcript.includes('tool_name=LightMemo'));
	t.true(transcript.includes('query=昨天的记录[@tag]'));
	t.true(transcript.includes('后文'));
});

test('format transcript indents multiline TOOL_REQUEST field values', t => {
	const input = `前文
<<<[TOOL_REQUEST]>>>
tool_name:「始」LightMemo「末」,
query:「始」第一行[@tag]
第二行
第三行「末」
<<<[END_TOOL_REQUEST]>>>
后文`;

	const transcript = formatVcpContentForTranscript(input);

	t.true(transcript.includes('- query: 第一行[@tag]\n  第二行\n  第三行'));
	t.false(transcript.includes('- query: 第一行[@tag]\n第二行'));
});

test('parse bracketless TOOL_REQUEST blocks as VCP tool requests', t => {
	const input = `前文
<<<TOOL_REQUEST>>>
tool_name:「始」LightMemo「末」,
query:「始」昨天的记录[@tag]「末」
<<<END_TOOL_REQUEST>>>
后文`;

	const result = parseVcpDisplayBlocks(input);
	const toolRequest = result.blocks.find(block => block.type === 'toolRequest');

	t.truthy(toolRequest);
	if (toolRequest?.type === 'toolRequest') {
		t.is(toolRequest.toolName, 'LightMemo');
		t.is(toolRequest.fields[1]?.value, '昨天的记录[@tag]');
	}
});

test('ignore VCP-looking protocol samples inside fenced code blocks', t => {
	const input = `下面是协议示例：
\`\`\`text
<<<[TOOL_REQUEST]>>>
tool_name:「始」LightMemo「末」
<<<[END_TOOL_REQUEST]>>>
\`\`\`
这里不是实际调用。`;

	const result = parseVcpDisplayBlocks(input);

	t.is(result.blocks.length, 0);
	t.true(result.mainText.includes('<<<[TOOL_REQUEST]>>>'));
	t.true(result.mainText.includes('这里不是实际调用。'));
});

test('parse english TOOL_RESULT fields into transcript summaries', t => {
	const input = `[[VCP调用结果信息汇总:
- Tool Name: LightMemo
- Status: SUCCESS
- Result: found 3 records
VCP调用结果结束]]`;

	const result = parseVcpDisplayBlocks(input);
	const toolResult = result.blocks.find(block => block.type === 'toolResult');

	t.truthy(toolResult);
	if (toolResult?.type === 'toolResult') {
		t.is(toolResult.toolName, 'LightMemo');
		t.is(toolResult.status, 'success');
		t.is(toolResult.statusText, 'SUCCESS');
		t.is(toolResult.content, 'found 3 records');
	}

	const transcript = formatVcpContentForTranscript(input);
	t.true(transcript.includes('VCP-ToolResult：LightMemo'));
	t.true(transcript.includes('- 状态: SUCCESS'));
	t.true(transcript.includes('- 内容: found 3 records'));
});

test('suppress VCP protocol shells during streaming until final render takes over', t => {
	let state = null;

	let decision = getVcpStreamingSuppressionDecision(
		'<<<[TOOL_REQUEST]>>>',
		state,
	);
	t.true(decision.suppress);
	state = decision.nextState;
	t.is(state, 'toolRequest');

	decision = getVcpStreamingSuppressionDecision(
		'tool_name:「始」LightMemo「末」',
		state,
	);
	t.true(decision.suppress);
	state = decision.nextState;
	t.is(state, 'toolRequest');

	decision = getVcpStreamingSuppressionDecision(
		'<<<[END_TOOL_REQUEST]>>>',
		state,
	);
	t.true(decision.suppress);
	t.is(decision.nextState, null);

	decision = getVcpStreamingSuppressionDecision(
		'[[VCP调用结果信息汇总: - 工具名称: LightMemo VCP调用结果结束]]',
		null,
	);
	t.true(decision.suppress);
	t.is(decision.nextState, null);

	decision = getVcpStreamingSuppressionDecision(
		'<<<[ROLE_DIVIDE_USER]>>>',
		null,
	);
	t.true(decision.suppress);
	t.is(decision.nextState, null);
});

test('parse conventional thinking blocks alongside VCP blocks', t => {
	const input = `<thinking>
先检查上下文
</thinking>
[--- VCP元思考链 ---]
再决定是否继续检索
[--- 元思考链结束 ---]`;

	const result = parseVcpDisplayBlocks(input);
	const thoughtBlocks = result.blocks.filter(block => block.type === 'thoughtChain');

	t.is(thoughtBlocks.length, 2);
	t.true(
		thoughtBlocks.some(
			block => block.type === 'thoughtChain' && block.kind === 'conventional',
		),
	);
	t.true(
		thoughtBlocks.some(
			block => block.type === 'thoughtChain' && block.kind === 'vcp',
		),
	);
});

test('strip role divider only payloads into empty plain text', t => {
	const input = `<<<[ROLE_DIVIDE_ASSISTANT]>>>
<<<[END_ROLE_DIVIDE_ASSISTANT]>>>`;

	t.is(stripVcpDisplayBlocks(input), '');
});

test('strip VCP display blocks while keeping conventional text order', t => {
	const input = `A
<think>先想一下</think>
B
[--- VCP元思考链 ---]
第一步
[--- 元思考链结束 ---]
C`;

	t.is(stripVcpDisplayBlocks(input), 'A\n\nB\n\nC');
});
