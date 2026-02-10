/**
 * Placeholder Validator Plugin
 *
 * Validates that placeholder() is used directly as a parameter value,
 * not nested inside arrays or objects within arrays.
 */

import type { GraphNode, NodeInstance } from '../../../types/base';
import { findNestedPlaceholders } from '../../validation-helpers';
import type { ValidatorPlugin, ValidationIssue, PluginContext } from '../types';

/**
 * Validator for placeholder usage.
 *
 * Checks for:
 * - placeholder() nested inside array elements (e.g., `values: [{ option: placeholder('...') }]`)
 */
export const placeholderValidator: ValidatorPlugin = {
	id: 'core:placeholder',
	name: 'Placeholder Validator',
	priority: 30,

	validateNode(
		node: NodeInstance<string, string, unknown>,
		_graphNode: GraphNode,
		_ctx: PluginContext,
	): ValidationIssue[] {
		const issues: ValidationIssue[] = [];

		const params = node.config?.parameters;
		if (!params) {
			return issues;
		}

		const placeholderIssues = findNestedPlaceholders(params);

		for (const { path, hint } of placeholderIssues) {
			issues.push({
				code: 'NESTED_PLACEHOLDER',
				message: `'${node.name}' has placeholder('${hint}') nested inside an array at "${path}". Use placeholder() directly as a parameter value, not inside arrays or objects.`,
				severity: 'warning',
				nodeName: node.name,
				parameterPath: path,
			});
		}

		return issues;
	},
};
