import { placeholderValidator } from './placeholder-validator';
import type { GraphNode, NodeInstance } from '../../../types/base';
import type { PluginContext } from '../types';

function createMockNode(
	type: string,
	config: { parameters?: Record<string, unknown> } = {},
): NodeInstance<string, string, unknown> {
	return {
		type,
		name: 'Test Node',
		version: '1',
		config: {
			parameters: config.parameters ?? {},
		},
	} as NodeInstance<string, string, unknown>;
}

function createGraphNode(node: NodeInstance<string, string, unknown>): GraphNode {
	return {
		instance: node,
		connections: new Map(),
	};
}

function createMockPluginContext(): PluginContext {
	return {
		nodes: new Map(),
		workflowId: 'test-workflow',
		workflowName: 'Test Workflow',
		settings: {},
	};
}

describe('placeholderValidator', () => {
	describe('metadata', () => {
		it('has correct id', () => {
			expect(placeholderValidator.id).toBe('core:placeholder');
		});

		it('has correct name', () => {
			expect(placeholderValidator.name).toBe('Placeholder Validator');
		});
	});

	describe('validateNode', () => {
		it('returns NESTED_PLACEHOLDER warning for placeholder inside array', () => {
			const node = createMockNode('n8n-nodes-base.formTrigger', {
				parameters: {
					formFields: {
						values: [
							{ fieldOptions: { values: [{ option: { __placeholder: true, hint: 'Choose' } }] } },
						],
					},
				},
			});
			const ctx = createMockPluginContext();

			const issues = placeholderValidator.validateNode(node, createGraphNode(node), ctx);

			expect(issues).toContainEqual(
				expect.objectContaining({
					code: 'NESTED_PLACEHOLDER',
					severity: 'warning',
				}),
			);
		});

		it('returns no warning for direct parameter placeholder', () => {
			const node = createMockNode('n8n-nodes-base.httpRequest', {
				parameters: {
					url: { __placeholder: true, hint: 'Your API URL' },
				},
			});
			const ctx = createMockPluginContext();

			const issues = placeholderValidator.validateNode(node, createGraphNode(node), ctx);

			expect(issues).toHaveLength(0);
		});

		it('returns no warning when parameters is undefined', () => {
			const node = createMockNode('n8n-nodes-base.set', {});
			const ctx = createMockPluginContext();

			const issues = placeholderValidator.validateNode(node, createGraphNode(node), ctx);

			expect(issues).toHaveLength(0);
		});

		it('includes nodeName and parameterPath in issues', () => {
			const node = createMockNode('n8n-nodes-base.form', {
				parameters: {
					items: [{ __placeholder: true, hint: 'Item hint' }],
				},
			});
			Object.assign(node, { name: 'My Form' });
			const ctx = createMockPluginContext();

			const issues = placeholderValidator.validateNode(node, createGraphNode(node), ctx);

			expect(issues[0]?.nodeName).toBe('My Form');
			expect(issues[0]?.parameterPath).toBe('items[0]');
		});
	});
});
