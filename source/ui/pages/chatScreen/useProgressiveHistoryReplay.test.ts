import anyTest from 'ava';
import React from 'react';
import {Text} from 'ink';
import {render} from 'ink-testing-library';

import type {Message} from '../../components/chat/MessageList.js';
import {
	advanceProgressiveReplayStart,
	getInitialProgressiveReplayStart,
	shouldResetProgressiveReplay,
	useProgressiveHistoryReplay,
} from './useProgressiveHistoryReplay.js';

const test = anyTest as any;

function buildMessage(id: string): Message {
	return {
		role: 'assistant',
		content: id,
	};
}

function ReplayProbe({messages}: {messages: Message[]}) {
	const {hiddenMessageCount} = useProgressiveHistoryReplay(messages);
	return React.createElement(Text, null, String(hiddenMessageCount));
}

test('progressive replay stays disabled for short histories', (t: any) => {
	t.is(
		getInitialProgressiveReplayStart(80, {
			threshold: 120,
			initialVisibleCount: 60,
		}),
		0,
	);
});

test('progressive replay starts from the newest visible window for long histories', (t: any) => {
	t.is(
		getInitialProgressiveReplayStart(180, {
			threshold: 120,
			initialVisibleCount: 60,
		}),
		120,
	);
	t.is(
		advanceProgressiveReplayStart(120, {
			batchSize: 40,
		}),
		80,
	);
});

test('progressive replay resets only when the loaded history is replaced', (t: any) => {
	const first = buildMessage('first');
	const second = buildMessage('second');
	const appended = buildMessage('third');

	t.false(shouldResetProgressiveReplay([first, second], [first, second, appended]));
	t.true(
		shouldResetProgressiveReplay(
			[first, second],
			[buildMessage('fresh-first'), buildMessage('fresh-second')],
		),
	);
	t.true(shouldResetProgressiveReplay([first, second], [first]));
});

test.serial(
	'progressive replay continues advancing across parent rerenders with default options',
	async (t: any) => {
		const messages = Array.from({length: 130}, (_, index) =>
			buildMessage(`message-${index}`),
		);
		const view = render(React.createElement(ReplayProbe, {messages}));

		try {
			t.is(view.lastFrame(), '70');

			for (let index = 0; index < 4; index += 1) {
				await new Promise(resolve => {
					setTimeout(resolve, 5);
				});
				view.rerender(React.createElement(ReplayProbe, {messages}));
			}
			await new Promise(resolve => {
				setTimeout(resolve, 5);
			});

			t.true(Number(view.lastFrame()) < 70);
		} finally {
			view.unmount();
		}
	},
);
