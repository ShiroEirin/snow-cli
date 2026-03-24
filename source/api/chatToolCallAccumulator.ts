import {parseJsonWithFix} from '../utils/core/retryUtils.js';
import type {ToolCall} from './types.js';

export type ChatToolCallDelta = {
	index?: number;
	id?: string;
	type?: 'function';
	function?: {
		name?: string;
		arguments?: string;
	};
};

type ToolCallBuffer = {
	id: string;
	type: 'function';
	anonymous: boolean;
	function: {
		name: string;
		arguments: string;
	};
};

function createToolCallBuffer(anonymous: boolean): ToolCallBuffer {
	return {
		id: '',
		type: 'function',
		anonymous,
		function: {
			name: '',
			arguments: '',
		},
	};
}

function mergeField(currentValue: string, incomingValue: string): string {
	if (!currentValue) {
		return incomingValue;
	}

	if (!incomingValue || currentValue.includes(incomingValue)) {
		return currentValue;
	}

	if (incomingValue.includes(currentValue)) {
		return incomingValue;
	}

	return currentValue + incomingValue;
}

export class ChatToolCallAccumulator {
	private readonly orderedBuffers: ToolCallBuffer[] = [];
	private readonly buffersById = new Map<string, ToolCallBuffer>();
	private readonly buffersByIndex = new Map<number, ToolCallBuffer>();
	private readonly knownToolNames: ReadonlySet<string>;

	public constructor(knownToolNames: Iterable<string> = []) {
		this.knownToolNames = new Set(knownToolNames);
	}

	public append(deltaToolCalls: ChatToolCallDelta[]): string[] {
		const streamedDeltas: string[] = [];

		for (const deltaCall of deltaToolCalls) {
			const buffer = this.resolveBuffer(deltaCall, deltaToolCalls.length);
			let deltaText = '';

			if (deltaCall.id) {
				buffer.id = deltaCall.id;
				this.buffersById.set(deltaCall.id, buffer);
			}

			if (typeof deltaCall.index === 'number') {
				this.buffersByIndex.set(deltaCall.index, buffer);
			}

			if (deltaCall.function?.name) {
				buffer.function.name += deltaCall.function.name;
				deltaText += deltaCall.function.name;
			}

			if (deltaCall.function?.arguments) {
				buffer.function.arguments += deltaCall.function.arguments;
				deltaText += deltaCall.function.arguments;
			}

			if (deltaText) {
				streamedDeltas.push(deltaText);
			}
		}

		return streamedDeltas;
	}

	public hasToolCalls(): boolean {
		return this.orderedBuffers.length > 0;
	}

	public finalize(): ToolCall[] {
		return this.orderedBuffers.map((buffer, index) => {
			const normalizedArguments = this.normalizeArguments(
				buffer.function.arguments,
				buffer.function.name,
			);

			return {
				id: buffer.id || `call_anonymous_${index}`,
				type: 'function',
				function: {
					name: buffer.function.name,
					arguments: normalizedArguments,
				},
			};
		});
	}

	private resolveBuffer(
		deltaCall: ChatToolCallDelta,
		batchSize: number,
	): ToolCallBuffer {
		const byId = deltaCall.id ? this.buffersById.get(deltaCall.id) : undefined;
		const byIndex =
			typeof deltaCall.index === 'number'
				? this.buffersByIndex.get(deltaCall.index)
				: undefined;

		if (byId && byIndex && byId !== byIndex) {
			return this.mergeBuffers(byId, byIndex);
		}

		if (byId || byIndex) {
			return byId ?? byIndex!;
		}

		if (!deltaCall.id && typeof deltaCall.index !== 'number') {
			return this.resolveAnonymousBuffer(deltaCall, batchSize);
		}

		const buffer = createToolCallBuffer(false);
		this.orderedBuffers.push(buffer);
		return buffer;
	}

	private resolveAnonymousBuffer(
		deltaCall: ChatToolCallDelta,
		batchSize: number,
	): ToolCallBuffer {
		const incomingName = deltaCall.function?.name;
		const incomingArguments = deltaCall.function?.arguments;
		const anonymousBuffers = this.orderedBuffers.filter(buffer => buffer.anonymous);
		const lastAnonymousBuffer = anonymousBuffers[anonymousBuffers.length - 1];

		if (incomingArguments && !incomingName) {
			const pendingArgumentBuffer = anonymousBuffers.find(
				buffer =>
					buffer.function.name.length > 0 && buffer.function.arguments.length === 0,
			);
			if (pendingArgumentBuffer) {
				return pendingArgumentBuffer;
			}
		}

		if (incomingName && lastAnonymousBuffer) {
			const currentName = lastAnonymousBuffer.function.name;
			const appendedName = currentName + incomingName;
			const currentIsKnown = this.isKnownToolName(currentName);
			const incomingIsKnown = this.isKnownToolName(incomingName);
			const appendedIsKnown = this.isKnownToolName(appendedName);
			const canAppendBySeparator =
				currentName.endsWith('-') ||
				currentName.endsWith('_') ||
				incomingName.startsWith('-') ||
				incomingName.startsWith('_');

			if (!currentName) {
				return lastAnonymousBuffer;
			}

			if (appendedIsKnown || canAppendBySeparator) {
				return lastAnonymousBuffer;
			}

			if (currentIsKnown && incomingIsKnown) {
				return this.createAnonymousBuffer();
			}

			if (batchSize === 1 && !currentIsKnown) {
				return lastAnonymousBuffer;
			}
		}

		if (!incomingName && !incomingArguments && batchSize === 1 && lastAnonymousBuffer) {
			return lastAnonymousBuffer;
		}

		return this.createAnonymousBuffer();
	}

	private createAnonymousBuffer(): ToolCallBuffer {
		const buffer = createToolCallBuffer(true);
		this.orderedBuffers.push(buffer);
		return buffer;
	}

	private mergeBuffers(
		primaryBuffer: ToolCallBuffer,
		secondaryBuffer: ToolCallBuffer,
	): ToolCallBuffer {
		if (primaryBuffer === secondaryBuffer) {
			return primaryBuffer;
		}

		primaryBuffer.id ||= secondaryBuffer.id;
		primaryBuffer.function.name = mergeField(
			primaryBuffer.function.name,
			secondaryBuffer.function.name,
		);
		primaryBuffer.function.arguments = mergeField(
			primaryBuffer.function.arguments,
			secondaryBuffer.function.arguments,
		);

		for (const [id, buffer] of this.buffersById.entries()) {
			if (buffer === secondaryBuffer) {
				this.buffersById.set(id, primaryBuffer);
			}
		}

		for (const [index, buffer] of this.buffersByIndex.entries()) {
			if (buffer === secondaryBuffer) {
				this.buffersByIndex.set(index, primaryBuffer);
			}
		}

		const secondaryIndex = this.orderedBuffers.indexOf(secondaryBuffer);
		if (secondaryIndex >= 0) {
			this.orderedBuffers.splice(secondaryIndex, 1);
		}

		return primaryBuffer;
	}

	private normalizeArguments(rawArguments: string, toolName: string): string {
		const trimmedArguments = rawArguments.trim();
		const parseResult = parseJsonWithFix(trimmedArguments || '{}', {
			toolName,
			fallbackValue: {},
			logWarning: false,
			logError: false,
		});

		return JSON.stringify(parseResult.data);
	}

	private isKnownToolName(name: string): boolean {
		return Boolean(name) && this.knownToolNames.has(name);
	}
}
