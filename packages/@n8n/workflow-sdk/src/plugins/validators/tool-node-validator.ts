/**
 * Tool Node Validator Plugin
 *
 * Validates Tool nodes for missing parameters.
 */

import type { ValidatorPlugin, ValidationIssue, PluginContext } from '../types';
import type { GraphNode, NodeInstance } from '../../types/base';
import { isToolNode, TOOLS_WITHOUT_PARAMETERS } from '../../workflow-builder/validation-helpers';

/**
 * Validator for Tool nodes.
 *
 * Checks for:
 * - Tool nodes with missing parameters (except tools that don't require them)
 */
export const toolNodeValidator: ValidatorPlugin = {
	id: 'core:tool-node',
	name: 'Tool Node Validator',
	// No nodeTypes - we check isToolNode internally
	priority: 50,

	validateNode(
		node: NodeInstance<string, string, unknown>,
		_graphNode: GraphNode,
		_ctx: PluginContext,
	): ValidationIssue[] {
		const issues: ValidationIssue[] = [];

		// Only validate tool nodes
		if (!isToolNode(node.type)) {
			return issues;
		}

		// Skip tools that don't need parameters
		if (TOOLS_WITHOUT_PARAMETERS.has(node.type)) {
			return issues;
		}

		const params = node.config?.parameters;
		if (!params || Object.keys(params).length === 0) {
			issues.push({
				code: 'TOOL_NO_PARAMETERS',
				message: `'${node.name}' has no parameters set.`,
				severity: 'warning',
				nodeName: node.name,
			});
		}

		return issues;
	},
};
