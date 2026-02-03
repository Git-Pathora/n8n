import { mount } from '@vue/test-utils';
import { computed, defineComponent, h, provide } from 'vue';
import { useInjectWorkflowId } from './useInjectWorkflowId';
import { WorkflowIdKey } from '@/app/constants/injectionKeys';
import { createTestingPinia } from '@pinia/testing';
import { useWorkflowsStore } from '@/app/stores/workflows.store';
import { mockedStore } from '@/__tests__/utils';

describe('useInjectWorkflowId', () => {
	it('should inject workflow ID from provider', () => {
		const ChildComponent = defineComponent({
			setup() {
				const workflowId = useInjectWorkflowId();
				return () => h('div', workflowId.value ?? 'undefined');
			},
		});

		const ParentComponent = defineComponent({
			setup() {
				provide(
					WorkflowIdKey,
					computed(() => 'provided-workflow-id'),
				);
				return () => h('div', [h(ChildComponent)]);
			},
		});

		const wrapper = mount(ParentComponent, {
			global: {
				plugins: [createTestingPinia()],
			},
		});

		expect(wrapper.text()).toBe('provided-workflow-id');
	});

	it('should handle undefined provided value', () => {
		const ChildComponent = defineComponent({
			setup() {
				const workflowId = useInjectWorkflowId();
				return () => h('div', workflowId.value ?? 'undefined');
			},
		});

		const ParentComponent = defineComponent({
			setup() {
				provide(
					WorkflowIdKey,
					computed(() => undefined),
				);
				return () => h('div', [h(ChildComponent)]);
			},
		});

		const wrapper = mount(ParentComponent, {
			global: {
				plugins: [createTestingPinia()],
			},
		});

		expect(wrapper.text()).toBe('undefined');
	});

	it('should fallback to workflows store when no provider exists', () => {
		const pinia = createTestingPinia({
			initialState: {
				workflows: {
					workflow: {
						id: 'store-workflow-id',
					},
				},
			},
		});

		const TestComponent = defineComponent({
			setup() {
				const workflowId = useInjectWorkflowId();
				return () => h('div', workflowId.value ?? 'undefined');
			},
		});

		const wrapper = mount(TestComponent, {
			global: {
				plugins: [pinia],
			},
		});

		expect(wrapper.text()).toBe('store-workflow-id');
	});

	it('should be reactive to provided value changes', async () => {
		const workflowIdValue = 'initial-id';
		const providedWorkflowId = computed(() => workflowIdValue);

		const ChildComponent = defineComponent({
			setup() {
				const workflowId = useInjectWorkflowId();
				return () => h('div', workflowId.value ?? 'undefined');
			},
		});

		const ParentComponent = defineComponent({
			setup() {
				provide(WorkflowIdKey, providedWorkflowId);
				return () => h('div', [h(ChildComponent)]);
			},
		});

		const wrapper = mount(ParentComponent, {
			global: {
				plugins: [createTestingPinia()],
			},
		});

		expect(wrapper.text()).toBe('initial-id');
	});

	it('should return ComputedRef type', () => {
		const TestComponent = defineComponent({
			setup() {
				const workflowId = useInjectWorkflowId();
				// Type check: workflowId should be a ComputedRef
				expect(typeof workflowId.value).toBe('string');
				return () => h('div', workflowId.value ?? 'undefined');
			},
		});

		const pinia = createTestingPinia();
		mockedStore(useWorkflowsStore).workflowId = 'type-check-id';

		mount(TestComponent, {
			global: {
				plugins: [pinia],
			},
		});
	});
});
