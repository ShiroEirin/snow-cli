import test from 'ava';
import React from 'react';

import ToolResultPreview from './ToolResultPreview.js';

function flattenText(node: React.ReactNode): string {
	if (node === null || node === undefined || typeof node === 'boolean') {
		return '';
	}

	if (typeof node === 'string' || typeof node === 'number') {
		return String(node);
	}

	if (Array.isArray(node)) {
		return node.map(child => flattenText(child)).join('');
	}

	if (!React.isValidElement(node)) {
		return '';
	}

	return flattenText(
		(node.props as {children?: React.ReactNode}).children,
	);
}

test('ToolResultPreview caps structured summary previews to a hard max line budget', t => {
	const rendered = ToolResultPreview({
		toolName: 'vcp-bridge-tool',
		maxLines: 99,
		result: JSON.stringify({
			summary: 'Found files in repo',
			itemCount: 12,
			status: 'success',
			asyncState: 'completed',
			topItems: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'],
			truncated: true,
		}),
	});
	const text = flattenText(rendered);

	t.true(text.includes('Found files in repo'));
	t.true(text.includes('items: 12'));
	t.true(text.includes('status: success (completed)'));
	t.true(text.includes('src/a.ts'));
	t.true(text.includes('src/b.ts'));
	t.false(text.includes('src/c.ts'));
	t.false(text.includes('src/d.ts'));
	t.true(text.includes('…'));
});
