/**
 * Build-time CLI for generating node definitions (types + schemas).
 *
 * Reads dist/types/nodes.json from CWD and generates to dist/node-definitions/.
 * Used as a post-build step in node packages (nodes-base, nodes-langchain).
 *
 * Usage:
 *   n8n-generate-node-defs
 *   # or: npx tsx generate-node-defs-cli.ts
 */

import * as fs from 'fs';
import * as path from 'path';

import { jsonParse } from 'n8n-workflow';

import type { NodeTypeDescription } from './generate-types';
import { orchestrateGeneration } from './generate-types';

export interface GenerateNodeDefinitionsOptions {
	nodesJsonPath: string;
	outputDir: string;
}

/**
 * Generate node definitions from a nodes.json file.
 * Testable core logic extracted from CLI entry point.
 */
export async function generateNodeDefinitions(
	options: GenerateNodeDefinitionsOptions,
): Promise<void> {
	const { nodesJsonPath, outputDir } = options;

	if (!fs.existsSync(nodesJsonPath)) {
		throw new Error(`nodes.json not found at ${nodesJsonPath}`);
	}

	const content = await fs.promises.readFile(nodesJsonPath, 'utf-8');
	const nodes = jsonParse<NodeTypeDescription[]>(content);

	const result = await orchestrateGeneration({ nodes, outputDir });
	console.log(`Generated node definitions for ${result.nodeCount} nodes in ${outputDir}`);
}

// CLI entry point
if (require.main === module) {
	const cwd = process.cwd();
	const nodesJsonPath = path.join(cwd, 'dist', 'types', 'nodes.json');
	const outputDir = path.join(cwd, 'dist', 'node-definitions');

	generateNodeDefinitions({ nodesJsonPath, outputDir }).catch((error) => {
		console.error('Node definition generation failed:', error);
		process.exit(1);
	});
}
