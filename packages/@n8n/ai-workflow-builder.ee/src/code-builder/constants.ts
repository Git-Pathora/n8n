/**
 * Constants for the Code Builder Agent
 *
 * Extracted from code-builder-agent.ts for better organization and testability.
 */

import type { BuilderToolBase } from '@/utils/stream-processor';

/** Maximum iterations for the agentic loop to prevent infinite loops */
export const MAX_AGENT_ITERATIONS = 50;

/** Maximum validate attempts before giving up in text editor mode */
export const MAX_VALIDATE_ATTEMPTS = 10;

/** Instruction appended to validation/parse error messages with steps to fix */
export const FIX_VALIDATION_ERRORS_INSTRUCTION = `
Use the think tool to analyze the error, then act:
1. Is this error relevant to the last user request? If NOT, stop — do not fix unrelated warnings.
2. Use search_nodes and get_node_types to look up the correct node schema (if not already fetched)
3. Use str_replace or insert to fix the code
4. Call validate_workflow to verify
Do NOT output explanations — just fix the code.`;

/** Native Anthropic text editor tool configuration */
export const TEXT_EDITOR_TOOL = {
	type: 'text_editor_20250728' as const,
	name: 'str_replace_based_edit_tool' as const,
};

/** Validate workflow tool schema - separate from text editor for clearer separation of concerns */
export const VALIDATE_TOOL = {
	type: 'function' as const,
	function: {
		name: 'validate_workflow',
		description:
			'Validate the current workflow code for errors. Returns validation results - either success or a list of errors to fix.',
		parameters: {
			type: 'object' as const,
			properties: {
				path: {
					type: 'string' as const,
					description: 'Path to the workflow file (must be /workflow.js)',
				},
			},
			required: ['path'],
		},
	},
};

/**
 * CodeBuilderAgent tools for display when session is loaded
 */
export const CODE_BUILDER_TEXT_EDITOR_TOOL: BuilderToolBase = {
	toolName: 'str_replace_based_edit_tool',
	displayTitle: 'Editing workflow',
};

export const CODE_BUILDER_VALIDATE_TOOL: BuilderToolBase = {
	toolName: 'validate_workflow',
	displayTitle: 'Validating workflow',
};

export const CODE_BUILDER_SEARCH_NODES_TOOL: BuilderToolBase = {
	toolName: 'search_nodes',
	displayTitle: 'Searching nodes',
};

export const CODE_BUILDER_GET_NODE_TYPES_TOOL: BuilderToolBase = {
	toolName: 'get_node_types',
	displayTitle: 'Getting node definitions',
};

export const CODE_BUILDER_THINK_TOOL: BuilderToolBase = {
	toolName: 'think',
	displayTitle: 'Reasoning',
};
