import { toolNodeValidator } from '../tool-node-validator';
import type { GraphNode, NodeInstance } from '../../../types/base';
import type { PluginContext } from '../../types';

// Helper to create a mock node instance
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

// Helper to create a mock graph node
function createGraphNode(node: NodeInstance<string, string, unknown>): GraphNode {
	return {
		instance: node,
		connections: new Map(),
	};
}

// Helper to create a mock plugin context
function createMockPluginContext(): PluginContext {
	return {
		nodes: new Map(),
		workflowId: 'test-workflow',
		workflowName: 'Test Workflow',
		settings: {},
	};
}

describe('toolNodeValidator', () => {
	describe('metadata', () => {
		it('has correct id', () => {
			expect(toolNodeValidator.id).toBe('core:tool-node');
		});

		it('has correct name', () => {
			expect(toolNodeValidator.name).toBe('Tool Node Validator');
		});

		it('has no specific nodeTypes (validates all nodes, filters internally)', () => {
			// This validator checks isToolNode internally
			expect(toolNodeValidator.nodeTypes).toBeUndefined();
		});
	});

	describe('validateNode', () => {
		it('returns TOOL_NO_PARAMETERS warning for tool node with no parameters', () => {
			const node = createMockNode('@n8n/n8n-nodes-langchain.toolHttpRequest', {
				parameters: {},
			});
			const ctx = createMockPluginContext();

			const issues = toolNodeValidator.validateNode(node, createGraphNode(node), ctx);

			expect(issues).toContainEqual(
				expect.objectContaining({
					code: 'TOOL_NO_PARAMETERS',
					severity: 'warning',
				}),
			);
		});

		it('returns TOOL_NO_PARAMETERS warning for tool node with undefined parameters', () => {
			const node = createMockNode('@n8n/n8n-nodes-langchain.toolHttpRequest', {});
			const ctx = createMockPluginContext();

			const issues = toolNodeValidator.validateNode(node, createGraphNode(node), ctx);

			expect(issues).toContainEqual(
				expect.objectContaining({
					code: 'TOOL_NO_PARAMETERS',
					severity: 'warning',
				}),
			);
		});

		it('returns no warning for tool node with parameters', () => {
			const node = createMockNode('@n8n/n8n-nodes-langchain.toolHttpRequest', {
				parameters: { url: 'https://api.example.com' },
			});
			const ctx = createMockPluginContext();

			const issues = toolNodeValidator.validateNode(node, createGraphNode(node), ctx);

			expect(issues).toHaveLength(0);
		});

		it('returns no warning for non-tool nodes', () => {
			const node = createMockNode('n8n-nodes-base.set', {
				parameters: {},
			});
			const ctx = createMockPluginContext();

			const issues = toolNodeValidator.validateNode(node, createGraphNode(node), ctx);

			expect(issues).toHaveLength(0);
		});

		it('returns no warning for toolCalculator (does not require parameters)', () => {
			const node = createMockNode('@n8n/n8n-nodes-langchain.toolCalculator', {
				parameters: {},
			});
			const ctx = createMockPluginContext();

			const issues = toolNodeValidator.validateNode(node, createGraphNode(node), ctx);

			expect(issues).toHaveLength(0);
		});

		it('returns no warning for toolVectorStore (does not require parameters)', () => {
			const node = createMockNode('@n8n/n8n-nodes-langchain.toolVectorStore', {
				parameters: {},
			});
			const ctx = createMockPluginContext();

			const issues = toolNodeValidator.validateNode(node, createGraphNode(node), ctx);

			expect(issues).toHaveLength(0);
		});

		it('returns no warning for mcpClientTool (does not require parameters)', () => {
			const node = createMockNode('@n8n/n8n-nodes-langchain.mcpClientTool', {
				parameters: {},
			});
			const ctx = createMockPluginContext();

			const issues = toolNodeValidator.validateNode(node, createGraphNode(node), ctx);

			expect(issues).toHaveLength(0);
		});

		it('returns no warning for toolWikipedia (does not require parameters)', () => {
			const node = createMockNode('@n8n/n8n-nodes-langchain.toolWikipedia', {
				parameters: {},
			});
			const ctx = createMockPluginContext();

			const issues = toolNodeValidator.validateNode(node, createGraphNode(node), ctx);

			expect(issues).toHaveLength(0);
		});

		it('returns no warning for toolSerpApi (does not require parameters)', () => {
			const node = createMockNode('@n8n/n8n-nodes-langchain.toolSerpApi', {
				parameters: {},
			});
			const ctx = createMockPluginContext();

			const issues = toolNodeValidator.validateNode(node, createGraphNode(node), ctx);

			expect(issues).toHaveLength(0);
		});

		it('validates tool nodes with "Tool" in name (case sensitive match)', () => {
			const node = createMockNode('custom.myCustomTool', {
				parameters: {},
			});
			const ctx = createMockPluginContext();

			const issues = toolNodeValidator.validateNode(node, createGraphNode(node), ctx);

			expect(issues).toContainEqual(
				expect.objectContaining({
					code: 'TOOL_NO_PARAMETERS',
					severity: 'warning',
				}),
			);
		});

		it('includes nodeName in issues', () => {
			const node = createMockNode('@n8n/n8n-nodes-langchain.toolHttpRequest', {
				parameters: {},
			});
			Object.assign(node, { name: 'My HTTP Tool' });
			const ctx = createMockPluginContext();

			const issues = toolNodeValidator.validateNode(node, createGraphNode(node), ctx);

			expect(issues[0]?.nodeName).toBe('My HTTP Tool');
		});
	});
});
