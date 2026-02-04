/**
 * Session Chat Handler
 *
 * Wraps agent chat with session management. Handles loading, compacting,
 * and saving sessions, as well as filtering internal messages.
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { MemorySaver } from '@langchain/langgraph';
import type { Logger } from '@n8n/backend-common';

import type { StreamOutput } from '../../types/streaming';
import type { HistoryContext } from '../prompts';
import type { ChatPayload } from '../../workflow-builder-agent';
import {
	loadCodeBuilderSession,
	saveCodeBuilderSession,
	compactSessionIfNeeded,
	generateCodeBuilderThreadId,
	saveSessionMessages,
} from '../utils/code-builder-session';

/**
 * Agent chat function type
 */
type AgentChatFn = (
	payload: ChatPayload,
	userId: string,
	abortSignal?: AbortSignal,
	historyContext?: HistoryContext,
) => AsyncGenerator<StreamOutput, void, unknown>;

/**
 * Configuration for SessionChatHandler
 */
export interface SessionChatHandlerConfig {
	checkpointer: MemorySaver;
	llm: BaseChatModel;
	logger?: Logger;
}

/**
 * Parameters for executing session-wrapped chat
 */
export interface SessionChatParams {
	payload: ChatPayload;
	userId: string;
	abortSignal?: AbortSignal;
	agentChat: AgentChatFn;
}

/**
 * Handles session management for agent chat.
 *
 * This handler:
 * 1. Loads existing session from checkpointer
 * 2. Compacts session if needed (when messages exceed threshold)
 * 3. Builds history context for the agent
 * 4. Delegates to the agent with history context
 * 5. Filters internal messages (session-messages) from output
 * 6. Saves session after successful generation
 */
export class SessionChatHandler {
	private checkpointer: MemorySaver;
	private llm: BaseChatModel;
	private logger?: Logger;

	constructor(config: SessionChatHandlerConfig) {
		this.checkpointer = config.checkpointer;
		this.llm = config.llm;
		this.logger = config.logger;
	}

	/**
	 * Execute session-wrapped chat.
	 *
	 * @param params - Chat parameters including agent function
	 * @yields StreamOutput chunks with internal messages filtered
	 */
	async *execute(params: SessionChatParams): AsyncGenerator<StreamOutput, void, unknown> {
		const { payload, userId, abortSignal, agentChat } = params;

		// Extract workflow ID from context
		const workflowId = payload.workflowContext?.currentWorkflow?.id;

		if (!workflowId) {
			// No workflow ID - cannot manage session, delegate directly
			this.logger?.debug('No workflow ID, skipping session management');
			yield* agentChat(payload, userId, abortSignal);
			return;
		}

		const threadId = generateCodeBuilderThreadId(workflowId, userId);

		// Load existing session
		let session = await loadCodeBuilderSession(this.checkpointer, threadId);

		this.logger?.debug('Loaded CodeBuilder session', {
			threadId,
			userMessagesCount: session.userMessages.length,
			hasPreviousSummary: !!session.previousSummary,
		});

		// Compact if needed
		session = await compactSessionIfNeeded(session, this.llm);

		// Build history context for the agent
		let historyContext: HistoryContext | undefined;
		if (session.userMessages.length > 0 || session.previousSummary) {
			historyContext = {
				userMessages: session.userMessages,
				previousSummary: session.previousSummary,
			};
		}

		// Track generation success and capture session messages
		let generationSucceeded = false;
		let sessionMessages: unknown[] | undefined;

		// Delegate to agent with history context
		for await (const chunk of agentChat(payload, userId, abortSignal, historyContext)) {
			// Track success when workflow-updated chunk is received
			if (chunk.messages?.some((msg) => msg.type === 'workflow-updated')) {
				generationSucceeded = true;
			}

			// Capture session messages for persistence
			for (const msg of chunk.messages ?? []) {
				if (msg.type === 'session-messages') {
					sessionMessages = (msg as { type: 'session-messages'; messages: unknown[] }).messages;
				}
			}

			// Filter internal messages and yield
			const filteredMessages = chunk.messages?.filter((msg) => msg.type !== 'session-messages');
			if (filteredMessages && filteredMessages.length > 0) {
				yield { messages: filteredMessages };
			}
		}

		// Save current message to session
		session.userMessages.push(payload.message);
		await saveCodeBuilderSession(this.checkpointer, threadId, session);

		// Save full message history for frontend retrieval
		if (generationSucceeded && sessionMessages) {
			await saveSessionMessages(
				this.checkpointer,
				workflowId,
				userId,
				sessionMessages,
				payload.versionId,
			);

			this.logger?.debug('Saved session messages to SessionManager thread', {
				workflowId,
				userId,
				messageCount: sessionMessages.length,
			});
		}

		this.logger?.debug('Saved CodeBuilder session', {
			threadId,
			newMessageCount: session.userMessages.length,
		});
	}
}
