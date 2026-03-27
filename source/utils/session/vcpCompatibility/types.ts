import type {ChatMessage} from '../../../api/chat.js';
import type {
	BackendMode,
	RequestMethod,
	ToolTransport,
} from '../../config/apiConfig.js';

export type VcpCompatibilityConfig = {
	requestMethod?: RequestMethod;
	baseUrl?: string;
	backendMode?: BackendMode;
	toolTransport?: ToolTransport;
	enableVcpTimeBridge?: boolean;
};

export type VcpOutboundTransformArgs = {
	config: VcpCompatibilityConfig;
	messages: ChatMessage[];
	allowTimeBridge?: boolean;
};

export type VcpOutboundTransform = {
	shouldApply(args: VcpOutboundTransformArgs): boolean;
	apply(args: VcpOutboundTransformArgs): ChatMessage[];
};
