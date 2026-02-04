import { computed, ref, watch, type Ref } from 'vue';
import sortBy from 'lodash/sortBy';

import type { INodeUi } from '@/Interface';
import type { NodeCredentialRequirement, NodeSetupState } from '../setupPanel.types';

import { useWorkflowsStore } from '@/app/stores/workflows.store';
import { useCredentialsStore } from '@/features/credentials/credentials.store';
import { useNodeHelpers } from '@/app/composables/useNodeHelpers';
import { injectWorkflowState } from '@/app/composables/useWorkflowState';

/**
 * Composable that manages workflow setup state for credential configuration.
 * Tracks nodes that have credential issues and provides data for setup UI.
 * It sources nodes with issues from n8n's internal validation system but
 * has it's own tracking to ensure nodes are not removed from the setup panel once issues are resolved.
 *
 * @param nodes Optional sub-set of nodes to check (defaults to full workflow)
 */
export const useWorkflowSetupState = (nodes?: Ref<INodeUi[]>) => {
	const workflowsStore = useWorkflowsStore();
	const credentialsStore = useCredentialsStore();
	const nodeHelpers = useNodeHelpers();
	const workflowState = injectWorkflowState();

	/**
	 * Keep internal record of nodes that need setup so we can keep cards
	 * visible even after node issues are resolved
	 */
	const trackedNodes = ref<Map<string, Set<string>>>(new Map());

	const sourceNodes = computed(() => nodes?.value ?? workflowsStore.allNodes);

	/**
	 * Nodes with current credential issues (used to update tracking).
	 */
	const nodesWithCredentialIssues = computed(() => {
		return sourceNodes.value.filter((node) => {
			if (node.disabled) return false;
			// TODO: Once we start adding support for parameter issues, we need to filter those out here
			return node.issues?.credentials && Object.keys(node.issues.credentials).length > 0;
		});
	});

	watch(
		nodesWithCredentialIssues,
		(nodesWithIssues) => {
			for (const node of nodesWithIssues) {
				const credentialTypes = Object.keys(node.issues?.credentials ?? {});
				if (credentialTypes.length === 0) continue;

				const existing = trackedNodes.value.get(node.id);
				if (existing) {
					for (const credType of credentialTypes) {
						existing.add(credType);
					}
				} else {
					trackedNodes.value.set(node.id, new Set(credentialTypes));
				}
			}
		},
		{ immediate: true },
	);

	/**
	 * Get tracked nodes that still exist in sourceNodes and are enabled.
	 * Sorted by X position (left to right).
	 */
	const trackedNodesSorted = computed(() => {
		const validNodes = sourceNodes.value.filter((node) => {
			if (node.disabled) return false;
			return trackedNodes.value.has(node.id);
		});
		return sortBy(validNodes, (node) => node.position[0]);
	});

	const getCredentialDisplayName = (credentialType: string): string => {
		const credentialTypeInfo = credentialsStore.getCredentialTypeByName(credentialType);
		return credentialTypeInfo?.displayName ?? credentialType;
	};

	/**
	 * Node setup states - one entry per tracked node.
	 * This data is used by cards component
	 */
	const nodeSetupStates = computed<NodeSetupState[]>(() => {
		return trackedNodesSorted.value.map((node) => {
			const trackedCredTypes = trackedNodes.value.get(node.id) ?? new Set();
			const credentialIssues = node.issues?.credentials ?? {};

			// Build requirements from tracked credential types
			const credentialRequirements: NodeCredentialRequirement[] = Array.from(trackedCredTypes).map(
				(credType) => {
					const credValue = node.credentials?.[credType];
					const selectedCredentialId =
						typeof credValue === 'string' ? undefined : (credValue?.id ?? undefined);

					// Get current issues for this credential type (if any)
					const issues = credentialIssues[credType];
					const issueMessages = issues ? (Array.isArray(issues) ? issues : [issues]) : [];

					return {
						credentialType: credType,
						credentialDisplayName: getCredentialDisplayName(credType),
						selectedCredentialId,
						issues: issueMessages,
					};
				},
			);

			const isComplete = credentialRequirements.every(
				(req) => req.selectedCredentialId && req.issues.length === 0,
			);

			return {
				node,
				credentialRequirements,
				isComplete,
			};
		});
	});

	const totalCredentialsMissing = computed(() => {
		return nodeSetupStates.value.reduce((total, state) => {
			const missing = state.credentialRequirements.filter(
				(req) => !req.selectedCredentialId || req.issues.length > 0,
			);
			return total + missing.length;
		}, 0);
	});

	const totalNodesRequiringSetup = computed(() => {
		return nodeSetupStates.value.length;
	});

	const isAllComplete = computed(() => {
		return (
			nodeSetupStates.value.length > 0 && nodeSetupStates.value.every((state) => state.isComplete)
		);
	});

	/**
	 * Set a credential for a specific node and credential type.
	 * Updates the workflow node immediately.
	 */
	const setCredential = (nodeName: string, credentialType: string, credentialId: string): void => {
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
