import { resolve } from 'path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const ROOT = resolve(import.meta.dirname);
// ROOT is packages/cli/src/modules/mcp/apps/ — go up 4 levels to packages/cli/
const CLI_ROOT = resolve(ROOT, '..', '..', '..', '..');

export default defineConfig({
	root: ROOT,
	plugins: [viteSingleFile()],
	build: {
		outDir: resolve(CLI_ROOT, 'dist', 'mcp-apps'),
		rollupOptions: {
			input: {
				'search-workflows': resolve(ROOT, 'search-workflows', 'index.html'),
				'execute-workflow': resolve(ROOT, 'execute-workflow', 'index.html'),
			},
		},
		emptyOutDir: true,
	},
});
