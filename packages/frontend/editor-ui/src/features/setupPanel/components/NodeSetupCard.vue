<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '@n8n/i18n';
import { N8nButton, N8nIcon } from '@n8n/design-system';

import NodeIcon from '@/app/components/NodeIcon.vue';
import CredentialPicker from '@/features/credentials/components/CredentialPicker/CredentialPicker.vue';
import { useNodeTypesStore } from '@/app/stores/nodeTypes.store';

import type { NodeSetupState } from '../setupPanel.types';

const props = defineProps<{
	state: NodeSetupState;
}>();

const emit = defineEmits<{
	credentialSelected: [payload: { credentialType: string; credentialId: string }];
	credentialDeselected: [credentialType: string];
	testNode: [];
}>();

const i18n = useI18n();
const nodeTypesStore = useNodeTypesStore();

const nodeType = computed(() =>
	nodeTypesStore.getNodeType(props.state.node.type, props.state.node.typeVersion),
);

const nodeDisplayName = computed(() => {
	return nodeType.value?.displayName ?? props.state.node.name;
});

const onCredentialSelected = (credentialType: string, credentialId: string) => {
	emit('credentialSelected', { credentialType, credentialId });
};

const onCredentialDeselected = (credentialType: string) => {
	emit('credentialDeselected', credentialType);
};

const onTestClick = () => {
	emit('testNode');
};
</script>

<template>
	<div :class="$style.card">
		<div :class="$style.header">
			<N8nIcon
				v-if="state.isComplete"
				icon="circle-check"
				:class="$style.completeIcon"
				size="medium"
			/>
			<NodeIcon v-else :node-type="nodeType" :size="24" />
			<span :class="$style.nodeName">{{ nodeDisplayName }}</span>
		</div>

		<div :class="$style.content">
			<div
				v-for="requirement in state.credentialRequirements"
				:key="requirement.credentialType"
				:class="$style.credentialRow"
			>
				<CredentialPicker
					:app-name="requirement.credentialDisplayName"
					:credential-type="requirement.credentialType"
					:selected-credential-id="requirement.selectedCredentialId ?? null"
					@credential-selected="onCredentialSelected(requirement.credentialType, $event)"
					@credential-deselected="onCredentialDeselected(requirement.credentialType)"
				/>
			</div>
		</div>

		<div :class="$style.footer">
			<N8nButton
				:label="i18n.baseText('node.testStep')"
				:disabled="!state.isComplete"
				size="small"
				@click="onTestClick"
			/>
		</div>
	</div>
</template>

<style module lang="scss">
.card {
	background-color: var(--color--background);
	border: var(--border-width) var(--border-style) var(--color--foreground);
	border-radius: var(--radius--lg);
	padding: var(--spacing--sm);
}

.header {
	display: flex;
	align-items: center;
	gap: var(--spacing--xs);
	margin-bottom: var(--spacing--sm);
}

.nodeName {
	font-size: var(--font-size--sm);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
}

.completeIcon {
	color: var(--color--success);
}

.content {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--xs);
}

.credentialRow {
	display: flex;
	align-items: center;
}

.footer {
	display: flex;
	justify-content: flex-end;
	margin-top: var(--spacing--sm);
	padding-top: var(--spacing--sm);
	border-top: var(--border-width) var(--border-style) var(--color--foreground);
}
</style>
