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

export class SessionLeaseStore<T> {
	private readonly defaultKey: string;
	private readonly ttlMs: number;
	private readonly now: () => number;
	private readonly resources = new Map<string, LeaseRecord<T>>();
	private readonly sessions = new Map<string, SessionLinkRecord>();
	private readonly sweepTimer: NodeJS.Timeout | null;

	constructor(options: SessionLeaseStoreOptions) {
		this.defaultKey = options.defaultKey;
		this.ttlMs = options.ttlMs;
		this.now = options.now || Date.now;
		this.sweepTimer =
			options.sweepIntervalMs > 0
				? setInterval(() => {
						this.sweepExpired();
				  }, options.sweepIntervalMs)
				: null;

		this.sweepTimer?.unref?.();
	}

	dispose(): void {
		if (this.sweepTimer) {
			clearInterval(this.sweepTimer);
		}

		this.resources.clear();
		this.sessions.clear();
	}

	registerResource(resourceKey: string | undefined, value: T): string {
		this.sweepExpired();
		const resolvedKey = this.resolveKey(resourceKey);
		this.resources.set(resolvedKey, this.createLeaseRecord(value));
		return resolvedKey;
	}

	rotateSession(options: {
		sessionKey?: string;
		nextResourceKey?: string;
		value: T;
	}): string {
		this.sweepExpired();
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
		this.sweepExpired();
		const resolvedResourceKey = this.resolveKey(resourceKey);
		this.resources.delete(resolvedResourceKey);

		for (const [sessionKey, record] of this.sessions.entries()) {
			if (record.resourceKey === resolvedResourceKey) {
				this.sessions.delete(sessionKey);
			}
		}
	}

	clearSession(sessionKey?: string): void {
		this.sweepExpired();
		const resolvedSessionKey = this.resolveKey(sessionKey);
		const record = this.sessions.get(resolvedSessionKey);
		if (!record) {
			return;
		}

		this.resources.delete(record.resourceKey);
		this.sessions.delete(resolvedSessionKey);
	}

	getResource(resourceOrSessionKey?: string): T | undefined {
		this.sweepExpired();
		const resolvedLookupKey = this.resolveKey(resourceOrSessionKey);
		const directResource = this.resources.get(resolvedLookupKey);
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

		const leasedResource = this.resources.get(sessionRecord.resourceKey);
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
	}

	private resolveKey(key?: string): string {
		const normalizedKey = key?.trim();
		return normalizedKey ? normalizedKey : this.defaultKey;
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
}
