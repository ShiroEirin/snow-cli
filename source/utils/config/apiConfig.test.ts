import test from 'ava';

import {
	resolveBackendModeWithMigration,
	validateApiConfig,
} from './apiConfig.js';

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
		resolveBackendModeWithMigration({
		}),
		{
			backendMode: 'native',
			migrated: true,
		},
	);
});

test('require bridge websocket url when vcp bridge transport is enabled', t => {
	t.true(
		validateApiConfig({
			baseUrl: 'http://127.0.0.1:6005/v1',
			backendMode: 'vcp',
			toolTransport: 'bridge',
		}).includes(
			'VCP bridge WebSocket URL is required when bridge transport is enabled',
		),
	);
});

test('accept valid bridge websocket url when vcp bridge transport is enabled', t => {
	t.deepEqual(
		validateApiConfig({
			baseUrl: 'http://127.0.0.1:6005/v1',
			backendMode: 'vcp',
			toolTransport: 'bridge',
			vcpToolBridgeWsUrl:
				'ws://127.0.0.1:6005/vcp-distributed-server/VCP_Key=test',
		}),
		[],
	);
});
