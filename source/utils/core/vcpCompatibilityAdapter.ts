import type {ApiConfig, RequestMethod} from '../config/apiConfig.js';
import {
	formatVcpContentForTranscript,
	getVcpStreamingSuppressionDecision,
	type VcpStreamingSuppressionState,
	stripVcpDisplayBlocks,
} from '../session/vcpCompatibility/display.js';
import {resolveVcpModeRequest} from '../session/vcpCompatibility/mode.js';

/**
 * Formats assistant or user content into a transcript-safe string while
 * preserving the existing VCP compatibility summaries.
 *
 * @param content - Raw message content.
 * @returns Content formatted for transcript compression.
 */
export function formatCompatibilityContentForTranscript(
	content: string,
): string {
	return formatVcpContentForTranscript(content);
}

/**
 * Removes VCP display protocol blocks from persisted assistant content.
 *
 * @param content - Raw assistant content.
 * @returns Visible content with protocol display blocks stripped.
 */
export function stripCompatibilityDisplayBlocks(content: string): string {
	return stripVcpDisplayBlocks(content);
}

export interface CompatibilityStreamingSuppressor {
	/**
	 * Consumes a streaming line and reports whether it should stay hidden until
	 * the final VCP-aware render path takes over.
	 *
	 * @param line - Streaming line candidate.
	 * @returns Whether the line should be suppressed from incremental UI output.
	 */
	shouldSuppress(line: string): boolean;

	/**
	 * Resets the suppressor to its initial state for the next streaming round.
	 */
	reset(): void;
}

/**
 * Creates a thin streaming suppression adapter so conversation core can keep
 * VCP display protocol details behind the compatibility seam.
 *
 * @returns Stateful suppressor for incremental streaming output.
 */
export function createCompatibilityStreamingSuppressor(): CompatibilityStreamingSuppressor {
	let currentState: VcpStreamingSuppressionState = null;

	return {
		shouldSuppress(line: string): boolean {
			const decision = getVcpStreamingSuppressionDecision(line, currentState);
			currentState = decision.nextState;
			return decision.suppress;
		},
		reset(): void {
			currentState = null;
		},
	};
}

/**
 * Resolves the request method used by context compression without exposing the
 * core caller to VCP mode internals.
 *
 * @param config - Active API configuration.
 * @param model - Model name used for compression.
 * @returns The request method that compression should use.
 */
export function resolveCompatibilityRequestMethod(
	config: ApiConfig,
	model: string,
): RequestMethod {
	return resolveVcpModeRequest(config, {model}).requestMethod;
}
