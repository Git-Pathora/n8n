import type { JSONSchema7 } from 'json-schema';
import type { ZodTypeAny, ZodEffects, ZodSchema } from 'zod';

export interface Tool {
	/**
	 * The name of the tool/function
	 */
	name: string;

	/**
	 * Description of what the tool does
	 */
	description?: string;

	/**
	 * JSON or Zod schema describing the tool's parameters
	 */
	inputSchema: JSONSchema7 | ZodSchema<any> | ZodEffects<ZodTypeAny>;

	/**
	 * Whether this tool should be called strictly according to schema
	 */
	strict?: boolean;

	execute?: (args: any) => Promise<unknown>;
}

/**
 * Tool call from the model
 */
export interface ToolCall {
	/**
	 * Unique identifier for this tool call
	 */
	id: string;

	/**
	 * Name of the tool being called
	 */
	name: string;

	/**
	 * Arguments passed to the tool (parsed JSON)
	 */
	arguments: Record<string, unknown>;

	/**
	 * Raw arguments string (before parsing)
	 */
	argumentsRaw?: string;
}

/**
 * Result from executing a tool
 */
export interface ToolResult {
	/**
	 * ID of the tool call this result corresponds to
	 */
	toolCallId: string;

	/**
	 * Name of the tool that was called
	 */
	toolName: string;

	/**
	 * Result from the tool execution
	 */
	result: unknown;

	status: 'success' | 'error';
}
