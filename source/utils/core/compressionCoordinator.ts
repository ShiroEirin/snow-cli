/**
 * CompressionCoordinator
 *
 * Cooperative lock that prevents race conditions when auto-compression
 * runs concurrently with teammate / sub-agent loops.
 *
 * When any participant acquires the lock, others that call
 * `waitUntilFree()` will be parked on a promise until the lock holder
 * releases it. Multiple independent compressors can coexist by using
 * the `excludeId` parameter.
 */

type Waiter = {
	resolve: () => void;
	excludeId?: string;
};

type PendingAcquisition = {
	id: string;
	resolve: () => void;
};

export class CompressionCoordinator {
	private readonly compressing = new Map<string, number>();
	private waiters: Waiter[] = [];
	private readonly pendingAcquisitions: PendingAcquisition[] = [];

	async acquireLock(id: string): Promise<void> {
		const currentCount = this.compressing.get(id);
		if (currentCount !== undefined) {
			this.compressing.set(id, currentCount + 1);
			return;
		}

		if (this.compressing.size === 0 && this.pendingAcquisitions.length === 0) {
			this.compressing.set(id, 1);
			return;
		}

		await new Promise<void>(resolve => {
			this.pendingAcquisitions.push({id, resolve});
		});
	}

	releaseLock(id: string): void {
		const currentCount = this.compressing.get(id);
		if (currentCount === undefined) {
			return;
		}

		if (currentCount > 1) {
			this.compressing.set(id, currentCount - 1);
			return;
		}

		this.compressing.delete(id);
		this.promoteNextAcquisition();
		this.drainWaiters();
	}

	isCompressing(excludeId?: string): boolean {
		if (excludeId === undefined) {
			return this.compressing.size > 0;
		}

		for (const id of this.compressing.keys()) {
			if (id !== excludeId) {
				return true;
			}
		}

		return false;
	}

	waitUntilFree(excludeId?: string): Promise<void> {
		if (!this.isCompressing(excludeId)) {
			return Promise.resolve();
		}

		return new Promise<void>(resolve => {
			this.waiters.push({resolve, excludeId});
		});
	}

	private promoteNextAcquisition(): void {
		if (this.compressing.size > 0 || this.pendingAcquisitions.length === 0) {
			return;
		}

		const nextAcquisition = this.pendingAcquisitions[0];
		if (nextAcquisition === undefined) {
			return;
		}

		const nextId = nextAcquisition.id;
		const ready: Array<() => void> = [];
		let acquiredCount = 0;

		for (let index = 0; index < this.pendingAcquisitions.length;) {
			const pending = this.pendingAcquisitions[index];
			if (pending === undefined) {
				break;
			}

			if (pending.id === nextId) {
				this.pendingAcquisitions.splice(index, 1);
				ready.push(pending.resolve);
				acquiredCount++;
				continue;
			}

			index++;
		}

		this.compressing.set(nextId, acquiredCount);
		for (const resolve of ready) {
			resolve();
		}
	}

	private drainWaiters(): void {
		const pending: Waiter[] = [];

		for (const waiter of this.waiters) {
			if (!this.isCompressing(waiter.excludeId)) {
				waiter.resolve();
			} else {
				pending.push(waiter);
			}
		}

		this.waiters = pending;
	}
}

export const compressionCoordinator = new CompressionCoordinator();
