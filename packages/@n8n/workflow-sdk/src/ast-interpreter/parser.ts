/**
 * Acorn parser wrapper for SDK code.
 * Parses JavaScript code into an ESTree-compliant AST.
 */
import * as acorn from 'acorn';
import type { Program } from 'estree';
import { InterpreterError } from './errors';

/**
 * Parse SDK code into an AST.
 *
 * The SDK code may contain `return` statements at the top level,
 * which is not valid in a regular script. We use `allowReturnOutsideFunction`
 * to allow this, treating the code as if it were inside an implicit function body.
 *
 * @param code - The JavaScript code to parse
 * @returns An ESTree-compliant Program AST
 * @throws InterpreterError if the code has syntax errors
 */
export function parseSDKCode(code: string): Program {
	try {
		// Acorn's AST is compatible with ESTree, but TypeScript doesn't know that
		return acorn.parse(code, {
			ecmaVersion: 'latest',
			sourceType: 'script', // SDK code is not a module
			locations: true, // Include line/column info for error messages
			allowReturnOutsideFunction: true, // Allow return statements at top level
		}) as unknown as Program;
	} catch (error) {
		if (error instanceof SyntaxError) {
			// Extract location from Acorn's error message
			const match = (error as { loc?: { line: number; column: number } }).loc;
			const location = match
				? {
						start: { line: match.line, column: match.column },
						end: { line: match.line, column: match.column + 1 },
					}
				: undefined;

			throw new InterpreterError(`Syntax error: ${error.message}`, location, code);
		}
		throw error;
	}
}
