export function buildHistoryToolMessage<
	T extends {
		content: string;
		historyContent?: string;
	},
>(
	result: T,
	messageStatus?: 'pending' | 'success' | 'error',
) {
	const {historyContent, ...rest} = result;
	return {
		...rest,
		content: historyContent ?? result.content,
		...(messageStatus ? {messageStatus} : {}),
	};
}
