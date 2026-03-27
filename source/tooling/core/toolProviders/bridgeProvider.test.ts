import test from 'ava';

import {buildBridgeToolSpecs} from './bridgeProvider.js';

test('prefer stable bridge metadata when building canonical specs', t => {
	const specs = buildBridgeToolSpecs({
		tools: [
			{
				type: 'function',
				function: {
					name: 'DailyNote',
					description: 'Remote daily note bridge tool.',
					parameters: {type: 'object', additionalProperties: true},
				},
			},
		],
		serviceInfo: {
			serviceName: 'snowbridge',
			tools: [
				{
					name: 'DailyNote',
					description: 'Remote daily note bridge tool.',
					inputSchema: {type: 'object', additionalProperties: true},
					toolId: 'vcp_bridge:snowbridge:dailynotemanager',
					originName: 'DailyNoteManager',
					displayName: '日记系统',
					capabilityTags: ['bridge_transport', 'single_command'],
				},
			],
			connected: true,
		},
		capabilities: {
			cancellable: true,
			asyncCallback: true,
			statusEvents: true,
		},
	});

	t.is(specs.length, 1);
	t.is(specs[0]?.toolId, 'vcp_bridge:snowbridge:dailynotemanager');
	t.is(specs[0]?.originName, 'DailyNoteManager');
	t.deepEqual(specs[0]?.capabilities, {
		cancellable: true,
		asyncCallback: true,
		statusEvents: true,
	});
	t.deepEqual(specs[0]?.metadata, {
		capabilityTags: ['bridge_transport', 'single_command'],
		bridgeDisplayName: '日记系统',
	});
});
