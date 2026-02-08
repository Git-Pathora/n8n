import type { CategoryData } from '../suggested-nodes-data';
import { formatSuggestedNodesForPrompt } from '../suggested-nodes-data';

describe('formatSuggestedNodesForPrompt', () => {
	it('formats a single category with nodes and notes', () => {
		const data: Record<string, CategoryData> = {
			notification: {
				description: 'Sending alerts via email or chat',
				patternHint: 'Trigger → Condition → Send',
				nodes: [
					{ name: 'n8n-nodes-base.gmail', note: 'Easy OAuth setup' },
					{ name: 'n8n-nodes-base.slack' },
				],
			},
		};

		const result = formatSuggestedNodesForPrompt(data);

		expect(result).toBe(
			[
				'**notification** — Pattern: Trigger → Condition → Send',
				'- n8n-nodes-base.gmail — Easy OAuth setup',
				'- n8n-nodes-base.slack',
			].join('\n'),
		);
	});

	it('formats multiple categories separated by blank lines', () => {
		const data: Record<string, CategoryData> = {
			scheduling: {
				description: 'Running actions at specific times',
				patternHint: 'Schedule Trigger → Fetch → Process',
				nodes: [{ name: 'n8n-nodes-base.scheduleTrigger' }],
			},
			triage: {
				description: 'Classifying data for routing',
				patternHint: 'Trigger → Classify → Route',
				nodes: [{ name: '@n8n/n8n-nodes-langchain.textClassifier', note: 'Set fallback branch' }],
			},
		};

		const result = formatSuggestedNodesForPrompt(data);

		expect(result).toContain('**scheduling** — Pattern: Schedule Trigger → Fetch → Process');
		expect(result).toContain('**triage** — Pattern: Trigger → Classify → Route');
		// Categories separated by blank line
		expect(result).toContain('\n\n');
	});

	it('returns empty string for empty data', () => {
		expect(formatSuggestedNodesForPrompt({})).toBe('');
	});

	it('formats the real suggestedNodesData without errors', () => {
		// Integration check: import the real data and format it
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { suggestedNodesData } = require('../suggested-nodes-data') as {
			suggestedNodesData: Record<string, CategoryData>;
		};

		const result = formatSuggestedNodesForPrompt(suggestedNodesData);

		// Should contain all 11 categories
		expect(result).toContain('**chatbot**');
		expect(result).toContain('**notification**');
		expect(result).toContain('**scheduling**');
		expect(result).toContain('**data_transformation**');
		expect(result).toContain('**data_persistence**');
		expect(result).toContain('**data_extraction**');
		expect(result).toContain('**document_processing**');
		expect(result).toContain('**form_input**');
		expect(result).toContain('**content_generation**');
		expect(result).toContain('**triage**');
		expect(result).toContain('**scraping_and_research**');
		// Should be non-trivially sized (rough sanity check)
		expect(result.length).toBeGreaterThan(1000);
	});
});
