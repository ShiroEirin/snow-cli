import test from 'ava';

import {formatTodoContext} from './todoPreprocessor.js';

test('omits completed TODO items from rendered context', t => {
	const context = formatTodoContext([
		{id: 'todo-1', content: 'done task', status: 'completed'},
		{id: 'todo-2', content: 'active task', status: 'pending'},
	]);

	t.false(context.includes('done task'));
	t.true(context.includes('active task'));
});

test('returns empty string when all TODO items are completed', t => {
	const context = formatTodoContext([
		{id: 'todo-1', content: 'done task', status: 'completed'},
	]);

	t.is(context, '');
});
