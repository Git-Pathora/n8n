/**
 * Tests for TextEditorToolHandler
 */

import type { BaseMessage } from '@langchain/core/messages';
import { ToolMessage } from '@langchain/core/messages';

import type { StreamOutput, ToolProgressChunk } from '../../../types/streaming';
import { WarningTracker } from '../../state/warning-tracker';
import { TextEditorToolHandler } from '../text-editor-tool-handler';

/** Type guard for ToolProgressChunk */
function isToolProgressChunk(chunk: unknown): chunk is ToolProgressChunk {
	return (
		typeof chunk === 'object' &&
		chunk !== null &&
		'type' in chunk &&
		(chunk as ToolProgressChunk).type === 'tool'
	);
}

describe('TextEditorToolHandler', () => {
	let handler: TextEditorToolHandler;
	let mockTextEditorExecute: jest.Mock;
	let mockTextEditorGetCode: jest.Mock;
	let mockParseAndValidate: jest.Mock;
	let mockGetErrorContext: jest.Mock;
	let mockDebugLog: jest.Mock;
	let messages: BaseMessage[];

	beforeEach(() => {
		mockTextEditorExecute = jest.fn();
		mockTextEditorGetCode = jest.fn();
		mockParseAndValidate = jest.fn();
		mockGetErrorContext = jest.fn().mockReturnValue('Code context:\n1: const x = 1;');
		mockDebugLog = jest.fn();
		messages = [];

		handler = new TextEditorToolHandler({
			textEditorExecute: mockTextEditorExecute,
			textEditorGetCode: mockTextEditorGetCode,
			parseAndValidate: mockParseAndValidate,
			getErrorContext: mockGetErrorContext,
			debugLog: mockDebugLog,
		});
	});

	describe('execute', () => {
		const baseParams = {
			toolCallId: 'test-id',
			args: { command: 'view', path: '/workflow.js' },
			currentWorkflow: undefined,
			iteration: 1,
		};

		it('should execute view command and return undefined', async () => {
			mockTextEditorExecute.mockReturnValue('1: const x = 1;');

			const generator = handler.execute({
				...baseParams,
				messages,
			});

			const chunks: unknown[] = [];
			for await (const chunk of generator) {
				chunks.push(chunk);
			}

			// Should yield running and completed
			expect(chunks.length).toBeGreaterThanOrEqual(2);

			// Should add tool result to messages
			expect(messages.length).toBe(1);
			expect(messages[0]).toBeInstanceOf(ToolMessage);
			const toolMessage = messages[0] as ToolMessage;
			expect(toolMessage.content).toBe('1: const x = 1;');
		});

		it('should execute str_replace command and return undefined', async () => {
			mockTextEditorExecute.mockReturnValue('Edit applied successfully.');

			const generator = handler.execute({
				...baseParams,
				args: { command: 'str_replace', path: '/workflow.js', old_str: 'x', new_str: 'y' },
				messages,
			});

			const chunks: unknown[] = [];
			for await (const chunk of generator) {
				chunks.push(chunk);
			}

			expect(messages.length).toBe(1);
			const toolMessage = messages[0] as ToolMessage;
			expect(toolMessage.content).toBe('Edit applied successfully.');
		});

		it('should auto-validate after create and return workflowReady true on success', async () => {
			const mockWorkflow = {
				id: 'test',
				name: 'Test',
				nodes: [{ id: 'n1', name: 'Node 1', type: 'test' }],
				connections: {},
			};

			mockTextEditorExecute.mockReturnValue('File created.');
			mockTextEditorGetCode.mockReturnValue('const workflow = {};');
			mockParseAndValidate.mockResolvedValue({
				workflow: mockWorkflow,
				warnings: [],
			});

			const generator = handler.execute({
				...baseParams,
				args: { command: 'create', path: '/workflow.js', file_text: 'const workflow = {};' },
				messages,
			});

			const chunks: unknown[] = [];
			for await (const chunk of generator) {
				chunks.push(chunk);
			}

			// Should have create result in messages (no additional validation message on success)
			expect(messages.length).toBe(1);
			expect(messages[0]).toBeInstanceOf(ToolMessage);
		});

		it('should auto-validate after create and return workflowReady false on warnings', async () => {
			const mockWorkflow = {
				id: 'test',
				name: 'Test',
				nodes: [],
				connections: {},
			};

			mockTextEditorExecute.mockReturnValue('File created.');
			mockTextEditorGetCode.mockReturnValue('const workflow = {};');
			mockParseAndValidate.mockResolvedValue({
				workflow: mockWorkflow,
				warnings: [{ code: 'WARN001', message: 'Missing parameter' }],
			});

			const generator = handler.execute({
				...baseParams,
				args: { command: 'create', path: '/workflow.js', file_text: 'const workflow = {};' },
				messages,
			});

			const chunks: unknown[] = [];
			for await (const chunk of generator) {
				chunks.push(chunk);
			}

			// Should have single ToolMessage combining create result + validation warning
			expect(messages.length).toBe(1);
			expect(messages[0]).toBeInstanceOf(ToolMessage);
			const content = (messages[0] as ToolMessage).content as string;
			expect(content).toContain('File created.');
			expect(content).toContain('WARN001');
		});

		it('should auto-validate after create and return workflowReady false on parse error', async () => {
			mockTextEditorExecute.mockReturnValue('File created.');
			mockTextEditorGetCode.mockReturnValue('const workflow = {};');
			mockParseAndValidate.mockRejectedValue(new Error('Syntax error'));

			const generator = handler.execute({
				...baseParams,
				args: { command: 'create', path: '/workflow.js', file_text: 'const workflow = {};' },
				messages,
			});

			const chunks: unknown[] = [];
			for await (const chunk of generator) {
				chunks.push(chunk);
			}

			// Should have single ToolMessage combining create result + parse error
			expect(messages.length).toBe(1);
			expect(messages[0]).toBeInstanceOf(ToolMessage);
			const content = (messages[0] as ToolMessage).content as string;
			expect(content).toContain('File created.');
			expect(content).toContain('Parse error');
		});

		it('should handle text editor execution error', async () => {
			mockTextEditorExecute.mockImplementation(() => {
				throw new Error('No match found');
			});

			const generator = handler.execute({
				...baseParams,
				args: { command: 'str_replace', path: '/workflow.js', old_str: 'x', new_str: 'y' },
				messages,
			});

			const chunks: unknown[] = [];
			for await (const chunk of generator) {
				chunks.push(chunk);
			}

			// Should add error message
			expect(messages.length).toBe(1);
			const toolMessage = messages[0] as ToolMessage;
			expect(toolMessage.content).toContain('Error: No match found');
		});

		it('should include toolCallId in all tool progress chunks', async () => {
			mockTextEditorExecute.mockReturnValue('Done');

			const generator = handler.execute({
				...baseParams,
				toolCallId: 'call-abc',
				messages,
			});

			const chunks: StreamOutput[] = [];
			for await (const chunk of generator) {
				chunks.push(chunk);
			}

			const toolChunks = chunks.flatMap((c) => c.messages ?? []).filter(isToolProgressChunk);

			expect(toolChunks.length).toBeGreaterThanOrEqual(2);
			for (const chunk of toolChunks) {
				expect(chunk.toolCallId).toBe('call-abc');
			}
		});

		it('should include toolCallId in progress chunks on error', async () => {
			mockTextEditorExecute.mockImplementation(() => {
				throw new Error('No match found');
			});

			const generator = handler.execute({
				...baseParams,
				toolCallId: 'call-def',
				args: { command: 'str_replace', path: '/workflow.js', old_str: 'x', new_str: 'y' },
				messages,
			});

			const chunks: StreamOutput[] = [];
			for await (const chunk of generator) {
				chunks.push(chunk);
			}

			const toolChunks = chunks.flatMap((c) => c.messages ?? []).filter(isToolProgressChunk);

			expect(toolChunks.length).toBeGreaterThanOrEqual(2);
			for (const chunk of toolChunks) {
				expect(chunk.toolCallId).toBe('call-def');
			}
		});

		it('should yield tool progress chunks', async () => {
			mockTextEditorExecute.mockReturnValue('Done');

			const generator = handler.execute({
				...baseParams,
				messages,
			});

			const chunks: unknown[] = [];
			for await (const chunk of generator) {
				chunks.push(chunk);
			}

			// Find running and completed chunks
			const runningChunk = chunks.find((c: unknown) =>
				(c as { messages?: Array<{ status?: string }> }).messages?.some(
					(m) => m.status === 'running',
				),
			);
			const completedChunk = chunks.find((c: unknown) =>
				(c as { messages?: Array<{ status?: string }> }).messages?.some(
					(m) => m.status === 'completed',
				),
			);

			expect(runningChunk).toBeDefined();
			expect(completedChunk).toBeDefined();
		});

		it('should send only new warnings after create when warningTracker is provided', async () => {
			const warningTracker = new WarningTracker();
			const mockWorkflow = {
				id: 'test',
				name: 'Test',
				nodes: [],
				connections: {},
			};

			const seenWarning = { code: 'WARN001', message: 'Already seen' };
			const newWarning = { code: 'WARN002', message: 'New warning' };

			warningTracker.markAsSeen([seenWarning]);

			mockTextEditorExecute.mockReturnValue('File created.');
			mockTextEditorGetCode.mockReturnValue('const workflow = {};');
			mockParseAndValidate.mockResolvedValue({
				workflow: mockWorkflow,
				warnings: [seenWarning, newWarning],
			});

			const generator = handler.execute({
				...baseParams,
				args: { command: 'create', path: '/workflow.js', file_text: 'const workflow = {};' },
				messages,
				warningTracker,
			});

			const chunks: unknown[] = [];
			for await (const chunk of generator) {
				chunks.push(chunk);
			}

			// Should have single ToolMessage combining create result + only new warning
			expect(messages).toHaveLength(1);
			expect(messages[0]).toBeInstanceOf(ToolMessage);
			const content = (messages[0] as ToolMessage).content as string;
			expect(content).toContain('WARN002');
			expect(content).not.toContain('WARN001');
			// New warning should now be marked as seen
			expect(warningTracker.filterNewWarnings([newWarning])).toHaveLength(0);
		});

		it('should annotate pre-existing warnings with [pre-existing] tag after create', async () => {
			const warningTracker = new WarningTracker();
			const mockWorkflow = {
				id: 'test',
				name: 'Test',
				nodes: [],
				connections: {},
			};

			const preExistingWarning = {
				code: 'WARN001',
				message: 'Pre-existing issue',
				nodeName: 'Node1',
			};
			const newWarning = { code: 'WARN002', message: 'New issue' };

			warningTracker.markAsPreExisting([preExistingWarning]);

			mockTextEditorExecute.mockReturnValue('File created.');
			mockTextEditorGetCode.mockReturnValue('const workflow = {};');
			mockParseAndValidate.mockResolvedValue({
				workflow: mockWorkflow,
				warnings: [preExistingWarning, newWarning],
			});

			const generator = handler.execute({
				...baseParams,
				args: { command: 'create', path: '/workflow.js', file_text: 'const workflow = {};' },
				messages,
				warningTracker,
			});

			for await (const _ of generator) {
				// consume
			}

			expect(messages).toHaveLength(1);
			const content = (messages[0] as ToolMessage).content as string;
			expect(content).toContain('[WARN001] [pre-existing] Pre-existing issue');
			expect(content).toContain('[WARN002] New issue');
			expect(content).not.toContain('[WARN002] [pre-existing]');
		});

		it('should treat all-repeated warnings as workflowReady after create', async () => {
			const warningTracker = new WarningTracker();
			const mockWorkflow = {
				id: 'test',
				name: 'Test',
				nodes: [{ id: 'n1', name: 'Node 1', type: 'test' }],
				connections: {},
			};

			const warning = {
				code: 'AGENT_NO_SYSTEM_MESSAGE',
				message: 'No system message',
				nodeName: 'Agent',
			};

			warningTracker.markAsSeen([warning]);

			mockTextEditorExecute.mockReturnValue('File created.');
			mockTextEditorGetCode.mockReturnValue('const workflow = {};');
			mockParseAndValidate.mockResolvedValue({
				workflow: mockWorkflow,
				warnings: [warning],
			});

			const generator = handler.execute({
				...baseParams,
				args: { command: 'create', path: '/workflow.js', file_text: 'const workflow = {};' },
				messages,
				warningTracker,
			});

			const chunks: unknown[] = [];
			let result: unknown;
			let iterResult = await generator.next();
			while (!iterResult.done) {
				chunks.push(iterResult.value);
				iterResult = await generator.next();
			}
			result = iterResult.value;

			// All warnings repeated → treat as workflowReady
			expect(result).toEqual(
				expect.objectContaining({ workflowReady: true, workflow: mockWorkflow }),
			);
			// Should have single ToolMessage with create result, no validation warnings
			expect(messages).toHaveLength(1);
			expect(messages[0]).toBeInstanceOf(ToolMessage);
		});
	});
});
