<script setup lang="ts">
import { useWorkflowSetupState } from '@/features/setupPanel/composables/useWorkflowSetupState';
import { onMounted } from 'vue';

const { nodeSetupStates, isAllComplete } = useWorkflowSetupState();

onMounted(() => {
	console.log('Node Setup States:', nodeSetupStates.value);
	console.log('Is All Complete:', isAllComplete.value);
});
</script>

<template>
	<div>HELLO</div>
</template>
