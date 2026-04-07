import React from 'react';
import {Box, Text} from 'ink';

type Props = {
	title: string;
	expanded: boolean;
	color?: string;
	summary?: string;
	children?: React.ReactNode;
};

export default function StructuredSidebandPanel({
	title,
	expanded,
	color = 'gray',
	summary,
	children,
}: Props) {
	return (
		<Box flexDirection="column">
			<Text color={color} bold>
				{expanded ? '▼' : '▶'} {title}
			</Text>
			{expanded
				? children
				: summary && (
						<Box marginLeft={2}>
							<Text color="gray" dimColor>
								{summary}
							</Text>
						</Box>
				  )}
		</Box>
	);
}
