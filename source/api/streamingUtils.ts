export function extractStreamTextContent(chunk: unknown): string {
	const payload = chunk as {
		type?: unknown;
		content?: unknown;
		choices?: Array<{
			delta?: {
				content?: unknown;
			};
		}>;
	};

	if (payload?.type === 'content' && typeof payload.content === 'string') {
		return payload.content;
	}

	if (Array.isArray(payload?.choices)) {
		const deltaContent = payload.choices[0]?.delta?.content;
		return typeof deltaContent === 'string' ? deltaContent : '';
	}

	return '';
}

export function extractStreamToolCalls<T>(chunk: unknown): T[] | undefined {
	const payload = chunk as {
		type?: unknown;
		tool_calls?: unknown;
	};

	if (payload?.type === 'tool_calls' && Array.isArray(payload.tool_calls)) {
		return payload.tool_calls as T[];
	}

	return undefined;
}
