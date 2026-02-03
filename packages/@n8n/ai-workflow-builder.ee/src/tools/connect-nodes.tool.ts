import { tool } from '@langchain/core/tools';
import type { Logger } from '@n8n/backend-common';
import { type INodeTypeDescription } from 'n8n-workflow';
import { z } from 'zod';

import type { BuilderTool, BuilderToolBase } from '@/utils/stream-processor';

import { ValidationError } from '../errors';
import { createProgressReporter, reportProgress } from './helpers/progress';
import { createSuccessResponse, createErrorResponse } from './helpers/response';
import { addConnectIntentToWorkflow } from './helpers/state';
import type { ConnectNodesOutput } from '../types/tools';

/**
 * Schema for node connection
 */
export const nodeConnectionSchema = z.object({
	sourceNodeName: z
		.string()
		.describe(
			'The name of the source node. For ai_* connections (ai_languageModel, ai_tool, etc.), use the sub-node (e.g., OpenAI Chat Model). For main connections, this is the node producing the output',
		),
	targetNodeName: z
		.string()
		.describe(
			'The name of the target node. For ai_* connections, use the main node that accepts the sub-node (e.g., AI Agent, Basic LLM Chain). For main connections, this is the node receiving the input',
		),
	connectionType: z
		.string()
		.optional()
		.describe(
			'Optional: Explicit connection type (e.g., "main", "ai_tool"). Omit to let the system infer it later.',
		),
	sourceOutputIndex: z
		.number()
		.optional()
		.describe('The index of the output to connect from (default: 0)'),
	targetInputIndex: z
		.number()
		.optional()
		.describe('The index of the input to connect to (default: 0)'),
});

export const CONNECT_NODES_TOOL: BuilderToolBase = {
	toolName: 'connect_nodes',
	displayTitle: 'Connecting nodes',
};

/**
 * Factory function to create the connect nodes tool
 */
export function createConnectNodesTool(
	_nodeTypes: INodeTypeDescription[],
	logger?: Logger,
): BuilderTool {
	const dynamicTool = tool(
		// eslint-disable-next-line complexity
		(input, config) => {
			const reporter = createProgressReporter(
				config,
				CONNECT_NODES_TOOL.toolName,
				CONNECT_NODES_TOOL.displayTitle,
			);

			try {
				// Validate input using Zod schema
				const validatedInput = nodeConnectionSchema.parse(input);

				// Report tool start
				reporter.start(validatedInput);

				const {
					sourceNodeName,
					targetNodeName,
					connectionType,
					sourceOutputIndex,
					targetInputIndex,
				} = validatedInput;

				reportProgress(reporter, `Queueing connection ${sourceNodeName} → ${targetNodeName}...`);

				logger?.debug('\n=== Connect Nodes Tool ===');
				logger?.debug(`Queued connection intent: ${sourceNodeName} -> ${targetNodeName}`);

				const message = `Queued connection: ${sourceNodeName} → ${targetNodeName}`;

				const output: ConnectNodesOutput = {
					sourceNode: sourceNodeName,
					targetNode: targetNodeName,
					connectionType,
					message,
				};
				reporter.complete(output);

				const stateUpdates = addConnectIntentToWorkflow(
					sourceNodeName,
					targetNodeName,
					connectionType,
					sourceOutputIndex ?? 0,
					targetInputIndex ?? 0,
				);
				return createSuccessResponse(config, message, stateUpdates);
			} catch (error) {
				// Handle validation or unexpected errors
				let toolError;

				if (error instanceof z.ZodError) {
					const validationError = new ValidationError('Invalid connection parameters', {
						field: error.errors[0]?.path.join('.'),
						value: error.errors[0]?.message,
					});
					toolError = {
						message: validationError.message,
						code: 'VALIDATION_ERROR',
						details: error.errors,
					};
				} else {
					toolError = {
						message: error instanceof Error ? error.message : 'Unknown error occurred',
						code: 'EXECUTION_ERROR',
					};
				}

				reporter.error(toolError);
				return createErrorResponse(config, toolError);
			}
		},
		{
			name: CONNECT_NODES_TOOL.toolName,
			description: `Connect two nodes in the workflow. This tool queues a connection intent; the system will resolve connection type and direction after all nodes are added.

UNDERSTANDING CONNECTIONS:
- SOURCE NODE: The node that PRODUCES output/provides capability
- TARGET NODE: The node that RECEIVES input/uses capability
- Flow direction: Source → Target

AUTOMATIC CONNECTION TYPE DETECTION:
- Connection type is inferred after nodes exist in the workflow
- If you already know the exact type, you can pass connectionType to skip inference

For ai_* connections (ai_languageModel, ai_tool, ai_memory, ai_embedding, etc.):
- Sub-nodes are ALWAYS the source (they provide capabilities)
- Main nodes are ALWAYS the target (they use capabilities)
- The tool will AUTO-CORRECT if you specify them backwards

CONNECTION EXAMPLES:
- OpenAI Chat Model → AI Agent (detects ai_languageModel)
- Calculator Tool → AI Agent (detects ai_tool)
- Simple Memory → Basic LLM Chain (detects ai_memory)
- Embeddings OpenAI → Vector Store (detects ai_embedding)
- Document Loader → Embeddings OpenAI (detects ai_document)
- HTTP Request → Set (detects main)

MULTI-OUTPUT NODES (sourceOutputIndex):
- IF node: output 0 = true branch, output 1 = false branch
- Switch node: outputs 0 to N-1 based on configured rules, output N = default/fallback

ERROR OUTPUT CONNECTIONS (onError: 'continueErrorOutput'):
When a node has nodeSettings.onError = 'continueErrorOutput', it gains an ADDITIONAL error output appended as the LAST index:
- Single-output node (HTTP Request): output 0 = success, output 1 = error
- IF node (2 outputs) + error handling: output 0 = true, output 1 = false, output 2 = error
- Switch node (N outputs) + error handling: outputs 0 to N-1 = branches, output N = error

Example: HTTP Request with continueErrorOutput → success at index 0, error at index 1
Example: IF with continueErrorOutput → true at 0, false at 1, error at 2`,
			schema: nodeConnectionSchema,
		},
	);

	return {
		tool: dynamicTool,
		...CONNECT_NODES_TOOL,
	};
}
