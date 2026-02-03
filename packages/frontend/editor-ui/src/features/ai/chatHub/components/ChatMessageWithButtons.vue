<script setup lang="ts">
import { ref } from 'vue';
import { N8nButton } from '@n8n/design-system';
import type { ChatHubMessageButton } from '@n8n/api-types';
import ChatMarkdownChunk from './ChatMarkdownChunk.vue';

const { text, buttons, isWaiting } = defineProps<{
	text: string;
	buttons: ChatHubMessageButton[];
	isWaiting: boolean;
}>();

const clickedButtonIndex = ref<number | null>(null);
const isLoading = ref(false);

async function onClick(link: string, index: number) {
	if (clickedButtonIndex.value !== null || !isWaiting) {
		return;
	}

	isLoading.value = true;
	try {
		const response = await fetch(link);
		if (response.ok) {
			clickedButtonIndex.value = index;
		}
	} finally {
		isLoading.value = false;
	}
}
</script>

<template>
	<div :class="$style.container">
		<ChatMarkdownChunk :source="text" />
		<div :class="$style.buttons">
			<template v-for="(button, index) in buttons" :key="button.text">
				<N8nButton
					v-if="clickedButtonIndex === null || index === clickedButtonIndex"
					:type="button.type"
					:disabled="index === clickedButtonIndex || !isWaiting"
					:loading="isLoading && clickedButtonIndex === null"
					size="small"
					@click="onClick(button.link, index)"
				>
					{{ button.text }}
				</N8nButton>
			</template>
		</div>
	</div>
</template>

<style lang="scss" module>
.container {
	display: flex;
	flex-direction: column;
}

.buttons {
	display: flex;
	gap: var(--spacing--xs);
	margin-top: var(--spacing--sm);
}
</style>
