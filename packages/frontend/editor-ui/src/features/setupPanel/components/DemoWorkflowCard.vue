<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from '@n8n/i18n';
import { N8nButton, N8nIcon, N8nText, N8nTooltip } from '@n8n/design-system';

import { useWorkflowsStore } from '@/app/stores/workflows.store';
import { type IPinData } from 'n8n-workflow';
import cloneDeep from 'lodash/cloneDeep';

type CardState = 'init' | 'skip' | 'ran' | 'clear';

const state = ref<CardState>('init');

const expanded = computed(() => state.value === 'init');

const emit = defineEmits<{
	exitDemo: [];
	reenterDemo: [];
	testWorkflow: [];
}>();

const pinDataHoldover = ref<IPinData | null>(null);

const i18n = useI18n();
const workflowsStore = useWorkflowsStore();

const workflow = computed(() => workflowsStore.workflow);

const headerText = computed(() => {
	switch (state.value) {
		case 'init':
			return i18n.baseText('setupPanel.readyToDemo.header');
		case 'clear':
		case 'ran':
			return i18n.baseText('setupPanel.readyToDemo.ran');
		case 'skip':
			return i18n.baseText('setupPanel.readyToDemo.skipped');
	}
});

const onExitDemo = () => {
	pinDataHoldover.value = cloneDeep(workflow.value.pinData ?? {});
	workflowsStore.setWorkflowPinData({});
	state.value = 'skip';
};

const onReenterDemo = () => {
	workflowsStore.setWorkflowPinData(pinDataHoldover.value);
	state.value = 'init';
};

const onClearDemoData = () => {
	workflowsStore.setWorkflowPinData(pinDataHoldover.value);
	state.value = 'clear';
};

const onTestClick = () => {
	state.value = 'ran';
	emit('testWorkflow');
};
</script>

<template>
	<div
		:class="[
			$style.card,
			{ [$style.collapsed]: !expanded, [$style.completed]: state === 'ran' || state === 'clear' },
		]"
	>
		<header :class="$style.header">
			<!-- <N8nIcon
				data-test-id="node-setup-card-complete-icon"
				icon="pin"
				:class="$style['complete-icon']"
				size="medium"
			/> -->
			<N8nIcon
				v-if="state === 'ran' || state === 'clear'"
				icon="check"
				:class="$style['complete-icon']"
				size="medium"
			/>
			<span :class="$style['node-name']">{{ headerText }}</span>
			<N8nTooltip
				v-if="state === 'ran'"
				:content="i18n.baseText('setupPanel.readyToDemo.clearTooltip')"
			>
				<N8nText
					:class="$style.clickableText"
					size="xsmall"
					color="text-base"
					@click="onClearDemoData"
					>{{ i18n.baseText('setupPanel.readyToDemo.clear') }}</N8nText
				>
			</N8nTooltip>
			<N8nTooltip
				v-else-if="state === 'clear' || state === 'skip'"
				:content="i18n.baseText('setupPanel.readyToDemo.undoTooltip')"
			>
				<N8nText
					:class="$style.clickableText"
					size="xsmall"
					color="text-base"
					@click="onReenterDemo"
					>{{ i18n.baseText('generic.undo') }}</N8nText
				>
			</N8nTooltip>
		</header>

		<template v-if="expanded">
			<div :class="$style.content">
				<div :class="$style['credential-label-row']">
					<N8nText
						data-test-id="node-setup-card-credential-label"
						:class="$style['credential-label']"
					>
						{{ i18n.baseText('setupPanel.readyToDemo.description') }}
					</N8nText>
				</div>
			</div>

			<footer :class="$style.footer">
				<N8nTooltip :content="i18n.baseText('setupPanel.readyToDemo.skipTooltip')">
					<N8nButton
						data-test-id="node-setup-card-test-button"
						:label="i18n.baseText('setupPanel.readyToDemo.skip')"
						type="secondary"
						size="small"
						@click="onExitDemo"
					/>
				</N8nTooltip>
				<N8nTooltip :content="i18n.baseText('setupPanel.readyToDemo.runTooltip')">
					<N8nButton
						data-test-id="node-setup-card-test-button"
						type="primary"
						:label="i18n.baseText('setupPanel.readyToDemo.run')"
						icon="play"
						size="small"
						@click="onTestClick"
					/>
				</N8nTooltip>
			</footer>
		</template>
	</div>
</template>

<style module lang="scss">
.card {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: var(--spacing--sm);
	background-color: var(--color--background--light-2);
	border: var(--border);
	border-radius: var(--radius);
}

.header {
	display: flex;
	gap: var(--spacing--xs);
	cursor: pointer;
	user-select: none;
	padding: var(--spacing--sm) var(--spacing--sm) 0;
	align-items: center;
	// .card:not(.collapsed) & {
	// 	margin-top: var(--spacing--sm);
	// }
}

.node-name {
	flex: 1;
	font-size: var(--font-size--sm);
	font-weight: var(--font-weight--medium);
	color: var(--color--text);
}

.complete-icon {
	// color: var(--callout--icon-color--secondary); // pinData
	color: var(--color--success);
}

.content {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--xs);
	padding: 0 var(--spacing--sm);
}

.credential-container {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--3xs);
}

.credential-label-row {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
}

.credential-label {
	font-size: var(--font-size--sm);
	color: var(--color--text--shade-1);
}

.shared-nodes-hint {
	font-size: var(--font-size--sm);
	color: var(--color--text--tint-1);
	cursor: default;
}

.credential-picker {
	flex: 1;
}

.footer {
	display: flex;
	justify-content: flex-end;
	gap: var(--spacing--xs);
	padding: 0 var(--spacing--sm) var(--spacing--sm);
}

.footer-complete-check {
	display: flex;
	align-items: center;
	gap: var(--spacing--4xs);
}

.card.collapsed {
	.header {
		padding: var(--spacing--sm);
	}

	.node-name {
		color: var(--color--text--tint-1);
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
}

.card.completed {
	border-color: var(--color--success);

	.footer {
		justify-content: space-between;
	}
}

.clickableText {
	cursor: pointer;
	&:hover {
		text-decoration: underline;
	}
}
</style>
