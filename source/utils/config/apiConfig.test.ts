import test from 'ava';
import {execFileSync} from 'child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';
import {fileURLToPath} from 'url';

import {resolveBackendModeWithMigration} from './apiConfig.js';

const API_CONFIG_MODULE_URL = new URL('./apiConfig.ts', import.meta.url).href;
const TS_NODE_LOADER_URL = new URL(
	'../../../node_modules/ts-node/esm/transpile-only.mjs',
	import.meta.url,
).href;
const TS_NODE_PROJECT_PATH = fileURLToPath(
	new URL('../../../tsconfig.json', import.meta.url),
);

function runApiConfigScenario<T>(options: {
	globalConfig: unknown;
	projectConfig: unknown;
	script: string;
}): T {
	const isolatedHomeDir = mkdtempSync(join(tmpdir(), 'snow-home-'));
	const projectDir = mkdtempSync(join(tmpdir(), 'snow-project-'));

	try {
		mkdirSync(join(isolatedHomeDir, '.snow'), {recursive: true});
		writeFileSync(
			join(isolatedHomeDir, '.snow', 'mcp-config.json'),
			JSON.stringify(options.globalConfig, null, 2),
			'utf8',
		);

		mkdirSync(join(projectDir, '.snow'), {recursive: true});
		writeFileSync(
			join(projectDir, '.snow', 'mcp-config.json'),
			JSON.stringify(options.projectConfig, null, 2),
			'utf8',
		);

		const output = execFileSync(
			process.execPath,
			[
				'--loader',
				TS_NODE_LOADER_URL,
				'--input-type=module',
				'--eval',
				`
					import {
						getMCPConfig,
						getMCPConfigByScope,
						getMCPServerSource,
						updateMCPConfig,
					} from '${API_CONFIG_MODULE_URL}';
					${options.script}
				`,
			],
			{
				cwd: projectDir,
				env: {
					...process.env,
					HOME: isolatedHomeDir,
					USERPROFILE: isolatedHomeDir,
					TS_NODE_PROJECT: TS_NODE_PROJECT_PATH,
				},
				encoding: 'utf8',
			},
		);

		return JSON.parse(output.trim()) as T;
	} finally {
		rmSync(projectDir, {recursive: true, force: true});
		rmSync(isolatedHomeDir, {recursive: true, force: true});
	}
}

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

test.serial(
	'getMCPConfig merges global and project configs while preserving source lookup',
	t => {
		const result = runApiConfigScenario<{
			global: Record<string, unknown>;
			project: Record<string, unknown>;
			merged: Record<string, unknown>;
			sources: Record<string, 'global' | 'project' | null>;
		}>({
			globalConfig: {
				mcpServers: {
					globalOnly: {command: 'global-only'},
					shared: {command: 'global-shared'},
				},
			},
			projectConfig: {
				mcpServers: {
					projectOnly: {command: 'project-only'},
					shared: {command: 'project-shared'},
				},
			},
			script: `
				console.log(JSON.stringify({
					global: getMCPConfigByScope('global').mcpServers,
					project: getMCPConfigByScope('project').mcpServers,
					merged: getMCPConfig().mcpServers,
					sources: {
						globalOnly: getMCPServerSource('globalOnly'),
						projectOnly: getMCPServerSource('projectOnly'),
						shared: getMCPServerSource('shared'),
						missing: getMCPServerSource('missing'),
					},
				}));
			`,
		});

		t.deepEqual(result.global, {
			globalOnly: {command: 'global-only'},
			shared: {command: 'global-shared'},
		});
		t.deepEqual(result.project, {
			projectOnly: {command: 'project-only'},
			shared: {command: 'project-shared'},
		});
		t.deepEqual(result.merged, {
			globalOnly: {command: 'global-only'},
			projectOnly: {command: 'project-only'},
			shared: {command: 'project-shared'},
		});
		t.is(result.sources['globalOnly'], 'global');
		t.is(result.sources['projectOnly'], 'project');
		t.is(result.sources['shared'], 'project');
		t.is(result.sources['missing'], null);
	},
);

test.serial(
	'updateMCPConfig without explicit scope preserves existing project ownership',
	t => {
		const result = runApiConfigScenario<{
			global: Record<string, unknown>;
			project: Record<string, unknown>;
		}>({
			globalConfig: {
				mcpServers: {
					globalOnly: {command: 'global-before', enabled: true},
					shared: {command: 'global-shared'},
				},
			},
			projectConfig: {
				mcpServers: {
					projectOnly: {command: 'project-before', enabled: true},
					shared: {command: 'project-shared'},
				},
			},
			script: `
				const mergedConfig = getMCPConfig();
				mergedConfig.mcpServers.globalOnly.enabled = false;
				mergedConfig.mcpServers.projectOnly.enabled = false;
				delete mergedConfig.mcpServers.shared;
				updateMCPConfig(mergedConfig);
				console.log(JSON.stringify({
					global: getMCPConfigByScope('global').mcpServers,
					project: getMCPConfigByScope('project').mcpServers,
				}));
			`,
		});

		t.deepEqual(result.global, {
			globalOnly: {command: 'global-before', enabled: false},
		});
		t.deepEqual(result.project, {
			projectOnly: {command: 'project-before', enabled: false},
		});
	},
);
