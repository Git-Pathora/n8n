import type { WorkflowJSON } from '@n8n/workflow-sdk';

import { buildCodeBuilderPrompt } from './index';

describe('buildCodeBuilderPrompt', () => {
	describe('preGeneratedCode option', () => {
		it('uses preGeneratedCode when provided instead of generating', async () => {
			const workflow: WorkflowJSON = {
				name: 'Test',
				nodes: [
					{
						id: '1',
						name: 'Start',
						type: 'n8n-nodes-base.manualTrigger',
						typeVersion: 1,
						position: [0, 0],
						parameters: {},
					},
				],
				connections: {},
			};

			const customCode = `// Custom pre-generated code
const start = trigger({ type: 'n8n-nodes-base.manualTrigger' });
return workflow('', 'Test').add(start);`;

			const prompt = buildCodeBuilderPrompt(workflow, undefined, {
				preGeneratedCode: customCode,
			});

			const messages = await prompt.formatMessages({ userMessage: 'test' });
			const humanMessage = messages.find((m) => m._getType() === 'human');
			const content = humanMessage?.content as string;

			// Should contain the custom code, not auto-generated
			expect(content).toContain('// Custom pre-generated code');
		});

		it('falls back to generateWorkflowCode when preGeneratedCode not provided', async () => {
			const workflow: WorkflowJSON = {
				name: 'Fallback Test',
				nodes: [
					{
						id: '1',
						name: 'Start',
						type: 'n8n-nodes-base.manualTrigger',
						typeVersion: 1,
						position: [0, 0],
						parameters: {},
					},
				],
				connections: {},
			};

			const prompt = buildCodeBuilderPrompt(workflow, undefined, {});

			const messages = await prompt.formatMessages({ userMessage: 'test' });
			const humanMessage = messages.find((m) => m._getType() === 'human');
			const content = humanMessage?.content as string;

			// Should contain auto-generated code with workflow name
			expect(content).toContain("workflow('', 'Fallback Test')");
		});
	});
});
