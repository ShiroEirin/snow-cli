import type {ChatMessage} from '../../../api/chat.js';
import {getOpenAiConfig} from '../../../utils/config/apiConfig.js';
import {
	collectAllMCPTools,
	getMCPServicesInfo,
	type MCPTool,
} from '../../../utils/execution/mcpToolsManager.js';
import {toolSearchService} from '../../../utils/execution/toolSearchService.js';
import {sessionManager} from '../../../utils/session/sessionManager.js';
import {snowBridgeClient} from '../../../utils/session/vcpCompatibility/bridgeClient.js';
import {
	buildSessionBridgeToolSnapshot,
	clearBridgeToolSnapshotSession,
	type BridgeModelToolDescriptor,
} from '../../../utils/session/vcpCompatibility/toolSnapshot.js';
import {
	shouldIncludeBridgeTools,
	shouldIncludeLocalTools,
} from '../../../utils/session/vcpCompatibility/toolRouteArbiter.js';
import {initializeConversationSession} from './sessionInitializer.js';
import {buildEditorContextContent} from './editorContextBuilder.js';
import {cleanOrphanedToolCalls} from '../utils/messageCleanup.js';
import type {ConversationHandlerOptions} from './conversationTypes.js';

export type PreparedConversationSetup = {
	conversationMessages: ChatMessage[];
	activeTools: MCPTool[];
	discoveredToolNames: Set<string>;
	useToolSearch: boolean;
	toolSnapshotKey?: string;
};

function projectBridgeToolsToModelTools(
	tools: BridgeModelToolDescriptor[],
): MCPTool[] {
	return tools.map(tool => ({
		type: tool.type,
		function: {
			name: tool.function.name,
			description: tool.function.description,
			parameters: tool.function.parameters,
		},
	}));
}

export async function prepareConversationSetup(
	options: Pick<
		ConversationHandlerOptions,
		'planMode' | 'vulnerabilityHuntingMode' | 'teamMode' | 'toolSearchDisabled'
	>,
): Promise<PreparedConversationSetup> {
	let {conversationMessages} = await initializeConversationSession(
		options.planMode || false,
		options.vulnerabilityHuntingMode || false,
		options.toolSearchDisabled || false,
		options.teamMode || false,
	);

	const config = getOpenAiConfig();
	const includeBridgeTools = shouldIncludeBridgeTools(config);
	const includeLocalTools = shouldIncludeLocalTools(config);
	const currentSessionId = sessionManager.getCurrentSession()?.id;
	const allMCPTools: MCPTool[] = [];
	const servicesInfo = [];
	let toolSnapshotKey: string | undefined;

	if (includeBridgeTools) {
		const manifest = await snowBridgeClient.getManifest(config);
		const bridgeSnapshot = buildSessionBridgeToolSnapshot(
			currentSessionId,
			manifest,
		);
		toolSnapshotKey = bridgeSnapshot.snapshotKey;
		allMCPTools.push(...projectBridgeToolsToModelTools(bridgeSnapshot.modelTools));
		servicesInfo.push(...bridgeSnapshot.servicesInfo);
	} else {
		clearBridgeToolSnapshotSession(currentSessionId);
	}

	if (includeLocalTools) {
		allMCPTools.push(...(await collectAllMCPTools()));
		servicesInfo.push(...(await getMCPServicesInfo()));
	}

	toolSearchService.updateRegistry(allMCPTools, servicesInfo);

	let activeTools: MCPTool[];
	let discoveredToolNames: Set<string>;
	const useToolSearch = !options.toolSearchDisabled;

	if (useToolSearch) {
		discoveredToolNames = toolSearchService.extractUsedToolNames(
			conversationMessages as any[],
		);
		activeTools = toolSearchService.buildActiveTools(discoveredToolNames);
	} else {
		discoveredToolNames = new Set<string>();
		activeTools = allMCPTools;
	}

	cleanOrphanedToolCalls(conversationMessages);

	return {
		conversationMessages,
		activeTools,
		discoveredToolNames,
		useToolSearch,
		toolSnapshotKey,
	};
}

export async function appendUserMessageAndSyncContext(options: {
	conversationMessages: ChatMessage[];
	userContent: string;
	editorContext: ConversationHandlerOptions['editorContext'];
	imageContents: ConversationHandlerOptions['imageContents'];
	saveMessage: ConversationHandlerOptions['saveMessage'];
}): Promise<void> {
	const {
		conversationMessages,
		userContent,
		editorContext,
		imageContents,
		saveMessage,
	} = options;

	const finalUserContent = buildEditorContextContent(editorContext, userContent);

	conversationMessages.push({
		role: 'user',
		content: finalUserContent,
		images: imageContents,
	});

	try {
		await saveMessage({
			role: 'user',
			content: userContent,
			images: imageContents,
		});
	} catch (error) {
		console.error('Failed to save user message:', error);
	}

	try {
		const {setConversationContext} = await import(
			'../../../utils/codebase/conversationContext.js'
		);
		const updatedSession = sessionManager.getCurrentSession();
		if (updatedSession) {
			const {convertSessionMessagesToUI} = await import(
				'../../../utils/session/sessionConverter.js'
			);
			const uiMessages = convertSessionMessagesToUI(updatedSession.messages);
			setConversationContext(updatedSession.id, uiMessages.length);
		}
	} catch (error) {
		console.error('Failed to set conversation context:', error);
	}
}
