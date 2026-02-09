<script setup lang="ts">
import Modal from '@/app/components/Modal.vue';
import NodeIcon from '@/app/components/NodeIcon.vue';
import { useNodeHelpers } from '@/app/composables/useNodeHelpers';
import { useNodeTypesStore } from '@/app/stores/nodeTypes.store';
import { useCredentialsStore } from '@/features/credentials/credentials.store';
import { useProjectsStore } from '@/features/collaboration/projects/projects.store';
import NodeCredentials from '@/features/credentials/components/NodeCredentials.vue';
import ParameterInputList from '@/features/ndv/parameters/components/ParameterInputList.vue';
import { collectParametersByTab } from '@/features/ndv/shared/ndv.utils';
import type { INodeUpdatePropertiesInformation, IUpdateInformation } from '@/Interface';
import { N8nButton, N8nInlineTextEdit } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { createEventBus } from '@n8n/utils/event-bus';
import type { Workflow } from 'n8n-workflow';
import { NodeHelpers, type INode } from 'n8n-workflow';
import { computed, onMounted, ref, shallowRef, watch } from 'vue';

const props = defineProps<{
	modalName: string;
	data: {
		node: INode | null;
		existingToolNames?: string[];
		onConfirm: (configuredNode: INode) => void;
	};
}>();

const i18n = useI18n();
const nodeTypesStore = useNodeTypesStore();
const credentialsStore = useCredentialsStore();
const projectsStore = useProjectsStore();
const nodeHelpers = useNodeHelpers();

const modalBus = ref(createEventBus());
const node = shallowRef(props.data.node);
const existingToolNames = computed(() => props.data.existingToolNames ?? []);
const userEditedName = ref(false);

const nodeTypeDescription = computed(() => {
	if (!props.data.node) {
		return null;
	}
	return nodeTypesStore.getNodeType(props.data.node.type);
});
const parameters = computed(
	() => collectParametersByTab(nodeTypeDescription.value?.properties ?? [], false).params,
);

const hasParameterIssues = computed(() => {
	if (!nodeTypeDescription.value || !node.value) {
		return false;
	}

	const parameterIssues = NodeHelpers.getNodeParametersIssues(
		nodeTypeDescription.value.properties,
		node.value,
		nodeTypeDescription.value,
	);

	return parameterIssues !== null && Object.keys(parameterIssues.parameters ?? {}).length > 0;
});

const hasCredentialIssues = computed(() => {
	if (!nodeTypeDescription.value || !node.value) {
		return false;
	}

	const credentialIssues = nodeHelpers.getNodeIssues(
		nodeTypeDescription.value,
		node.value,
		{ getNode: () => node.value } as unknown as Workflow,
		['parameters', 'execution', 'typeUnknown', 'input'],
	);

	return Object.keys(credentialIssues?.credentials ?? {}).length > 0;
});

const isValid = computed(() => {
	return node.value?.name && !hasParameterIssues.value && !hasCredentialIssues.value;
});

function handleConfirm() {
	if (!node.value) {
		return;
	}

	props.data.onConfirm(node.value);
	modalBus.value.emit('close');
}

function handleCancel() {
	modalBus.value.emit('close');
}

function makeUniqueName(baseName: string, existingNames: string[]): string {
	if (!existingNames.includes(baseName)) return baseName;
	let counter = 1;
	while (existingNames.includes(`${baseName} (${counter})`)) {
		counter++;
	}
	return `${baseName} (${counter})`;
}

function handleChangeParameter(updateData: IUpdateInformation) {
	if (!node.value) return;

	node.value = {
		...node.value,
		parameters: {
			...node.value.parameters,
			[updateData.name]: updateData.value,
		},
	};
}

function handleChangeCredential(updateData: INodeUpdatePropertiesInformation) {
	if (node.value) {
		node.value = {
			...node.value,
			...updateData.properties,
		};
	}
}

function handleChangeName(name: string) {
	if (node.value) {
		userEditedName.value = true;
		node.value = { ...node.value, name };
	}
}

watch(
	() => props.data.node,
	(initialNode) => {
		if (initialNode) {
			const uniqueName = makeUniqueName(initialNode.name, existingToolNames.value);
			let nodeData =
				uniqueName !== initialNode.name ? { ...initialNode, name: uniqueName } : initialNode;

			// Initialize parameters with defaults if node type is available
			if (nodeTypeDescription.value) {
				const defaultParameters = NodeHelpers.getNodeParameters(
					nodeTypeDescription.value.properties ?? [],
					nodeData.parameters ?? {},
					true, // returnDefaults: include all default values
					false, // returnNoneDisplayed: exclude hidden parameters
					nodeData,
					nodeTypeDescription.value,
				);

				nodeData = {
					...nodeData,
					parameters: defaultParameters ?? {},
				};
			}

			node.value = nodeData;
		} else {
			node.value = initialNode;
		}
		userEditedName.value = false;
	},
	{ immediate: true },
);

// Auto-rename when resource/operation changes (if user hasn't manually edited)
watch(
	() => [node.value?.parameters?.resource, node.value?.parameters?.operation],
	() => {
		if (userEditedName.value || !node.value || !nodeTypeDescription.value) return;

		const newName = NodeHelpers.makeNodeName(node.value.parameters, nodeTypeDescription.value);
		if (newName) {
			const uniqueName = makeUniqueName(newName, existingToolNames.value);
			if (uniqueName !== node.value.name) {
				node.value = { ...node.value, name: uniqueName };
			}
		}
	},
);

onMounted(async () => {
	// Ensure credentials are loaded for the credentials selector to work
	const personalProject = projectsStore.personalProject;
	if (personalProject && credentialsStore.allCredentials.length === 0) {
		await Promise.all([
			credentialsStore.fetchCredentialTypes(false),
			credentialsStore.fetchAllCredentialsForWorkflow({ projectId: personalProject.id }),
		]);
	}
});
</script>

<template>
	<Modal
		v-if="node"
		:name="modalName"
		:event-bus="modalBus"
		width="520px"
		:center="true"
		max-width="90vw"
		min-height="250px"
		:class="$style.modal"
	>
		<template #header>
			<div :class="$style.header">
				<NodeIcon
					v-if="nodeTypeDescription"
					:node-type="nodeTypeDescription"
					:size="24"
					:circle="true"
					:class="$style.icon"
				/>
				<N8nInlineTextEdit
					:model-value="node.name"
					:max-width="400"
					:class="$style.title"
					@update:model-value="handleChangeName"
				/>
			</div>
		</template>
		<template #content>
			<ParameterInputList
				:parameters="parameters"
				:hide-delete="true"
				:node-values="node.parameters"
				:is-read-only="false"
				:node="node"
				@value-changed="handleChangeParameter"
			>
				<NodeCredentials
					:node="node"
					:readonly="false"
					:show-all="true"
					:hide-issues="false"
					@credential-selected="handleChangeCredential"
					@value-changed="handleChangeParameter"
				/>
			</ParameterInputList>
		</template>
		<template #footer>
			<div :class="$style.footer">
				<N8nButton type="tertiary" @click="handleCancel">
					{{ i18n.baseText('chatHub.toolSettings.cancel') }}
				</N8nButton>
				<N8nButton type="primary" :disabled="!isValid" @click="handleConfirm">
					{{ i18n.baseText('chatHub.toolSettings.confirm') }}
				</N8nButton>
			</div>
		</template>
	</Modal>
</template>

<style lang="scss" module>
.modal {
	:global(.el-dialog__header) {
		width: 100%;
	}

	:global(.el-dialog__body) {
		padding: var(--spacing--sm);
	}

	/* don't show "This node must be connected to an AI agent." */
	:global(.ndv-connection-hint-notice) {
		display: none;
	}
}

.footer {
	display: flex;
	justify-content: flex-end;
	align-items: center;
	gap: var(--spacing--2xs);
	width: 100%;
	padding-top: var(--spacing--sm);
}

.header {
	display: flex;
	gap: var(--spacing--2xs);
	align-items: center;
	min-width: 0;
}

.icon {
	flex-shrink: 0;
	flex-grow: 0;
}

.title {
	font-size: var(--font-size--md);
	font-weight: var(--font-weight--regular);
	line-height: var(--line-height--lg);
	color: var(--color--text--shade-1);
	flex: 1;
	min-width: 0;
}
</style>
