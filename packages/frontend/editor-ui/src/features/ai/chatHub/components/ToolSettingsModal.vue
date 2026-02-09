<script setup lang="ts">
import Modal from '@/app/components/Modal.vue';
import NodeIcon from '@/app/components/NodeIcon.vue';
import { useNodeHelpers } from '@/app/composables/useNodeHelpers';
import { useNodeTypesStore } from '@/app/stores/nodeTypes.store';
import { useCredentialsStore } from '@/features/credentials/credentials.store';
import { useProjectsStore } from '@/features/collaboration/projects/projects.store';
import NodeCredentials from '@/features/credentials/components/NodeCredentials.vue';
import ParameterInputList from '@/features/ndv/parameters/components/ParameterInputList.vue';
import { collectParametersByTab, createCommonNodeSettings } from '@/features/ndv/shared/ndv.utils';
import type { INodeUpdatePropertiesInformation, ITab, IUpdateInformation } from '@/Interface';
import { N8nButton, N8nInlineTextEdit, N8nTabs, N8nText } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { createEventBus } from '@n8n/utils/event-bus';
import {
	Workflow,
	NodeHelpers,
	deepCopy,
	type INode,
	type INodeParameters,
	type INodeTypes,
	type INodeType,
	type IVersionedNodeType,
	type IDataObject,
} from 'n8n-workflow';
import { computed, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue';
import { ExpressionLocalResolveContextSymbol } from '@/app/constants';
import type { ExpressionLocalResolveContext } from '@/app/types/expressions';
import useEnvironmentsStore from '@/features/settings/environments.ee/environments.store';

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
const environmentsStore = useEnvironmentsStore();

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
type ToolSettingsTab = 'params' | 'settings';
const activeTab = ref<ToolSettingsTab>('params');

const parametersByTab = computed(() =>
	collectParametersByTab(nodeTypeDescription.value?.properties ?? [], false),
);

const tabOptions = computed<Array<ITab<ToolSettingsTab>>>(() => [
	{ label: i18n.baseText('nodeSettings.parameters'), value: 'params' },
	{ label: i18n.baseText('nodeSettings.settings'), value: 'settings' },
]);

const nodeSettings = computed(() => createCommonNodeSettings(true, i18n.baseText.bind(i18n)));

const settingsNodeValues = computed<INodeParameters>(() => {
	if (!node.value) return { notes: '', notesInFlow: false, parameters: {} };
	return {
		notes: node.value.notes ?? '',
		notesInFlow: node.value.notesInFlow ?? false,
		parameters: deepCopy(node.value.parameters),
	};
});

const showNoParametersNotice = computed(
	() => parametersByTab.value.params.filter((item) => item.type !== 'notice').length === 0,
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

const expressionResolveCtx = computed<ExpressionLocalResolveContext | undefined>(() => {
	if (!node.value) return undefined;

	const nodeTypes: INodeTypes = {
		getByName(nodeType: string): INodeType | IVersionedNodeType {
			const description = nodeTypesStore.getNodeType(nodeType);
			if (description === null) {
				throw new Error(`Node type "${nodeType}" not found`);
			}

			return {
				description,
			} as INodeType;
		},
		getByNameAndVersion(nodeType: string, version?: number): INodeType {
			const description = nodeTypesStore.getNodeType(nodeType, version);
			if (description === null) {
				throw new Error(`Node type "${nodeType}" (v${version}) not found`);
			}

			return {
				description,
			} as INodeType;
		},
		getKnownTypes(): IDataObject {
			return {};
		},
	};

	// Minimal workflow containing only this node for parameter resolution
	const workflow = new Workflow({
		id: 'chat-tool-workflow',
		name: 'Tool Configuration',
		nodes: [node.value],
		connections: {},
		active: false,
		nodeTypes,
		settings: {},
	});

	return {
		localResolve: true,
		envVars: environmentsStore.variablesAsObject,
		workflow,
		execution: null,
		nodeName: node.value.name,
		additionalKeys: {},
		connections: {},
		inputNode: undefined,
	};
});

const isValid = computed(() => {
	return node.value?.name && !hasParameterIssues.value && !hasCredentialIssues.value;
});

// Provide expression resolve context for dynamic parameter loading
provide(ExpressionLocalResolveContextSymbol, expressionResolveCtx);

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

function handleChangeSettingsValue(updateData: IUpdateInformation) {
	if (!node.value) return;
	if (updateData.name.startsWith('parameters.')) {
		const paramName = updateData.name.slice('parameters.'.length);
		node.value = {
			...node.value,
			parameters: { ...node.value.parameters, [paramName]: updateData.value },
		};
	} else {
		node.value = { ...node.value, [updateData.name]: updateData.value };
	}
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
	// Set personal project as current project for dynamic parameter loading
	const personalProject = projectsStore.personalProject;
	if (personalProject) {
		projectsStore.setCurrentProject(personalProject);

		// Ensure credentials are loaded for the credentials selector to work
		if (credentialsStore.allCredentials.length === 0) {
			await Promise.all([
				credentialsStore.fetchCredentialTypes(false),
				credentialsStore.fetchAllCredentialsForWorkflow({ projectId: personalProject.id }),
			]);
		}
	}
});

onBeforeUnmount(() => {
	// Clear current project to avoid side effects
	projectsStore.setCurrentProject(null);
});
</script>

<template>
	<Modal
		v-if="node"
		:name="modalName"
		:event-bus="modalBus"
		width="710px"
		:center="true"
		max-width="90vw"
		min-height="250px"
		max-height="650px"
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
			<N8nTabs
				:model-value="activeTab"
				:options="tabOptions"
				:class="$style.tabs"
				@update:model-value="activeTab = $event"
			/>

			<div :class="$style.tabContent">
				<!-- Parameters Tab -->
				<div v-show="activeTab === 'params'">
					<ParameterInputList
						:parameters="parametersByTab.params"
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
					<div v-if="showNoParametersNotice" :class="$style.noParameters">
						<N8nText>
							{{ i18n.baseText('nodeSettings.thisNodeDoesNotHaveAnyParameters') }}
						</N8nText>
					</div>
				</div>

				<!-- Settings Tab -->
				<div v-show="activeTab === 'settings'">
					<ParameterInputList
						v-if="parametersByTab.settings.length > 0"
						:parameters="parametersByTab.settings"
						:node-values="settingsNodeValues"
						:is-read-only="false"
						:hide-delete="true"
						path="parameters"
						:node="node"
						@value-changed="handleChangeSettingsValue"
					/>
					<ParameterInputList
						:parameters="nodeSettings"
						:hide-delete="true"
						:node-values="settingsNodeValues"
						:is-read-only="false"
						path=""
						:node="node"
						@value-changed="handleChangeSettingsValue"
					/>
				</div>
			</div>
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
		padding: var(--spacing--sm) var(--spacing--md);
	}

	:global(.modal-content) {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* don't show "This node must be connected to an AI agent." */
	:global(.ndv-connection-hint-notice) {
		display: none;
	}
}

.tabs {
	flex-shrink: 0;
	margin-bottom: var(--spacing--xs);
}

.noParameters {
	margin-top: var(--spacing--xs);
}

.tabContent {
	flex: 1;
	overflow-y: auto;
	min-height: 0;
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
