import { test, expect } from '../../../fixtures/base';

/**
 * Sentry Baseline Tests - verifies what Sentry captures to establish a baseline.
 * Run with: pnpm test:e2e --grep "Sentry baseline"
 */

test.use({ capability: 'kent' });

test.beforeEach(async ({ n8nContainer }) => {
	await n8nContainer.services.kent.clear();
});

test.describe('Sentry baseline', () => {
	test('frontend error is captured', async ({ n8n, n8nContainer }) => {
		const kent = n8nContainer.services.kent;
		await n8n.navigate.toHome();

		// Trigger unhandled error
		n8n.page.on('pageerror', () => {}); // Suppress Playwright error
		await n8n.page.evaluate(() => {
			setTimeout(() => {
				throw new Error('Test frontend error');
			}, 0);
		});

		// Poll until Kent captures the frontend error
		await expect
			.poll(
				async () => {
					const events = await kent.getEvents();
					return events.find(
						(e) =>
							kent.getSource(e) === 'frontend' &&
							kent.getType(e) === 'error' &&
							kent.getErrorMessage(e).includes('Test frontend error'),
					);
				},
				{ timeout: 10000 },
			)
			.toBeTruthy();
	});

	test('backend transaction is captured', async ({ n8n, n8nContainer }) => {
		const kent = n8nContainer.services.kent;
		await n8n.navigate.toHome();

		// Poll until Kent captures a backend transaction
		await expect
			.poll(
				async () => {
					const events = await kent.getEvents();
					return events.find(
						(e) => kent.getSource(e) === 'backend' && kent.getType(e) === 'transaction',
					);
				},
				{ timeout: 10000 },
			)
			.toBeTruthy();
	});

	test('can count events by source and type', async ({ n8n, n8nContainer }) => {
		const kent = n8nContainer.services.kent;
		await n8n.navigate.toHome();

		// Poll until we have backend transactions, then verify count
		await expect
			.poll(
				async () => {
					const events = await kent.getEvents();
					return events.filter(
						(e) => kent.getSource(e) === 'backend' && kent.getType(e) === 'transaction',
					).length;
				},
				{ timeout: 10000 },
			)
			.toBeGreaterThan(0);
	});
});
