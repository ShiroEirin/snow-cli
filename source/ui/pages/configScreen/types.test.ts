import test from 'ava';

import {
	isDirectTextInputField,
	isEscapeClosableEditingField,
	shouldShowBridgeCredentialFields,
	shouldShowToolTransportField,
} from './types.js';

test('bridge config fields are treated as direct text inputs', t => {
	t.true(isDirectTextInputField('baseUrl'));
	t.true(isDirectTextInputField('apiKey'));
	t.true(isDirectTextInputField('bridgeWsUrl'));
	t.true(isDirectTextInputField('bridgeVcpKey'));
	t.true(isDirectTextInputField('bridgeAccessToken'));
	t.false(isDirectTextInputField('toolTransport'));
});

test('editing escape contract covers select and direct text fields only', t => {
	t.true(isEscapeClosableEditingField('systemPromptId'));
	t.true(isEscapeClosableEditingField('toolTransport'));
	t.true(isEscapeClosableEditingField('bridgeWsUrl'));
	t.true(isEscapeClosableEditingField('bridgeVcpKey'));
	t.true(isEscapeClosableEditingField('bridgeAccessToken'));
	t.false(isEscapeClosableEditingField('showThinking'));
});

test('tool transport field is only shown in vcp backend mode', t => {
	t.true(shouldShowToolTransportField('vcp'));
	t.false(shouldShowToolTransportField('native'));
});

test('bridge credential fields require vcp mode plus bridge-capable transport', t => {
	t.false(shouldShowBridgeCredentialFields('native', 'local'));
	t.false(shouldShowBridgeCredentialFields('native', 'hybrid'));
	t.false(shouldShowBridgeCredentialFields('vcp', 'local'));
	t.true(shouldShowBridgeCredentialFields('vcp', 'bridge'));
	t.true(shouldShowBridgeCredentialFields('vcp', 'hybrid'));
});
