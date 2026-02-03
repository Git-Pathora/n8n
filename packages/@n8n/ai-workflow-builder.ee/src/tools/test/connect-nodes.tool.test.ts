import { getCurrentTaskInput } from '@langchain/langgraph';
import type { INodeTypeDescription } from 'n8n-workflow';

import {
	buildConnectNodesInput,
	createToolConfig,
	createToolConfigWithWriter,
	expectToolSuccess,
	expectWorkflowOperation,
	parseToolResult,
	setupWorkflowState,
	type ParsedToolContent,
	nodeTypes,
} from '../../../test/test-utils';
import { createConnectNodesTool } from '../connect-nodes.tool';

// Mock LangGraph dependencies
jest.mock('@langchain/langgraph', () => ({
	getCurrentTaskInput: jest.fn(),
	Command: jest.fn().mockImplementation((params: Record<string, unknown>) => ({
		content: JSON.stringify(params),
	})),
}));

describe('ConnectNodesTool', () => {
	let nodeTypesList: INodeTypeDescription[];
	let connectNodesTool: ReturnType<typeof createConnectNodesTool>['tool'];
	const mockGetCurrentTaskInput = getCurrentTaskInput as jest.MockedFunction<
		typeof getCurrentTaskInput
	>;

	beforeEach(() => {
		jest.clearAllMocks();
		nodeTypesList = [nodeTypes.code, nodeTypes.httpRequest, nodeTypes.webhook, nodeTypes.agent];
		connectNodesTool = createConnectNodesTool(nodeTypesList).tool;
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('invoke', () => {
		it('should queue a connect intent with defaults', async () => {
			setupWorkflowState(mockGetCurrentTaskInput);
			const mockConfig = createToolConfigWithWriter('connect_nodes', 'test-call-1');

			const result = await connectNodesTool.invoke(
				buildConnectNodesInput({
					sourceNodeName: 'Code',
					targetNodeName: 'HTTP Request',
				}),
				mockConfig,
			);

			const content = parseToolResult<ParsedToolContent>(result);

			expectWorkflowOperation(content, 'connectIntent', {
				sourceNodeName: 'Code',
				targetNodeName: 'HTTP Request',
				sourceOutputIndex: 0,
				targetInputIndex: 0,
			});

			expectToolSuccess(content, 'Queued connection: Code → HTTP Request');
		});

		it('should include indices and explicit connection type when provided', async () => {
			setupWorkflowState(mockGetCurrentTaskInput);
			const mockConfig = createToolConfig('connect_nodes', 'test-call-2');

			const result = await connectNodesTool.invoke(
				{
					sourceNodeName: 'AI Tool',
					targetNodeName: 'AI Agent',
					connectionType: 'ai_tool',
					sourceOutputIndex: 2,
					targetInputIndex: 1,
				},
				mockConfig,
			);

			const content = parseToolResult<ParsedToolContent>(result);

			expectWorkflowOperation(content, 'connectIntent', {
				sourceNodeName: 'AI Tool',
				targetNodeName: 'AI Agent',
				connectionType: 'ai_tool',
				sourceOutputIndex: 2,
				targetInputIndex: 1,
			});
		});

		it('should handle validation errors for missing required fields', async () => {
			setupWorkflowState(mockGetCurrentTaskInput);
			const mockConfig = createToolConfig('connect_nodes', 'test-call-3');

			await expect(
				connectNodesTool.invoke({} as Parameters<typeof connectNodesTool.invoke>[0], mockConfig),
			).rejects.toThrow(/Received tool input did not match expected schema/);
		});
	});
});
