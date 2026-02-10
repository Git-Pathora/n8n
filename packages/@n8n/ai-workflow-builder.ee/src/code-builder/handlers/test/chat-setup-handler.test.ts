import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { StructuredToolInterface } from '@langchain/core/tools';

import type { PlanOutput } from '../../../types/planning';
import type { ChatPayload } from '../../../workflow-builder-agent';
import { ChatSetupHandler } from '../chat-setup-handler';

function createMockTool(name: string): StructuredToolInterface {
	return { name } as unknown as StructuredToolInterface;
}

function createMockLlm() {
	const boundTools: Array<unknown[] | undefined> = [];
	const mockBoundLlm = {};

	const llm = {
		bindTools: jest.fn((tools: unknown[]) => {
			boundTools.push(tools);
			return mockBoundLlm;
		}),
	} as unknown as BaseChatModel;

	return { llm, boundTools, mockBoundLlm };
}

const mockPlan: PlanOutput = {
	summary: 'Fetch weather and send Slack alert',
	trigger: 'Runs every morning at 7 AM',
	steps: [
		{ description: 'Fetch weather forecast', suggestedNodes: ['n8n-nodes-base.httpRequest'] },
		{ description: 'Send Slack notification', suggestedNodes: ['n8n-nodes-base.slack'] },
	],
};

describe('ChatSetupHandler', () => {
	describe('tool exclusion with approved plan', () => {
		const tools = [
			createMockTool('search_nodes'),
			createMockTool('get_node_types'),
			createMockTool('get_suggested_nodes'),
			createMockTool('think'),
		];

		it('excludes get_suggested_nodes tool when planOutput is present', async () => {
			const { llm } = createMockLlm();

			const handler = new ChatSetupHandler({
				llm,
				tools,
				enableTextEditorConfig: false,
				parseAndValidate: jest.fn(),
				getErrorContext: jest.fn(),
			});

			const payload: ChatPayload = {
				id: 'test-1',
				message: 'Build the workflow',
				planOutput: mockPlan,
			};

			await handler.execute({ payload });

			const bindToolsCall = (llm.bindTools as jest.Mock).mock.calls[0][0] as Array<{
				name?: string;
			}>;
			const toolNames = bindToolsCall
				.filter((t): t is { name: string } => 'name' in t)
				.map((t) => t.name);

			expect(toolNames).not.toContain('get_suggested_nodes');
		});

		it('includes get_suggested_nodes tool when planOutput is absent', async () => {
			const { llm } = createMockLlm();

			const handler = new ChatSetupHandler({
				llm,
				tools,
				enableTextEditorConfig: false,
				parseAndValidate: jest.fn(),
				getErrorContext: jest.fn(),
			});

			const payload: ChatPayload = {
				id: 'test-2',
				message: 'Build a weather workflow',
			};

			await handler.execute({ payload });

			const bindToolsCall = (llm.bindTools as jest.Mock).mock.calls[0][0] as Array<{
				name?: string;
			}>;
			const toolNames = bindToolsCall
				.filter((t): t is { name: string } => 'name' in t)
				.map((t) => t.name);

			expect(toolNames).toContain('get_suggested_nodes');
		});

		it('keeps other tools when planOutput is present', async () => {
			const { llm } = createMockLlm();

			const handler = new ChatSetupHandler({
				llm,
				tools,
				enableTextEditorConfig: false,
				parseAndValidate: jest.fn(),
				getErrorContext: jest.fn(),
			});

			const payload: ChatPayload = {
				id: 'test-1',
				message: 'Build the workflow',
				planOutput: mockPlan,
			};

			await handler.execute({ payload });

			const bindToolsCall = (llm.bindTools as jest.Mock).mock.calls[0][0] as Array<{
				name?: string;
			}>;
			const toolNames = bindToolsCall
				.filter((t): t is { name: string } => 'name' in t)
				.map((t) => t.name);

			expect(toolNames).toContain('search_nodes');
			expect(toolNames).toContain('get_node_types');
			expect(toolNames).toContain('think');
		});
	});
});
