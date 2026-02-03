import { inject, computed, type ComputedRef } from 'vue';
import { WorkflowIdKey } from '@/app/constants/injectionKeys';
import { useWorkflowsStore } from '@/app/stores/workflows.store';

export function useInjectWorkflowId(): ComputedRef<string> {
	return inject(
		WorkflowIdKey,
		() => {
			// Fallback to store during migration
			const workflowsStore = useWorkflowsStore();
			return computed(() => workflowsStore.workflowId);
		},
		true,
	);
}
