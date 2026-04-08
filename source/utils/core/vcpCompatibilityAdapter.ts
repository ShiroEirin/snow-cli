import type {ApiConfig, RequestMethod} from '../config/apiConfig.js';
import {formatVcpContentForTranscript} from '../session/vcpCompatibility/display.js';
import {resolveVcpModeRequest} from '../session/vcpCompatibility/mode.js';
import {stripVcpDisplayBlocks} from '../session/vcpCompatibility/display.js';

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
