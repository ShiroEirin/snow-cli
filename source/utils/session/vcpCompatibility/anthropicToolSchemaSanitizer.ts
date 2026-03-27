import type {ChatCompletionTool} from '../../../api/chat.js';

const STRIPPED_SCHEMA_KEYS = new Set([
	'$id',
	'$schema',
	'default',
	'deprecated',
	'example',
	'examples',
	'readOnly',
	'writeOnly',
]);

const ZERO_ARGUMENT_COMPAT_PROPERTY = {
	type: 'string',
	description:
		'Optional placeholder for zero-argument tool compatibility on Anthropic-style VCP mode endpoints. Omit during normal use.',
};

function isPlainObject(value: unknown): value is Record<string, any> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeArray(schema: unknown[]): unknown[] {
	return schema.map(item => sanitizeAnthropicToolSchema(item));
}

function collectVariantTypes(variants: Record<string, any>[]): string[] {
	const types = new Set<string>();

	for (const variant of variants) {
		const variantType = variant['type'];
		if (typeof variantType === 'string') {
			types.add(variantType);
			continue;
		}

		if (Array.isArray(variantType)) {
			for (const type of variantType) {
				if (typeof type === 'string') {
					types.add(type);
				}
			}
		}
	}

	return [...types];
}

function mergeArrayItems(
	variants: Record<string, any>[],
): Record<string, any> | undefined {
	const arrayVariants = variants.filter(variant => variant['type'] === 'array');
	if (arrayVariants.length === 0) {
		return undefined;
	}

	const sanitizedItems = arrayVariants
		.map(variant => variant['items'])
		.filter(isPlainObject)
		.map(item => sanitizeAnthropicToolSchema(item))
		.filter(isPlainObject);

	if (sanitizedItems.length !== arrayVariants.length) {
		return undefined;
	}

	const firstSignature = JSON.stringify(sanitizedItems[0]);
	return sanitizedItems.every(
		item => JSON.stringify(item) === firstSignature,
	)
		? sanitizedItems[0]
		: undefined;
}

function mergeObjectVariants(
	variants: Record<string, any>[],
): Record<string, any> | undefined {
	const objectVariants = variants.filter(
		variant => variant['type'] === 'object',
	);
	if (objectVariants.length === 0) {
		return undefined;
	}

	const mergedProperties: Record<string, any> = {};
	const mergedRequired = new Set<string>();

	for (const variant of objectVariants) {
		const variantProperties = variant['properties'];
		if (isPlainObject(variantProperties)) {
			for (const [key, value] of Object.entries(variantProperties)) {
				mergedProperties[key] = sanitizeAnthropicToolSchema(value);
			}
		}

		const variantRequired = variant['required'];
		if (Array.isArray(variantRequired)) {
			for (const key of variantRequired) {
				if (typeof key === 'string') {
					mergedRequired.add(key);
				}
			}
		}
	}

	const result: Record<string, any> = {};
	if (Object.keys(mergedProperties).length > 0) {
		result['properties'] = mergedProperties;
	}

	if (mergedRequired.size > 0) {
		result['required'] = [...mergedRequired];
	}

	return Object.keys(result).length > 0 ? result : undefined;
}

function sanitizeSchemaObject(schema: Record<string, any>): Record<string, any> {
	const result: Record<string, any> = {};

	for (const [key, value] of Object.entries(schema)) {
		if (STRIPPED_SCHEMA_KEYS.has(key)) {
			continue;
		}

		if (key === 'oneOf' || key === 'anyOf' || key === 'allOf') {
			continue;
		}

		if (key === 'properties' && isPlainObject(value)) {
			result['properties'] = Object.fromEntries(
				Object.entries(value).map(([propertyName, propertySchema]) => [
					propertyName,
					sanitizeAnthropicToolSchema(propertySchema),
				]),
			);
			continue;
		}

		if (Array.isArray(value)) {
			result[key] = sanitizeArray(value);
			continue;
		}

		if (isPlainObject(value)) {
			result[key] = sanitizeAnthropicToolSchema(value);
			continue;
		}

		result[key] = value;
	}

	const schemaType = result['type'];
	const isObjectSchema =
		schemaType === 'object' ||
		(Array.isArray(schemaType) && schemaType.includes('object'));
	if (isObjectSchema) {
		const properties = isPlainObject(result['properties'])
			? result['properties']
			: undefined;
		if (!properties || Object.keys(properties).length === 0) {
			result['properties'] = {
				_noop: ZERO_ARGUMENT_COMPAT_PROPERTY,
			};
		}

		if (!Array.isArray(result['required'])) {
			result['required'] = [];
		}
	}

	return result;
}

function sanitizeUnionSchema(
	schema: Record<string, any>,
	keyword: 'oneOf' | 'anyOf' | 'allOf',
): Record<string, any> {
	const variants = Array.isArray(schema[keyword])
		? schema[keyword]
				.filter(isPlainObject)
				.map(variant => sanitizeAnthropicToolSchema(variant))
				.filter(isPlainObject)
		: [];
	const sanitizedBase = sanitizeSchemaObject(schema);

	if (variants.length === 0) {
		return sanitizedBase;
	}

	const variantTypes = collectVariantTypes(variants);
	if (variantTypes.length === 1) {
		sanitizedBase['type'] = variantTypes[0];
	} else if (variantTypes.length > 1) {
		sanitizedBase['type'] = variantTypes;
	}

	const mergedArrayItems = mergeArrayItems(variants);
	if (mergedArrayItems) {
		sanitizedBase['items'] = mergedArrayItems;
	}

	const mergedObjectShape = mergeObjectVariants(variants);
	if (mergedObjectShape) {
		const mergedProperties = mergedObjectShape['properties'];
		if (mergedProperties) {
			const baseProperties = sanitizedBase['properties'];
			sanitizedBase['properties'] = {
				...(isPlainObject(baseProperties)
					? baseProperties
					: {}),
				...mergedProperties,
			};
		}

		const mergedRequired = mergedObjectShape['required'];
		if (Array.isArray(mergedRequired)) {
			const baseRequired = sanitizedBase['required'];
			const required = new Set<string>(
				Array.isArray(baseRequired)
					? baseRequired.filter(
							(value): value is string => typeof value === 'string',
					  )
					: [],
			);
			for (const key of mergedRequired) {
				required.add(key);
			}
			sanitizedBase['required'] = [...required];
		}
	}

	return sanitizedBase;
}

export function sanitizeAnthropicToolSchema(schema: unknown): unknown {
	if (Array.isArray(schema)) {
		return sanitizeArray(schema);
	}

	if (!isPlainObject(schema)) {
		return schema;
	}

	if (Array.isArray(schema['oneOf']) && schema['oneOf'].length > 0) {
		return sanitizeUnionSchema(schema, 'oneOf');
	}

	if (Array.isArray(schema['anyOf']) && schema['anyOf'].length > 0) {
		return sanitizeUnionSchema(schema, 'anyOf');
	}

	if (Array.isArray(schema['allOf']) && schema['allOf'].length > 0) {
		return sanitizeUnionSchema(schema, 'allOf');
	}

	return sanitizeSchemaObject(schema);
}

export function sanitizeAnthropicVcpTools(
	tools?: ChatCompletionTool[],
): ChatCompletionTool[] | undefined {
	if (!tools || tools.length === 0) {
		return undefined;
	}

	return tools.map(tool => ({
		...tool,
		function: {
			...tool.function,
			parameters: sanitizeAnthropicToolSchema(tool.function.parameters) as
				| Record<string, any>
				| undefined,
		},
	}));
}
