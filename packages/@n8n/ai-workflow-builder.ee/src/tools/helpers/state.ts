import type { ToolRunnableConfig } from '@langchain/core/tools';
import { getCurrentTaskInput } from '@langchain/langgraph';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { INode, IConnection } from 'n8n-workflow';

import type { PendingNodeEntry, PendingNodeRegistry } from '../../types/pending-nodes';
import type { SimpleWorkflow } from '../../types/workflow';
import type { WorkflowState } from '../../workflow-state';

/**
 * Get the current workflow from state in a type-safe manner
 */
export function getCurrentWorkflow(state: typeof WorkflowState.State): SimpleWorkflow {
	return state.workflowJSON;
}

export function getWorkflowState(): typeof WorkflowState.State {
	return getCurrentTaskInput();
}

/**
 * Get the current workflow from task input
 */
export function getCurrentWorkflowFromTaskInput(): SimpleWorkflow {
	const state = getWorkflowState();
	return getCurrentWorkflow(state);
}

type PendingNodesConfig = (ToolRunnableConfig & LangGraphRunnableConfig) | undefined;

function getPendingNodesRegistry(config: PendingNodesConfig): PendingNodeRegistry | undefined {
	const configurable = config?.configurable as { pendingNodes?: PendingNodeRegistry } | undefined;
	return configurable?.pendingNodes;
}

export function getPendingNodeEntry(
	config: PendingNodesConfig,
	nodeName: string,
): PendingNodeEntry | undefined {
	const registry = getPendingNodesRegistry(config);
	if (!registry) return undefined;
	return registry[nodeName.toLowerCase()];
}

export function resolvePendingNode(config: PendingNodesConfig, node: INode): void {
	const entry = getPendingNodeEntry(config, node.name);
	entry?.resolve(node);
}

export function rejectPendingNode(
	config: PendingNodesConfig,
	nodeName: string,
	error: Error,
): void {
	const entry = getPendingNodeEntry(config, nodeName);
	entry?.reject(error);
}

/**
 * Create a state update for workflow connections
 */
export function updateWorkflowConnections(
	connections: SimpleWorkflow['connections'],
): Partial<typeof WorkflowState.State> {
	// Return an operation to merge connections (not replace them)
	return {
		workflowOperations: [{ type: 'mergeConnections', connections }],
	};
}

/**
 * Add a node to the workflow state
 */
export function addNodeToWorkflow(node: INode): Partial<typeof WorkflowState.State> {
	return addNodesToWorkflow([node]);
}

/**
 * Add multiple nodes to the workflow state
 */
export function addNodesToWorkflow(nodes: INode[]): Partial<typeof WorkflowState.State> {
	// Return an operation to add nodes
	return {
		workflowOperations: [{ type: 'addNodes', nodes }],
	};
}

/**
 * Remove a node from the workflow state
 */
export function removeNodeFromWorkflow(nodeName: string): Partial<typeof WorkflowState.State> {
	// Return an operation to remove nodes
	return {
		workflowOperations: [{ type: 'removeNode', nodeNames: [nodeName] }],
	};
}

/**
 * Remove multiple nodes from the workflow state
 */
export function removeNodesFromWorkflow(nodeNames: string[]): Partial<typeof WorkflowState.State> {
	// Return an operation to remove nodes
	return {
		workflowOperations: [{ type: 'removeNode', nodeNames }],
	};
}

/**
 * Update a node in the workflow state
 */
export function updateNodeInWorkflow(
	state: typeof WorkflowState.State,
	nodeName: string,
	updates: Partial<INode>,
): Partial<typeof WorkflowState.State> {
	const existingNode = state.workflowJSON.nodes.find(
		(n) => n.name.toLowerCase() === nodeName.toLowerCase(),
	);
	if (!existingNode) {
		return {};
	}

	// Return an operation to update the node
	return {
		workflowOperations: [{ type: 'updateNode', nodeName, updates }],
	};
}

/**
 * Queue a node update intent for later resolution
 */
export function addUpdateNodeIntentToWorkflow(
	nodeName: string,
	updates: Partial<INode>,
): Partial<typeof WorkflowState.State> {
	return {
		workflowOperations: [{ type: 'updateNodeIntent', nodeName, updates }],
	};
}

/**
 * Queue a connection intent for later resolution
 */
export function addConnectIntentToWorkflow(
	sourceNodeName: string,
	targetNodeName: string,
	connectionType?: string,
	sourceOutputIndex: number = 0,
	targetInputIndex: number = 0,
): Partial<typeof WorkflowState.State> {
	return {
		workflowOperations: [
			{
				type: 'connectIntent',
				sourceNodeName,
				targetNodeName,
				connectionType,
				sourceOutputIndex,
				targetInputIndex,
			},
		],
	};
}

/**
 * Add a connection to the workflow state
 */
export function addConnectionToWorkflow(
	sourceNodeId: string,
	_targetNodeId: string,
	connection: IConnection,
): Partial<typeof WorkflowState.State> {
	return {
		workflowOperations: [
			{
				type: 'mergeConnections',
				connections: {
					[sourceNodeId]: {
						main: [[connection]],
					},
				},
			},
		],
	};
}

/**
 * Remove a connection from the workflow state
 */
export function removeConnectionFromWorkflow(
	sourceNode: string,
	targetNode: string,
	connectionType: string,
	sourceOutputIndex: number,
	targetInputIndex: number,
): Partial<typeof WorkflowState.State> {
	return {
		workflowOperations: [
			{
				type: 'removeConnection',
				sourceNode,
				targetNode,
				connectionType,
				sourceOutputIndex,
				targetInputIndex,
			},
		],
	};
}

/**
 * Rename a node in the workflow state
 */
export function renameNodeInWorkflow(
	oldName: string,
	newName: string,
): Partial<typeof WorkflowState.State> {
	return {
		workflowOperations: [{ type: 'renameNode', oldName, newName }],
	};
}
