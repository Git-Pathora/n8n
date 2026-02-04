import { computed, type Ref } from 'vue';
import sortBy from 'lodash/sortBy';

import type { INodeUi } from '@/Interface';
import type { NodeCredentialRequirement, NodeSetupState } from '../setupPanel.types';

import { useWorkflowsStore } from '@/app/stores/workflows.store';
import { useCredentialsStore } from '@/features/credentials/credentials.store';
import { useNodeHelpers } from '@/app/composables/useNodeHelpers';
import { injectWorkflowState } from '@/app/composables/useWorkflowState';

/**
 * Composable that manages workflow setup state for credential configuration.
 * Currently only used in the Setup Panel.
 * @param nodes Optional sub-set of nodes to check (defaults to full workflow)
 */
export const useWorkflowSetupState = (nodes?: Ref<INodeUi[]>) => {
	const workflowsStore = useWorkflowsStore();
	const credentialsStore = useCredentialsStore();
	const nodeHelpers = useNodeHelpers();
	const workflowState = injectWorkflowState();

	const sourceNodes = computed(() => nodes?.value ?? workflowsStore.allNodes);

	const nodesWithCredentialIssues = computed(() => {
		return sourceNodes.value.filter((node) => {
			if (node.disabled) return false;
			return node.issues?.credentials && Object.keys(node.issues.credentials).length > 0;
		});
	});

	/**
	 * Nodes with credential issues, sorted by X position (left to right).
	 */
	const nodesWithCredentialIssuesSorted = computed(() => {
		return sortBy(nodesWithCredentialIssues.value, (node) => node.position[0]);
	});

	const getCredentialDisplayName = (credentialType: string): string => {
		const credentialTypeInfo = credentialsStore.getCredentialTypeByName(credentialType);
		return credentialTypeInfo?.displayName ?? credentialType;
	};

	/**
	 * Node setup states - one entry per node with credential issues.
	 * Each entry contains the node and its credential requirements.
	 * These entries will be used to render node setup cards
	 */
	const nodeSetupStates = computed<NodeSetupState[]>(() => {
		return nodesWithCredentialIssuesSorted.value.map((node) => {
			const credentialIssues = node.issues?.credentials ?? {};

			const credentialRequirements: NodeCredentialRequirement[] = Object.entries(
				credentialIssues,
			).map(([credType, messages]) => {
				// Read selected credential directly from node.credentials
				const credValue = node.credentials?.[credType];
				const selectedCredentialId =
					typeof credValue === 'string' ? undefined : (credValue?.id ?? undefined);

				return {
					credentialType: credType,
					credentialDisplayName: getCredentialDisplayName(credType),
					selectedCredentialId,
					issues: Array.isArray(messages) ? messages : [messages],
				};
			});

			const isComplete = credentialRequirements.every((req) => req.selectedCredentialId);

			return {
				node,
				credentialRequirements,
				isComplete,
			};
		});
	});

	const totalCredentialsMissing = computed(() => {
		return nodeSetupStates.value.reduce((total, state) => {
			const missing = state.credentialRequirements.filter((req) => !req.selectedCredentialId);
			return total + missing.length;
		}, 0);
	});

	const totalNodesRequiringSetup = computed(() => {
		return nodeSetupStates.value.length;
	});

	/**
	 * Whether all credential requirements are satisfied.
	 */
	const isAllComplete = computed(() => {
		return nodeSetupStates.value.every((state) => state.isComplete);
	});

	/**
	 * Set a credential for a specific node and credential type.
	 * Updates the workflow node immediately.
	 */
	const setCredential = (nodeName: string, credentialType: string, credentialId: string): void => {
		// Get credential details from store
		const credential = credentialsStore.getCredentialById(credentialId);
		if (!credential) return;

		const node = workflowsStore.getNodeByName(nodeName);
		if (!node) return;

		workflowState.updateNodeProperties({
			name: nodeName,
			properties: {
				credentials: {
					...node.credentials,
					[credentialType]: { id: credentialId, name: credential.name },
				},
			},
		});
		nodeHelpers.updateNodeCredentialIssuesByName(nodeName);
	};

	/**
	 * Unset a credential for a specific node and credential type.
	 * Removes the credential from the workflow node.
	 */
	const unsetCredential = (nodeName: string, credentialType: string): void => {
		const node = workflowsStore.getNodeByName(nodeName);
		if (!node) return;

		const updatedCredentials = { ...node.credentials };
		delete updatedCredentials[credentialType];

		workflowState.updateNodeProperties({
			name: nodeName,
			properties: {
				credentials: updatedCredentials,
			},
		});
		nodeHelpers.updateNodeCredentialIssuesByName(nodeName);
	};

	return {
		nodeSetupStates,
		totalCredentialsMissing,
		totalNodesRequiringSetup,
		isAllComplete,
		setCredential,
		unsetCredential,
	};
};
