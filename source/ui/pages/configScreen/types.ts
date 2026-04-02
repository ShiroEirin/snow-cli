import type {
	BackendMode,
	RequestMethod,
	ToolTransport,
} from '../../../utils/config/apiConfig.js';

export type ConfigField =
	| 'profile'
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
	| 'anthropicSpeed'
	| 'enableAutoCompress'
	| 'autoCompressThreshold'
	| 'showThinking'
	| 'thinkingEnabled'
	| 'thinkingMode'
	| 'thinkingBudgetTokens'
	| 'thinkingEffort'
	| 'geminiThinkingEnabled'
	| 'geminiThinkingBudget'
	| 'responsesReasoningEnabled'
	| 'responsesReasoningEffort'
	| 'responsesVerbosity'
	| 'responsesFastMode'
	| 'advancedModel'
	| 'basicModel'
	| 'maxContextTokens'
	| 'maxTokens'
	| 'streamIdleTimeoutSec'
	| 'toolResultTokenLimit'
	| 'editSimilarityThreshold'
	| 'streamingDisplay';

export type ProfileMode = 'normal' | 'creating' | 'renaming' | 'deleting';

export type ConfigScreenProps = {
	onBack: () => void;
	onSave: () => void;
	inlineMode?: boolean;
};

export const MAX_VISIBLE_FIELDS = 8;

const focusEventTokenRegex = /(?:\x1b)?\[[0-9;]*[IO]/g;

export const isFocusEventInput = (value?: string) => {
	if (!value) {
		return false;
	}

	if (
		value === '\x1b[I' ||
		value === '\x1b[O' ||
		value === '[I' ||
		value === '[O'
	) {
		return true;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return false;
	}

	const tokens = trimmed.match(focusEventTokenRegex);
	if (!tokens) {
		return false;
	}

	const normalized = trimmed.replace(/\s+/g, '');
	const tokensCombined = tokens.join('');
	return tokensCombined === normalized;
};

export const stripFocusArtifacts = (value: string) => {
	if (!value) {
		return '';
	}

	return value
		.replace(/\x1b\[[0-9;]*[IO]/g, '')
		.replace(/\[[0-9;]*[IO]/g, '')
		.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
};

export const SELECT_FIELDS: ConfigField[] = [
	'profile',
	'requestMethod',
	'enableVcpTimeBridge',
	'backendMode',
	'toolTransport',
	'bridgeWsUrl',
	'systemPromptId',
	'customHeadersSchemeId',
	'advancedModel',
	'basicModel',
	'thinkingMode',
	'thinkingEffort',
	'responsesReasoningEffort',
	'responsesVerbosity',
	'anthropicSpeed',
];

export const isSelectField = (field: ConfigField) =>
	SELECT_FIELDS.includes(field);

export const TEXT_INPUT_FIELDS: ConfigField[] = [
	'baseUrl',
	'apiKey',
	'bridgeWsUrl',
	'bridgeVcpKey',
	'bridgeAccessToken',
];

export const isDirectTextInputField = (field: ConfigField) =>
	TEXT_INPUT_FIELDS.includes(field);

export const isEscapeClosableEditingField = (field: ConfigField) =>
	isSelectField(field) || isDirectTextInputField(field);

export const shouldShowToolTransportField = (backendMode: BackendMode) =>
	backendMode === 'vcp';

export const shouldShowBridgeCredentialFields = (
	backendMode: BackendMode,
	toolTransport: ToolTransport,
) =>
	shouldShowToolTransportField(backendMode) &&
	(toolTransport === 'bridge' || toolTransport === 'hybrid');

export const NUMERIC_FIELDS: ConfigField[] = [
	'maxContextTokens',
	'maxTokens',
	'streamIdleTimeoutSec',
	'toolResultTokenLimit',
	'thinkingBudgetTokens',
	'geminiThinkingBudget',
	'autoCompressThreshold',
	'editSimilarityThreshold',
];

export const isNumericField = (field: ConfigField) =>
	NUMERIC_FIELDS.includes(field);

export const TOGGLE_FIELDS: ConfigField[] = [
	'anthropicBeta',
	'enableAutoCompress',
	'showThinking',
	'streamingDisplay',
	'thinkingEnabled',
	'geminiThinkingEnabled',
	'responsesReasoningEnabled',
	'responsesFastMode',
];

export const isToggleField = (field: ConfigField) =>
	TOGGLE_FIELDS.includes(field);

export type RequestMethodOption = {
	label: string;
	value: RequestMethod;
};
