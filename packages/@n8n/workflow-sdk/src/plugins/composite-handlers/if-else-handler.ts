/**
 * If/Else Composite Handler Plugin
 *
 * Handles IfElseComposite structures - if/else branching patterns.
 */

import type { CompositeHandlerPlugin, MutablePluginContext } from '../types';
import type { IfElseComposite, ConnectionTarget, NodeInstance } from '../../types/base';
import { isIfElseComposite } from '../../workflow-builder/type-guards';

/**
 * Handler for If/Else composite structures.
 *
 * Recognizes IfElseComposite patterns and adds the if node and its branches
 * to the workflow graph.
 */
export const ifElseHandler: CompositeHandlerPlugin<IfElseComposite> = {
	id: 'core:if-else',
	name: 'If/Else Handler',
	priority: 100,

	canHandle(input: unknown): input is IfElseComposite {
		return isIfElseComposite(input);
	},

	addNodes(input: IfElseComposite, ctx: MutablePluginContext): string {
		// Build the IF node connections to its branches
		const ifMainConns = new Map<number, ConnectionTarget[]>();

		// Add true branch (output 0)
		if (input.trueBranch) {
			if (Array.isArray(input.trueBranch)) {
				// Fan-out: multiple parallel targets from trueBranch
				const targets: ConnectionTarget[] = [];
				for (const branchNode of input.trueBranch) {
					const branchHead = ctx.addBranchToGraph(branchNode);
					targets.push({ node: branchHead, type: 'main', index: 0 });
				}
				ifMainConns.set(0, targets);
			} else {
				const trueBranchHead = ctx.addBranchToGraph(input.trueBranch);
				ifMainConns.set(0, [{ node: trueBranchHead, type: 'main', index: 0 }]);
			}
		}

		// Add false branch (output 1)
		if (input.falseBranch) {
			if (Array.isArray(input.falseBranch)) {
				// Fan-out: multiple parallel targets from falseBranch
				const targets: ConnectionTarget[] = [];
				for (const branchNode of input.falseBranch as NodeInstance<string, string, unknown>[]) {
					const branchHead = ctx.addBranchToGraph(branchNode);
					targets.push({ node: branchHead, type: 'main', index: 0 });
				}
				ifMainConns.set(1, targets);
			} else {
				const falseBranchHead = ctx.addBranchToGraph(input.falseBranch);
				ifMainConns.set(1, [{ node: falseBranchHead, type: 'main', index: 0 }]);
			}
		}

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
