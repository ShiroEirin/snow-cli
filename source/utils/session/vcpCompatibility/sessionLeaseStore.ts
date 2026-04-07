type LeaseRecord<T> = {
	value: T;
	expiresAt: number;
};

type SessionLinkRecord = {
	resourceKey: string;
	expiresAt: number;
};

export type SessionLeaseStoreOptions = {
	defaultKey: string;
	ttlMs: number;
	sweepIntervalMs: number;
	now?: () => number;
};

const PROCESS_EXIT_EVENTS = ['beforeExit', 'exit', 'SIGINT', 'SIGTERM', 'SIGBREAK'] as const;

export class SessionLeaseStore<T> {
	private static readonly activeStores = new Set<SessionLeaseStore<unknown>>();
	private static processHooksInstalled = false;
	private readonly defaultKey: string;
	private readonly ttlMs: number;
	private readonly sweepIntervalMs: number;
	private readonly now: () => number;
	private readonly resources = new Map<string, LeaseRecord<T>>();
	private readonly sessions = new Map<string, SessionLinkRecord>();
	private readonly sweepTimer: NodeJS.Timeout | null;
	private isDisposed = false;
	private nextSweepAt = Number.POSITIVE_INFINITY;

	constructor(options: SessionLeaseStoreOptions) {
		SessionLeaseStore.installProcessHooks();
		SessionLeaseStore.activeStores.add(this as SessionLeaseStore<unknown>);
		this.defaultKey = options.defaultKey;
		this.ttlMs = options.ttlMs;
		this.sweepIntervalMs = options.sweepIntervalMs;
		this.now = options.now || Date.now;
		this.sweepTimer =
			options.sweepIntervalMs > 0
				? setInterval(() => {
						this.sweepExpired();
				  }, options.sweepIntervalMs)
				: null;
		this.nextSweepAt =
			options.sweepIntervalMs > 0
				? this.now() + options.sweepIntervalMs
				: Number.POSITIVE_INFINITY;

		this.sweepTimer?.unref?.();
	}

	dispose(): void {
		if (this.isDisposed) {
			return;
		}

		this.isDisposed = true;
		SessionLeaseStore.activeStores.delete(this as SessionLeaseStore<unknown>);
		if (this.sweepTimer) {
			clearInterval(this.sweepTimer);
		}

		this.resources.clear();
		this.sessions.clear();
	}

	registerResource(resourceKey: string | undefined, value: T): string {
		this.sweepIfDue();
		const resolvedKey = this.resolveKey(resourceKey);
		this.resources.set(resolvedKey, this.createLeaseRecord(value));
		return resolvedKey;
	}

	rotateSession(options: {
		sessionKey?: string;
		nextResourceKey?: string;
		value: T;
	}): string {
		this.sweepIfDue();
		const resolvedSessionKey = this.resolveKey(options.sessionKey);
		this.clearSession(resolvedSessionKey);

		const resolvedResourceKey = this.registerResource(
			options.nextResourceKey,
			options.value,
		);
		this.sessions.set(
			resolvedSessionKey,
			this.createSessionLinkRecord(resolvedResourceKey),
		);
		return resolvedResourceKey;
	}

	clearResource(resourceKey?: string): void {
		this.sweepIfDue();
		const resolvedResourceKey = this.resolveKey(resourceKey);
		this.deleteResource(resolvedResourceKey);
	}

	clearSession(sessionKey?: string): void {
		this.sweepIfDue();
		const resolvedSessionKey = this.resolveKey(sessionKey);
		const record = this.sessions.get(resolvedSessionKey);
		if (!record) {
			return;
		}

		this.resources.delete(record.resourceKey);
		this.sessions.delete(resolvedSessionKey);
	}

	getResource(resourceOrSessionKey?: string): T | undefined {
		this.sweepIfDue();
		const resolvedLookupKey = this.resolveKey(resourceOrSessionKey);
		const directResource = this.getLiveResource(resolvedLookupKey);
		if (directResource) {
			this.resources.set(
				resolvedLookupKey,
				this.createLeaseRecord(directResource.value),
			);
			return directResource.value;
		}

		const sessionRecord = this.sessions.get(resolvedLookupKey);
		if (!sessionRecord) {
			return;
		}
		if (sessionRecord.expiresAt <= this.now()) {
			this.sessions.delete(resolvedLookupKey);
			return;
		}

		const leasedResource = this.getLiveResource(sessionRecord.resourceKey);
		if (!leasedResource) {
			this.sessions.delete(resolvedLookupKey);
			return;
		}

		this.sessions.set(
			resolvedLookupKey,
			this.createSessionLinkRecord(sessionRecord.resourceKey),
		);
		this.resources.set(
			sessionRecord.resourceKey,
			this.createLeaseRecord(leasedResource.value),
		);
		return leasedResource.value;
	}

	sweepExpired(): void {
		const now = this.now();

		for (const [sessionKey, record] of this.sessions.entries()) {
			if (record.expiresAt <= now) {
				this.sessions.delete(sessionKey);
			}
		}

		for (const [resourceKey, record] of this.resources.entries()) {
			if (record.expiresAt <= now) {
				this.resources.delete(resourceKey);
			}
		}

		for (const [sessionKey, record] of this.sessions.entries()) {
			if (!this.resources.has(record.resourceKey)) {
				this.sessions.delete(sessionKey);
			}
		}

		this.nextSweepAt =
			this.sweepIntervalMs > 0
				? now + this.sweepIntervalMs
				: Number.POSITIVE_INFINITY;
	}

	private sweepIfDue(): void {
		if (this.now() < this.nextSweepAt) {
			return;
		}

		this.sweepExpired();
	}

	private resolveKey(key?: string): string {
		const normalizedKey = key?.trim();
		return normalizedKey ? normalizedKey : this.defaultKey;
	}

	private getLiveResource(resourceKey: string): LeaseRecord<T> | undefined {
		const record = this.resources.get(resourceKey);
		if (!record) {
			return;
		}

		if (record.expiresAt > this.now()) {
			return record;
		}

		this.deleteResource(resourceKey);
		return;
	}

	private deleteResource(resourceKey: string): void {
		this.resources.delete(resourceKey);

		for (const [sessionKey, record] of this.sessions.entries()) {
			if (record.resourceKey === resourceKey) {
				this.sessions.delete(sessionKey);
			}
		}
	}

	private createLeaseRecord(value: T): LeaseRecord<T> {
		return {
			value,
			expiresAt: this.now() + this.ttlMs,
		};
	}

	private createSessionLinkRecord(resourceKey: string): SessionLinkRecord {
		return {
			resourceKey,
			expiresAt: this.now() + this.ttlMs,
		};
	}

	private static installProcessHooks(): void {
		if (SessionLeaseStore.processHooksInstalled) {
			return;
		}

		SessionLeaseStore.processHooksInstalled = true;
		for (const eventName of PROCESS_EXIT_EVENTS) {
			process.once(eventName, () => {
				disposeAllSessionLeaseStores();
			});
		}
	}

	static disposeAllActiveStores(): void {
		for (const store of Array.from(SessionLeaseStore.activeStores)) {
			store.dispose();
		}
	}
}

export function disposeAllSessionLeaseStores(): void {
	SessionLeaseStore.disposeAllActiveStores();
}
