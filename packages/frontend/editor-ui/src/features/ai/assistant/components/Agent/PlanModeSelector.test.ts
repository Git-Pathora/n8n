import { describe, it, expect } from 'vitest';

import { renderComponent } from '@/__tests__/render';
import PlanModeSelector from './PlanModeSelector.vue';

function render(modelValue: 'build' | 'plan' = 'build', disabled = false) {
	return renderComponent(PlanModeSelector, {
		props: { modelValue, disabled },
	});
}

describe('PlanModeSelector', () => {
	it('renders with data-test-id', () => {
		const { getByTestId } = render();
		expect(getByTestId('plan-mode-selector')).toBeTruthy();
	});

	it('renders the current mode label for build mode', () => {
		const { container } = render('build');
		// The button should contain the "Build" label text (i18n key resolved to key itself in test)
		const labelSpan = container.querySelector('[class*="label"]');
		expect(labelSpan?.textContent).toBeTruthy();
	});

	it('renders the current mode label for plan mode', () => {
		const { container } = render('plan');
		const labelSpan = container.querySelector('[class*="label"]');
		expect(labelSpan?.textContent).toBeTruthy();
	});

	it('disables the button when disabled prop is true', () => {
		const { container } = render('build', true);
		const button = container.querySelector('button');
		expect(button?.hasAttribute('disabled')).toBe(true);
	});
});
