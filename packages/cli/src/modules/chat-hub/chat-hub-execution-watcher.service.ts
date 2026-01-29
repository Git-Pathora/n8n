import { Logger } from '@n8n/backend-common';
import { ExecutionsConfig } from '@n8n/config';
import { ExecutionRepository, type IExecutionResponse } from '@n8n/db';
import { OnLifecycleEvent, type WorkflowExecuteAfterContext } from '@n8n/decorators';
import { Service } from '@n8n/di';
import { InstanceSettings } from 'n8n-core';
import { jsonStringify, NodeConnectionTypes, type INodeExecutionData } from 'n8n-workflow';
import { v4 as uuidv4 } from 'uuid';

import { ChatHubExecutionStore, type ChatHubExecutionContext } from './chat-hub-execution.store';
import type { ChatTriggerResponseMode, NonStreamingResponseMode } from './chat-hub.types';
import { ChatHubMessageRepository } from './chat-message.repository';
import { ChatStreamService } from './chat-stream.service';
import { getLastNodeExecuted, shouldResumeImmediately } from '../../chat/utils';

import { ChatExecutionManager } from '@/chat/chat-execution-manager';
import { EventService } from '@/events/event.service';

/**
 * Service responsible for handling execution lifecycle events for non-streaming
 * chat hub executions. This implements the event-driven architecture where:
 *
 * - execution-resumed event: Notifies frontend when a resumed execution starts
 * - workflowExecuteAfter: Handles all completion scenarios (success, error, waiting, auto-resume)
 *
 * This eliminates the blocking waitForExecutionCompletion() calls and provides
 * a unified code path for handling all execution outcomes.
 */
@Service()
export class ChatHubExecutionWatcherService {
	constructor(
		private readonly logger: Logger,
		private readonly executionStore: ChatHubExecutionStore,
		private readonly messageRepository: ChatHubMessageRepository,
		private readonly executionRepository: ExecutionRepository,
		private readonly chatStreamService: ChatStreamService,
		private readonly executionManager: ChatExecutionManager,
		private readonly eventService: EventService,
		private readonly executionsConfig: ExecutionsConfig,
		private readonly instanceSettings: InstanceSettings,
	) {
		this.logger = this.logger.scoped('chat-hub');

		// Subscribe to execution-resumed events from ActiveExecutions
		this.eventService.on('execution-resumed', async (event) => {
			this.logger.debug(`Handling execution-resumed event for execution ${event.executionId}`);
			await this.handleExecutionResumed(event);
		});
	}

	/**
	 * Called when any execution resumes from waiting state.
	 * This catches ALL resumption scenarios:
	 * - Auto-resume from shouldResumeImmediately()
	 * - User sends message to waiting execution
	 * - WaitTracker timer expiration
	 * - External HITL webhooks (form submissions, etc.)
	 */
	private async handleExecutionResumed(event: {
		executionId: string;
		workflowId?: string;
	}): Promise<void> {
		const { executionId } = event;

		// Check if this is a tracked chat hub execution
		const context = await this.executionStore.get(executionId);
		if (!context) return; // Not a tracked chat hub execution

		// Only notify if marked as resuming (prevents duplicate notifications)
		if (!context.isResuming) return;

		this.logger.debug(`Chat hub execution ${executionId} resumed, notifying frontend`);

		// Clear the isResuming flag
		await this.executionStore.update(executionId, { isResuming: false });

		// Notify frontend that execution is running again
		await this.chatStreamService.startExecution(context.userId, context.sessionId);
		await this.chatStreamService.startStream({
			userId: context.userId,
			sessionId: context.sessionId,
			messageId: context.messageId,
			previousMessageId: context.previousMessageId,
			retryOfMessageId: null,
			executionId: parseInt(executionId, 10),
		});
	}

	/**
	 * Called when any workflow execution COMPLETES.
	 * Handles ALL non-streaming completion scenarios:
	 * - Initial execution completion (success/error)
	 * - Waiting state with auto-resume (shouldResumeImmediately)
	 * - Waiting state for external trigger
	 * - Resumed execution completion
	 */
	@OnLifecycleEvent('workflowExecuteAfter')
	async handleWorkflowExecuteAfter(ctx: WorkflowExecuteAfterContext): Promise<void> {
		const { runData, executionId } = ctx;

		const isQueueMode = this.executionsConfig.mode === 'queue';
		const isWorker = this.instanceSettings.isWorker;

		this.logger.debug(
			`workflowExecuteAfter received for ${executionId}: status=${runData.status}, isQueueMode=${isQueueMode}, isWorker=${isWorker}`,
		);

		// In queue mode, only the worker should process this event.
		// Main also receives the event (via lifecycle hooks) but should skip it
		// to prevent race conditions where both instances try to process.
		if (isQueueMode && !isWorker) {
			this.logger.debug(
				`Skipping workflowExecuteAfter for ${executionId} - main instance in queue mode`,
			);
			return;
		}

		this.logger.debug(`Handling workflowExecuteAfter for execution ${executionId}`);

		// Get stored context for this execution
		const context = await this.executionStore.get(executionId);
		if (!context) return; // Not a tracked chat hub execution

		// Check for execution errors first
		if (!['success', 'waiting', 'canceled'].includes(runData.status)) {
			const errorMessage = this.getErrorMessage(runData) ?? 'Failed to generate a response';
			await this.pushErrorResults(context, errorMessage);
			await this.executionStore.remove(executionId);
			return;
		}

		// Handle canceled execution
		if (runData.status === 'canceled') {
			// When messages are cancelled they're already marked cancelled on `stopGeneration`
			await this.chatStreamService.endExecution(context.userId, context.sessionId, 'cancelled');
			await this.executionStore.remove(executionId);
			return;
		}

		// Extract message from run data
		const message = this.getMessageFromRunData(runData, context.responseMode);

		// If execution is waiting (paused state)
		if (runData.status === 'waiting') {
			this.logger.debug(
				`Execution ${executionId} entering waiting state, calling handleWaitingExecution`,
			);
			await this.handleWaitingExecution(context, executionId, message);
			return;
		}

		if (runData.finished) {
			// Execution completed successfully - push final results
			this.logger.debug(
				`Execution ${executionId} completed with status=${runData.status}, calling pushFinalResults`,
			);
			await this.pushFinalResults(context, message);
			await this.executionStore.remove(executionId);
		}
	}

	/**
	 * Handle execution that has entered waiting state
	 */
	private async handleWaitingExecution(
		context: ChatHubExecutionContext,
		executionId: string,
		message: string | undefined,
	): Promise<void> {
		// Update message with current content and waiting status
		await this.messageRepository.updateChatMessage(context.messageId, {
			content: message ?? '',
			status: 'waiting',
		});

		// Send content chunk if any
		if (message) {
			await this.chatStreamService.sendChunk(context.sessionId, context.messageId, message);
		}

		// End the current stream with waiting status
		await this.chatStreamService.endStream(context.sessionId, context.messageId, 'waiting');
		await this.chatStreamService.endExecution(context.userId, context.sessionId, 'success');

		// Check if we should auto-resume (responseNodes mode only)
		if (context.responseMode === 'responseNodes') {
			const execution = await this.executionRepository.findSingleExecution(executionId, {
				includeData: true,
				unflattenData: true,
			});

			if (execution) {
				const lastNode = getLastNodeExecuted(execution);
				if (lastNode && shouldResumeImmediately(lastNode)) {
					await this.triggerAutoResume(context, execution);
					return;
				}
			}
		}

		// Not auto-resuming - mark context as "resuming" for next workflowExecuteBefore
		await this.executionStore.markAsResuming(executionId);
	}

	/**
	 * Trigger auto-resume for responseNodes mode when the last node doesn't require user input
	 */
	private async triggerAutoResume(
		context: ChatHubExecutionContext,
		execution: IExecutionResponse,
	): Promise<void> {
		this.logger.debug(`Auto-resuming execution ${execution.id}`);

		// Mark current message as success (not waiting) since we're continuing
		await this.messageRepository.updateChatMessage(context.messageId, { status: 'success' });

		// Create new message for the next response
		const newMessageId = uuidv4();
		await this.createNextMessage(context, newMessageId, execution.id);

		// Update context with new message ID and mark as resuming
		await this.executionStore.update(execution.id, {
			previousMessageId: context.messageId,
			messageId: newMessageId,
			isResuming: true,
		});

		// Trigger resume (non-blocking - lifecycle events will handle the rest)
		void this.executionManager.runWorkflow(execution, {
			action: 'sendMessage',
			chatInput: '', // No new human input for auto-resume
			sessionId: context.sessionId,
		});
	}

	/**
	 * Create a new AI message for the next segment of a resumed execution
	 */
	private async createNextMessage(
		context: ChatHubExecutionContext,
		messageId: string,
		executionId: string,
	): Promise<void> {
		await this.messageRepository.createChatMessage({
			id: messageId,
			sessionId: context.sessionId,
			previousMessageId: context.messageId,
			executionId: parseInt(executionId, 10),
			type: 'ai',
			name: 'AI',
			status: 'running',
			content: '',
			retryOfMessageId: null,
			...context.model,
		});
	}

	/**
	 * Push final successful results to frontend and database
	 */
	private async pushFinalResults(
		context: ChatHubExecutionContext,
		message: string | undefined,
	): Promise<void> {
		// Send final content via WebSocket
		if (message) {
			await this.chatStreamService.sendChunk(context.sessionId, context.messageId, message);
		}

		// End stream and execution
		await this.chatStreamService.endStream(context.sessionId, context.messageId, 'success');
		await this.chatStreamService.endExecution(context.userId, context.sessionId, 'success');

		// Update message in DB
		await this.messageRepository.updateChatMessage(context.messageId, {
			content: message ?? '',
			status: 'success',
		});
	}

	/**
	 * Push error results to frontend and database
	 */
	private async pushErrorResults(
		context: ChatHubExecutionContext,
		errorMessage: string,
	): Promise<void> {
		// Send error via WebSocket
		await this.chatStreamService.sendChunk(context.sessionId, context.messageId, errorMessage);

		// End stream and execution with error status
		await this.chatStreamService.endStream(context.sessionId, context.messageId, 'error');
		await this.chatStreamService.endExecution(context.userId, context.sessionId, 'error');

		// Update message in DB
		await this.messageRepository.updateChatMessage(context.messageId, {
			content: errorMessage,
			status: 'error',
		});
	}

	/**
	 * Extract message content from run data based on response mode
	 */
	private getMessageFromRunData(
		runData: WorkflowExecuteAfterContext['runData'],
		responseMode: NonStreamingResponseMode,
	): string | undefined {
		const lastNodeExecuted = runData.data.resultData.lastNodeExecuted;
		if (typeof lastNodeExecuted !== 'string') return undefined;

		const nodeRunData = runData.data.resultData.runData[lastNodeExecuted];
		if (!nodeRunData || nodeRunData.length === 0) return undefined;

		const runIndex = nodeRunData.length - 1;
		const data = nodeRunData[runIndex]?.data;
		const outputs = data?.main ?? data?.[NodeConnectionTypes.AiTool] ?? [];

		const entry = this.getFirstOutputEntry(outputs);
		if (!entry) return undefined;

		return this.extractMessageFromEntry(entry, responseMode);
	}

	/**
	 * Get the first entry from output branches
	 */
	private getFirstOutputEntry(
		outputs: Array<INodeExecutionData[] | null>,
	): INodeExecutionData | undefined {
		for (const branch of outputs) {
			if (!Array.isArray(branch) || branch.length === 0) continue;
			return branch[0];
		}
		return undefined;
	}

	/**
	 * Extract message text from an output entry based on response mode
	 */
	private extractMessageFromEntry(
		entry: INodeExecutionData,
		responseMode: ChatTriggerResponseMode,
	): string | undefined {
		if (responseMode === 'responseNodes') {
			const sendMessage = entry.sendMessage;
			return typeof sendMessage === 'string' ? sendMessage : '';
		}

		if (responseMode === 'lastNode') {
			const response: Record<string, unknown> = entry.json ?? {};
			const message = response.output ?? response.text ?? response.message ?? '';
			if (typeof message === 'string') return message;
			// For non-string values, serialize to JSON
			return jsonStringify(message);
		}

		return undefined;
	}

	/**
	 * Extract error message from run data
	 */
	private getErrorMessage(runData: WorkflowExecuteAfterContext['runData']): string | undefined {
		if (runData.data.resultData.error) {
			return runData.data.resultData.error.description ?? runData.data.resultData.error.message;
		}
		return undefined;
	}
}
