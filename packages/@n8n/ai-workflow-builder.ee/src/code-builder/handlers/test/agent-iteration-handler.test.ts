/**
 * Tests for AgentIterationHandler
 */

import { HumanMessage, AIMessage } from '@langchain/core/messages';

import { AgentIterationHandler } from '../agent-iteration-handler';

describe('AgentIterationHandler', () => {
	let handler: AgentIterationHandler;
	let mockDebugLog: jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();
		mockDebugLog = jest.fn();
	});

	describe('invokeLlm', () => {
		describe('onTokenUsage callback', () => {
			it('should call onTokenUsage callback with token counts when tokens are used', async () => {
				const onTokenUsage = jest.fn();

				handler = new AgentIterationHandler({
					debugLog: mockDebugLog,
					onTokenUsage,
				});

				// Create mock LLM that returns a response with token usage
				const mockResponse = new AIMessage({
					content: 'Hello',
					response_metadata: {
						usage: { input_tokens: 100, output_tokens: 50 },
					},
				});

				const mockLlmWithTools = {
					invoke: jest.fn().mockResolvedValue(mockResponse),
				};

				const messages = [new HumanMessage('Test')];

				// Consume the generator to completion
				const generator = handler.invokeLlm({
					llmWithTools: mockLlmWithTools as never,
					messages,
					iteration: 1,
				});

				// Exhaust the generator
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				for await (const _chunk of generator) {
					// consume chunks
				}

				expect(onTokenUsage).toHaveBeenCalledTimes(1);
				expect(onTokenUsage).toHaveBeenCalledWith({
					inputTokens: 100,
					outputTokens: 50,
				});
			});

			it('should not call onTokenUsage when tokens are zero', async () => {
				const onTokenUsage = jest.fn();

				handler = new AgentIterationHandler({
					debugLog: mockDebugLog,
					onTokenUsage,
				});

				const mockResponse = new AIMessage({
					content: 'Hello',
					response_metadata: {
						usage: { input_tokens: 0, output_tokens: 0 },
					},
				});

				const mockLlmWithTools = {
					invoke: jest.fn().mockResolvedValue(mockResponse),
				};

				const messages = [new HumanMessage('Test')];

				const generator = handler.invokeLlm({
					llmWithTools: mockLlmWithTools as never,
					messages,
					iteration: 1,
				});

				for await (const _chunk of generator) {
					// consume chunks
				}

				expect(onTokenUsage).not.toHaveBeenCalled();
			});

			it('should not call onTokenUsage when no usage metadata present', async () => {
				const onTokenUsage = jest.fn();

				handler = new AgentIterationHandler({
					debugLog: mockDebugLog,
					onTokenUsage,
				});

				const mockResponse = new AIMessage({
					content: 'Hello',
					response_metadata: {},
				});

				const mockLlmWithTools = {
					invoke: jest.fn().mockResolvedValue(mockResponse),
				};

				const messages = [new HumanMessage('Test')];

				const generator = handler.invokeLlm({
					llmWithTools: mockLlmWithTools as never,
					messages,
					iteration: 1,
				});

				for await (const _chunk of generator) {
					// consume chunks
				}

				expect(onTokenUsage).not.toHaveBeenCalled();
			});

			it('should work without onTokenUsage callback', async () => {
				handler = new AgentIterationHandler({
					debugLog: mockDebugLog,
				});

				const mockResponse = new AIMessage({
					content: 'Hello',
					response_metadata: {
						usage: { input_tokens: 100, output_tokens: 50 },
					},
				});

				const mockLlmWithTools = {
					invoke: jest.fn().mockResolvedValue(mockResponse),
				};

				const messages = [new HumanMessage('Test')];

				const generator = handler.invokeLlm({
					llmWithTools: mockLlmWithTools as never,
					messages,
					iteration: 1,
				});

				// Should not throw
				for await (const _chunk of generator) {
					// consume chunks
				}

				// The generator should complete without error
				expect(mockLlmWithTools.invoke).toHaveBeenCalled();
			});
		});
	});
});
