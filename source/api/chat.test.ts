import anyTest from 'ava';

const test = anyTest as any;

import {mergeStreamingToolCallField} from './chat.js';

test('append standard tool name deltas', (t: any) => {
	const merged = mergeStreamingToolCallField('filesystem-', 'read');

	t.deepEqual(merged, {
		value: 'filesystem-read',
		delta: 'read',
	});
});

test('deduplicate repeated full tool name fragments', (t: any) => {
	const merged = mergeStreamingToolCallField(
		'filesystem-read',
		'filesystem-read',
	);

	t.deepEqual(merged, {
		value: 'filesystem-read',
		delta: '',
	});
});

test('promote resent full tool name over partial prefix', (t: any) => {
	const merged = mergeStreamingToolCallField(
		'filesystem-',
		'filesystem-read',
	);

	t.deepEqual(merged, {
		value: 'filesystem-read',
		delta: 'read',
	});
});

test('deduplicate repeated full tool arguments payloads', (t: any) => {
	const merged = mergeStreamingToolCallField(
		'{"filePath":"D:/repo/.helloagents/INDEX.md"}',
		'{"filePath":"D:/repo/.helloagents/INDEX.md"}',
	);

	t.deepEqual(merged, {
		value: '{"filePath":"D:/repo/.helloagents/INDEX.md"}',
		delta: '',
	});
});

test('promote resent full tool arguments over partial json prefix', (t: any) => {
	const merged = mergeStreamingToolCallField(
		'{"filePath":"D:/repo/.helloagents/',
		'{"filePath":"D:/repo/.helloagents/INDEX.md"}',
	);

	t.deepEqual(merged, {
		value: '{"filePath":"D:/repo/.helloagents/INDEX.md"}',
		delta: 'INDEX.md"}',
	});
});
