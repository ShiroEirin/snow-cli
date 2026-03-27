import test from 'ava';

import {resolveBackendModeWithMigration} from './apiConfig.js';

test('keep explicit backend mode without migration', t => {
	t.deepEqual(
		resolveBackendModeWithMigration({
			backendMode: 'vcp',
		}),
		{
			backendMode: 'vcp',
			migrated: false,
		},
	);
});

test('migrate missing backend mode to explicit native mode', t => {
	t.deepEqual(
		resolveBackendModeWithMigration({}),
		{
			backendMode: 'native',
			migrated: true,
		},
	);
});
