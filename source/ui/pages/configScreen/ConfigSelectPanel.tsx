import React, {useState} from 'react';
import {Box, Text} from 'ink';
import {Alert} from '@inkjs/ui';
import ScrollableSelectInput from '../../components/common/ScrollableSelectInput.js';
import type {
	BackendMode,
	RequestMethod,
	ToolTransport,
} from '../../../utils/config/apiConfig.js';
import {switchProfile} from '../../../utils/config/configManager.js';
import type {ConfigStateReturn} from './useConfigState.js';

type Props = {
	state: ConfigStateReturn;
};

function getLocalizedLevelLabel(
	value: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max',
	t: ConfigStateReturn['t'],
): string {
	switch (value) {
		case 'none':
			return t.configScreen.optionNone;
		case 'low':
			return t.configScreen.optionLow;
		case 'medium':
			return t.configScreen.optionMedium;
		case 'high':
			return t.configScreen.optionHigh;
		case 'xhigh':
			return t.configScreen.optionXHigh;
		case 'max':
			return t.configScreen.optionMax;
		default:
			return value;
	}
}

export default function ConfigSelectPanel({state}: Props) {
	const {
		t,
		theme,
		currentField,
		setIsEditing,
		requestMethod,
		setRequestMethod,
		enableVcpTimeBridge,
		setEnableVcpTimeBridge,
		backendMode,
		setBackendMode,
		toolTransport,
		setToolTransport,
		requestMethodOptions,
		thinkingMode,
		setThinkingMode,
		thinkingEffort,
		setThinkingEffort,
		geminiThinkingLevel,
		setGeminiThinkingLevel,
		responsesVerbosity,
		setResponsesVerbosity,
		anthropicSpeed,
		setAnthropicSpeed,
		getCustomHeadersSchemeSelectItems,
		getCustomHeadersSchemeSelectedValue,
		applyCustomHeadersSchemeSelectValue,
	} = state;

	const getFieldLabel = () => {
		switch (currentField) {
			case 'profile':
				return t.configScreen.profile.replace(':', '');
			case 'requestMethod':
				return t.configScreen.requestMethod.replace(':', '');
			case 'enableVcpTimeBridge':
				return t.configScreen.vcpTimeBridge.replace(':', '');
			case 'backendMode':
				return t.configScreen.vcpMode.replace(':', '');
			case 'toolTransport':
				return t.configScreen.toolTransport.replace(':', '');
			case 'advancedModel':
				return t.configScreen.advancedModel.replace(':', '');
			case 'basicModel':
				return t.configScreen.basicModel.replace(':', '');
			case 'thinkingMode':
				return t.configScreen.thinkingMode.replace(':', '');
			case 'thinkingEffort':
				return t.configScreen.thinkingEffort.replace(':', '');
			case 'geminiThinkingLevel':
				return t.configScreen.geminiThinkingLevel.replace(':', '');
			case 'responsesReasoningEffort':
				return t.configScreen.responsesReasoningEffort.replace(':', '');
			case 'responsesVerbosity':
				return t.configScreen.responsesVerbosity.replace(':', '');
			case 'anthropicSpeed':
				return t.configScreen.anthropicSpeed.replace(':', '');
			case 'systemPromptId':
				return t.configScreen.systemPrompt;
			case 'customHeadersSchemeId':
				return t.configScreen.customHeadersField;
			default:
				return '';
		}
	};

	return (
		<Box flexDirection="column">
			<Text color={theme.colors.menuSelected}>❯ {getFieldLabel()}</Text>
			<Box marginLeft={3} marginTop={1}>
				{currentField === 'profile' && <ProfileSelect state={state} />}
				{currentField === 'requestMethod' && (
					<ScrollableSelectInput
						items={requestMethodOptions}
						initialIndex={requestMethodOptions.findIndex(
							opt => opt.value === requestMethod,
						)}
						isFocused={true}
						onSelect={item => {
							setRequestMethod(item.value as RequestMethod);
							setIsEditing(false);
						}}
					/>
				)}
				{currentField === 'enableVcpTimeBridge' && (
					<ScrollableSelectInput
						items={[
							{
								label: t.configScreen.vcpTimeBridgeAuto,
								value: 'auto',
							},
							{
								label: t.configScreen.vcpTimeBridgeEnabled,
								value: 'enabled',
							},
							{
								label: t.configScreen.vcpTimeBridgeDisabled,
								value: 'disabled',
							},
						]}
						initialIndex={
							enableVcpTimeBridge === true
								? 1
								: enableVcpTimeBridge === false
								? 2
								: 0
						}
						isFocused={true}
						onSelect={item => {
							if (item.value === 'enabled') {
								setEnableVcpTimeBridge(true);
							} else if (item.value === 'disabled') {
								setEnableVcpTimeBridge(false);
							} else {
								setEnableVcpTimeBridge(undefined);
							}
							setIsEditing(false);
						}}
					/>
				)}
				{currentField === 'backendMode' && (
					<ScrollableSelectInput
						items={[
							{
								label: t.configScreen.vcpModeNative,
								value: 'native',
							},
							{
								label: t.configScreen.vcpModeVcp,
								value: 'vcp',
							},
						]}
						initialIndex={backendMode === 'vcp' ? 1 : 0}
						isFocused={true}
						onSelect={item => {
							setBackendMode(item.value as BackendMode);
							setIsEditing(false);
						}}
					/>
				)}
				{currentField === 'toolTransport' && (
					<ScrollableSelectInput
						items={[
							{
								label: t.configScreen.toolTransportLocal,
								value: 'local',
							},
							{
								label: t.configScreen.toolTransportBridge,
								value: 'bridge',
							},
							{
								label: t.configScreen.toolTransportHybrid,
								value: 'hybrid',
							},
						]}
						initialIndex={
							toolTransport === 'bridge'
								? 1
								: toolTransport === 'hybrid'
								? 2
								: 0
						}
						isFocused={true}
						onSelect={item => {
							setToolTransport(item.value as ToolTransport);
							setIsEditing(false);
						}}
					/>
				)}
				{currentField === 'systemPromptId' && (
					<SystemPromptSelect state={state} />
				)}
				{currentField === 'customHeadersSchemeId' &&
					(() => {
						const items = getCustomHeadersSchemeSelectItems();
						const selected = getCustomHeadersSchemeSelectedValue();
						return (
							<ScrollableSelectInput
								items={items}
								limit={10}
								initialIndex={Math.max(
									0,
									items.findIndex(opt => opt.value === selected),
								)}
								isFocused={true}
								onSelect={item => {
									applyCustomHeadersSchemeSelectValue(item.value);
									setIsEditing(false);
								}}
							/>
						);
					})()}
				{(currentField === 'advancedModel' ||
					currentField === 'basicModel') && (
					<ModelSelect state={state} />
				)}
				{currentField === 'thinkingMode' && (
					<ScrollableSelectInput
						items={[
							{label: t.configScreen.thinkingModeTokens, value: 'tokens'},
							{
								label: t.configScreen.thinkingModeAdaptive,
								value: 'adaptive',
							},
						]}
						initialIndex={thinkingMode === 'tokens' ? 0 : 1}
						isFocused={true}
						onSelect={item => {
							setThinkingMode(item.value as 'tokens' | 'adaptive');
							setIsEditing(false);
						}}
					/>
				)}
				{currentField === 'thinkingEffort' && (
					<ScrollableSelectInput
						items={[
							{label: getLocalizedLevelLabel('low', t), value: 'low'},
							{label: getLocalizedLevelLabel('medium', t), value: 'medium'},
							{label: getLocalizedLevelLabel('high', t), value: 'high'},
							{label: getLocalizedLevelLabel('max', t), value: 'max'},
						]}
						initialIndex={
							thinkingEffort === 'low'
								? 0
								: thinkingEffort === 'medium'
								? 1
								: thinkingEffort === 'high'
								? 2
								: 3
						}
						isFocused={true}
						onSelect={item => {
							setThinkingEffort(
								item.value as 'low' | 'medium' | 'high' | 'max',
							);
							setIsEditing(false);
						}}
					/>
				)}
				{currentField === 'geminiThinkingLevel' && (
					<ScrollableSelectInput
						items={[
							{label: 'MINIMAL', value: 'minimal'},
							{label: 'LOW', value: 'low'},
							{label: 'MEDIUM', value: 'medium'},
							{label: 'HIGH', value: 'high'},
						]}
						initialIndex={Math.max(
							0,
							(['minimal', 'low', 'medium', 'high'] as const).indexOf(
								geminiThinkingLevel,
							),
						)}
						isFocused={true}
						onSelect={item => {
							setGeminiThinkingLevel(
								item.value as 'minimal' | 'low' | 'medium' | 'high',
							);
							setIsEditing(false);
						}}
					/>
				)}
				{currentField === 'responsesReasoningEffort' && (
					<ReasoningEffortSelect state={state} />
				)}
				{currentField === 'responsesVerbosity' && (
					<ScrollableSelectInput
						items={[
							{label: getLocalizedLevelLabel('low', t), value: 'low'},
							{label: getLocalizedLevelLabel('medium', t), value: 'medium'},
							{label: getLocalizedLevelLabel('high', t), value: 'high'},
						]}
						initialIndex={Math.max(
							0,
							[
								{label: getLocalizedLevelLabel('low', t), value: 'low'},
								{label: getLocalizedLevelLabel('medium', t), value: 'medium'},
								{label: getLocalizedLevelLabel('high', t), value: 'high'},
							].findIndex(opt => opt.value === responsesVerbosity),
						)}
						isFocused={true}
						onSelect={item => {
							setResponsesVerbosity(item.value as 'low' | 'medium' | 'high');
							setIsEditing(false);
						}}
					/>
				)}
				{currentField === 'anthropicSpeed' && (
					<ScrollableSelectInput
						items={[
							{label: t.configScreen.anthropicSpeedNotUsed, value: '__NONE__'},
							{label: t.configScreen.anthropicSpeedFast, value: 'fast'},
							{label: t.configScreen.anthropicSpeedStandard, value: 'standard'},
						]}
						initialIndex={
							anthropicSpeed === 'fast' ? 1 : anthropicSpeed === 'standard' ? 2 : 0
						}
						isFocused={true}
						onSelect={item => {
							setAnthropicSpeed(
								item.value === '__NONE__' ? undefined : (item.value as 'fast' | 'standard'),
							);
							setIsEditing(false);
						}}
					/>
				)}
			</Box>
		</Box>
	);
}

function ProfileSelect({state}: Props) {
	const {
		t,
		theme,
		profiles,
		activeProfile,
		markedProfiles,
		setMarkedProfiles,
		setErrors,
		setIsEditing,
		loadProfilesAndConfig,
	} = state;

	return (
		<Box flexDirection="column">
			<ScrollableSelectInput
				items={profiles.map(p => ({
					label: p.displayName,
					value: p.name,
					isActive: p.name === activeProfile,
				}))}
				limit={5}
				initialIndex={Math.max(
					0,
					profiles.findIndex(p => p.name === activeProfile),
				)}
				isFocused={true}
				selectedValues={markedProfiles}
				renderItem={({label, isSelected, isMarked, isActive}) => {
					return (
						<Text>
							<Text color={isMarked ? 'yellow' : isSelected ? 'cyan' : 'white'}>
								{isMarked ? '✓ ' : '  '}
							</Text>
							{isActive && <Text color="green">[active] </Text>}
							<Text color={isSelected ? 'cyan' : 'white'}>{label}</Text>
						</Text>
					);
				}}
				onSelect={item => {
					switchProfile(item.value);
					loadProfilesAndConfig();
					setIsEditing(false);
					setErrors([]);
				}}
				onToggleItem={item => {
					if (item.value === 'default') {
						setErrors([t.configScreen.cannotDeleteDefault]);
						return;
					}
					setMarkedProfiles(prev => {
						const next = new Set(prev);
						if (next.has(item.value)) {
							next.delete(item.value);
						} else {
							next.add(item.value);
						}
						return next;
					});
					setErrors([]);
				}}
			/>
			<Box flexDirection="row" marginTop={1}>
				<Box marginRight={2}>
					<Text color={theme.colors.menuSelected}>
						{t.configScreen.newProfile}
					</Text>
					<Text color={theme.colors.menuSecondary}> (n)</Text>
				</Box>
				<Box marginRight={2}>
					<Text color={theme.colors.menuInfo}>
						{t.configScreen.renameProfileShort}
					</Text>
					<Text color={theme.colors.menuSecondary}> (r)</Text>
				</Box>
				<Box marginRight={2}>
					<Text color={theme.colors.warning}>{t.configScreen.mark}</Text>
					<Text color={theme.colors.menuSecondary}> (space)</Text>
				</Box>
				<Box>
					<Text color={theme.colors.error}>
						{t.configScreen.deleteProfileShort}
					</Text>
					<Text color={theme.colors.menuSecondary}> (d)</Text>
					{markedProfiles.size > 0 && (
						<Text color={theme.colors.warning}>[{markedProfiles.size}]</Text>
					)}
				</Box>
			</Box>
			<Box marginTop={1}>
				<Alert variant="info">{t.configScreen.profileSelectHint}</Alert>
			</Box>
		</Box>
	);
}

function SystemPromptSelect({state}: Props) {
	const {
		t,
		theme,
		pendingPromptIds,
		setPendingPromptIds,
		setIsEditing,
		setSystemPromptId,
		getSystemPromptSelectItems,
		getSystemPromptSelectedValue,
		applySystemPromptSelectValue,
	} = state;

	const items = getSystemPromptSelectItems();
	const selected = getSystemPromptSelectedValue();

	return (
		<Box flexDirection="column">
			<ScrollableSelectInput
				items={items}
				limit={10}
				initialIndex={Math.max(
					0,
					items.findIndex(opt => opt.value === selected),
				)}
				isFocused={true}
				selectedValues={pendingPromptIds}
				renderItem={({label, value, isSelected, isMarked}) => {
					const isMeta = value === '__FOLLOW__' || value === '__DISABLED__';
					return (
						<Text
							color={
								isSelected ? 'cyan' : isMarked ? theme.colors.menuInfo : 'white'
							}
						>
							{isMeta ? '' : isMarked ? '[✓] ' : '[ ] '}
							{label}
						</Text>
					);
				}}
				onToggleItem={item => {
					if (item.value === '__FOLLOW__' || item.value === '__DISABLED__') {
						applySystemPromptSelectValue(item.value);
						setPendingPromptIds(new Set());
						setIsEditing(false);
						return;
					}
					setPendingPromptIds(prev => {
						const next = new Set(prev);
						if (next.has(item.value)) {
							next.delete(item.value);
						} else {
							next.add(item.value);
						}
						return next;
					});
				}}
				onSelect={item => {
					if (item.value === '__FOLLOW__' || item.value === '__DISABLED__') {
						applySystemPromptSelectValue(item.value);
						setPendingPromptIds(new Set());
						setIsEditing(false);
						return;
					}
					const finalIds =
						pendingPromptIds.size > 0
							? Array.from(pendingPromptIds)
							: [item.value];
					if (pendingPromptIds.size > 0 && !pendingPromptIds.has(item.value)) {
						finalIds.push(item.value);
					}
					setSystemPromptId(finalIds.length === 1 ? finalIds[0]! : finalIds);
					setPendingPromptIds(new Set());
					setIsEditing(false);
				}}
			/>
			<Box marginTop={1}>
				<Text color={theme.colors.menuSecondary} dimColor>
					{t.configScreen.systemPromptMultiSelectHint}
				</Text>
			</Box>
		</Box>
	);
}

function ModelSelect({state}: Props) {
	const {
		t,
		theme,
		searchTerm,
		getCurrentOptions,
		getCurrentValue,
		handleModelChange,
	} = state;

	const [highlightedIndex, setHighlightedIndex] = useState(0);
	const options = getCurrentOptions();
	const modelCount = options.length - 1;

	return (
		<Box flexDirection="column">
			<Box>
				{searchTerm && (
					<Text color={theme.colors.menuInfo}>
						{t.modelsPanel.filterLabel} {searchTerm}
						{'  '}
					</Text>
				)}
				<Text color={theme.colors.warning} bold>
					{t.modelsPanel.modelCount.replace(
						'{count}',
						modelCount.toString(),
					)}
					{options.length > 10 &&
						` (${highlightedIndex + 1}/${options.length})`}
				</Text>
			</Box>
			<ScrollableSelectInput
				items={options}
				limit={10}
				disableNumberShortcuts={true}
				initialIndex={Math.max(
					0,
					options.findIndex(opt => opt.value === getCurrentValue()),
				)}
				isFocused={true}
				onSelect={item => {
					handleModelChange(item.value);
				}}
				onHighlight={item => {
					const idx = options.findIndex(o => o.value === item.value);
					if (idx >= 0) setHighlightedIndex(idx);
				}}
			/>
			{options.length > 10 && (
				<Box>
					<Text dimColor color={theme.colors.menuSecondary}>
						{t.modelsPanel.scrollHint}
					</Text>
				</Box>
			)}
		</Box>
	);
}

function ReasoningEffortSelect({state}: Props) {
	const {
		supportsXHigh,
		responsesReasoningEffort,
		setResponsesReasoningEffort,
		setIsEditing,
	} = state;

	const effortOptions = [
		{label: getLocalizedLevelLabel('none', state.t), value: 'none'},
		{label: getLocalizedLevelLabel('low', state.t), value: 'low'},
		{label: getLocalizedLevelLabel('medium', state.t), value: 'medium'},
		{label: getLocalizedLevelLabel('high', state.t), value: 'high'},
		...(supportsXHigh
			? [{label: getLocalizedLevelLabel('xhigh', state.t), value: 'xhigh'}]
			: []),
	];

	return (
		<ScrollableSelectInput
			items={effortOptions}
			initialIndex={Math.max(
				0,
				effortOptions.findIndex(opt => opt.value === responsesReasoningEffort),
			)}
			isFocused={true}
			onSelect={item => {
				const nextEffort = item.value as
					| 'none'
					| 'low'
					| 'medium'
					| 'high'
					| 'xhigh';
				setResponsesReasoningEffort(
					nextEffort === 'xhigh' && !supportsXHigh ? 'high' : nextEffort,
				);
				setIsEditing(false);
			}}
		/>
	);
}
