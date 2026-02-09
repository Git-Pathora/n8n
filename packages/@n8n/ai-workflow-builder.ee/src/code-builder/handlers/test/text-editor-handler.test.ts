import { TextEditorHandler } from '../text-editor-handler';
import {
	NoMatchFoundError,
	MultipleMatchesError,
	InvalidLineNumberError,
	InvalidPathError,
	FileExistsError,
	FileNotFoundError,
	BatchReplacementError,
} from '../text-editor.types';

describe('TextEditorHandler', () => {
	let handler: TextEditorHandler;

	beforeEach(() => {
		handler = new TextEditorHandler();
	});

	describe('view command', () => {
		it('should return file content with line numbers', () => {
			const code = 'line1\nline2\nline3';
			handler.setWorkflowCode(code);

			const result = handler.execute({
				command: 'view',
				path: '/workflow.js',
			});

			expect(result).toBe('1: line1\n2: line2\n3: line3');
		});

		it('should return view_range subset with line numbers', () => {
			const code = 'line1\nline2\nline3\nline4\nline5';
			handler.setWorkflowCode(code);

			const result = handler.execute({
				command: 'view',
				path: '/workflow.js',
				view_range: [2, 4],
			});

			expect(result).toBe('2: line2\n3: line3\n4: line4');
		});

		it('should clamp view_range end to file length', () => {
			const code = 'line1\nline2\nline3';
			handler.setWorkflowCode(code);

			const result = handler.execute({
				command: 'view',
				path: '/workflow.js',
				view_range: [2, 100],
			});

			expect(result).toBe('2: line2\n3: line3');
		});

		it('should throw FileNotFoundError when no code exists', () => {
			expect(() =>
				handler.execute({
					command: 'view',
					path: '/workflow.js',
				}),
			).toThrow(FileNotFoundError);
		});

		it('should throw InvalidLineNumberError for invalid start line', () => {
			handler.setWorkflowCode('line1\nline2');

			expect(() =>
				handler.execute({
					command: 'view',
					path: '/workflow.js',
					view_range: [0, 2],
				}),
			).toThrow(InvalidLineNumberError);
		});

		it('should throw InvalidLineNumberError when start exceeds file length', () => {
			handler.setWorkflowCode('line1\nline2');

			expect(() =>
				handler.execute({
					command: 'view',
					path: '/workflow.js',
					view_range: [5, 10],
				}),
			).toThrow(InvalidLineNumberError);
		});
	});

	describe('create command', () => {
		it('should create file when no code exists', () => {
			const result = handler.execute({
				command: 'create',
				path: '/workflow.js',
				file_text: 'const x = 1;',
			});

			expect(result).toBe('File created successfully.');
			expect(handler.getWorkflowCode()).toBe('const x = 1;');
		});

		it('should overwrite existing code', () => {
			handler.setWorkflowCode('existing content');

			const result = handler.execute({
				command: 'create',
				path: '/workflow.js',
				file_text: 'new content',
			});

			expect(result).toBe('File created successfully.');
			expect(handler.getWorkflowCode()).toBe('new content');
		});
	});

	describe('str_replace command', () => {
		it('should replace exact single match', () => {
			handler.setWorkflowCode('const x = 1;\nconst y = 2;');

			const result = handler.execute({
				command: 'str_replace',
				path: '/workflow.js',
				old_str: 'const y = 2;',
				new_str: 'const y = 3;',
			});

			expect(result).toBe('Edit applied successfully.');
			expect(handler.getWorkflowCode()).toBe('const x = 1;\nconst y = 3;');
		});

		it("should handle special replacement patterns like $' in new_str", () => {
			// $' is a special pattern in String.prototype.replace() that inserts
			// the portion of the string that follows the matched substring
			handler.setWorkflowCode('const pattern = "";\nconst other = "test";');

			handler.execute({
				command: 'str_replace',
				path: '/workflow.js',
				old_str: 'const pattern = "";',
				new_str: "const pattern = '^\\\\d{4}-\\\\d{2}-\\\\d{2}$';",
			});

			// Without fix: $' would cause 'const other = "test";' to be duplicated
			expect(handler.getWorkflowCode()).toBe(
				'const pattern = \'^\\\\d{4}-\\\\d{2}-\\\\d{2}$\';\nconst other = "test";',
			);
		});

		it('should handle $& replacement pattern in new_str', () => {
			// $& inserts the matched substring
			handler.setWorkflowCode('const x = "hello";');

			handler.execute({
				command: 'str_replace',
				path: '/workflow.js',
				old_str: 'const x = "hello";',
				new_str: 'const x = "$&world";',
			});

			expect(handler.getWorkflowCode()).toBe('const x = "$&world";');
		});

		it('should handle $` replacement pattern in new_str', () => {
			// $` inserts the portion of the string that precedes the matched substring
			handler.setWorkflowCode('const prefix = "before";\nconst x = "test";');

			handler.execute({
				command: 'str_replace',
				path: '/workflow.js',
				old_str: 'const x = "test";',
				new_str: 'const x = "$`value";',
			});

			expect(handler.getWorkflowCode()).toBe('const prefix = "before";\nconst x = "$`value";');
		});

		it('should handle $$ literally in new_str', () => {
			// $$ is a special pattern in String.prototype.replace() that inserts a literal $
			// But we want literal replacement, so $$ should remain $$
			handler.setWorkflowCode('const price = 0;');

			handler.execute({
				command: 'str_replace',
				path: '/workflow.js',
				old_str: 'const price = 0;',
				new_str: 'const price = "$$100";',
			});

			// With literal replacement, $$ should remain $$ in the output
			expect(handler.getWorkflowCode()).toBe('const price = "$$100";');
		});

		it('should handle $n (capture group) patterns in new_str', () => {
			// $1, $2, etc. reference capture groups (which don't exist in literal replacement)
			handler.setWorkflowCode('const regex = /test/;');

			handler.execute({
				command: 'str_replace',
				path: '/workflow.js',
				old_str: 'const regex = /test/;',
				new_str: 'const regex = /($1|$2)/;',
			});

			expect(handler.getWorkflowCode()).toBe('const regex = /($1|$2)/;');
		});

		it('should throw NoMatchFoundError when no match found', () => {
			handler.setWorkflowCode('const x = 1;');

			expect(() =>
				handler.execute({
					command: 'str_replace',
					path: '/workflow.js',
					old_str: 'const y = 2;',
					new_str: 'const y = 3;',
				}),
			).toThrow(NoMatchFoundError);
		});

		it('should throw MultipleMatchesError when multiple matches found', () => {
			handler.setWorkflowCode('const x = 1;\nconst x = 1;');

			expect(() =>
				handler.execute({
					command: 'str_replace',
					path: '/workflow.js',
					old_str: 'const x = 1;',
					new_str: 'const x = 2;',
				}),
			).toThrow(MultipleMatchesError);
		});

		it('should throw FileNotFoundError when no code exists', () => {
			expect(() =>
				handler.execute({
					command: 'str_replace',
					path: '/workflow.js',
					old_str: 'old',
					new_str: 'new',
				}),
			).toThrow(FileNotFoundError);
		});

		it('should handle multiline replacements', () => {
			handler.setWorkflowCode('function foo() {\n  return 1;\n}');

			handler.execute({
				command: 'str_replace',
				path: '/workflow.js',
				old_str: 'function foo() {\n  return 1;\n}',
				new_str: 'function foo() {\n  return 2;\n}',
			});

			expect(handler.getWorkflowCode()).toBe('function foo() {\n  return 2;\n}');
		});
	});

	describe('insert command', () => {
		it('should insert at beginning of file (line 0)', () => {
			handler.setWorkflowCode('line1\nline2');

			const result = handler.execute({
				command: 'insert',
				path: '/workflow.js',
				insert_line: 0,
				insert_text: 'line0',
			});

			expect(result).toBe('Text inserted successfully.');
			expect(handler.getWorkflowCode()).toBe('line0\nline1\nline2');
		});

		it('should insert after specified line', () => {
			handler.setWorkflowCode('line1\nline3');

			handler.execute({
				command: 'insert',
				path: '/workflow.js',
				insert_line: 1,
				insert_text: 'line2',
			});

			expect(handler.getWorkflowCode()).toBe('line1\nline2\nline3');
		});

		it('should insert at end of file', () => {
			handler.setWorkflowCode('line1\nline2');

			handler.execute({
				command: 'insert',
				path: '/workflow.js',
				insert_line: 2,
				insert_text: 'line3',
			});

			expect(handler.getWorkflowCode()).toBe('line1\nline2\nline3');
		});

		it('should throw InvalidLineNumberError for negative line', () => {
			handler.setWorkflowCode('line1');

			expect(() =>
				handler.execute({
					command: 'insert',
					path: '/workflow.js',
					insert_line: -1,
					insert_text: 'new',
				}),
			).toThrow(InvalidLineNumberError);
		});

		it('should throw InvalidLineNumberError when line exceeds file length', () => {
			handler.setWorkflowCode('line1\nline2');

			expect(() =>
				handler.execute({
					command: 'insert',
					path: '/workflow.js',
					insert_line: 5,
					insert_text: 'new',
				}),
			).toThrow(InvalidLineNumberError);
		});

		it('should throw FileNotFoundError when no code exists', () => {
			expect(() =>
				handler.execute({
					command: 'insert',
					path: '/workflow.js',
					insert_line: 0,
					insert_text: 'new',
				}),
			).toThrow(FileNotFoundError);
		});
	});

	describe('path validation', () => {
		it('should throw InvalidPathError for unsupported paths', () => {
			expect(() =>
				handler.execute({
					command: 'view',
					path: '/other.ts',
				}),
			).toThrow(InvalidPathError);

			expect(() =>
				handler.execute({
					command: 'create',
					path: '/src/workflow.js',
					file_text: 'code',
				}),
			).toThrow(InvalidPathError);
		});
	});

	describe('accessor methods', () => {
		it('getWorkflowCode should return null initially', () => {
			expect(handler.getWorkflowCode()).toBeNull();
		});

		it('setWorkflowCode should set the code', () => {
			handler.setWorkflowCode('test code');
			expect(handler.getWorkflowCode()).toBe('test code');
		});

		it('hasWorkflowCode should return false initially', () => {
			expect(handler.hasWorkflowCode()).toBe(false);
		});

		it('hasWorkflowCode should return true after setting code', () => {
			handler.setWorkflowCode('code');
			expect(handler.hasWorkflowCode()).toBe(true);
		});

		it('clearWorkflowCode should clear the code', () => {
			handler.setWorkflowCode('code');
			handler.clearWorkflowCode();
			expect(handler.getWorkflowCode()).toBeNull();
			expect(handler.hasWorkflowCode()).toBe(false);
		});
	});

	describe('error messages', () => {
		it('NoMatchFoundError should have descriptive message', () => {
			const error = new NoMatchFoundError('search string');
			expect(error.message).toContain('No match found');
			expect(error.name).toBe('NoMatchFoundError');
		});

		it('MultipleMatchesError should include count', () => {
			const error = new MultipleMatchesError(3);
			expect(error.message).toContain('Found 3 matches');
			expect(error.name).toBe('MultipleMatchesError');
		});

		it('InvalidLineNumberError should include line info', () => {
			const error = new InvalidLineNumberError(10, 5);
			expect(error.message).toContain('Invalid line number 10');
			expect(error.message).toContain('5 lines');
			expect(error.name).toBe('InvalidLineNumberError');
		});

		it('InvalidPathError should include path', () => {
			const error = new InvalidPathError('/bad/path.ts');
			expect(error.message).toContain('/bad/path.ts');
			expect(error.message).toContain('/workflow.js');
			expect(error.name).toBe('InvalidPathError');
		});

		it('FileExistsError should have descriptive message', () => {
			const error = new FileExistsError();
			expect(error.message).toContain('already exists');
			expect(error.name).toBe('FileExistsError');
		});

		it('FileNotFoundError should have descriptive message', () => {
			const error = new FileNotFoundError();
			expect(error.message).toContain('No workflow code exists');
			expect(error.name).toBe('FileNotFoundError');
		});

		it('BatchReplacementError should include failedIndex and cause', () => {
			const cause = new NoMatchFoundError('search');
			const error = new BatchReplacementError(2, 5, cause);
			expect(error.message).toContain('index 2 of 5');
			expect(error.message).toContain('rolled back');
			expect(error.name).toBe('BatchReplacementError');
			expect(error.failedIndex).toBe(2);
			expect(error.totalCount).toBe(5);
			expect(error.cause).toBe(cause);
		});
	});

	describe('executeBatch', () => {
		it('should apply multiple replacements successfully', () => {
			handler.setWorkflowCode('const x = 1;\nconst y = 2;\nconst z = 3;');

			const result = handler.executeBatch([
				{ old_str: 'const x = 1;', new_str: 'const x = 10;' },
				{ old_str: 'const y = 2;', new_str: 'const y = 20;' },
				{ old_str: 'const z = 3;', new_str: 'const z = 30;' },
			]);

			expect(result).toBe('All 3 replacements applied successfully.');
			expect(handler.getWorkflowCode()).toBe('const x = 10;\nconst y = 20;\nconst z = 30;');
		});

		it('should roll back all changes on NoMatchFound', () => {
			const originalCode = 'const a = 1;\nconst b = 2;';
			handler.setWorkflowCode(originalCode);

			expect(() =>
				handler.executeBatch([
					{ old_str: 'const a = 1;', new_str: 'const a = 10;' },
					{ old_str: 'const c = 3;', new_str: 'const c = 30;' }, // doesn't exist
				]),
			).toThrow(BatchReplacementError);

			expect(handler.getWorkflowCode()).toBe(originalCode);
		});

		it('should roll back all changes on MultipleMatches', () => {
			const originalCode = 'const x = 1;\nconst x = 1;\nconst y = 2;';
			handler.setWorkflowCode(originalCode);

			expect(() =>
				handler.executeBatch([
					{ old_str: 'const y = 2;', new_str: 'const y = 20;' },
					{ old_str: 'const x = 1;', new_str: 'const x = 10;' }, // multiple matches
				]),
			).toThrow(BatchReplacementError);

			expect(handler.getWorkflowCode()).toBe(originalCode);
		});

		it('should handle empty replacements array', () => {
			handler.setWorkflowCode('const x = 1;');

			const result = handler.executeBatch([]);

			expect(result).toBe('No replacements to apply.');
			expect(handler.getWorkflowCode()).toBe('const x = 1;');
		});

		it('should throw FileNotFoundError when no code exists', () => {
			expect(() => handler.executeBatch([{ old_str: 'old', new_str: 'new' }])).toThrow(
				FileNotFoundError,
			);
		});

		it('should handle sequential dependent replacements', () => {
			handler.setWorkflowCode('const x = 1;');

			const result = handler.executeBatch([
				{ old_str: 'const x = 1;', new_str: 'const x = 1;\nconst y = 2;' },
				{ old_str: 'const y = 2;', new_str: 'const y = 20;' },
			]);

			expect(result).toBe('All 2 replacements applied successfully.');
			expect(handler.getWorkflowCode()).toBe('const x = 1;\nconst y = 20;');
		});

		it('should escape $ correctly in batch replacements', () => {
			handler.setWorkflowCode('const price = 0;\nconst tax = 0;');

			handler.executeBatch([
				{ old_str: 'const price = 0;', new_str: "const price = '$100';" },
				{ old_str: 'const tax = 0;', new_str: "const tax = '$10';" },
			]);

			expect(handler.getWorkflowCode()).toBe("const price = '$100';\nconst tax = '$10';");
		});

		it('should report correct failedIndex in BatchReplacementError', () => {
			handler.setWorkflowCode('const a = 1;\nconst b = 2;\nconst c = 3;');

			try {
				handler.executeBatch([
					{ old_str: 'const a = 1;', new_str: 'const a = 10;' },
					{ old_str: 'const b = 2;', new_str: 'const b = 20;' },
					{ old_str: 'const d = 4;', new_str: 'const d = 40;' }, // fails at index 2
				]);
				fail('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(BatchReplacementError);
				const batchError = error as BatchReplacementError;
				expect(batchError.failedIndex).toBe(2);
				expect(batchError.totalCount).toBe(3);
				expect(batchError.cause).toBeInstanceOf(NoMatchFoundError);
			}
		});
	});
});
