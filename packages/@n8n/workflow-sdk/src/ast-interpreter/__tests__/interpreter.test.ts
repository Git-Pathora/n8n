/**
 * Unit tests for the AST interpreter.
 */
import { interpretSDKCode, SDKFunctions } from '../interpreter';
import { parseSDKCode } from '../parser';
import {
	InterpreterError,
	SecurityError,
	UnsupportedNodeError,
	UnknownIdentifierError,
} from '../errors';

// Mock SDK functions for testing
const createMockSDKFunctions = (): SDKFunctions => ({
	workflow: jest.fn((id: string, name: string) => ({
		id,
		name,
		nodes: [] as unknown[],
		add: jest.fn(function (this: { nodes: unknown[] }, node: unknown) {
			this.nodes.push(node);
			return this;
		}),
		then: jest.fn(function (this: { nodes: unknown[] }, node: unknown) {
			this.nodes.push(node);
			return this;
		}),
		toJSON: jest.fn(function (this: { id: string; name: string; nodes: unknown[] }) {
			return { id: this.id, name: this.name, nodes: this.nodes };
		}),
	})),
	node: jest.fn((config: unknown) => ({
		type: 'node',
		config,
		then: jest.fn((target: unknown) => target),
		to: jest.fn((target: unknown) => target),
		input: jest.fn(() => ({ index: 0 })),
		output: jest.fn(() => ({ index: 0 })),
		onError: jest.fn(),
	})),
	trigger: jest.fn((config: unknown) => ({
		type: 'trigger',
		config,
		then: jest.fn((target: unknown) => target),
		to: jest.fn((target: unknown) => target),
	})),
	sticky: jest.fn((content: string, options?: unknown) => ({
		type: 'sticky',
		content,
		options,
	})),
	placeholder: jest.fn((value: string) => `__PLACEHOLDER__${value}__`),
	newCredential: jest.fn((name: string) => ({ __newCredential: true, name })),
	ifElse: jest.fn(),
	ifNode: jest.fn(),
	switchCase: jest.fn(),
	merge: jest.fn((config: unknown) => ({ type: 'merge', config, input: jest.fn() })),
	splitInBatches: jest.fn(),
	nextBatch: jest.fn(),
	languageModel: jest.fn((config: unknown) => ({ type: 'languageModel', config })),
	memory: jest.fn((config: unknown) => ({ type: 'memory', config })),
	tool: jest.fn((config: unknown) => ({ type: 'tool', config })),
	outputParser: jest.fn((config: unknown) => ({ type: 'outputParser', config })),
	embedding: jest.fn((config: unknown) => ({ type: 'embedding', config })),
	embeddings: jest.fn((config: unknown) => ({ type: 'embeddings', config })),
	vectorStore: jest.fn((config: unknown) => ({ type: 'vectorStore', config })),
	retriever: jest.fn((config: unknown) => ({ type: 'retriever', config })),
	documentLoader: jest.fn((config: unknown) => ({ type: 'documentLoader', config })),
	textSplitter: jest.fn((config: unknown) => ({ type: 'textSplitter', config })),
	reranker: jest.fn((config: unknown) => ({ type: 'reranker', config })),
	fanOut: jest.fn((...args: unknown[]) => args),
	fromAi: jest.fn(
		(key: string, desc?: string) => `={{ $fromAI('${key}'${desc ? `, '${desc}'` : ''}) }}`,
	),
});

describe('AST Interpreter', () => {
	describe('parseSDKCode', () => {
		it('should parse simple code', () => {
			const code = `const x = 1; return x;`;
			const ast = parseSDKCode(code);
			expect(ast.type).toBe('Program');
			expect(ast.body.length).toBe(2);
		});

		it('should throw InterpreterError for syntax errors', () => {
			const code = `const x = {;`; // Invalid syntax
			expect(() => parseSDKCode(code)).toThrow(InterpreterError);
		});

		it('should include location info in error', () => {
			const code = `const x = {;`;
			try {
				parseSDKCode(code);
				fail('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(InterpreterError);
				expect((error as InterpreterError).location).toBeDefined();
			}
		});
	});

	describe('interpretSDKCode - basic operations', () => {
		let sdkFunctions: SDKFunctions;

		beforeEach(() => {
			sdkFunctions = createMockSDKFunctions();
		});

		it('should interpret a simple return statement', () => {
			const code = `return 42;`;
			const result = interpretSDKCode(code, sdkFunctions);
			expect(result).toBe(42);
		});

		it('should interpret const variable declaration', () => {
			const code = `const x = 10; return x;`;
			const result = interpretSDKCode(code, sdkFunctions);
			expect(result).toBe(10);
		});

		it('should interpret object literals', () => {
			const code = `return { a: 1, b: 'hello', c: true };`;
			const result = interpretSDKCode(code, sdkFunctions);
			expect(result).toEqual({ a: 1, b: 'hello', c: true });
		});

		it('should interpret array literals', () => {
			const code = `return [1, 2, 3];`;
			const result = interpretSDKCode(code, sdkFunctions);
			expect(result).toEqual([1, 2, 3]);
		});

		it('should interpret nested objects and arrays', () => {
			const code = `return { items: [{ name: 'a' }, { name: 'b' }] };`;
			const result = interpretSDKCode(code, sdkFunctions);
			expect(result).toEqual({ items: [{ name: 'a' }, { name: 'b' }] });
		});

		it('should interpret template literals', () => {
			const code = 'return `hello world`;';
			const result = interpretSDKCode(code, sdkFunctions);
			expect(result).toBe('hello world');
		});

		it('should interpret template literals with expressions', () => {
			const code = 'const name = "test"; return `hello ${name}`;';
			const result = interpretSDKCode(code, sdkFunctions);
			expect(result).toBe('hello test');
		});

		it('should interpret spread operator in arrays', () => {
			const code = `const arr = [1, 2]; return [...arr, 3];`;
			const result = interpretSDKCode(code, sdkFunctions);
			expect(result).toEqual([1, 2, 3]);
		});

		it('should interpret spread operator in objects', () => {
			const code = `const obj = { a: 1 }; return { ...obj, b: 2 };`;
			const result = interpretSDKCode(code, sdkFunctions);
			expect(result).toEqual({ a: 1, b: 2 });
		});
	});

	describe('interpretSDKCode - SDK functions', () => {
		let sdkFunctions: SDKFunctions;

		beforeEach(() => {
			sdkFunctions = createMockSDKFunctions();
		});

		it('should call workflow function', () => {
			const code = `return workflow('id-123', 'My Workflow');`;
			const result = interpretSDKCode(code, sdkFunctions) as { id: string; name: string };
			expect(sdkFunctions.workflow).toHaveBeenCalledWith('id-123', 'My Workflow');
			expect(result.id).toBe('id-123');
			expect(result.name).toBe('My Workflow');
		});

		it('should call node function with config', () => {
			const code = `return node({ type: 'n8n-nodes-base.set', version: 3, config: {} });`;
			interpretSDKCode(code, sdkFunctions);
			expect(sdkFunctions.node).toHaveBeenCalledWith({
				type: 'n8n-nodes-base.set',
				version: 3,
				config: {},
			});
		});

		it('should call trigger function', () => {
			const code = `return trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: {} });`;
			interpretSDKCode(code, sdkFunctions);
			expect(sdkFunctions.trigger).toHaveBeenCalledWith({
				type: 'n8n-nodes-base.manualTrigger',
				version: 1,
				config: {},
			});
		});

		it('should call languageModel function', () => {
			const code = `return languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', version: 1, config: {} });`;
			interpretSDKCode(code, sdkFunctions);
			expect(sdkFunctions.languageModel).toHaveBeenCalled();
		});

		it('should call fromAi function', () => {
			const code = `return fromAi('email', 'The recipient email address');`;
			const result = interpretSDKCode(code, sdkFunctions);
			expect(sdkFunctions.fromAi).toHaveBeenCalledWith('email', 'The recipient email address');
			expect(result).toContain('$fromAI');
		});

		it('should chain method calls', () => {
			const code = `
				const wf = workflow('id', 'name');
				return wf.add(trigger({ type: 'test', version: 1, config: {} }));
			`;
			const result = interpretSDKCode(code, sdkFunctions) as { nodes: unknown[] };
			expect(result.nodes.length).toBe(1);
		});
	});

	describe('interpretSDKCode - operators', () => {
		let sdkFunctions: SDKFunctions;

		beforeEach(() => {
			sdkFunctions = createMockSDKFunctions();
		});

		it('should interpret unary minus', () => {
			const code = `return -5;`;
			const result = interpretSDKCode(code, sdkFunctions);
			expect(result).toBe(-5);
		});

		it('should interpret unary plus', () => {
			const code = `return +'10';`;
			const result = interpretSDKCode(code, sdkFunctions);
			expect(result).toBe(10);
		});

		it('should interpret logical not', () => {
			const code = `return !false;`;
			const result = interpretSDKCode(code, sdkFunctions);
			expect(result).toBe(true);
		});

		it('should interpret binary operators', () => {
			expect(interpretSDKCode(`return 2 + 3;`, sdkFunctions)).toBe(5);
			expect(interpretSDKCode(`return 5 - 2;`, sdkFunctions)).toBe(3);
			expect(interpretSDKCode(`return 3 * 4;`, sdkFunctions)).toBe(12);
			expect(interpretSDKCode(`return 10 / 2;`, sdkFunctions)).toBe(5);
			expect(interpretSDKCode(`return 7 % 3;`, sdkFunctions)).toBe(1);
		});

		it('should interpret comparison operators', () => {
			expect(interpretSDKCode(`return 5 > 3;`, sdkFunctions)).toBe(true);
			expect(interpretSDKCode(`return 5 < 3;`, sdkFunctions)).toBe(false);
			expect(interpretSDKCode(`return 5 >= 5;`, sdkFunctions)).toBe(true);
			expect(interpretSDKCode(`return 5 <= 4;`, sdkFunctions)).toBe(false);
			expect(interpretSDKCode(`return 5 === 5;`, sdkFunctions)).toBe(true);
			expect(interpretSDKCode(`return 5 !== 3;`, sdkFunctions)).toBe(true);
		});

		it('should interpret logical operators', () => {
			expect(interpretSDKCode(`return true && false;`, sdkFunctions)).toBe(false);
			expect(interpretSDKCode(`return true || false;`, sdkFunctions)).toBe(true);
			expect(interpretSDKCode(`return null ?? 'default';`, sdkFunctions)).toBe('default');
		});

		it('should interpret conditional (ternary) operator', () => {
			expect(interpretSDKCode(`return true ? 'yes' : 'no';`, sdkFunctions)).toBe('yes');
			expect(interpretSDKCode(`return false ? 'yes' : 'no';`, sdkFunctions)).toBe('no');
		});
	});

	describe('interpretSDKCode - n8n runtime variables in templates', () => {
		let sdkFunctions: SDKFunctions;

		beforeEach(() => {
			sdkFunctions = createMockSDKFunctions();
		});

		it('should preserve $json as literal in template literals', () => {
			// When we have ${$json.name} in a template, it should become literal "${$json.name}"
			const code = 'return `${$json.name}`;';
			const result = interpretSDKCode(code, sdkFunctions);
			expect(result).toBe('${$json.name}');
		});

		it('should preserve $today as literal in template literals', () => {
			const code = 'return `Today is ${$today}`;';
			const result = interpretSDKCode(code, sdkFunctions);
			expect(result).toBe('Today is ${$today}');
		});

		it('should preserve $input.item as literal', () => {
			const code = 'return `${$input.item.json.data}`;';
			const result = interpretSDKCode(code, sdkFunctions);
			expect(result).toBe('${$input.item.json.data}');
		});

		it('should preserve $env as literal', () => {
			const code = 'return `${$env.API_KEY}`;';
			const result = interpretSDKCode(code, sdkFunctions);
			expect(result).toBe('${$env.API_KEY}');
		});
	});

	describe('Security - rejected patterns', () => {
		let sdkFunctions: SDKFunctions;

		beforeEach(() => {
			sdkFunctions = createMockSDKFunctions();
		});

		it('should reject eval()', () => {
			const code = `return eval('1+1');`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(SecurityError);
		});

		it('should reject Function()', () => {
			// Direct Function call (not chained) - this is caught as a dangerous identifier
			const code = `return Function;`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(SecurityError);
		});

		it('should reject require()', () => {
			const code = `return require('fs');`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(SecurityError);
		});

		it('should reject process access', () => {
			const code = `return process.env.PATH;`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(SecurityError);
		});

		it('should reject global access', () => {
			const code = `return global.process;`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(SecurityError);
		});

		it('should reject globalThis access', () => {
			const code = `return globalThis.process;`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(SecurityError);
		});

		it('should reject constructor access', () => {
			const code = `return {}.constructor;`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(SecurityError);
		});

		it('should reject __proto__ access', () => {
			const code = `return {}.__proto__;`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(SecurityError);
		});

		it('should reject prototype access', () => {
			const code = `return {}.prototype;`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(SecurityError);
		});

		it('should reject dynamic property access with expressions', () => {
			const code = `const prop = 'constructor'; return {}[prop];`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(SecurityError);
		});

		it('should allow literal property access', () => {
			const code = `return { foo: 'bar' }['foo'];`;
			const result = interpretSDKCode(code, sdkFunctions);
			expect(result).toBe('bar');
		});
	});

	describe('Security - forbidden syntax', () => {
		let sdkFunctions: SDKFunctions;

		beforeEach(() => {
			sdkFunctions = createMockSDKFunctions();
		});

		it('should reject arrow functions', () => {
			const code = `return (() => 1);`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(UnsupportedNodeError);
		});

		it('should reject function expressions', () => {
			const code = `return (function() { return 1; });`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(UnsupportedNodeError);
		});

		it('should reject for loops', () => {
			const code = `for (let i = 0; i < 10; i++) {}`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(UnsupportedNodeError);
		});

		it('should reject while loops', () => {
			const code = `while (true) { break; }`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(UnsupportedNodeError);
		});

		it('should reject try-catch', () => {
			const code = `try { return 1; } catch (e) {}`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(UnsupportedNodeError);
		});

		it('should reject let declarations', () => {
			const code = `let x = 1; return x;`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(SecurityError);
		});

		it('should reject var declarations', () => {
			const code = `var x = 1; return x;`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(SecurityError);
		});

		it('should reject new expressions', () => {
			const code = `return new Date();`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(UnsupportedNodeError);
		});

		it('should reject assignment expressions', () => {
			const code = `const x = {}; x.y = 1;`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(UnsupportedNodeError);
		});
	});

	describe('Security - reserved SDK names', () => {
		let sdkFunctions: SDKFunctions;

		beforeEach(() => {
			sdkFunctions = createMockSDKFunctions();
		});

		it('should reject using workflow as variable name', () => {
			const code = `const workflow = 1; return workflow;`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(SecurityError);
		});

		it('should reject using node as variable name', () => {
			const code = `const node = 1; return node;`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(SecurityError);
		});

		it('should reject using trigger as variable name', () => {
			const code = `const trigger = 1; return trigger;`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(SecurityError);
		});

		it('should allow user-defined variable names', () => {
			const code = `const myWorkflow = workflow('id', 'name'); return myWorkflow;`;
			const result = interpretSDKCode(code, sdkFunctions) as { id: string };
			expect(result.id).toBe('id');
		});
	});

	describe('interpretSDKCode - unknown identifiers', () => {
		let sdkFunctions: SDKFunctions;

		beforeEach(() => {
			sdkFunctions = createMockSDKFunctions();
		});

		it('should throw for undefined variables', () => {
			const code = `return undefinedVar;`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(UnknownIdentifierError);
		});

		it('should throw for non-SDK functions', () => {
			const code = `return someRandomFunction();`;
			expect(() => interpretSDKCode(code, sdkFunctions)).toThrow(UnknownIdentifierError);
		});
	});

	describe('interpretSDKCode - complete workflow examples', () => {
		let sdkFunctions: SDKFunctions;

		beforeEach(() => {
			sdkFunctions = createMockSDKFunctions();
		});

		it('should interpret a simple workflow', () => {
			const code = `
				const wf = workflow('test-id', 'Test Workflow');
				wf.add(trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: {} }));
				return wf;
			`;
			const result = interpretSDKCode(code, sdkFunctions) as { id: string; name: string };
			expect(result.id).toBe('test-id');
			expect(result.name).toBe('Test Workflow');
		});

		it('should interpret workflow with node chain', () => {
			const code = `
				const t = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: {} });
				const n = node({ type: 'n8n-nodes-base.set', version: 3, config: {} });
				return workflow('id', 'name').add(t).add(n);
			`;
			const result = interpretSDKCode(code, sdkFunctions) as { nodes: unknown[] };
			expect(result.nodes.length).toBe(2);
		});

		it('should interpret workflow with subnodes', () => {
			const code = `
				const model = languageModel({
					type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
					version: 1,
					config: { parameters: { model: 'gpt-4' } }
				});
				return node({
					type: '@n8n/n8n-nodes-langchain.agent',
					version: 1,
					config: { subnodes: { model: model } }
				});
			`;
			interpretSDKCode(code, sdkFunctions);
			// Verify languageModel was called
			expect(sdkFunctions.languageModel).toHaveBeenCalledWith({
				type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
				version: 1,
				config: { parameters: { model: 'gpt-4' } },
			});
			// Verify node was called with the subnode
			expect(sdkFunctions.node).toHaveBeenCalled();
			const nodeCallArgs = (sdkFunctions.node as jest.Mock).mock.calls[0][0];
			expect(nodeCallArgs.config.subnodes.model).toBeDefined();
		});

		it('should interpret workflow with fromAi', () => {
			const code = `
				return tool({
					type: 'n8n-nodes-base.gmailTool',
					version: 1,
					config: { parameters: { sendTo: fromAi('email', 'Recipient email') } }
				});
			`;
			interpretSDKCode(code, sdkFunctions);
			// Verify fromAi was called with correct arguments
			expect(sdkFunctions.fromAi).toHaveBeenCalledWith('email', 'Recipient email');
			// Verify tool was called with the fromAi result
			expect(sdkFunctions.tool).toHaveBeenCalled();
			const toolCallArgs = (sdkFunctions.tool as jest.Mock).mock.calls[0][0];
			expect(toolCallArgs.config.parameters.sendTo).toContain('$fromAI');
		});
	});
});
