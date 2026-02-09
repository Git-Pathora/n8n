/**
 * Text Editor Tool Handler
 *
 * Handles the str_replace_based_edit_tool execution. Wraps the TextEditorHandler
 * and adds progress streaming, auto-validation after create, and error handling.
 */

import type { BaseMessage } from '@langchain/core/messages';
import { ToolMessage } from '@langchain/core/messages';
import type { WorkflowJSON } from '@n8n/workflow-sdk';

import type { StreamOutput, ToolProgressChunk, WorkflowUpdateChunk } from '../../types/streaming';
import { FIX_VALIDATION_ERRORS_INSTRUCTION } from '../constants';
import type { WarningTracker } from '../state/warning-tracker';
import type { ParseAndValidateResult } from '../types';
import { formatWarnings } from '../utils/format-warnings';

/**
 * Debug log callback type
 */
type DebugLogFn = (context: string, message: string, data?: Record<string, unknown>) => void;

/**
 * Text editor execute function type
 */
type TextEditorExecuteFn = (args: Record<string, unknown>) => string;

/**
 * Text editor get code function type
 */
type TextEditorGetCodeFn = () => string | null;

/**
 * Parse and validate function type
 */
type ParseAndValidateFn = (
	code: string,
	currentWorkflow?: WorkflowJSON,
) => Promise<ParseAndValidateResult>;

/**
 * Get error context function type
 */
type GetErrorContextFn = (code: string, errorMessage: string) => string;

/**
 * Configuration for TextEditorToolHandler
 */
export interface TextEditorToolHandlerConfig {
	textEditorExecute: TextEditorExecuteFn;
	textEditorGetCode: TextEditorGetCodeFn;
	parseAndValidate: ParseAndValidateFn;
	getErrorContext: GetErrorContextFn;
	debugLog?: DebugLogFn;
}

/**
 * Parameters for executing the text editor tool
 */
export interface TextEditorToolParams {
	toolCallId: string;
	args: Record<string, unknown>;
	currentWorkflow: WorkflowJSON | undefined;
	iteration: number;
	messages: BaseMessage[];
	/** Optional warning tracker for deduplicating repeated warnings */
	warningTracker?: WarningTracker;
}

/**
 * Result of text editor tool execution
 */
export interface TextEditorToolResult {
	workflowReady?: boolean;
	workflow?: WorkflowJSON;
}

/**
 * Result of a preview parse attempt after an edit command
 */
export interface PreviewParseResult {
	/** WorkflowUpdateChunk if parse succeeded */
	chunk?: StreamOutput;
	/** Error message if parse failed */
	parseError?: string;
}

/**
 * Handles the str_replace_based_edit_tool execution.
 *
 * This handler:
 * 1. Executes text editor commands (view, str_replace, create, insert)
 * 2. Auto-validates after create command
 * 3. Yields progress chunks
 * 4. Handles errors gracefully
 */
export class TextEditorToolHandler {
	private textEditorExecute: TextEditorExecuteFn;
	private textEditorGetCode: TextEditorGetCodeFn;
	private parseAndValidate: ParseAndValidateFn;
	private getErrorContext: GetErrorContextFn;
	private debugLog: DebugLogFn;

	constructor(config: TextEditorToolHandlerConfig) {
		this.textEditorExecute = config.textEditorExecute;
		this.textEditorGetCode = config.textEditorGetCode;
		this.parseAndValidate = config.parseAndValidate;
		this.getErrorContext = config.getErrorContext;
		this.debugLog = config.debugLog ?? (() => {});
	}

	/**
	 * Execute the text editor tool.
	 *
	 * @param params - Execution parameters
	 * @yields StreamOutput chunks for tool progress
	 * @returns TextEditorToolResult with optional workflowReady status
	 */
	async *execute(
		params: TextEditorToolParams,
	): AsyncGenerator<StreamOutput, TextEditorToolResult | undefined, unknown> {
		const { toolCallId, args, currentWorkflow, iteration, messages, warningTracker } = params;

		const command = args.command as string;
		this.debugLog('TEXT_EDITOR_TOOL', `Executing command: ${command}`, {
			iteration,
			toolCallId,
			command,
		});

		// Stream tool progress - running
		yield this.createToolProgressChunk('running', command, toolCallId);

		try {
			// Execute the text editor command
			const result = this.textEditorExecute(args);

			this.debugLog('TEXT_EDITOR_TOOL', `Command ${command} succeeded`, {
				resultLength: result.length,
			});

			// Auto-validate after create command — combines create result + validation into single ToolMessage
			if (command === 'create') {
				const autoValidateResult = await this.autoValidateAfterCreate(
					toolCallId,
					result,
					currentWorkflow,
					iteration,
					messages,
					warningTracker,
				);

				yield this.createToolProgressChunk('completed', command, toolCallId);
				return autoValidateResult;
			}

			// Add tool result to messages (non-create commands)
			messages.push(
				new ToolMessage({
					tool_call_id: toolCallId,
					content: result,
				}),
			);

			// Preview parse after edit commands for progressive canvas rendering
			if (command !== 'view') {
				const preview = await this.tryParseForPreview(currentWorkflow);
				if (preview.chunk) {
					yield preview.chunk;
				}
				if (preview.parseError) {
					const lastMsg = messages[messages.length - 1] as ToolMessage;
					lastMsg.content = `${lastMsg.content as string}\n\nParse error: ${preview.parseError}`;
				}
			}

			yield this.createToolProgressChunk('completed', command, toolCallId);
			return undefined;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const errorStack = error instanceof Error ? error.stack : undefined;

			this.debugLog('TEXT_EDITOR_TOOL', `Command ${command} failed`, {
				errorMessage,
				stack: errorStack,
			});

			// Add error message to messages
			messages.push(
				new ToolMessage({
					tool_call_id: toolCallId,
					content: `Error: ${errorMessage}`,
				}),
			);

			yield this.createToolProgressChunk('completed', command, toolCallId);
			return undefined;
		}
	}

	/**
	 * Auto-validate after create command
	 */
	private async autoValidateAfterCreate(
		toolCallId: string,
		createResult: string,
		currentWorkflow: WorkflowJSON | undefined,
		_iteration: number,
		messages: BaseMessage[],
		warningTracker?: WarningTracker,
	): Promise<TextEditorToolResult> {
		const code = this.textEditorGetCode();

		if (!code) {
			this.debugLog('TEXT_EDITOR_TOOL', 'Auto-validate: no code to validate');
			messages.push(new ToolMessage({ tool_call_id: toolCallId, content: createResult }));
			return { workflowReady: false };
		}

		this.debugLog('TEXT_EDITOR_TOOL', 'Auto-validating after create', {
			codeLength: code.length,
		});

		try {
			const result = await this.parseAndValidate(code, currentWorkflow);

			this.debugLog('TEXT_EDITOR_TOOL', 'Auto-validate succeeded', {
				warningCount: result.warnings.length,
				nodeCount: result.workflow.nodes.length,
			});

			// Handle warnings
			if (result.warnings.length > 0) {
				const newWarnings = warningTracker
					? warningTracker.filterNewWarnings(result.warnings)
					: result.warnings;

				if (newWarnings.length > 0) {
					if (warningTracker) {
						warningTracker.markAsSeen(newWarnings);
					}

					const warningText = formatWarnings(newWarnings, warningTracker);
					const errorContext = this.getErrorContext(code, newWarnings[0].message);

					// Combine create result + validation warnings into single ToolMessage
					messages.push(
						new ToolMessage({
							tool_call_id: toolCallId,
							content: `${createResult}\n\nValidation warnings:\n${warningText}\n\n${errorContext}\n\n${FIX_VALIDATION_ERRORS_INSTRUCTION}`,
						}),
					);

					return {
						workflowReady: false,
						workflow: result.workflow,
					};
				}

				// All warnings are repeated - treat as valid
				this.debugLog('TEXT_EDITOR_TOOL', 'All warnings are repeated, treating as valid');
			}

			// Validation passed — push create result as ToolMessage
			messages.push(new ToolMessage({ tool_call_id: toolCallId, content: createResult }));

			return {
				workflowReady: true,
				workflow: result.workflow,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const errorStack = error instanceof Error ? error.stack : undefined;
			const errorContext = this.getErrorContext(code, errorMessage);

			this.debugLog('TEXT_EDITOR_TOOL', 'Auto-validate parse error', {
				errorMessage,
				stack: errorStack,
			});

			// Combine create result + parse error into single ToolMessage
			messages.push(
				new ToolMessage({
					tool_call_id: toolCallId,
					content: `${createResult}\n\nParse error: ${errorMessage}\n\n${errorContext}\n\n${FIX_VALIDATION_ERRORS_INSTRUCTION}`,
					additional_kwargs: { validationMessage: true },
				}),
			);

			return { workflowReady: false };
		}
	}

	/**
	 * Try parsing the current code for a preview update.
	 *
	 * On success: returns a WorkflowUpdateChunk for progressive canvas rendering.
	 * On error: returns the parse error message so the agent can self-correct.
	 * If no code exists: returns empty object.
	 */
	async tryParseForPreview(currentWorkflow?: WorkflowJSON): Promise<PreviewParseResult> {
		const code = this.textEditorGetCode();
		if (!code) {
			return {};
		}

		try {
			const result = await this.parseAndValidate(code, currentWorkflow);
			return { chunk: this.createWorkflowUpdateChunk(result.workflow) };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return { parseError: errorMessage };
		}
	}

	/**
	 * Create a tool progress chunk
	 */
	private createToolProgressChunk(
		status: 'running' | 'completed',
		command: string,
		toolCallId: string,
	): StreamOutput {
		const displayTitle = command === 'view' ? 'Viewing workflow' : 'Editing workflow';
		return {
			messages: [
				{
					type: 'tool',
					toolName: 'str_replace_based_edit_tool',
					toolCallId,
					displayTitle,
					status,
				} as ToolProgressChunk,
			],
		};
	}

	/**
	 * Create a workflow update chunk for progressive canvas rendering
	 */
	private createWorkflowUpdateChunk(workflow: WorkflowJSON): StreamOutput {
		return {
			messages: [
				{
					role: 'assistant',
					type: 'workflow-updated',
					codeSnippet: JSON.stringify(workflow, null, 2),
				} as WorkflowUpdateChunk,
			],
		};
	}
}
