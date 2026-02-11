import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { StructuredToolInterface } from '@langchain/core/tools';

import type { PlanOutput } from '../../../types/planning';
import type { ChatPayload } from '../../../workflow-builder-agent';
import { ChatSetupHandler, extractSearchQueriesFromPlan } from '../chat-setup-handler';

function createMockTool(name: string): StructuredToolInterface {
	return { name } as unknown as StructuredToolInterface;
}

function createMockSearchTool() {
	const invoke = jest.fn().mockResolvedValue('mock search results for httpRequest, slack');
	return {
		tool: { name: 'search_nodes', invoke } as unknown as StructuredToolInterface,
		invoke,
	};
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

	describe('pre-fetch search results', () => {
		it('invokes search_nodes tool with correct queries when planOutput has suggestedNodes', async () => {
			const { llm } = createMockLlm();
			const { tool: searchTool, invoke } = createMockSearchTool();

			const tools = [searchTool, createMockTool('get_node_types'), createMockTool('think')];

			const handler = new ChatSetupHandler({
				llm,
				tools,
				enableTextEditorConfig: false,
				parseAndValidate: jest.fn(),
				getErrorContext: jest.fn(),
			});

			const payload: ChatPayload = {
				id: 'test-prefetch-1',
				message: 'Build the workflow',
				planOutput: mockPlan,
			};

			await handler.execute({ payload });

			expect(invoke).toHaveBeenCalledWith({
				queries: expect.arrayContaining(['httpRequest', 'slack']),
			});
		});

		it('does NOT invoke search_nodes when planOutput is absent', async () => {
			const { llm } = createMockLlm();
			const { tool: searchTool, invoke } = createMockSearchTool();

			const tools = [searchTool, createMockTool('get_node_types'), createMockTool('think')];

			const handler = new ChatSetupHandler({
				llm,
				tools,
				enableTextEditorConfig: false,
				parseAndValidate: jest.fn(),
				getErrorContext: jest.fn(),
			});

			const payload: ChatPayload = {
				id: 'test-prefetch-2',
				message: 'Build a weather workflow',
			};

			await handler.execute({ payload });

			expect(invoke).not.toHaveBeenCalled();
		});

		it('does NOT invoke search_nodes when plan has no suggestedNodes', async () => {
			const { llm } = createMockLlm();
			const { tool: searchTool, invoke } = createMockSearchTool();

			const tools = [searchTool, createMockTool('get_node_types'), createMockTool('think')];

			const handler = new ChatSetupHandler({
				llm,
				tools,
				enableTextEditorConfig: false,
				parseAndValidate: jest.fn(),
				getErrorContext: jest.fn(),
			});

			const planWithoutNodes: PlanOutput = {
				summary: 'Simple workflow',
				trigger: 'Manual',
				steps: [{ description: 'Do something' }, { description: 'Do something else' }],
			};

			const payload: ChatPayload = {
				id: 'test-prefetch-3',
				message: 'Build the workflow',
				planOutput: planWithoutNodes,
			};

			await handler.execute({ payload });

			expect(invoke).not.toHaveBeenCalled();
		});

		it('deduplicates suggestedNodes across steps', async () => {
			const { llm } = createMockLlm();
			const { tool: searchTool, invoke } = createMockSearchTool();

			const tools = [searchTool, createMockTool('get_node_types'), createMockTool('think')];

			const handler = new ChatSetupHandler({
				llm,
				tools,
				enableTextEditorConfig: false,
				parseAndValidate: jest.fn(),
				getErrorContext: jest.fn(),
			});

			const planWithDuplicates: PlanOutput = {
				summary: 'Workflow with duplicates',
				trigger: 'Manual',
				steps: [
					{
						description: 'Step 1',
						suggestedNodes: ['n8n-nodes-base.httpRequest', 'n8n-nodes-base.set'],
					},
					{
						description: 'Step 2',
						suggestedNodes: ['n8n-nodes-base.httpRequest', 'n8n-nodes-base.slack'],
					},
				],
			};

			const payload: ChatPayload = {
				id: 'test-prefetch-4',
				message: 'Build the workflow',
				planOutput: planWithDuplicates,
			};

			await handler.execute({ payload });

			const queries = invoke.mock.calls[0][0].queries as string[];
			expect(queries).toHaveLength(3);
			expect(queries).toContain('httpRequest');
			expect(queries).toContain('set');
			expect(queries).toContain('slack');
		});
	});

	describe('extractSearchQueriesFromPlan', () => {
		it('strips package prefixes from node names', () => {
			const plan: PlanOutput = {
				summary: 'Test',
				trigger: 'Manual',
				steps: [
					{
						description: 'Step 1',
						suggestedNodes: [
							'n8n-nodes-base.httpRequest',
							'@n8n/n8n-nodes-langchain.agent',
							'n8n-nodes-base.slack',
						],
					},
				],
			};

			const queries = extractSearchQueriesFromPlan(plan);

			expect(queries).toEqual(['httpRequest', 'agent', 'slack']);
		});

		it('returns empty array when no suggestedNodes exist', () => {
			const plan: PlanOutput = {
				summary: 'Test',
				trigger: 'Manual',
				steps: [{ description: 'Step 1' }],
			};

			expect(extractSearchQueriesFromPlan(plan)).toEqual([]);
		});

		it('handles node names without a dot', () => {
			const plan: PlanOutput = {
				summary: 'Test',
				trigger: 'Manual',
				steps: [{ description: 'Step 1', suggestedNodes: ['customNode'] }],
			};

			expect(extractSearchQueriesFromPlan(plan)).toEqual(['customNode']);
		});
	});
});
