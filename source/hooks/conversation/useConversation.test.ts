import test from 'ava';

async function loadUseConversationModule() {
	return import('./useConversation.js');
}

test('normal assistant path sanitizes stray think closing tag before display and save', async t => {
	const {buildSanitizedFinalAssistantTurn} = await loadUseConversationModule();
	const result = buildSanitizedFinalAssistantTurn(
		{
			streamedContent:
				'让我先确认普通 assistant 链路。</think>最终只保留这句。',
			receivedReasoning: undefined,
			receivedThinking: undefined,
			receivedReasoningContent: undefined,
			hasStreamedLines: false,
		},
		false,
	);

	t.is(result.assistantContent, '最终只保留这句。');
	t.is(result.finalAssistantMessage?.content, '最终只保留这句。');
	t.is(result.assistantMessage?.content, '最终只保留这句。');
});

test('normal assistant path replaces streamed fragments with sanitized final display', async t => {
	const {buildSanitizedFinalAssistantTurn, mergeFinalAssistantDisplayMessage} =
		await loadUseConversationModule();
	const result = buildSanitizedFinalAssistantTurn(
		{
			streamedContent: `继续检索
<<<[TOOL_REQUEST]>>>
tool_name:「始」LightMemo「末」
<<<[END_TOOL_REQUEST]>>>
最终结果`,
			receivedReasoning: undefined,
			receivedThinking: undefined,
			receivedReasoningContent: undefined,
			hasStreamedLines: true,
		},
		false,
	);

	const mergedMessages = mergeFinalAssistantDisplayMessage(
		[
			{
				role: 'assistant',
				content: '<<<[TOOL_REQUEST]>>>',
				streamingLine: true,
			},
			{
				role: 'assistant',
				content: '保留的旧消息',
			},
		],
		result.finalAssistantMessage!,
		true,
	);

	t.deepEqual(mergedMessages, [
		{
			role: 'assistant',
			content: '保留的旧消息',
		},
		{
			role: 'assistant',
			content: '继续检索\n最终结果',
			streaming: false,
			discontinued: false,
			thinking: undefined,
		},
	]);
});

test('normal assistant path strips VCP display shell before display and save', async t => {
	const {buildSanitizedFinalAssistantTurn} = await loadUseConversationModule();
	const result = buildSanitizedFinalAssistantTurn(
		{
			streamedContent: `继续检索
<<<[TOOL_REQUEST]>>>
tool_name:「始」LightMemo「末」
<<<[END_TOOL_REQUEST]>>>
最终结果`,
			receivedReasoning: undefined,
			receivedThinking: undefined,
			receivedReasoningContent: undefined,
			hasStreamedLines: false,
		},
		false,
	);

	t.is(result.assistantContent, '继续检索\n最终结果');
	t.is(result.finalAssistantMessage?.content, '继续检索\n最终结果');
	t.is(result.assistantMessage?.content, '继续检索\n最终结果');
});
