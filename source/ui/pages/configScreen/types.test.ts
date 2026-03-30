import test from 'ava';

import {
	isDirectTextInputField,
	isEscapeClosableEditingField,
} from './types.js';

test('bridge config fields are treated as direct text inputs', t => {
	t.true(isDirectTextInputField('baseUrl'));
	t.true(isDirectTextInputField('apiKey'));
	t.true(isDirectTextInputField('bridgeVcpKey'));
	t.true(isDirectTextInputField('bridgeAccessToken'));
	t.false(isDirectTextInputField('toolTransport'));
});

test('editing escape contract covers select and direct text fields only', t => {
	t.true(isEscapeClosableEditingField('systemPromptId'));
	t.true(isEscapeClosableEditingField('toolTransport'));
	t.true(isEscapeClosableEditingField('bridgeVcpKey'));
	t.true(isEscapeClosableEditingField('bridgeAccessToken'));
	t.false(isEscapeClosableEditingField('showThinking'));
});
