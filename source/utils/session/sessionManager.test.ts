import test from 'ava';

import {
	buildSessionListMetadataProjection,
	createSessionListItem,
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
