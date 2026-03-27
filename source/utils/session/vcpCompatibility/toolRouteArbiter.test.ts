import anyTest from 'ava';

const test = anyTest as any;

import {validateApiConfig} from '../../config/apiConfig.js';
import {
	resolveToolExecutionRoute,
	resolveToolTransport,
	shouldIncludeBridgeTools,
	shouldIncludeLocalTools,
} from './toolRouteArbiter.js';
import {
	buildBridgeToolSnapshot,
	clearBridgeToolSnapshot,
} from './toolSnapshot.js';

test.afterEach(() => {
	clearBridgeToolSnapshot('hybrid-session');
});

test('resolve transport flags for local bridge and hybrid', (t: any) => {
	t.is(resolveToolTransport({toolTransport: 'local'}), 'local');
	t.is(resolveToolTransport({toolTransport: 'bridge'}), 'bridge');
	t.is(resolveToolTransport({toolTransport: 'hybrid'}), 'hybrid');
	t.true(shouldIncludeLocalTools({toolTransport: 'local'}));
	t.false(shouldIncludeBridgeTools({toolTransport: 'local'}));
	t.false(shouldIncludeLocalTools({toolTransport: 'bridge'}));
	t.true(shouldIncludeBridgeTools({toolTransport: 'bridge'}));
	t.true(shouldIncludeLocalTools({toolTransport: 'hybrid'}));
	t.true(shouldIncludeBridgeTools({toolTransport: 'hybrid'}));
});

test('resolve execution route by transport mode and session snapshot', (t: any) => {
	buildBridgeToolSnapshot('hybrid-session', {
		plugins: [
			{
				name: 'FileOperator',
				displayName: 'FileOperator',
				description: 'File operations',
				bridgeCommands: [
					{
						commandName: 'ReadFile',
						description: 'Read a file.',
						parameters: [],
						example: '',
					},
				],
			},
		],
	});

	t.is(
		resolveToolExecutionRoute({
			config: {toolTransport: 'bridge'},
			toolName: 'vcp-fileoperator-readfile',
			snapshotKey: 'hybrid-session',
		}),
		'bridge',
	);
	t.is(
		resolveToolExecutionRoute({
			config: {toolTransport: 'hybrid'},
			toolName: 'filesystem-read',
			snapshotKey: 'hybrid-session',
		}),
		'local',
	);
	t.is(
		resolveToolExecutionRoute({
			config: {toolTransport: 'local'},
			toolName: 'vcp-fileoperator-readfile',
			snapshotKey: 'hybrid-session',
		}),
		'local',
	);
});

test('validate hybrid transport requires bridge key like bridge mode', (t: any) => {
	t.true(
		validateApiConfig({
			toolTransport: 'hybrid',
		}).includes(
			'bridgeVcpKey is required when toolTransport is set to bridge or hybrid',
		),
	);
	t.deepEqual(
		validateApiConfig({
			toolTransport: 'hybrid',
			bridgeVcpKey: 'Snow',
		}),
		[],
	);
});
