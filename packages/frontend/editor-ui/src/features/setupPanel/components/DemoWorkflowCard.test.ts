import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createComponentRenderer } from '@/__tests__/render';
import { createTestingPinia } from '@pinia/testing';
import userEvent from '@testing-library/user-event';
import { useWorkflowsStore } from '@/app/stores/workflows.store';
import { useRunWorkflow } from '@/app/composables/useRunWorkflow';
import ReadyToDemoCard from './ReadyToDemoCard.vue';

vi.mock('@/app/composables/useRunWorkflow', () => ({
	useRunWorkflow: vi.fn(),
}));

const renderComponent = createComponentRenderer(ReadyToDemoCard);

describe('ReadyToDemoCard', () => {
	let workflowsStore: ReturnType<typeof useWorkflowsStore>;
	let runEntireWorkflow: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		runEntireWorkflow = vi.fn();
		vi.mocked(useRunWorkflow).mockReturnValue({
			runEntireWorkflow,
		} as any);

		const pinia = createTestingPinia({
			initialState: {
				workflows: {
					workflow: {
						id: '1',
						name: 'Test Workflow',
						pinData: {},
					},
				},
			},
		});

		workflowsStore = useWorkflowsStore(pinia);
	});

	describe('Initial State', () => {
		it('renders in expanded state initially', () => {
			const { getByText } = renderComponent();
			expect(getByText('setupPanel.readyToDemo.header')).toBeInTheDocument();
			expect(getByText('setupPanel.readyToDemo.description')).toBeInTheDocument();
		});

		it('displays skip and run buttons in initial state', () => {
			const { getByText } = renderComponent();
			expect(getByText('setupPanel.readyToDemo.skip')).toBeInTheDocument();
			expect(getByText('setupPanel.readyToDemo.run')).toBeInTheDocument();
		});

		it('shows correct header text for init state', () => {
			const { getByText } = renderComponent();
			expect(getByText('setupPanel.readyToDemo.header')).toBeInTheDocument();
		});
	});

	describe('Skip Functionality', () => {
		it('transitions to skip state when skip button is clicked', async () => {
			const { getByText, emitted } = renderComponent();
			const skipButton = getByText('setupPanel.readyToDemo.skip');

			await userEvent.click(skipButton);

			expect(getByText('setupPanel.readyToDemo.skipped')).toBeInTheDocument();
		});

		it('clears pin data when skipping demo', async () => {
			const pinData = { node1: [{ json: { test: 'data' } }] };
			workflowsStore.workflow.pinData = pinData;

			const { getByText } = renderComponent();
			const skipButton = getByText('setupPanel.readyToDemo.skip');

			await userEvent.click(skipButton);

			expect(workflowsStore.setWorkflowPinData).toHaveBeenCalledWith({});
		});

		it('stores pin data holdover when skipping', async () => {
			const pinData = { node1: [{ json: { test: 'data' } }] };
			workflowsStore.workflow.pinData = pinData;

			const { getByText } = renderComponent();
			const skipButton = getByText('setupPanel.readyToDemo.skip');

			await userEvent.click(skipButton);

			// Verify pin data was stored by checking re-enter functionality
			const undoButton = getByText('generic.undo');
			await userEvent.click(undoButton);

			expect(workflowsStore.setWorkflowPinData).toHaveBeenCalledWith(
				expect.objectContaining({
					node1: expect.any(Array),
				}),
			);
		});

		it('collapses card when in skip state', async () => {
			const { getByText, queryByText } = renderComponent();
			const skipButton = getByText('setupPanel.readyToDemo.skip');

			await userEvent.click(skipButton);

			expect(queryByText('setupPanel.readyToDemo.description')).not.toBeInTheDocument();
		});

		it('shows undo button in skip state', async () => {
			const { getByText } = renderComponent();
			const skipButton = getByText('setupPanel.readyToDemo.skip');

			await userEvent.click(skipButton);

			expect(getByText('generic.undo')).toBeInTheDocument();
		});
	});

	describe('Run Functionality', () => {
		it('transitions to ran state when run button is clicked', async () => {
			const { getByText } = renderComponent();
			const runButton = getByText('setupPanel.readyToDemo.run');

			await userEvent.click(runButton);

			expect(getByText('setupPanel.readyToDemo.ran')).toBeInTheDocument();
		});

		it('executes workflow when run button is clicked', async () => {
			const { getByText } = renderComponent();
			const runButton = getByText('setupPanel.readyToDemo.run');

			await userEvent.click(runButton);

			expect(runEntireWorkflow).toHaveBeenCalledWith('main');
		});

		it('emits testWorkflow event when run button is clicked', async () => {
			const { getByText, emitted } = renderComponent();
			const runButton = getByText('setupPanel.readyToDemo.run');

			await userEvent.click(runButton);

			expect(emitted()).toHaveProperty('testWorkflow');
		});

		it('shows check icon in ran state', async () => {
			const { getByText, container } = renderComponent();
			const runButton = getByText('setupPanel.readyToDemo.run');

			await userEvent.click(runButton);

			const checkIcon = container.querySelector('[data-icon="check"]');
			expect(checkIcon).toBeInTheDocument();
		});

		it('shows clear button in ran state', async () => {
			const { getByText } = renderComponent();
			const runButton = getByText('setupPanel.readyToDemo.run');

			await userEvent.click(runButton);

			expect(getByText('setupPanel.readyToDemo.clear')).toBeInTheDocument();
		});

		it('collapses card when in ran state', async () => {
			const { getByText, queryByText } = renderComponent();
			const runButton = getByText('setupPanel.readyToDemo.run');

			await userEvent.click(runButton);

			expect(queryByText('setupPanel.readyToDemo.description')).not.toBeInTheDocument();
		});
	});

	describe('Clear Functionality', () => {
		it('transitions to clear state when clear button is clicked', async () => {
			const { getByText } = renderComponent();

			// First run the workflow
			const runButton = getByText('setupPanel.readyToDemo.run');
			await userEvent.click(runButton);

			// Then clear
			const clearButton = getByText('setupPanel.readyToDemo.clear');
			await userEvent.click(clearButton);

			// Should still show ran header
			expect(getByText('setupPanel.readyToDemo.ran')).toBeInTheDocument();
		});

		it('restores pin data when clearing', async () => {
			const pinData = { node1: [{ json: { test: 'data' } }] };
			workflowsStore.workflow.pinData = pinData;

			const { getByText } = renderComponent();

			// Skip to store pin data
			const skipButton = getByText('setupPanel.readyToDemo.skip');
			await userEvent.click(skipButton);

			// Re-enter and run
			const undoButton = getByText('generic.undo');
			await userEvent.click(undoButton);

			const runButton = getByText('setupPanel.readyToDemo.run');
			await userEvent.click(runButton);

			// Clear to restore
			const clearButton = getByText('setupPanel.readyToDemo.clear');
			await userEvent.click(clearButton);

			expect(workflowsStore.setWorkflowPinData).toHaveBeenCalledWith(
				expect.objectContaining({
					node1: expect.any(Array),
				}),
			);
		});

		it('shows undo button in clear state', async () => {
			const { getByText } = renderComponent();

			const runButton = getByText('setupPanel.readyToDemo.run');
			await userEvent.click(runButton);

			const clearButton = getByText('setupPanel.readyToDemo.clear');
			await userEvent.click(clearButton);

			expect(getByText('generic.undo')).toBeInTheDocument();
		});

		it('shows check icon in clear state', async () => {
			const { getByText, container } = renderComponent();

			const runButton = getByText('setupPanel.readyToDemo.run');
			await userEvent.click(runButton);

			const clearButton = getByText('setupPanel.readyToDemo.clear');
			await userEvent.click(clearButton);

			const checkIcon = container.querySelector('[data-icon="check"]');
			expect(checkIcon).toBeInTheDocument();
		});
	});

	describe('Re-enter Demo Functionality', () => {
		it('transitions back to init state when undo is clicked from skip state', async () => {
			const { getByText } = renderComponent();

			const skipButton = getByText('setupPanel.readyToDemo.skip');
			await userEvent.click(skipButton);

			const undoButton = getByText('generic.undo');
			await userEvent.click(undoButton);

			expect(getByText('setupPanel.readyToDemo.header')).toBeInTheDocument();
			expect(getByText('setupPanel.readyToDemo.description')).toBeInTheDocument();
		});

		it('transitions back to init state when undo is clicked from clear state', async () => {
			const { getByText } = renderComponent();

			const runButton = getByText('setupPanel.readyToDemo.run');
			await userEvent.click(runButton);

			const clearButton = getByText('setupPanel.readyToDemo.clear');
			await userEvent.click(clearButton);

			const undoButton = getByText('generic.undo');
			await userEvent.click(undoButton);

			expect(getByText('setupPanel.readyToDemo.header')).toBeInTheDocument();
			expect(getByText('setupPanel.readyToDemo.description')).toBeInTheDocument();
		});

		it('restores pin data when re-entering demo', async () => {
			const pinData = { node1: [{ json: { test: 'data' } }] };
			workflowsStore.workflow.pinData = pinData;

			const { getByText } = renderComponent();

			const skipButton = getByText('setupPanel.readyToDemo.skip');
			await userEvent.click(skipButton);

			const undoButton = getByText('generic.undo');
			await userEvent.click(undoButton);

			expect(workflowsStore.setWorkflowPinData).toHaveBeenCalledWith(
				expect.objectContaining({
					node1: expect.any(Array),
				}),
			);
		});

		it('expands card when re-entering demo', async () => {
			const { getByText } = renderComponent();

			const skipButton = getByText('setupPanel.readyToDemo.skip');
			await userEvent.click(skipButton);

			const undoButton = getByText('generic.undo');
			await userEvent.click(undoButton);

			expect(getByText('setupPanel.readyToDemo.description')).toBeInTheDocument();
			expect(getByText('setupPanel.readyToDemo.skip')).toBeInTheDocument();
			expect(getByText('setupPanel.readyToDemo.run')).toBeInTheDocument();
		});
	});

	describe('Pin Data Management', () => {
		it('handles empty pin data correctly', async () => {
			workflowsStore.workflow.pinData = {};

			const { getByText } = renderComponent();
			const skipButton = getByText('setupPanel.readyToDemo.skip');

			await userEvent.click(skipButton);

			expect(workflowsStore.setWorkflowPinData).toHaveBeenCalledWith({});
		});

		it('handles null pin data correctly', async () => {
			workflowsStore.workflow.pinData = null;

			const { getByText } = renderComponent();
			const skipButton = getByText('setupPanel.readyToDemo.skip');

			await userEvent.click(skipButton);

			const undoButton = getByText('generic.undo');
			await userEvent.click(undoButton);

			expect(workflowsStore.setWorkflowPinData).toHaveBeenCalledWith({});
		});

		it('deep clones pin data to prevent mutations', async () => {
			const pinData = { node1: [{ json: { test: 'data' } }] };
			workflowsStore.workflow.pinData = pinData;

			const { getByText } = renderComponent();
			const skipButton = getByText('setupPanel.readyToDemo.skip');

			await userEvent.click(skipButton);

			// Mutate original
			pinData.node1[0].json.test = 'modified';

			const undoButton = getByText('generic.undo');
			await userEvent.click(undoButton);

			// Should restore original value, not mutated value
			expect(workflowsStore.setWorkflowPinData).toHaveBeenCalledWith(
				expect.objectContaining({
					node1: expect.arrayContaining([
						expect.objectContaining({
							json: expect.objectContaining({
								test: 'data',
							}),
						}),
					]),
				}),
			);
		});
	});

	describe('UI States', () => {
		it('applies collapsed class when not in init state', async () => {
			const { getByText, container } = renderComponent();
			const skipButton = getByText('setupPanel.readyToDemo.skip');

			await userEvent.click(skipButton);

			const card = container.querySelector('[class*="card"]');
			expect(card?.className).toContain('collapsed');
		});

		it('applies completed class when in ran state', async () => {
			const { getByText, container } = renderComponent();
			const runButton = getByText('setupPanel.readyToDemo.run');

			await userEvent.click(runButton);

			const card = container.querySelector('[class*="card"]');
			expect(card?.className).toContain('completed');
		});

		it('applies completed class when in clear state', async () => {
			const { getByText, container } = renderComponent();

			const runButton = getByText('setupPanel.readyToDemo.run');
			await userEvent.click(runButton);

			const clearButton = getByText('setupPanel.readyToDemo.clear');
			await userEvent.click(clearButton);

			const card = container.querySelector('[class*="card"]');
			expect(card?.className).toContain('completed');
		});

		it('does not apply completed class in init or skip state', async () => {
			const { getByText, container } = renderComponent();

			let card = container.querySelector('[class*="card"]');
			expect(card?.className).not.toContain('completed');

			const skipButton = getByText('setupPanel.readyToDemo.skip');
			await userEvent.click(skipButton);

			card = container.querySelector('[class*="card"]');
			expect(card?.className).not.toContain('completed');
		});
	});
});
