import test from 'ava';

import {buildSnowConfigDraft} from './configDraft.js';

test('build snow config draft keeps bridge and reasoning fields', t => {
	const draft = buildSnowConfigDraft({
		baseUrl: 'http://127.0.0.1:6005/v1',
		apiKey: 'test',
		requestMethod: 'chat',
		backendMode: 'vcp',
		toolTransport: 'bridge',
		bridgeWsUrl: 'wss://bridge.example.com/vcp-distributed-server/VCP_Key=Snow',
		bridgeVcpKey: 'Snow',
		bridgeAccessToken: 'token',
		geminiThinking: {
			enabled: true,
			budget: 2048,
		},
		responsesReasoning: {
			enabled: true,
			effort: 'high',
		},
		responsesVerbosity: 'high',
		responsesFastMode: true,
		editSimilarityThreshold: 0.88,
	});

	t.is(draft.snowcfg.toolTransport, 'bridge');
	t.is(
		draft.snowcfg.bridgeWsUrl,
		'wss://bridge.example.com/vcp-distributed-server/VCP_Key=Snow',
	);
	t.is(draft.snowcfg.bridgeVcpKey, 'Snow');
	t.deepEqual(draft.snowcfg.geminiThinking, {
		enabled: true,
		budget: 2048,
	});
	t.deepEqual(draft.snowcfg.responsesReasoning, {
		enabled: true,
		effort: 'high',
	});
	t.is(draft.snowcfg.responsesVerbosity, 'high');
	t.true(draft.snowcfg.responsesFastMode);
	t.is(draft.snowcfg.editSimilarityThreshold, 0.88);
});
