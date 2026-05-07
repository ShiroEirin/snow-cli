import test from 'ava';
import {executeLocalToolCall, isLocalToolService} from './localExecutor.js';

test('isLocalToolService matches Snow local service boundaries', t => {
	t.true(isLocalToolService('filesystem'));
	t.true(isLocalToolService('skill'));
	t.true(isLocalToolService('team'));
	t.false(isLocalToolService('snowbridge'));
	t.false(isLocalToolService('custom-mcp'));
});

test('executeLocalToolCall validates scheduler args before touching runtime state', async t => {
	const result = await executeLocalToolCall({
		serviceName: 'scheduler',
		actualToolName: 'schedule_task',
		toolName: 'scheduler-schedule_task',
		args: {
			duration: 0,
			description: 'invalid',
		},
		getTodoService: () => {
			throw new Error('todo service should not be requested');
		},
	});

	t.true(result.isError);
	t.regex(result.content[0].text, /duration/i);
});
