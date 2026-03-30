import anyTest from 'ava';

const test = anyTest as any;

import {resolveTeamCleanupTargets} from './team.js';

test('resolveTeamCleanupTargets keeps runtime and stale active configs together', (t: any) => {
	const targets = resolveTeamCleanupTargets({
		activeTeam: {
			name: 'team-active',
			leadInstanceId: 'lead',
			members: [],
			createdAt: '2026-03-29T00:00:00.000Z',
			status: 'active',
		},
		trackerActiveTeamName: 'team-runtime',
		activeTeams: [
			{
				name: 'team-active',
				leadInstanceId: 'lead',
				members: [],
				createdAt: '2026-03-29T00:00:00.000Z',
				status: 'active',
			},
			{
				name: 'team-stale',
				leadInstanceId: 'lead',
				members: [],
				createdAt: '2026-03-29T00:00:01.000Z',
				status: 'active',
			},
		],
		getTeamByName: teamName =>
			teamName === 'team-runtime'
				? {
						name: 'team-runtime',
						leadInstanceId: 'lead',
						members: [],
						createdAt: '2026-03-29T00:00:02.000Z',
						status: 'active',
				  }
				: null,
	});

	t.deepEqual(
		targets.map(target => target.teamName),
		['team-active', 'team-runtime', 'team-stale'],
	);
	t.truthy(targets.find(target => target.teamName === 'team-runtime')?.config);
});
