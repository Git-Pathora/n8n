import { promises as fs } from 'fs';
import path from 'path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const SEARCH_WORKFLOWS_RESOURCE_URI = 'ui://n8n/search-workflows';
export const EXECUTE_WORKFLOW_RESOURCE_URI = 'ui://n8n/execute-workflow';

const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';

// At runtime __dirname is packages/cli/dist/modules/mcp/apps/
// The built HTML files are at packages/cli/dist/mcp-apps/<app-name>/index.html
const DIST_DIR = path.resolve(__dirname, '..', '..', '..', 'mcp-apps');

/**
 * Registers all MCP App resources with the server.
 * Each app has a corresponding `ui://` resource that serves bundled HTML.
 */
export async function registerMcpApps(server: McpServer): Promise<void> {
	registerSearchWorkflowsApp(server);
	registerExecuteWorkflowApp(server);
}

function registerSearchWorkflowsApp(server: McpServer): void {
	const htmlPath = path.join(DIST_DIR, 'search-workflows', 'index.html');

	server.registerResource(
		'search-workflows-app',
		SEARCH_WORKFLOWS_RESOURCE_URI,
		{
			description: 'Interactive UI for browsing n8n workflow search results',
			mimeType: RESOURCE_MIME_TYPE,
		},
		async () => {
			const html = await fs.readFile(htmlPath, 'utf-8');
			return {
				contents: [
					{
						uri: SEARCH_WORKFLOWS_RESOURCE_URI,
						mimeType: RESOURCE_MIME_TYPE,
						text: html,
					},
				],
			};
		},
	);
}

function registerExecuteWorkflowApp(server: McpServer): void {
	const htmlPath = path.join(DIST_DIR, 'execute-workflow', 'index.html');

	server.registerResource(
		'execute-workflow-app',
		EXECUTE_WORKFLOW_RESOURCE_URI,
		{
			description: 'Interactive UI for providing inputs and executing n8n workflows',
			mimeType: RESOURCE_MIME_TYPE,
		},
		async () => {
			const html = await fs.readFile(htmlPath, 'utf-8');
			return {
				contents: [
					{
						uri: EXECUTE_WORKFLOW_RESOURCE_URI,
						mimeType: RESOURCE_MIME_TYPE,
						text: html,
					},
				],
			};
		},
	);
}
