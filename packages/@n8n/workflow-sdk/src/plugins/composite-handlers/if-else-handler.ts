/**
 * If/Else Composite Handler Plugin
 *
 * Handles IfElseComposite and IfElseBuilder structures - if/else branching patterns.
 */

import type { CompositeHandlerPlugin, MutablePluginContext } from '../types';
import type {
	IfElseComposite,
	ConnectionTarget,
	NodeInstance,
	IfElseBuilder,
} from '../../types/base';
import { isIfElseComposite } from '../../workflow-builder/type-guards';
import { isIfElseBuilder } from '../../node-builder';

/**
 * Type representing either Composite or Builder format
 */
type IfElseInput = IfElseComposite | IfElseBuilder<unknown>;

/**
 * Helper to process a branch (handles arrays for fan-out)
 */
function processBranch(
	branch: unknown,
	outputIndex: number,
	ctx: MutablePluginContext,
	ifMainConns: Map<number, ConnectionTarget[]>,
): void {
	if (branch === null || branch === undefined) {
		return; // Skip null branches - no connection for this output
	}

	// Check if branch is an array (fan-out pattern)
	if (Array.isArray(branch)) {
		// Fan-out: multiple parallel targets from this branch
		const targets: ConnectionTarget[] = [];
		for (const branchNode of branch as (NodeInstance<string, string, unknown> | null)[]) {
			if (branchNode === null) continue;
			const branchHead = ctx.addBranchToGraph(branchNode);
			targets.push({ node: branchHead, type: 'main', index: 0 });
		}
		if (targets.length > 0) {
			ifMainConns.set(outputIndex, targets);
		}
	} else {
		const branchHead = ctx.addBranchToGraph(branch);
		ifMainConns.set(outputIndex, [{ node: branchHead, type: 'main', index: 0 }]);
	}
}

/**
 * Handler for If/Else composite structures.
 *
 * Recognizes IfElseComposite and IfElseBuilder patterns and adds the if node
 * and its branches to the workflow graph.
 */
export const ifElseHandler: CompositeHandlerPlugin<IfElseInput> = {
	id: 'core:if-else',
	name: 'If/Else Handler',
	priority: 100,

	canHandle(input: unknown): input is IfElseInput {
		return isIfElseComposite(input) || isIfElseBuilder(input);
	},

	addNodes(input: IfElseInput, ctx: MutablePluginContext): string {
		// Build the IF node connections to its branches
		const ifMainConns = new Map<number, ConnectionTarget[]>();

		// Process true branch (output 0)
		processBranch(input.trueBranch, 0, ctx, ifMainConns);

		// Process false branch (output 1)
		processBranch(input.falseBranch, 1, ctx, ifMainConns);

		// Add the IF node with connections to branches
		const ifConns = new Map<string, Map<number, ConnectionTarget[]>>();
		ifConns.set('main', ifMainConns);
		ctx.nodes.set(input.ifNode.name, {
			instance: input.ifNode,
			connections: ifConns,
		});

		// Return the IF node name as the head of this composite
		return input.ifNode.name;
	},
};
