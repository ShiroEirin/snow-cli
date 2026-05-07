import React, {useState, useEffect, useMemo} from 'react';
import {Box, Text, useInput} from 'ink';
import {useTheme} from '../../contexts/ThemeContext.js';
import {useI18n} from '../../../i18n/I18nContext.js';
import {
	toggleSkill,
	isSkillEnabled,
} from '../../../utils/config/disabledSkills.js';
import type {Skill} from '../../../mcp/skills.js';

interface Props {
	onClose: () => void;
}

const NON_FOCUSED_SKILL_DESC_MAX_LEN = 30;
const MAX_DISPLAY_ITEMS = 8;

export default function SkillsListPanel({onClose}: Props) {
	const {t} = useI18n();
	const {theme} = useTheme();
	const [skills, setSkills] = useState<Skill[]>([]);
	const [skillEnabledMap, setSkillEnabledMap] = useState<
		Record<string, boolean>
	>({});
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const {listAvailableSkills} = await import('../../../mcp/skills.js');
				const skillsList = await listAvailableSkills(process.cwd());
				if (cancelled) return;
				setSkills(skillsList);
				const enabledMap: Record<string, boolean> = {};
				for (const skill of skillsList) {
					enabledMap[skill.id] = isSkillEnabled(skill.id);
				}
				setSkillEnabledMap(enabledMap);
				setIsLoading(false);
			} catch (error) {
				if (cancelled) return;
				setErrorMessage(
					error instanceof Error ? error.message : 'Failed to load skills',
				);
				setIsLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const displayWindow = useMemo(() => {
		if (skills.length <= MAX_DISPLAY_ITEMS) {
			return {
				items: skills,
				startIndex: 0,
				endIndex: skills.length,
			};
		}

		const halfWindow = Math.floor(MAX_DISPLAY_ITEMS / 2);
		let startIndex = Math.max(0, selectedIndex - halfWindow);
		const endIndex = Math.min(skills.length, startIndex + MAX_DISPLAY_ITEMS);
		if (endIndex - startIndex < MAX_DISPLAY_ITEMS) {
			startIndex = Math.max(0, endIndex - MAX_DISPLAY_ITEMS);
		}

		return {
			items: skills.slice(startIndex, endIndex),
			startIndex,
			endIndex,
		};
	}, [skills, selectedIndex]);

	const hiddenAboveCount = displayWindow.startIndex;
	const hiddenBelowCount = Math.max(0, skills.length - displayWindow.endIndex);

	const formatSkillDescription = (
		description: string,
		isSelected: boolean,
	): string => {
		if (isSelected || description.length <= NON_FOCUSED_SKILL_DESC_MAX_LEN) {
			return description;
		}
		return `${description.slice(0, NON_FOCUSED_SKILL_DESC_MAX_LEN - 3)}...`;
	};

	useInput((input, key) => {
		if (isLoading) return;

		if (key.escape) {
			onClose();
			return;
		}

		if (skills.length === 0) return;

		if (key.upArrow) {
			setSelectedIndex(prev => (prev > 0 ? prev - 1 : skills.length - 1));
			return;
		}

		if (key.downArrow) {
			setSelectedIndex(prev => (prev < skills.length - 1 ? prev + 1 : 0));
			return;
		}

		if (key.tab || input === ' ' || key.return) {
			const current = skills[selectedIndex];
			if (!current) return;
			try {
				toggleSkill(current.id);
				setSkillEnabledMap(prev => ({
					...prev,
					[current.id]: !prev[current.id],
				}));
			} catch (error) {
				setErrorMessage(
					error instanceof Error ? error.message : 'Failed to toggle skill',
				);
			}
			return;
		}
	});

	if (isLoading) {
		return (
			<Text color={theme.colors.menuSecondary}>
				{t.skillsListPanel?.loading || 'Loading skills...'}
			</Text>
		);
	}

	if (errorMessage) {
		return (
			<Box
				borderColor={theme.colors.error}
				borderStyle="round"
				paddingX={2}
				paddingY={0}
			>
				<Text color={theme.colors.error} dimColor>
					{(t.skillsListPanel?.error || 'Error: {message}').replace(
						'{message}',
						errorMessage,
					)}
				</Text>
			</Box>
		);
	}

	if (skills.length === 0) {
		return (
			<Box
				borderColor={theme.colors.menuInfo}
				borderStyle="round"
				paddingX={2}
				paddingY={0}
			>
				<Text color={theme.colors.menuSecondary} dimColor>
					{t.skillsListPanel?.noSkills || 'No skills available'}
				</Text>
			</Box>
		);
	}

	return (
		<Box
			borderColor={theme.colors.menuInfo}
			borderStyle="round"
			paddingX={2}
			paddingY={0}
		>
			<Box flexDirection="column">
				<Text color={theme.colors.menuInfo} bold>
					{t.skillsListPanel?.title || 'Skills'}
					{skills.length > MAX_DISPLAY_ITEMS &&
						` (${selectedIndex + 1}/${skills.length})`}
				</Text>

				{hiddenAboveCount > 0 && (
					<Text color={theme.colors.menuSecondary} dimColor>
						{(t.skillsListPanel?.moreAbove || '↑ {count} more above').replace(
							'{count}',
							String(hiddenAboveCount),
						)}
					</Text>
				)}

				{displayWindow.items.map((skill, displayIdx) => {
					const actualIndex = displayWindow.startIndex + displayIdx;
					const isSelected = actualIndex === selectedIndex;
					const isEnabled = skillEnabledMap[skill.id] !== false;
					const locationSuffix =
						skill.location === 'project'
							? t.skillsListPanel?.locationProject || '(Project)'
							: t.skillsListPanel?.locationGlobal || '(Global)';
					const skillDescription = (skill.description || '').trim();
					const hasDescription = Boolean(skillDescription);
					const renderedDescription = hasDescription
						? formatSkillDescription(skillDescription, isSelected)
						: '';

					return (
						<Box key={skill.id} flexDirection="column">
							<Text>
								{isSelected ? '❯ ' : '  '}
								<Text
									color={
										isEnabled
											? theme.colors.success
											: theme.colors.menuSecondary
									}
								>
									◆{' '}
								</Text>
								<Text
									color={
										isSelected
											? theme.colors.menuInfo
											: isEnabled
											? theme.colors.text
											: theme.colors.menuSecondary
									}
								>
									{skill.name || skill.id}
								</Text>
								<Text color={theme.colors.menuSecondary} dimColor>
									{' '}
									{isEnabled
										? locationSuffix
										: t.skillsListPanel?.statusDisabled || '(Disabled)'}
								</Text>
							</Text>
							{isEnabled && hasDescription ? (
								<Box marginLeft={4}>
									<Text color={theme.colors.menuSecondary} dimColor>
										{renderedDescription}
									</Text>
								</Box>
							) : null}
						</Box>
					);
				})}

				{hiddenBelowCount > 0 && (
					<Text color={theme.colors.menuSecondary} dimColor>
						{(t.skillsListPanel?.moreBelow || '↓ {count} more below').replace(
							'{count}',
							String(hiddenBelowCount),
						)}
					</Text>
				)}

				<Box marginTop={1}>
					<Text color={theme.colors.menuSecondary} dimColor>
						{t.skillsListPanel?.navigationHint ||
							'↑↓ Navigate • Tab/Space/Enter Toggle • ESC Close'}
					</Text>
				</Box>
			</Box>
		</Box>
	);
}
