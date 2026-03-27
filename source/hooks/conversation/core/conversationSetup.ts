import type {ChatMessage} from '../../../api/chat.js';
import {getOpenAiConfig} from '../../../utils/config/apiConfig.js';
import {
	collectAllMCPTools,
	getMCPServicesInfo,
	type MCPServiceTools,
	type MCPTool,
} from '../../../utils/execution/mcpToolsManager.js';
import {toolSearchService} from '../../../utils/execution/toolSearchService.js';
import {sessionManager} from '../../../utils/session/sessionManager.js';
import {snowBridgeClient} from '../../../utils/session/vcpCompatibility/bridgeClient.js';
import {
	buildSessionBridgeToolSnapshot,
	clearBridgeToolSnapshotSession,
	type SessionBridgeToolSnapshot,
} from '../../../utils/session/vcpCompatibility/toolSnapshot.js';
import {
	resolveToolRegistry,
	resolveToolTransport,
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
	const transport = resolveToolTransport(config);
	const currentSessionId = sessionManager.getCurrentSession()?.id;
	let localTools: MCPTool[] = [];
	let localServicesInfo: MCPServiceTools[] = [];
	let bridgeSnapshot: SessionBridgeToolSnapshot | undefined;
	let toolSnapshotKey: string | undefined;

	if (transport === 'bridge' || transport === 'hybrid') {
		const manifest = await snowBridgeClient.getManifest(config);
		bridgeSnapshot = buildSessionBridgeToolSnapshot(
			currentSessionId,
			manifest,
		);
		toolSnapshotKey = bridgeSnapshot.snapshotKey;
	} else {
		clearBridgeToolSnapshotSession(currentSessionId);
	}

	if (transport === 'local' || transport === 'hybrid') {
		localTools = await collectAllMCPTools();
		localServicesInfo = await getMCPServicesInfo();
	}

	const {tools: allMCPTools, servicesInfo, duplicateToolNames} =
		resolveToolRegistry({
			config,
			localTools,
			localServicesInfo,
			bridgeSnapshot,
		});

	if (duplicateToolNames.length > 0) {
		console.warn(
			`[Snow VCP] Ignored duplicate tool registrations: ${duplicateToolNames.join(', ')}`,
		);
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
