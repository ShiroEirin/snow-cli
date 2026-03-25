import test from 'ava';

import {resolveBackendModeWithMigration} from './apiConfig.js';

test('keep explicit backend mode without migration', t => {
	t.deepEqual(
		resolveBackendModeWithMigration({
			backendMode: 'vcp',
			baseUrl: 'http://localhost:6005/v1',
		}),
		{
			backendMode: 'vcp',
			migrated: false,
		},
	);
});

test('migrate legacy localhost fallback into explicit vcp mode', t => {
	t.deepEqual(
		resolveBackendModeWithMigration({
			baseUrl: 'http://localhost:6005/v1',
		}),
		{
			backendMode: 'vcp',
			migrated: true,
		},
	);
});

test('migrate missing backend mode to explicit native mode for non-vcp endpoints', t => {
	t.deepEqual(
		resolveBackendModeWithMigration({
			baseUrl: 'https://api.openai.com/v1',
		}),
		{
			backendMode: 'native',
			migrated: true,
		},
	);
});

test('migrate legacy enableVcpGateway flag into backend mode', t => {
	t.deepEqual(
		resolveBackendModeWithMigration({
			enableVcpGateway: true,
		}),
		{
			backendMode: 'vcp',
			migrated: true,
		},
	);

	t.deepEqual(
		resolveBackendModeWithMigration({
			enableVcpGateway: false,
		}),
		{
			backendMode: 'native',
			migrated: true,
		},
	);
});
