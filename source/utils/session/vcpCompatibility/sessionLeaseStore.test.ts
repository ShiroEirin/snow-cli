import anyTest from 'ava';

const test = anyTest as any;

import {SessionLeaseStore} from './sessionLeaseStore.js';

test('session lease store resolves direct resources and session aliases', (t: any) => {
	let now = 1_000;
	const store = new SessionLeaseStore<Map<string, string>>({
		defaultKey: '__default__',
		ttlMs: 10_000,
		sweepIntervalMs: 0,
		now: () => now,
	});

	const resource = new Map([['tool-a', 'binding-a']]);
	store.rotateSession({
		sessionKey: 'chat-session',
		nextResourceKey: 'plane-a',
		value: resource,
	});

	t.is(store.getResource('plane-a')?.get('tool-a'), 'binding-a');
	t.is(store.getResource('chat-session')?.get('tool-a'), 'binding-a');

	now += 100;
	t.is(store.getResource('chat-session')?.get('tool-a'), 'binding-a');

	store.dispose();
});

test('session lease store clears stale session aliases when resource is removed', (t: any) => {
	const store = new SessionLeaseStore<Map<string, string>>({
		defaultKey: '__default__',
		ttlMs: 10_000,
		sweepIntervalMs: 0,
	});

	store.rotateSession({
		sessionKey: 'chat-session',
		nextResourceKey: 'plane-a',
		value: new Map([['tool-a', 'binding-a']]),
	});

	store.clearResource('plane-a');

	t.is(store.getResource('plane-a'), undefined);
	t.is(store.getResource('chat-session'), undefined);

	store.dispose();
});

test('session lease store expires idle resources and aliases together', (t: any) => {
	let now = 5_000;
	const store = new SessionLeaseStore<Map<string, string>>({
		defaultKey: '__default__',
		ttlMs: 1_000,
		sweepIntervalMs: 0,
		now: () => now,
	});

	store.rotateSession({
		sessionKey: 'chat-session',
		nextResourceKey: 'plane-a',
		value: new Map([['tool-a', 'binding-a']]),
	});

	t.is(store.getResource('chat-session')?.get('tool-a'), 'binding-a');

	now += 1_500;
	store.sweepExpired();

	t.is(store.getResource('plane-a'), undefined);
	t.is(store.getResource('chat-session'), undefined);

	store.dispose();
});
