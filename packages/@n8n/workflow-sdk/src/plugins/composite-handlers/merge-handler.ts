/**
 * Merge Composite Handler Plugin
 *
 * Handles MergeComposite structures - merging multiple branches.
 */

import type { CompositeHandlerPlugin, MutablePluginContext } from '../types';
import type { MergeComposite, NodeInstance, ConnectionTarget } from '../../types/base';
import { isMergeComposite, isMergeNamedInputSyntax } from '../../workflow-builder/type-guards';

/**
 * Handler for Merge composite structures.
 *
 * Recognizes MergeComposite patterns and adds the merge node and its branches
 * to the workflow graph.
 */
export const mergeHandler: CompositeHandlerPlugin<
	MergeComposite<NodeInstance<string, string, unknown>[]>
> = {
	id: 'core:merge',
	name: 'Merge Handler',
	priority: 100,

	canHandle(input: unknown): input is MergeComposite<NodeInstance<string, string, unknown>[]> {
		return isMergeComposite(input);
	},

	addNodes(
		input: MergeComposite<NodeInstance<string, string, unknown>[]>,
		ctx: MutablePluginContext,
	): string {
		// Add the merge node first (without connections - branches connect TO it)
		const mergeConns = new Map<string, Map<number, ConnectionTarget[]>>();
		mergeConns.set('main', new Map());
		ctx.nodes.set(input.mergeNode.name, {
			instance: input.mergeNode,
			connections: mergeConns,
		});

		// Handle named input syntax: merge(node, { input0, input1, ... })
		if (isMergeNamedInputSyntax(input)) {
			const namedMerge = input as MergeComposite<NodeInstance<string, string, unknown>[]> & {
				inputMapping: Map<number, NodeInstance<string, string, unknown>[]>;
				_allInputNodes: NodeInstance<string, string, unknown>[];
			};

			// Track the actual key each node was added under (may differ from node.name if renamed)
			const nodeActualKeys = new Map<NodeInstance<string, string, unknown>, string>();

			// Add all input nodes
			for (const inputNode of namedMerge._allInputNodes) {
				const actualKey = ctx.addBranchToGraph(inputNode);
				nodeActualKeys.set(inputNode, actualKey);
			}

			// Connect tail nodes to merge at their specified input indices
			// Skip connections that already exist (e.g., created by IF/Switch builders with correct output index)
			for (const [inputIndex, tailNodes] of namedMerge.inputMapping) {
				for (const tailNode of tailNodes) {
					const actualKey = nodeActualKeys.get(tailNode) ?? tailNode.name;
					const tailGraphNode = ctx.nodes.get(actualKey);
					if (tailGraphNode) {
						const tailMainConns = tailGraphNode.connections.get('main') || new Map();
						// Check all output indices for an existing connection to this merge at this input
						let connectionExists = false;
						for (const [, conns] of tailMainConns) {
							if (
								conns.some(
									(c: ConnectionTarget) =>
										c.node === input.mergeNode.name && c.index === inputIndex,
								)
							) {
								connectionExists = true;
								break;
							}
						}
						if (!connectionExists) {
							// No existing connection found, create one at output 0
							const existingConns = tailMainConns.get(0) || [];
							tailMainConns.set(0, [
								...existingConns,
								{ node: input.mergeNode.name, type: 'main', index: inputIndex },
							]);
							tailGraphNode.connections.set('main', tailMainConns);
						}
					}
				}
			}

			return input.mergeNode.name;
		}

		// Original behavior: merge([branch1, branch2], config)
		// Add all branch nodes with connections TO the merge node at different input indices
		input.branches.forEach((branch, index) => {
			if (branch === null) {
				return; // Skip null branches - no connection for this input
			}

			// Add the branch node
			const branchHead = ctx.addBranchToGraph(branch);

			// Create connection from branch output 0 to merge at this input index
			const branchNode = ctx.nodes.get(branchHead);
			if (branchNode) {
				const mainConns = branchNode.connections.get('main') || new Map();
				mainConns.set(0, [{ node: input.mergeNode.name, type: 'main', index }]);
				branchNode.connections.set('main', mainConns);
			}
		});

		// Return the merge node name as the head of this composite
		return input.mergeNode.name;
	},
};
