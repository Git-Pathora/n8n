/**
 * Merge Node Validator Plugin
 *
 * Validates Merge nodes for proper input connections.
 */

import type { ValidatorPlugin, ValidationIssue, PluginContext } from '../types';
import type { GraphNode, NodeInstance } from '../../types/base';

/**
 * Validator for Merge nodes.
 *
 * Checks for:
 * - Merge nodes with fewer than 2 distinct input connections
 */
export const mergeNodeValidator: ValidatorPlugin = {
	id: 'core:merge-node',
	name: 'Merge Node Validator',
	nodeTypes: ['n8n-nodes-base.merge'],
	priority: 40,

	validateNode(
		node: NodeInstance<string, string, unknown>,
		_graphNode: GraphNode,
		ctx: PluginContext,
	): ValidationIssue[] {
		const issues: ValidationIssue[] = [];

		// Track which distinct input indices have connections
		const connectedInputIndices = new Set<number>();

		// Scan all nodes' connections to find which ones connect to this merge node
		for (const [_name, otherNode] of ctx.nodes) {
			const mainConns = otherNode.connections.get('main');
			if (mainConns) {
				for (const [_outputIndex, targets] of mainConns) {
					for (const target of targets) {
						// Compare against node.name (the actual name in the workflow)
						if (target.node === node.name) {
							connectedInputIndices.add(target.index);
						}
					}
				}
			}
		}

		const inputCount = connectedInputIndices.size;
		if (inputCount < 2) {
			issues.push({
				code: 'MERGE_SINGLE_INPUT',
				message: `'${node.name}' has only ${inputCount} input connection(s). Merge nodes require at least 2 inputs.`,
				severity: 'warning',
				nodeName: node.name,
			});
		}

		return issues;
	},
};
