import test from 'ava';
import {CompressionCoordinator} from './compressionCoordinator.js';

const flushMicrotasks = async (): Promise<void> => Promise.resolve();

test('same id reentry keeps the lock until the final release', async t => {
	const coordinator = new CompressionCoordinator();

	await coordinator.acquireLock('main');
	await coordinator.acquireLock('main');

	let unlocked = false;
	const waitForUnlock = coordinator.waitUntilFree().then(() => {
		unlocked = true;
	});

	await flushMicrotasks();
	t.false(unlocked);
	t.true(coordinator.isCompressing());
	t.false(coordinator.isCompressing('main'));

	coordinator.releaseLock('main');
	await flushMicrotasks();
	t.false(unlocked);
	t.true(coordinator.isCompressing());

	coordinator.releaseLock('main');
	await waitForUnlock;
	t.true(unlocked);
	t.false(coordinator.isCompressing());
});

test('different ids cannot both acquire the initial lock concurrently', async t => {
	const coordinator = new CompressionCoordinator();
	const acquired: string[] = [];

	const firstAcquire = coordinator.acquireLock('first').then(() => {
		acquired.push('first');
	});
	const secondAcquire = coordinator.acquireLock('second').then(() => {
		acquired.push('second');
	});

	await flushMicrotasks();
	t.is(acquired.length, 1);

	const activeId = acquired[0];
	if (activeId === undefined) {
		t.fail('expected one acquisition to resolve');
		return;
	}

	const waitingId = activeId === 'first' ? 'second' : 'first';
	t.true(coordinator.isCompressing());
	t.false(coordinator.isCompressing(activeId));
	t.true(coordinator.isCompressing(waitingId));

	coordinator.releaseLock(activeId);
	await Promise.all([firstAcquire, secondAcquire]);
	t.deepEqual(acquired, [activeId, waitingId]);
	t.true(coordinator.isCompressing(activeId));
	t.false(coordinator.isCompressing(waitingId));

	coordinator.releaseLock(waitingId);
	t.false(coordinator.isCompressing());
});

test('waitUntilFree still ignores the active excluded id during reentry', async t => {
	const coordinator = new CompressionCoordinator();

	await coordinator.acquireLock('main');
	await coordinator.acquireLock('main');

	await t.notThrowsAsync(coordinator.waitUntilFree('main'));
	t.false(coordinator.isCompressing('main'));
	t.true(coordinator.isCompressing());

	let otherUnlocked = false;
	const waitForOther = coordinator.waitUntilFree('other').then(() => {
		otherUnlocked = true;
	});

	await flushMicrotasks();
	t.false(otherUnlocked);

	coordinator.releaseLock('main');
	await flushMicrotasks();
	t.false(otherUnlocked);

	coordinator.releaseLock('main');
	await waitForOther;
	t.true(otherUnlocked);
	t.false(coordinator.isCompressing('other'));
});
