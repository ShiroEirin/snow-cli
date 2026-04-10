import test from 'ava';
import React from 'react';
import {cleanup, render} from 'ink-testing-library';

import {I18nProvider} from '../../../i18n/I18nContext.js';
import {ThemeProvider} from '../../contexts/ThemeContext.js';
import FileRollbackConfirmation, {
	resolveCompactRollbackSelection,
} from './FileRollbackConfirmation.js';

test.afterEach.always(() => {
	cleanup();
});

function renderConfirmation(
	props: Partial<React.ComponentProps<typeof FileRollbackConfirmation>> = {},
) {
	const instance = render(
		<I18nProvider defaultLanguage="en">
			<ThemeProvider>
				<FileRollbackConfirmation
					fileCount={1}
					filePaths={['src/example.ts']}
					terminalWidth={80}
					onConfirm={() => {}}
					{...props}
				/>
			</ThemeProvider>
		</I18nProvider>,
	);

	Object.assign(instance.stdin, {
		ref() {},
		unref() {},
	});

	return instance;
}

test('FileRollbackConfirmation does not throw in ultra narrow terminals', t => {
	t.notThrows(() => {
		const instance = renderConfirmation({terminalWidth: 3});
		t.truthy(instance.lastFrame());
		instance.unmount();
	});
});

test('FileRollbackConfirmation no-files state only keeps conversation and team cleanup hints visible', t => {
	const instance = renderConfirmation({
		fileCount: 0,
		filePaths: [],
		notebookCount: 2,
		teamCount: 3,
	});

	const frame = instance.lastFrame() ?? '';
	t.true(
		frame.includes('No file changes detected. Rollback conversation only?'),
	);
	t.false(frame.includes('2 notebook(s) will also be rolled back'));
	t.true(
		frame.includes(
			'3 team member(s) will be terminated and worktrees cleaned up',
		),
	);
	t.false(frame.includes('Rollback conversation + files'));
});

test('resolveCompactRollbackSelection keeps no-files Enter behavior aligned with the prompt', t => {
	t.deepEqual(resolveCompactRollbackSelection(false, 'both', [], 0), [
		'conversation',
	]);
});
