<script setup lang="ts">
import { v4 as uuidv4 } from 'uuid';
import Modal from '@/app/components/Modal.vue';
import { useNodeTypesStore } from '@/app/stores/nodeTypes.store';
import { useUIStore } from '@/app/stores/ui.store';
import { TOOL_SETTINGS_MODAL_KEY } from '@/features/ai/chatHub/constants';
import ToolListItem from './ToolListItem.vue';
import { N8nButton, N8nHeading, N8nIcon, N8nInput, N8nText } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { createEventBus } from '@n8n/utils/event-bus';
import { useDebounceFn } from '@vueuse/core';
import { NodeConnectionTypes, type INode, type INodeTypeDescription } from 'n8n-workflow';
import type { ChatHubToolDto } from '@n8n/api-types';
import { computed, ref, watch } from 'vue';
import { AGENT_TOOL_NODE_TYPE, DEBOUNCE_TIME, getDebounceTime } from '@/app/constants';
import { useChatStore } from '@/features/ai/chatHub/chat.store';
import { useToast } from '@/app/composables/useToast';

defineProps<{
	modalName: string;
	data: {
		tools: INode[];
		onConfirm: (tools: INode[]) => void;
	};
}>();

/** Tool node types that should not be available in the Chat Hub tool selector. */
const CHAT_HUB_EXCLUDED_TOOL_TYPES: string[] = [AGENT_TOOL_NODE_TYPE];

const i18n = useI18n();
const nodeTypesStore = useNodeTypesStore();
const uiStore = useUIStore();
const chatStore = useChatStore();
const toast = useToast();

const modalBus = ref(createEventBus());
const searchQuery = ref('');
const debouncedSearchQuery = ref('');

const setDebouncedSearchQuery = useDebounceFn((value: string) => {
	debouncedSearchQuery.value = value;
}, getDebounceTime(DEBOUNCE_TIME.INPUT.SEARCH));

watch(searchQuery, (newValue) => {
	void setDebouncedSearchQuery(newValue);
});

const tools = computed<ChatHubToolDto[]>(() => chatStore.configuredTools);

const availableToolTypes = computed<INodeTypeDescription[]>(() => {
	const toolTypeNames =
		nodeTypesStore.visibleNodeTypesByOutputConnectionTypeNames[NodeConnectionTypes.AiTool] ?? [];

	return toolTypeNames
		.map((name) => nodeTypesStore.getNodeType(name))
		.filter(
			(nodeType): nodeType is INodeTypeDescription =>
				nodeType !== null && !CHAT_HUB_EXCLUDED_TOOL_TYPES.includes(nodeType.name),
		);
});

const filteredConfiguredTools = computed(() => {
	if (!debouncedSearchQuery.value) {
		return tools.value;
	}
	const query = debouncedSearchQuery.value.toLowerCase();
	return tools.value.filter((tool) => {
		const def = tool.definition;
		const nodeType = nodeTypesStore.getNodeType(def.type, def.typeVersion);
		const nameMatch = def.name.toLowerCase().includes(query);
		const typeMatch = nodeType?.displayName.toLowerCase().includes(query);
		return nameMatch || typeMatch;
	});
});

const filteredAvailableTools = computed(() => {
	if (!debouncedSearchQuery.value) {
		return availableToolTypes.value;
	}
	const query = debouncedSearchQuery.value.toLowerCase();
	return availableToolTypes.value.filter((nodeType) => {
		const nameMatch = nodeType.displayName.toLowerCase().includes(query);
		const descMatch = nodeType.description?.toLowerCase().includes(query);
		return nameMatch || descMatch;
	});
});

function getNodeType(tool: ChatHubToolDto): INodeTypeDescription | null {
	return nodeTypesStore.getNodeType(tool.definition.type, tool.definition.typeVersion);
}

async function handleConfigureTool(tool: ChatHubToolDto) {
	const otherToolNames = tools.value
		.filter((t) => t.definition.id !== tool.definition.id)
		.map((t) => t.definition.name);

	uiStore.openModalWithData({
		name: TOOL_SETTINGS_MODAL_KEY,
		data: {
			node: { ...tool.definition },
			existingToolNames: otherToolNames,
			onConfirm: async (configuredNode: INode) => {
				try {
					await chatStore.updateConfiguredTool(tool.definition.id, configuredNode);
				} catch (error) {
					toast.showError(error, i18n.baseText('chatHub.error.updateToolsFailed'));
				}
			},
		},
	});
}

async function handleRemoveTool(toolId: string) {
	try {
		await chatStore.removeConfiguredTool(toolId);
	} catch (error) {
		toast.showError(error, i18n.baseText('chatHub.error.updateToolsFailed'));
	}
}

async function handleToggleTool(tool: ChatHubToolDto, enabled: boolean) {
	try {
		await chatStore.toggleToolEnabled(tool.definition.id, enabled);
	} catch (error) {
		toast.showError(error, i18n.baseText('chatHub.error.updateToolsFailed'));
	}
}

function handleAddTool(nodeType: INodeTypeDescription) {
	const typeVersion =
		typeof nodeType.version === 'number'
			? nodeType.version
			: nodeType.version.toSorted((a, b) => b - a)?.[0];

	if (!typeVersion) {
		return;
	}

	const newToolId = uuidv4();
	const existingNames = tools.value.map((t) => t.definition.name);

	uiStore.openModalWithData({
		name: TOOL_SETTINGS_MODAL_KEY,
		data: {
			node: {
				type: nodeType.name,
				typeVersion,
				parameters: {},
				id: newToolId,
				name: nodeType.displayName,
				position: [0, 0],
			},
			existingToolNames: existingNames,
			onConfirm: async (configuredNode: INode) => {
				try {
					await chatStore.addConfiguredTool(configuredNode);
				} catch (error) {
					toast.showError(error, i18n.baseText('chatHub.error.updateToolsFailed'));
				}
			},
		},
	});
}

function handleClose() {
	modalBus.value.emit('close');
}
</script>

<template>
	<Modal
		:name="modalName"
		:event-bus="modalBus"
		width="710px"
		:center="true"
		max-width="90vw"
		max-height="80vh"
		:scrollable="true"
		:class="$style.modal"
	>
		<template #header>
			<N8nHeading tag="h2" size="large">
				{{ i18n.baseText('chatHub.toolsManager.title') }}
			</N8nHeading>
		</template>

		<template #content>
			<div :class="$style.content">
				<N8nInput
					v-model="searchQuery"
					:placeholder="i18n.baseText('chatHub.toolsManager.searchPlaceholder')"
					clearable
					:class="$style.searchInput"
				>
					<template #prefix>
						<N8nIcon icon="search" />
					</template>
				</N8nInput>

				<div v-if="filteredConfiguredTools.length > 0" :class="$style.section">
					<N8nHeading size="small" color="text-light" tag="h3">
						{{
							i18n.baseText('chatHub.toolsManager.configuredTools', {
								interpolate: { count: tools.length },
							})
						}}
					</N8nHeading>
					<div :class="$style.toolsList">
						<ToolListItem
							v-for="tool in filteredConfiguredTools"
							:key="tool.definition.id"
							:node-type="getNodeType(tool)!"
							:configured-node="tool.definition"
							:enabled="tool.enabled"
							mode="configured"
							@configure="handleConfigureTool(tool)"
							@remove="handleRemoveTool(tool.definition.id)"
							@toggle="handleToggleTool(tool, $event)"
						/>
					</div>
				</div>

				<div v-if="filteredAvailableTools.length > 0" :class="$style.section">
					<N8nHeading size="small" color="text-light" tag="h3">
						{{
							i18n.baseText('chatHub.toolsManager.availableTools', {
								interpolate: { count: availableToolTypes.length },
							})
						}}
					</N8nHeading>
					<div :class="$style.toolsList">
						<ToolListItem
							v-for="nodeType in filteredAvailableTools"
							:key="nodeType.name"
							:node-type="nodeType"
							mode="available"
							@add="handleAddTool(nodeType)"
						/>
					</div>
				</div>

				<div
					v-if="filteredConfiguredTools.length === 0 && filteredAvailableTools.length === 0"
					:class="$style.emptyState"
				>
					<N8nText color="text-light">
						{{ i18n.baseText('chatHub.toolsManager.noResults') }}
					</N8nText>
				</div>
			</div>
		</template>
	</Modal>
</template>

<style lang="scss" module>
.modal {
	:global(.el-dialog__body) {
		padding: var(--spacing--sm) var(--spacing--md);
	}

	:global(.el-dialog__header) {
		padding: var(--spacing--md) var(--spacing--md) var(--spacing--sm);
	}
}

.content {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--sm);
}

.searchInput {
	padding-bottom: var(--spacing--sm);
	width: 100%;
}

.section {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
}

.toolsList {
	display: flex;
	flex-direction: column;
}

.emptyState {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: var(--spacing--xl);
}

.footer {
	display: flex;
	justify-content: flex-end;
	align-items: center;
	gap: var(--spacing--2xs);
	width: 100%;
	padding: var(--spacing--sm);
}
</style>
