import {
	splitApiConfig,
	type ApiCoreConfig,
	type AppConfig,
	type VcpApiConfig,
} from '../../../utils/config/apiConfig.js';

export type ConfigDraftInput = Pick<
	ApiCoreConfig,
	| 'baseUrl'
	| 'apiKey'
	| 'requestMethod'
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
> &
	Pick<
		VcpApiConfig,
	| 'enableVcpTimeBridge'
	| 'backendMode'
	| 'toolTransport'
	| 'bridgeWsUrl'
	| 'bridgeVcpKey'
	| 'bridgeAccessToken'
	| 'bridgeToolProfile'
>;

export function buildSnowConfigDraft(input: ConfigDraftInput): AppConfig {
	const {apiConfig, vcpConfig} = splitApiConfig(input);

	return {
		snowcfg: {
			...apiConfig,
			...vcpConfig,
		} as AppConfig['snowcfg'],
	};
}
