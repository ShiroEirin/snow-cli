import test from 'ava';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

import {sanitizeAssistantContent} from './assistantContentSanitizer.js';

function readAssistantContentSanitizerSource(): string {
	return readFileSync(
		fileURLToPath(new URL('./assistantContentSanitizer.ts', import.meta.url)),
		'utf8',
	);
}

test('drops leaked thinking prefix before a stray closing tag', t => {
	const input =
		'找到了！Snow CLI 在 `snow-cli` 目录下。让我开始深入审查代码。</think>好的御主！我找到了 Snow CLI。';

	t.is(sanitizeAssistantContent(input), '好的御主！我找到了 Snow CLI。');
});

test('removes orphan closing tag only messages from persisted assistant content', t => {
	t.is(
		sanitizeAssistantContent('让我先确认 Snow CLI 的项目位置。</think>'),
		'',
	);
});

test('strips complete think blocks and preserves visible text order', t => {
	const input = `前文
<thinking>
这里是隐藏思考
</thinking>
后文`;

	t.is(sanitizeAssistantContent(input), '前文\n后文');
});

test('removes VCP display protocol blocks from assistant content', t => {
	const input = `继续检索
<<<[TOOL_REQUEST]>>>
tool_name:「始」LightMemo「末」
<<<[END_TOOL_REQUEST]>>>
最终结果`;

	t.is(sanitizeAssistantContent(input), '继续检索\n最终结果');
});

test('assistantContentSanitizer uses the thin VCP compatibility adapter seam', t => {
	const source = readAssistantContentSanitizerSource();

	t.true(
		source.includes("from '../../../utils/core/vcpCompatibilityAdapter.js'"),
	);
	t.false(
		source.includes(
			"from '../../../utils/session/vcpCompatibility/display.js'",
		),
	);
});
