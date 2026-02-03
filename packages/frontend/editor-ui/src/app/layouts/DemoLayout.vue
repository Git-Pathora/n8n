<script lang="ts" setup>
import BaseLayout from './BaseLayout.vue';
import DemoFooter from '@/features/execution/logs/components/DemoFooter.vue';
import { useProvideWorkflowId } from '@/app/composables/useProvideWorkflowId';

useProvideWorkflowId();
</script>

<template>
	<BaseLayout>
		<RouterView />
		<template #footer>
			<DemoFooter />
		</template>
	</BaseLayout>
</template>
