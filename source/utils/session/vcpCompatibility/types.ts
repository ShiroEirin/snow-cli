import type {ChatMessage} from '../../../api/chat.js';
import type {VcpCompatibilityApiConfig} from '../../config/apiConfig.js';

export type VcpCompatibilityConfig = VcpCompatibilityApiConfig;

export type VcpOutboundTransformArgs = {
	config: VcpCompatibilityConfig;
	messages: ChatMessage[];
	allowTimeBridge?: boolean;
	allowProjectionBridge?: boolean;
};

export type VcpOutboundTransform = {
	shouldApply(args: VcpOutboundTransformArgs): boolean;
	apply(args: VcpOutboundTransformArgs): ChatMessage[];
};

export type SnowBridgeToolIdentityFields = {
	originName?: string;
	publicName?: string;
	toolId?: string;
};

export type BridgeToolEffect =
	| 'read'
	| 'write'
	| 'delete'
	| 'command'
	| 'unknown';

export type BridgeToolMetadata = {
	revision?: string;
	reloadedAt?: string;
	requiresApproval?: boolean;
	approvalTimeoutMs?: number;
	readOnly?: boolean;
	effect?: BridgeToolEffect;
};
