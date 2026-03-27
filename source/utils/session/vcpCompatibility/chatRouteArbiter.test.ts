import anyTest from 'ava';

const test = anyTest as any;

import {
	resolveChatRouteRequestMethod,
	resolveModelFetchRouteMethod,
} from './chatRouteArbiter.js';

test('keep configured request method in vcp mode', (t: any) => {
	t.is(
		resolveChatRouteRequestMethod({
			backendMode: 'vcp',
			requestMethod: 'anthropic',
		}),
		'anthropic',
	);
	t.is(
		resolveModelFetchRouteMethod({
			backendMode: 'vcp',
			requestMethod: 'gemini',
		}),
		'gemini',
	);
});

test('preserve native request method outside vcp mode', (t: any) => {
	t.is(
		resolveChatRouteRequestMethod({
			backendMode: 'native',
			requestMethod: 'responses',
		}),
		'responses',
	);
	t.is(resolveModelFetchRouteMethod({requestMethod: 'anthropic'}), 'anthropic');
});
