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
