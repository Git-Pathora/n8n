import { describe, it, expect } from '@jest/globals';
import { generateSchemaJSDoc, schemaToOutputSample } from './execution-schema-jsdoc';
import type { Schema } from 'n8n-workflow';

describe('execution-schema-jsdoc', () => {
	describe('schemaToOutputSample', () => {
		it('converts object schema with primitive fields to sample object', () => {
			const schema: Schema = {
				type: 'object',
				path: '',
				value: [
					{ type: 'string', key: 'id', value: 'usr_12345', path: 'id' },
					{ type: 'string', key: 'name', value: 'John Doe', path: 'name' },
					{ type: 'number', key: 'age', value: '30', path: 'age' },
					{ type: 'boolean', key: 'active', value: 'true', path: 'active' },
				],
			};

			const result = schemaToOutputSample(schema);

			expect(result).toEqual({
				id: 'usr_12345',
				name: 'John Doe',
				age: 30,
				active: true,
			});
		});

		it('returns null for non-object schemas', () => {
			const stringSchema: Schema = {
				type: 'string',
				path: '',
				value: 'hello',
			};

			expect(schemaToOutputSample(stringSchema)).toBeNull();
		});

		it('handles nested object fields', () => {
			const schema: Schema = {
				type: 'object',
				path: '',
				value: [
					{ type: 'string', key: 'id', value: '123', path: 'id' },
					{
						type: 'object',
						key: 'data',
						path: 'data',
						value: [{ type: 'boolean', key: 'approved', value: 'true', path: 'data.approved' }],
					},
				],
			};

			const result = schemaToOutputSample(schema);

			expect(result).toEqual({
				id: '123',
				data: {
					approved: true,
				},
			});
		});

		it('handles array fields with empty default', () => {
			const schema: Schema = {
				type: 'object',
				path: '',
				value: [{ type: 'array', key: 'items', value: [], path: 'items' }],
			};

			const result = schemaToOutputSample(schema);

			expect(result).toEqual({
				items: [],
			});
		});

		it('returns empty object for empty schema', () => {
			const schema: Schema = {
				type: 'object',
				path: '',
				value: [],
			};

			const result = schemaToOutputSample(schema);

			expect(result).toEqual({});
		});

		it('handles null type fields', () => {
			const schema: Schema = {
				type: 'object',
				path: '',
				value: [{ type: 'null', key: 'empty', value: 'null', path: 'empty' }],
			};

			const result = schemaToOutputSample(schema);

			expect(result).toEqual({
				empty: null,
			});
		});

		it('skips fields without keys', () => {
			const schema: Schema = {
				type: 'object',
				path: '',
				value: [
					{ type: 'string', key: 'valid', value: 'value', path: 'valid' },
					{ type: 'string', value: 'no-key', path: '' }, // missing key
				],
			};

			const result = schemaToOutputSample(schema);

			expect(result).toEqual({
				valid: 'value',
			});
		});
	});

	describe('generateSchemaJSDoc', () => {
		it('generates JSDoc for object schema with primitive fields', () => {
			const schema: Schema = {
				type: 'object',
				path: '',
				value: [
					{ type: 'string', key: 'id', value: 'usr_12345', path: 'id' },
					{ type: 'string', key: 'name', value: 'John Doe', path: 'name' },
					{ type: 'number', key: 'age', value: '30', path: 'age' },
					{ type: 'boolean', key: 'active', value: 'true', path: 'active' },
				],
			};

			const result = generateSchemaJSDoc('Fetch Users', schema);

			expect(result).toContain("@output - access via $('Fetch Users').item.json");
			expect(result).toContain('id: string');
			expect(result).toContain('@example "usr_12345"');
			expect(result).toContain('name: string');
			expect(result).toContain('@example "John Doe"');
			expect(result).toContain('age: number');
			expect(result).toContain('active: boolean');
		});

		it('truncates long sample values', () => {
			const longValue = 'a'.repeat(50);
			const schema: Schema = {
				type: 'object',
				path: '',
				value: [{ type: 'string', key: 'data', value: longValue, path: 'data' }],
			};

			const result = generateSchemaJSDoc('Node', schema);

			expect(result).toContain('@example "' + 'a'.repeat(40) + '..."');
			expect(result).not.toContain(longValue);
		});

		it('escapes newlines in sample values', () => {
			const schema: Schema = {
				type: 'object',
				path: '',
				value: [{ type: 'string', key: 'text', value: 'line1\nline2', path: 'text' }],
			};

			const result = generateSchemaJSDoc('Node', schema);

			expect(result).toContain('@example "line1\\nline2"');
		});

		it('handles nested object fields', () => {
			const schema: Schema = {
				type: 'object',
				path: '',
				value: [{ type: 'object', key: 'metadata', value: [], path: 'metadata' }],
			};

			const result = generateSchemaJSDoc('Node', schema);

			expect(result).toContain('metadata: Record<string, unknown>');
		});

		it('handles array fields', () => {
			const schema: Schema = {
				type: 'object',
				path: '',
				value: [{ type: 'array', key: 'items', value: [], path: 'items' }],
			};

			const result = generateSchemaJSDoc('Node', schema);

			expect(result).toContain('items: unknown[]');
		});

		it('returns empty string for empty schema', () => {
			const schema: Schema = {
				type: 'object',
				path: '',
				value: [],
			};

			const result = generateSchemaJSDoc('Node', schema);

			expect(result).toContain('@output');
			// No fields, just the header
		});

		it('handles special characters in node names', () => {
			const schema: Schema = {
				type: 'object',
				path: '',
				value: [{ type: 'string', key: 'id', value: '123', path: 'id' }],
			};

			const result = generateSchemaJSDoc("Node's Data (v2)", schema);

			expect(result).toContain("@output - access via $('Node's Data (v2)').item.json");
		});
	});
});
