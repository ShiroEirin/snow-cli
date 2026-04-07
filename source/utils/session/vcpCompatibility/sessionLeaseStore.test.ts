import anyTest from 'ava';

const test = anyTest as any;

import {
	disposeAllSessionLeaseStores,
	SessionLeaseStore,
} from './sessionLeaseStore.js';

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

test('session lease store does not full-sweep on hot getResource reads before interval', (t: any) => {
	let now = 10_000;
	const store = new SessionLeaseStore<Map<string, string>>({
		defaultKey: '__default__',
		ttlMs: 10_000,
		sweepIntervalMs: 5_000,
		now: () => now,
	}) as any;
	let sweepCount = 0;
	const originalSweepExpired = store.sweepExpired.bind(store);

	store.sweepExpired = () => {
		sweepCount += 1;
		return originalSweepExpired();
	};

	store.rotateSession({
		sessionKey: 'chat-session',
		nextResourceKey: 'plane-a',
		value: new Map([['tool-a', 'binding-a']]),
	});

	sweepCount = 0;
	t.is(store.getResource('chat-session')?.get('tool-a'), 'binding-a');
	t.is(store.getResource('plane-a')?.get('tool-a'), 'binding-a');
	t.is(sweepCount, 0);

	now += 5_001;
	t.is(store.getResource('chat-session')?.get('tool-a'), 'binding-a');
	t.is(sweepCount, 1);

	store.dispose();
});

test('disposeAllSessionLeaseStores clears active stores for process lifecycle cleanup', (t: any) => {
	const storeA = new SessionLeaseStore<Map<string, string>>({
		defaultKey: '__default__',
		ttlMs: 10_000,
		sweepIntervalMs: 0,
	});
	const storeB = new SessionLeaseStore<Map<string, string>>({
		defaultKey: '__default__',
		ttlMs: 10_000,
		sweepIntervalMs: 0,
	});

	storeA.rotateSession({
		sessionKey: 'session-a',
		nextResourceKey: 'plane-a',
		value: new Map([['tool-a', 'binding-a']]),
	});
	storeB.rotateSession({
		sessionKey: 'session-b',
		nextResourceKey: 'plane-b',
		value: new Map([['tool-b', 'binding-b']]),
	});

	disposeAllSessionLeaseStores();

	t.is(storeA.getResource('session-a'), undefined);
	t.is(storeB.getResource('session-b'), undefined);
});
