import test from 'ava';

import {
	buildSessionListMetadataProjection,
	createSessionListItem,
	matchesSessionContentSearch,
	matchesSessionQuickSearch,
	sessionManager,
	type Session,
} from './sessionManager.js';

function createSession(overrides: Partial<Session> = {}): Session {
	return {
		id: 'session-1',
		title: 'Test Session',
		summary: 'Summary',
		createdAt: 1,
		updatedAt: 2,
		messages: [],
		messageCount: 3,
		...overrides,
	};
}

test('buildSessionListMetadataProjection keeps disk-only observation fields compact', t => {
	const metadata = buildSessionListMetadataProjection(7, {
		mtimeMs: 1234.6,
		size: 4096,
	});

	t.deepEqual(metadata, {
		mtime: 1235,
		size: 4096,
		messageCount: 7,
	});
});

test('createSessionListItem attaches metadata sidecar without mutating session payload', t => {
	const session = createSession({
		messageCount: 5,
		title: 'Title with\nnewline',
		projectId: 'project-1',
		projectPath: '/repo',
	});

	const item = createSessionListItem(session, {
		mtimeMs: 999.2,
		size: 2048,
	});

	t.is(item.id, session.id);
	t.is(item.messageCount, 5);
	t.deepEqual(item.metadata, {
		mtime: 999,
		size: 2048,
		messageCount: 5,
	});
	t.false('metadata' in session);
	t.false(JSON.stringify(session).includes('"metadata"'));
});

test('createSessionListItem omits metadata when file stats are unavailable', t => {
	const item = createSessionListItem(createSession(), undefined);

	t.is(item.metadata, undefined);
});

test('matchesSessionQuickSearch covers title, summary, id and date fields', t => {
	const matchedByTitle = matchesSessionQuickSearch(
		{
			id: 'session-alpha',
			title: 'Research Bridge Manifest',
			summary: 'summary text',
			createdAt: new Date('2026-04-04T00:00:00Z').getTime(),
			updatedAt: new Date('2026-04-05T00:00:00Z').getTime(),
		},
		'bridge manifest',
	);
	const matchedByDate = matchesSessionQuickSearch(
		{
			id: 'session-beta',
			title: 'Other title',
			summary: 'summary text',
			createdAt: new Date('2026-04-04T00:00:00Z').getTime(),
			updatedAt: new Date('2026-04-05T00:00:00Z').getTime(),
		},
		'2026-04-05',
	);

	t.true(matchedByTitle);
	t.true(matchedByDate);
	t.false(
		matchesSessionQuickSearch(
			{
				id: 'session-gamma',
				title: 'No match',
				summary: 'none',
				createdAt: 1,
				updatedAt: 2,
			},
			'manifest bridge',
		),
	);
});

test('matchesSessionContentSearch scans message content and sidecar projections', t => {
	t.true(
		matchesSessionContentSearch(
			createSession({
				messages: [
					{
						role: 'assistant',
						content: 'plain assistant text',
						timestamp: 1,
					},
					{
						role: 'tool',
						content: 'raw tool payload',
						historyContent: 'normalized bridge recall summary',
						previewContent: '{"summary":"preview text"}',
						timestamp: 2,
					} as any,
				],
			}),
			'bridge recall',
		),
	);
	t.true(
		matchesSessionContentSearch(
			createSession({
				messages: [
					{
						role: 'tool',
						content: 'raw tool payload',
						previewContent: '{"summary":"preview text"}',
						timestamp: 2,
					} as any,
				],
			}),
			'preview text',
		),
	);
	t.false(
		matchesSessionContentSearch(
			createSession({
				messages: [
					{
						role: 'assistant',
						content: 'plain assistant text',
						timestamp: 1,
					},
				],
			}),
			'nonexistent needle',
		),
	);
});

test.serial(
	'listSessionsPaginated runs quick match first and only falls back to disk content scan for misses',
	async t => {
		const originalListSessions = sessionManager.listSessions.bind(sessionManager);
		const originalLoadSessionFromDisk = (sessionManager as any).loadSessionFromDisk;
		(sessionManager as any).sessionListCache = null;
		(sessionManager as any).cacheTimestamp = 0;

		const quickMatchedSession = createSession({
			id: 'quick-hit',
			title: 'Bridge profile review',
			summary: 'quick needle summary',
		});
		const contentMatchedSession = createSession({
			id: 'content-hit',
			title: 'Other title',
			summary: 'other summary',
		});
		const scannedSessionIds: string[] = [];

		sessionManager.listSessions = (async () => [
			createSessionListItem(quickMatchedSession),
			createSessionListItem(contentMatchedSession),
		]) as typeof sessionManager.listSessions;
		(sessionManager as any).loadSessionFromDisk = async (sessionId: string) => {
			scannedSessionIds.push(sessionId);
			if (sessionId === 'content-hit') {
				return createSession({
					id: sessionId,
					messages: [
						{
							role: 'tool',
							content: 'raw payload',
							historyContent: 'normalized search needle',
							timestamp: 1,
						} as any,
					],
				});
			}

			return null;
		};

		try {
			const result = await sessionManager.listSessionsPaginated(
				0,
				20,
				'needle',
			);

			t.deepEqual(
				result.sessions.map(session => session.id),
				['quick-hit', 'content-hit'],
			);
			t.deepEqual(scannedSessionIds, ['content-hit']);
		} finally {
			sessionManager.listSessions = originalListSessions;
			(sessionManager as any).loadSessionFromDisk = originalLoadSessionFromDisk;
			(sessionManager as any).sessionListCache = null;
			(sessionManager as any).cacheTimestamp = 0;
		}
	},
);
