export function buildHistoryToolMessage<
	T extends {
		content: string;
		historyContent?: string;
	},
>(
	result: T,
	messageStatus?: 'pending' | 'success' | 'error',
) {
	return {
		...result,
		...(messageStatus ? {messageStatus} : {}),
	};
}

export function buildConversationToolMessage<
	T extends {
		role: string;
		content: string;
		historyContent?: string;
	},
>(
	result: T,
	messageStatus?: 'pending' | 'success' | 'error',
) {
	return projectToolMessageForContext({
		...result,
		...(messageStatus ? {messageStatus} : {}),
	});
}

export function projectToolMessageForContext<
	T extends {
		role: string;
		content: string;
		historyContent?: string;
	},
>(message: T): T {
	if (message.role !== 'tool' || !message.historyContent) {
		return message;
	}

	return {
		...message,
		content: message.historyContent,
	};
}
