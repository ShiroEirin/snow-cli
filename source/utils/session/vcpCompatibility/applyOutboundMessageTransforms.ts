import type {ChatMessage} from '../../../api/chat.js';
import {vcpOutboundProjectionTransform} from './outboundProjectionBridge.js';
import {vcpTimeContextTransform} from './timeContextBridge.js';
import type {VcpOutboundTransform, VcpOutboundTransformArgs} from './types.js';

const VCP_OUTBOUND_TRANSFORMS: VcpOutboundTransform[] = [
	vcpTimeContextTransform,
	vcpOutboundProjectionTransform,
];

export function applyVcpOutboundMessageTransforms(
	args: VcpOutboundTransformArgs,
): ChatMessage[] {
	let transformedMessages = args.messages;

	for (const transform of VCP_OUTBOUND_TRANSFORMS) {
		const transformArgs: VcpOutboundTransformArgs = {
			...args,
			messages: transformedMessages,
		};
		if (!transform.shouldApply(transformArgs)) {
			continue;
		}

		transformedMessages = transform.apply(transformArgs);
	}

	return transformedMessages;
}
