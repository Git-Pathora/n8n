import type { Schema } from 'n8n-workflow';

/**
 * Convert Schema to output sample data for node({ output: [...] })
 *
 * This generates sample output data that the LLM can use to understand
 * what fields are available from a node's output. Used for data flow awareness.
 *
 * @param schema - The node's output schema
 * @returns A sample object with example values, or null if schema is not an object
 */
export function schemaToOutputSample(schema: Schema): Record<string, unknown> | null {
	if (schema.type !== 'object' || !Array.isArray(schema.value)) {
		return null;
	}

	const sample: Record<string, unknown> = {};
	for (const field of schema.value) {
		if (!field.key) continue;

		// Use the example value if it's a string (primitive value), otherwise use a type-appropriate default
		if (typeof field.value === 'string') {
			// Try to parse the string value to its actual type
			sample[field.key] = parseSchemaValue(field.value, field.type);
		} else if (field.type === 'object' && Array.isArray(field.value)) {
			// Recursively convert nested objects
			const nestedSample = schemaToOutputSample(field as Schema);
			sample[field.key] = nestedSample ?? {};
		} else if (field.type === 'array' && Array.isArray(field.value)) {
			// For arrays, try to get a sample from the first element if available
			sample[field.key] = [];
		} else {
			sample[field.key] = getDefaultForType(field.type);
		}
	}
	return sample;
}

/**
 * Parse a string value from Schema to its actual type
 */
function parseSchemaValue(value: string, type: string): unknown {
	switch (type) {
		case 'number':
			return parseFloat(value) || 0;
		case 'boolean':
			return value === 'true';
		case 'null':
			return null;
		default:
			return value;
	}
}

/**
 * Get a default value for a given schema type
 */
function getDefaultForType(type: string): unknown {
	switch (type) {
		case 'string':
			return '';
		case 'number':
			return 0;
		case 'boolean':
			return false;
		case 'object':
			return {};
		case 'array':
			return [];
		case 'null':
			return null;
		default:
			return null;
	}
}

/**
 * Generate JSDoc comment content with output schema for a node.
 * No TypeScript generics - parser doesn't support them.
 */
export function generateSchemaJSDoc(nodeName: string, schema: Schema): string {
	const lines: string[] = [];
	lines.push(`@output - access via $('${nodeName}').item.json`);

	if (schema.type === 'object' && Array.isArray(schema.value)) {
		for (const field of schema.value) {
			const tsType = schemaTypeToTs(field.type);
			const example =
				typeof field.value === 'string' ? `  // @example ${formatSampleValue(field.value)}` : '';
			lines.push(`  ${field.key}: ${tsType}${example}`);
		}
	}

	return lines.join('\n');
}

function schemaTypeToTs(type: string): string {
	const typeMap: Record<string, string> = {
		string: 'string',
		number: 'number',
		boolean: 'boolean',
		object: 'Record<string, unknown>',
		array: 'unknown[]',
		null: 'null',
		undefined: 'undefined',
	};
	return typeMap[type] ?? 'unknown';
}

function formatSampleValue(value: string): string {
	const maxLen = 40;
	const escaped = value.replace(/\n/g, '\\n');
	return escaped.length > maxLen ? `"${escaped.slice(0, maxLen)}..."` : `"${escaped}"`;
}
