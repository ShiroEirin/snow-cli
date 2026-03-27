import test from 'ava';
import {
	getMCPServerTransportType,
	getServerProcessEnv,
	interpolateMCPConfigValue,
	shouldFallbackToSSE,
} from './mcpExecutor.js';

test('getMCPServerTransportType supports local alias and inferred transports', t => {
	t.is(getMCPServerTransportType({type: 'local'}), 'stdio');
	t.is(getMCPServerTransportType({url: 'https://example.com/mcp'}), 'http');
	t.is(getMCPServerTransportType({command: 'node'}), 'stdio');
	t.is(getMCPServerTransportType({}), null);
});

test('getServerProcessEnv merges env aliases over process values', t => {
	const envKey = 'SNOW_MCP_EXECUTOR_TEST_ENV';
	const original = process.env[envKey];
	process.env[envKey] = 'process';
	t.teardown(() => {
		if (original === undefined) {
			delete process.env[envKey];
			return;
		}

		process.env[envKey] = original;
	});

	const env = getServerProcessEnv({
		env: {[envKey]: 'env'},
		environment: {[envKey]: 'environment'},
	});

	t.is(env[envKey], 'environment');
});

test('interpolateMCPConfigValue resolves braced and plain variables', t => {
	const resolved = interpolateMCPConfigValue(
		'https://${HOST}/$PATH_SEGMENT',
		{
			HOST: 'example.com',
			PATH_SEGMENT: 'mcp',
		},
	);

	t.is(resolved, 'https://example.com/mcp');
});

test('shouldFallbackToSSE only matches supported fallback failures', t => {
	t.true(shouldFallbackToSSE(new Error('Method not allowed')));
	t.true(shouldFallbackToSSE({code: 405}));
	t.false(shouldFallbackToSSE(new Error('socket hang up')));
});
