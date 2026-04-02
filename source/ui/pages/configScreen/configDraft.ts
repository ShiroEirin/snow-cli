import type {ApiConfig, AppConfig} from '../../../utils/config/apiConfig.js';

export type ConfigDraftInput = Pick<
	ApiConfig,
	| 'baseUrl'
	| 'apiKey'
	| 'requestMethod'
	| 'enableVcpTimeBridge'
	| 'backendMode'
	| 'toolTransport'
	| 'bridgeWsUrl'
	| 'bridgeVcpKey'
	| 'bridgeAccessToken'
	| 'systemPromptId'
	| 'customHeadersSchemeId'
	| 'anthropicBeta'
	| 'anthropicCacheTTL'
	| 'enableAutoCompress'
	| 'autoCompressThreshold'
	| 'showThinking'
	| 'streamingDisplay'
	| 'thinking'
	| 'geminiThinking'
	| 'responsesReasoning'
	| 'responsesVerbosity'
	| 'responsesFastMode'
	| 'anthropicSpeed'
	| 'advancedModel'
	| 'basicModel'
	| 'maxContextTokens'
	| 'maxTokens'
	| 'streamIdleTimeoutSec'
	| 'toolResultTokenLimit'
	| 'editSimilarityThreshold'
>;

export function buildSnowConfigDraft(input: ConfigDraftInput): AppConfig {
	return {
		snowcfg: {
			...input,
		},
	};
}
