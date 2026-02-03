/**
 * Set Node Validator Plugin
 *
 * Validates Set nodes for security issues like credential-like field names.
 */

import type { ValidatorPlugin, ValidationIssue, PluginContext } from '../types';
import type { GraphNode, NodeInstance } from '../../types/base';
import { isCredentialFieldName } from '../../workflow-builder/validation-helpers';

/**
 * Validator for Set nodes.
 *
 * Checks for:
 * - Credential-like field names in assignments (password, api_key, secret, token, etc.)
 */
export const setNodeValidator: ValidatorPlugin = {
	id: 'core:set-node',
	name: 'Set Node Validator',
	nodeTypes: ['n8n-nodes-base.set'],
	priority: 40,

	validateNode(
		node: NodeInstance<string, string, unknown>,
		_graphNode: GraphNode,
		_ctx: PluginContext,
	): ValidationIssue[] {
		const issues: ValidationIssue[] = [];
		const params = node.config?.parameters as Record<string, unknown> | undefined;

		if (!params) {
			return issues;
		}

		const assignments = params.assignments as
			| { assignments?: Array<{ name?: string; value?: unknown; type?: string }> }
			| undefined;

		if (!assignments?.assignments) {
			return issues;
		}

		for (const assignment of assignments.assignments) {
			if (assignment.name && isCredentialFieldName(assignment.name)) {
				issues.push({
					code: 'SET_CREDENTIAL_FIELD',
					message: `'${node.name}' has a field named "${assignment.name}" which appears to be storing credentials. Use n8n's credential system instead.`,
					severity: 'warning',
					nodeName: node.name,
				});
			}
		}

		return issues;
	},
};
