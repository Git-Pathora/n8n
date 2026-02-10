<script setup lang="ts">
import { ref } from 'vue';
import { useAgentPanelStore } from '../agentPanel.store';

const panelStore = useAgentPanelStore();
const taskPrompt = ref('');

async function onRunTask() {
	const prompt = taskPrompt.value.trim();
	if (!prompt) return;
	await panelStore.dispatchTask(prompt);
}
</script>

<template>
	<aside :class="$style.panel" data-testid="agent-action-panel">
		<!-- Header -->
		<div :class="$style.header">
			<div :class="$style.headerInfo">
				<span :class="$style.emoji">{{ panelStore.selectedAgent?.emoji }}</span>
				<div>
					<div :class="$style.name">{{ panelStore.selectedAgent?.firstName }}</div>
					<div :class="$style.role">{{ panelStore.selectedAgent?.role }}</div>
					<div v-if="panelStore.zoneName" :class="$style.zone">{{ panelStore.zoneName }}</div>
				</div>
			</div>
			<button
				:class="$style.closeBtn"
				data-testid="agent-panel-close"
				@click="panelStore.closePanel()"
			>
				&times;
			</button>
		</div>

		<!-- Loading -->
		<div v-if="panelStore.isLoading" :class="$style.loading">Loading capabilities...</div>

		<!-- Content -->
		<div v-else :class="$style.content">
			<!-- Workflows -->
			<section :class="$style.section">
				<h3 :class="$style.sectionTitle">Workflows</h3>
				<div v-if="panelStore.capabilities?.workflows.length" :class="$style.list">
					<div
						v-for="wf in panelStore.capabilities.workflows"
						:key="wf.id"
						:class="$style.listItem"
					>
						<span :class="$style.itemName">{{ wf.name }}</span>
						<span :class="[$style.badge, wf.active ? $style.badgeActive : $style.badgeInactive]">
							{{ wf.active ? 'Active' : 'Inactive' }}
						</span>
					</div>
				</div>
				<div v-else :class="$style.empty">No workflows accessible</div>
			</section>

			<!-- Credentials -->
			<section :class="$style.section">
				<h3 :class="$style.sectionTitle">Credentials</h3>
				<div v-if="panelStore.capabilities?.credentials.length" :class="$style.list">
					<div
						v-for="cred in panelStore.capabilities.credentials"
						:key="cred.id"
						:class="$style.listItem"
					>
						<span :class="$style.itemName">{{ cred.name }}</span>
						<span :class="$style.itemType">{{ cred.type }}</span>
					</div>
				</div>
				<div v-else :class="$style.empty">No credentials accessible</div>
			</section>

			<!-- Connected Agents -->
			<section v-if="panelStore.connectedAgents.length" :class="$style.section">
				<h3 :class="$style.sectionTitle">Connected Agents</h3>
				<div :class="$style.list">
					<div v-for="agent in panelStore.connectedAgents" :key="agent.id" :class="$style.listItem">
						<span :class="$style.connectedEmoji">{{ agent.emoji }}</span>
						<span :class="$style.itemName">{{ agent.firstName }}</span>
					</div>
				</div>
			</section>

			<!-- Task Input -->
			<section :class="$style.section">
				<h3 :class="$style.sectionTitle">Run a Task</h3>
				<textarea
					v-model="taskPrompt"
					:class="$style.taskInput"
					placeholder="Describe what this agent should do..."
					data-testid="agent-task-input"
					:disabled="panelStore.isSubmitting"
				/>
				<button
					:class="$style.runBtn"
					data-testid="agent-run-task"
					:disabled="!taskPrompt.trim() || panelStore.isSubmitting"
					@click="onRunTask"
				>
					{{ panelStore.isSubmitting ? 'Running...' : 'Run Task' }}
				</button>
			</section>

			<!-- Task Result -->
			<section v-if="panelStore.taskResult" :class="$style.section">
				<h3 :class="$style.sectionTitle">Result</h3>
				<div
					:class="[
						$style.resultBox,
						panelStore.taskResult.status === 'error' ? $style.resultError : $style.resultSuccess,
					]"
				>
					<div v-if="panelStore.taskResult.summary" :class="$style.resultSummary">
						{{ panelStore.taskResult.summary }}
					</div>
					<div v-if="panelStore.taskResult.message" :class="$style.resultMessage">
						{{ panelStore.taskResult.message }}
					</div>
					<div v-if="panelStore.taskResult.steps?.length" :class="$style.steps">
						<div v-for="(step, i) in panelStore.taskResult.steps" :key="i" :class="$style.step">
							<span :class="$style.stepIndex">{{ i + 1 }}.</span>
							<span>{{ step.action }}</span>
							<span v-if="step.workflowName" :class="$style.stepWorkflow">
								{{ step.workflowName }}
							</span>
							<span v-if="step.toAgent" :class="$style.stepAgent"> &rarr; {{ step.toAgent }} </span>
							<span v-if="step.result" :class="$style.stepResult">{{ step.result }}</span>
						</div>
					</div>
				</div>
			</section>
		</div>
	</aside>
</template>

<style lang="scss" module>
.panel {
	width: 380px;
	flex-shrink: 0;
	border-left: var(--border);
	background: var(--color--background);
	display: flex;
	flex-direction: column;
	overflow-y: auto;
}

.header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	padding: var(--spacing--lg);
	border-bottom: var(--border);
}

.headerInfo {
	display: flex;
	gap: var(--spacing--xs);
	align-items: flex-start;
}

.emoji {
	font-size: var(--font-size--2xl);
	line-height: 1;
}

.name {
	font-size: var(--font-size--lg);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
}

.role {
	font-size: var(--font-size--sm);
	color: var(--color--text--tint-2);
}

.zone {
	font-size: var(--font-size--2xs);
	color: var(--color--primary);
	margin-top: var(--spacing--4xs);
}

.closeBtn {
	background: none;
	border: none;
	font-size: var(--font-size--xl);
	color: var(--color--text--tint-2);
	cursor: pointer;
	padding: 0;
	line-height: 1;

	&:hover {
		color: var(--color--text);
	}
}

.loading {
	padding: var(--spacing--xl);
	text-align: center;
	color: var(--color--text--tint-2);
	font-size: var(--font-size--sm);
}

.content {
	display: flex;
	flex-direction: column;
	gap: 0;
}

.section {
	padding: var(--spacing--sm) var(--spacing--lg);
	border-bottom: var(--border);
}

.sectionTitle {
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
	color: var(--color--text--tint-2);
	text-transform: uppercase;
	letter-spacing: 0.5px;
	margin: 0 0 var(--spacing--2xs);
}

.list {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--4xs);
}

.listItem {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
	padding: var(--spacing--4xs) 0;
	font-size: var(--font-size--sm);
}

.itemName {
	color: var(--color--text);
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.itemType {
	font-size: var(--font-size--2xs);
	color: var(--color--text--tint-2);
	flex-shrink: 0;
}

.badge {
	font-size: var(--font-size--3xs);
	padding: 1px var(--spacing--4xs);
	border-radius: var(--radius);
	flex-shrink: 0;
}

.badgeActive {
	background: var(--color--success--tint-3);
	color: var(--color--success--shade-1);
}

.badgeInactive {
	background: var(--color--foreground--tint-2);
	color: var(--color--text--tint-2);
}

.connectedEmoji {
	font-size: var(--font-size--md);
}

.empty {
	font-size: var(--font-size--sm);
	color: var(--color--text--tint-2);
	font-style: italic;
}

.taskInput {
	width: 100%;
	min-height: 80px;
	padding: var(--spacing--2xs);
	border: var(--border);
	border-radius: var(--radius);
	font-family: var(--font-family);
	font-size: var(--font-size--sm);
	color: var(--color--text);
	background: var(--color--background);
	resize: vertical;
	box-sizing: border-box;

	&::placeholder {
		color: var(--color--text--tint-2);
	}

	&:focus {
		outline: none;
		border-color: var(--color--primary);
	}

	&:disabled {
		opacity: 0.6;
	}
}

.runBtn {
	margin-top: var(--spacing--2xs);
	width: 100%;
	padding: var(--spacing--2xs) var(--spacing--sm);
	background: var(--color--primary);
	color: #fff;
	border: none;
	border-radius: var(--radius);
	font-size: var(--font-size--sm);
	font-weight: var(--font-weight--bold);
	cursor: pointer;

	&:hover:not(:disabled) {
		background: var(--color--primary--shade-1);
	}

	&:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
}

.resultBox {
	padding: var(--spacing--xs);
	border-radius: var(--radius);
	font-size: var(--font-size--sm);
}

.resultSuccess {
	background: var(--color--success--tint-4);
	border: 1px solid var(--color--success--tint-2);
}

.resultError {
	background: var(--color--danger--tint-4);
	border: 1px solid var(--color--danger--tint-3);
}

.resultSummary {
	color: var(--color--text);
	font-weight: var(--font-weight--bold);
	margin-bottom: var(--spacing--4xs);
}

.resultMessage {
	color: var(--color--text--tint-1);
}

.steps {
	margin-top: var(--spacing--2xs);
	display: flex;
	flex-direction: column;
	gap: var(--spacing--4xs);
}

.step {
	display: flex;
	gap: var(--spacing--4xs);
	align-items: baseline;
	font-size: var(--font-size--2xs);
	color: var(--color--text--tint-1);
}

.stepIndex {
	color: var(--color--text--tint-2);
	font-weight: var(--font-weight--bold);
	flex-shrink: 0;
}

.stepWorkflow {
	color: var(--color--primary);
}

.stepAgent {
	color: var(--color--secondary);
}

.stepResult {
	color: var(--color--text--tint-2);
	font-style: italic;
}
</style>
