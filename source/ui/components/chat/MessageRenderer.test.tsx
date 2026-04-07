import test from 'ava';
import React from 'react';
import {cleanup, render} from 'ink-testing-library';

import {I18nProvider} from '../../../i18n/I18nContext.js';
import {ThemeContext} from '../../contexts/ThemeContext.js';
import {themes} from '../../themes/index.js';
import type {Message} from './MessageList.js';
import MessageRenderer from './MessageRenderer.js';

test.afterEach.always(() => {
	cleanup();
});

function renderMessage(
	message: Message,
	props: Partial<React.ComponentProps<typeof MessageRenderer>> = {},
) {
	const instance = render(
		<I18nProvider defaultLanguage="en">
			<ThemeContext.Provider
				value={{
					theme: themes.dark,
					themeType: 'dark',
					diffOpacity: 1,
					setThemeType: () => {},
					setDiffOpacity: () => {},
				}}
			>
				<MessageRenderer
					message={message}
					index={0}
					filteredMessages={[message]}
					terminalWidth={80}
					{...props}
				/>
			</ThemeContext.Provider>
		</I18nProvider>,
	);

	Object.assign(instance.stdin, {
		ref() {},
		unref() {},
	});

	return instance;
}

test('MessageRenderer supports collapsed and expanded structured thinking panels', t => {
	const message: Message = {
		role: 'assistant',
		content: 'Answer body',
		thinking: 'First private line\nSecond private line',
	};

	const expandedView = renderMessage(message, {
		showThinking: true,
		thinkingPanelExpanded: true,
	});
	const expandedFrame = expandedView.lastFrame() ?? '';

	t.true(expandedFrame.includes('▼ Thinking'));
	t.true(expandedFrame.includes('First private line'));
	t.true(expandedFrame.includes('Second private line'));
	expandedView.unmount();

	const collapsedView = renderMessage(message, {
		showThinking: true,
		thinkingPanelExpanded: false,
	});
	const collapsedFrame = collapsedView.lastFrame() ?? '';

	t.true(collapsedFrame.includes('▶ Thinking'));
	t.true(collapsedFrame.includes('First private line'));
	t.false(collapsedFrame.includes('Second private line'));
});

test('MessageRenderer keeps showThinking=false semantics for structured thinking sidebands', t => {
	const message: Message = {
		role: 'assistant',
		content: 'Visible answer',
		thinking: 'Hidden reasoning',
	};

	const view = renderMessage(message, {
		showThinking: false,
		thinkingPanelExpanded: true,
	});
	const frame = view.lastFrame() ?? '';

	t.true(frame.includes('Visible answer'));
	t.false(frame.includes('Thinking'));
	t.false(frame.includes('Hidden reasoning'));
});

test('MessageRenderer folds tool sidebands without breaking structured tool previews', t => {
	const message: Message = {
		role: 'assistant',
		content: '✓ filesystem-read',
		messageStatus: 'success',
		toolName: 'filesystem-read',
		toolResult: JSON.stringify({
			summary: 'Preview summary',
			itemCount: 2,
			status: 'success',
			topItems: ['src/a.ts'],
		}),
		toolResultPreview: JSON.stringify({
			summary: 'Preview summary',
			itemCount: 2,
			status: 'success',
			topItems: ['src/a.ts'],
		}),
		toolStatusDetail: '✓ filesystem-read\n├─ lines 1-5',
	};

	const expandedView = renderMessage(message, {
		toolPanelExpanded: true,
	});
	const expandedFrame = expandedView.lastFrame() ?? '';

	t.true(expandedFrame.includes('▼ ✓ filesystem-read'));
	t.true(expandedFrame.includes('Preview summary'));
	t.true(expandedFrame.includes('items: 2'));
	expandedView.unmount();

	const collapsedView = renderMessage(message, {
		toolPanelExpanded: false,
	});
	const collapsedFrame = collapsedView.lastFrame() ?? '';

	t.true(collapsedFrame.includes('▶ ✓ filesystem-read'));
	t.false(collapsedFrame.includes('items: 2'));
});
