<script setup lang="ts">
import SetupPanelCards from '@/features/setupPanel/components/SetupPanelCards.vue';
</script>

<template>
	<div :class="$style.container" data-test-id="setup-panel-container">
		<SetupPanelCards />
	</div>
</template>

<style module lang="scss">
.container {
	display: flex;
	height: 100%;
	width: 100%;
	align-items: center;
	justify-content: center;
}
</style>
