/**
 * Parse and Validate Handler
 *
 * Handles parsing TypeScript workflow code to WorkflowJSON and validation.
 * Consolidates duplicate parse/validate logic that was previously in multiple
 * places in the code builder agent.
 */

import type { Logger } from '@n8n/backend-common';
import { parseWorkflowCodeToBuilder, validateWorkflow, workflow } from '@n8n/workflow-sdk';
import type { WorkflowJSON } from '@n8n/workflow-sdk';

import type { ParseAndValidateResult, ValidationWarning } from '../types';
import { stripImportStatements } from '../utils/extract-code';

/**
 * Debug log callback type
 */
type DebugLogFn = (context: string, message: string, data?: Record<string, unknown>) => void;

/**
 * Configuration for ParseValidateHandler
 */
export interface ParseValidateHandlerConfig {
	debugLog?: DebugLogFn;
	logger?: Logger;
}

/**
 * Handles parsing and validation of workflow code.
 *
 * Consolidates the parse/validate logic that was duplicated in:
 * - Main loop (lines 784-846)
 * - Text editor auto-finalize (lines 695-765)
 * - Validate tool (lines 1428-1594)
 */
/** Validation issue from graph or JSON validation */
interface ValidationIssue {
	code: string;
	message: string;
	nodeName?: string;
}

export class ParseValidateHandler {
	private debugLog: DebugLogFn;
	private logger?: Logger;

	constructor(config: ParseValidateHandlerConfig = {}) {
		this.debugLog = config.debugLog ?? (() => {});
		this.logger = config.logger;
	}

	/**
	 * Collect validation issues (errors or warnings) into the warnings array.
	 * Used to normalize all validation feedback for agent self-correction.
	 */
	private collectValidationIssues(
		issues: ValidationIssue[],
		allWarnings: ValidationWarning[],
		context: string,
		logLevel: 'warn' | 'info',
	): void {
		if (issues.length === 0) return;

		this.debugLog('PARSE_VALIDATE', `${context.toUpperCase()}`, {
			[context.toLowerCase()]: issues.map((i) => ({
				message: i.message,
				code: i.code,
			})),
		});

		if (logLevel === 'warn') {
			this.logger?.warn(`Graph validation ${context.toLowerCase()}`, {
				[context.toLowerCase()]: issues.map((i) => i.message),
			});
		} else {
			this.logger?.info(`Graph validation ${context.toLowerCase()}`, {
				[context.toLowerCase()]: issues.map((i) => i.message),
			});
		}

		for (const issue of issues) {
			allWarnings.push({
				code: issue.code,
				message: issue.message,
				nodeName: issue.nodeName,
			});
		}
	}

	/**
	 * Validate an existing workflow (from JSON) using graph validation only.
	 *
	 * Used to discover pre-existing warnings before the agent starts editing,
	 * so those warnings can be annotated as [pre-existing] when shown to the agent.
	 *
	 * Skips JSON validation since we already have the JSON — graph validation
	 * alone is sufficient for discovering pre-existing warnings.
	 *
	 * @param json - The existing workflow JSON to validate
	 * @returns Array of validation warnings found in the existing workflow
	 */
	validateExistingWorkflow(json: WorkflowJSON): ValidationWarning[] {
		if (json.nodes.length === 0) {
			return [];
		}

		const builder = workflow.fromJSON(json);
		const allWarnings: ValidationWarning[] = [];
		const graphValidation = builder.validate();
		this.collectValidationIssues(
			graphValidation.errors,
			allWarnings,
			'GRAPH VALIDATION ERRORS',
			'warn',
		);
		this.collectValidationIssues(
			graphValidation.warnings,
			allWarnings,
			'GRAPH VALIDATION WARNINGS',
			'info',
		);
		return allWarnings;
	}

	/**
	 * Parse TypeScript code to WorkflowJSON and validate.
	 *
	 * @param code - The TypeScript workflow code to parse
	 * @param currentWorkflow - Optional current workflow for context (used for pin data generation)
	 * @returns ParseAndValidateResult with workflow and any warnings
	 * @throws Error if parsing fails or there are validation errors
	 */
	async parseAndValidate(
		code: string,
		currentWorkflow?: WorkflowJSON,
	): Promise<ParseAndValidateResult> {
		this.debugLog('PARSE_VALIDATE', '========== PARSING WORKFLOW CODE ==========');
		this.debugLog('PARSE_VALIDATE', 'Input code', {
			codeLength: code.length,
			codePreview: code.substring(0, 500),
			codeEnd: code.substring(Math.max(0, code.length - 500)),
		});

		// Strip import statements before parsing - SDK functions are available as globals
		const codeToParse = stripImportStatements(code);
		this.debugLog('PARSE_VALIDATE', 'Code after stripping imports', {
			originalLength: code.length,
			strippedLength: codeToParse.length,
		});

		try {
			// Parse the TypeScript code to WorkflowBuilder
			this.logger?.debug('Parsing WorkflowCode', { codeLength: codeToParse.length });
			this.debugLog('PARSE_VALIDATE', 'Calling parseWorkflowCodeToBuilder...');
			const parseStartTime = Date.now();
			const builder = parseWorkflowCodeToBuilder(codeToParse);
			const parseDuration = Date.now() - parseStartTime;

			this.debugLog('PARSE_VALIDATE', 'Code parsed to builder', {
				parseDurationMs: parseDuration,
			});

			// Regenerate node IDs deterministically to ensure stable IDs across re-parses
			builder.regenerateNodeIds();
			this.debugLog('PARSE_VALIDATE', 'Node IDs regenerated deterministically');

			// Run graph + JSON validation
			const allWarnings: ValidationWarning[] = [];

			// Validate the graph structure BEFORE converting to JSON
			this.debugLog('PARSE_VALIDATE', 'Validating graph structure...');
			const graphValidateStartTime = Date.now();
			const graphValidation = builder.validate();
			const graphValidateDuration = Date.now() - graphValidateStartTime;

			this.debugLog('PARSE_VALIDATE', 'Graph validation complete', {
				validateDurationMs: graphValidateDuration,
				isValid: graphValidation.valid,
				errorCount: graphValidation.errors.length,
				warningCount: graphValidation.warnings.length,
			});

			// Collect graph validation errors as warnings for agent self-correction
			this.collectValidationIssues(
				graphValidation.errors,
				allWarnings,
				'GRAPH VALIDATION ERRORS',
				'warn',
			);

			// Collect graph validation warnings
			this.collectValidationIssues(
				graphValidation.warnings,
				allWarnings,
				'GRAPH VALIDATION WARNINGS',
				'info',
			);

			// Convert to JSON for JSON-based validation
			const json = builder.toJSON();

			// Run JSON-based validation for additional checks
			this.debugLog('PARSE_VALIDATE', 'Running JSON validation...');
			const validateStartTime = Date.now();
			const validationResult = validateWorkflow(json);
			const validateDuration = Date.now() - validateStartTime;

			this.debugLog('PARSE_VALIDATE', 'JSON validation complete', {
				validateDurationMs: validateDuration,
				isValid: validationResult.valid,
				errorCount: validationResult.errors.length,
				warningCount: validationResult.warnings.length,
			});

			// Collect JSON validation errors as warnings for agent self-correction
			this.collectValidationIssues(
				validationResult.errors,
				allWarnings,
				'JSON VALIDATION ERRORS',
				'warn',
			);

			// Collect JSON validation warnings
			this.collectValidationIssues(
				validationResult.warnings,
				allWarnings,
				'JSON VALIDATION WARNINGS',
				'info',
			);

			// Generate pin data for new nodes only (nodes not in currentWorkflow)
			builder.generatePinData({ beforeWorkflow: currentWorkflow });

			// Convert to JSON
			this.debugLog('PARSE_VALIDATE', 'Converting to JSON...');
			const workflowJson: WorkflowJSON = builder.toJSON();

			this.debugLog('PARSE_VALIDATE', 'Workflow converted to JSON', {
				workflowId: workflowJson.id,
				workflowName: workflowJson.name,
				nodeCount: workflowJson.nodes.length,
				connectionCount: Object.keys(workflowJson.connections).length,
			});

			// Log each node
			this.debugLog('PARSE_VALIDATE', 'Parsed nodes', {
				nodes: workflowJson.nodes.map((n) => ({
					id: n.id,
					name: n.name,
					type: n.type,
					position: n.position,
					parametersKeys: n.parameters ? Object.keys(n.parameters) : [],
				})),
			});

			// Log connections
			this.debugLog('PARSE_VALIDATE', 'Parsed connections', {
				connections: workflowJson.connections,
			});

			this.logger?.debug('Parsed workflow', {
				id: workflowJson.id,
				name: workflowJson.name,
				nodeCount: workflowJson.nodes.length,
			});

			// Log full workflow JSON
			this.debugLog('PARSE_VALIDATE', 'Final workflow JSON', {
				workflow: JSON.stringify(workflowJson, null, 2),
			});

			this.debugLog('PARSE_VALIDATE', '========== PARSING COMPLETE ==========');

			// Return both workflow and warnings for agent self-correction
			return { workflow: workflowJson, warnings: allWarnings };
		} catch (error) {
			this.debugLog('PARSE_VALIDATE', '========== PARSING FAILED ==========', {
				errorMessage: error instanceof Error ? error.message : String(error),
				errorStack: error instanceof Error ? error.stack : undefined,
				code,
			});

			this.logger?.error('Failed to parse WorkflowCode', {
				error: error instanceof Error ? error.message : String(error),
				code: code.substring(0, 500),
			});

			throw new Error(
				`Failed to parse generated workflow code: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}

	/**
	 * Extract error context with line numbers for debugging.
	 *
	 * @param code - The code to extract context from
	 * @param errorMessage - The error message (may contain line number)
	 * @returns Formatted code context around the error
	 */
	getErrorContext(code: string, errorMessage: string): string {
		// Try to extract line number from error message (e.g., "at line 5" or "Line 5:")
		const lineMatch = errorMessage.match(/(?:line|Line)\s*(\d+)/i);
		if (!lineMatch) {
			// No line number - show first 10 lines as context
			const lines = code.split('\n').slice(0, 10);
			return `Code context:\n${lines.map((l, i) => `${i + 1}: ${l}`).join('\n')}`;
		}

		const errorLine = parseInt(lineMatch[1], 10);
		const lines = code.split('\n');

		// Show 3 lines before and after the error line
		const start = Math.max(0, errorLine - 4);
		const end = Math.min(lines.length, errorLine + 3);
		const context = lines
			.slice(start, end)
			.map((l, i) => {
				const lineNum = start + i + 1;
				const marker = lineNum === errorLine ? '> ' : '  ';
				return `${marker}${lineNum}: ${l}`;
			})
			.join('\n');

		const contextText = `Code around line ${errorLine}:\n${context}`;

		const hint = this.detectFixHint(lines, errorLine);
		if (hint) {
			return `${contextText}\n\n${hint}`;
		}

		return contextText;
	}

	/**
	 * Detect known error patterns near the error line and return a fix hint.
	 *
	 * Checks for `${{` inside backtick template literals — a common issue where
	 * JS interprets `${{` as template literal interpolation `${...}`.
	 */
	private detectFixHint(lines: string[], errorLine: number): string | null {
		const searchStart = Math.max(0, errorLine - 5);
		const searchEnd = Math.min(lines.length, errorLine + 5);
		const nearbyCode = lines.slice(searchStart, searchEnd).join('\n');

		// Detect ${{ inside backtick template literals (expr(`...${{...}}`))
		if (/expr\s*\(\s*`[^`]*\$\{\{/.test(nearbyCode)) {
			return (
				"HINT: The '$' before '{{' inside a backtick template literal is interpreted as JS template interpolation. " +
				// eslint-disable-next-line n8n-local-rules/no-interpolation-in-regular-string
				"Use single quotes instead of backticks for expr(), e.g. expr('Amount: ${{ $json.amount }}'). " +
				'Fix ALL occurrences in the file at once.'
			);
		}

		return null;
	}
}
