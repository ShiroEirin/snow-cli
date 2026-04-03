import test from 'ava';

import {
	isToolNeedTwoStepDisplay,
	isToolOnlyShowCompleted,
} from './toolDisplayConfig.js';

test('vcp bridge tools use two-step display by default', t => {
	t.true(isToolNeedTwoStepDisplay('vcp-fileoperator-readfile'));
	t.false(isToolOnlyShowCompleted('vcp-fileoperator-readfile'));
});

test('non-vcp quick tools keep single-step display semantics', t => {
	t.false(isToolNeedTwoStepDisplay('filesystem-read'));
	t.true(isToolOnlyShowCompleted('filesystem-read'));
});
