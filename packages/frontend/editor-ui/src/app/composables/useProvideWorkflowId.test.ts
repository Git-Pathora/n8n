import { mount } from '@vue/test-utils';
import { computed, defineComponent, h, inject } from 'vue';
import { useProvideWorkflowId } from './useProvideWorkflowId';
import { WorkflowIdKey } from '@/app/constants/injectionKeys';

const mockRoute = {
	params: { name: 'test-workflow-id' },
};

vi.mock('vue-router', () => ({
	useRoute: () => mockRoute,
}));

describe('useProvideWorkflowId', () => {
	beforeEach(() => {
		mockRoute.params = { name: 'test-workflow-id' };
	});

	it('should provide workflow ID from route params', () => {
		const ChildComponent = defineComponent({
			setup() {
				const workflowId = inject(WorkflowIdKey);
				return () => h('div', workflowId?.value);
			},
		});

		const ParentComponent = defineComponent({
			setup() {
				useProvideWorkflowId();
				return () => h('div', [h(ChildComponent)]);
			},
		});

		const wrapper = mount(ParentComponent);
		expect(wrapper.text()).toBe('test-workflow-id');
	});

	it('should return the workflow ID as a computed ref', () => {
		const TestComponent = defineComponent({
			setup() {
				const workflowId = useProvideWorkflowId();
				return () => h('div', workflowId.value);
			},
		});

		const wrapper = mount(TestComponent);
		expect(wrapper.text()).toBe('test-workflow-id');
	});

	it('should handle array route params by using the first value', () => {
		mockRoute.params = { name: ['first-id', 'second-id'] };

		const TestComponent = defineComponent({
			setup() {
				const workflowId = useProvideWorkflowId();
				return () => h('div', workflowId.value ?? 'undefined');
			},
		});

		const wrapper = mount(TestComponent);
		expect(wrapper.text()).toBe('first-id');
	});

	it('should handle undefined route params', () => {
		mockRoute.params = {};

		const TestComponent = defineComponent({
			setup() {
				const workflowId = useProvideWorkflowId();
				return () => h('div', workflowId.value ?? 'undefined');
			},
		});

		const wrapper = mount(TestComponent);
		expect(wrapper.text()).toBe('undefined');
	});
});
