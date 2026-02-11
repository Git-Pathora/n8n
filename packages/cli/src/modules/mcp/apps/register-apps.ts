import { promises as fs } from 'fs';
import path from 'path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const SEARCH_WORKFLOWS_RESOURCE_URI = 'ui://n8n/search-workflows';

const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';

/**
 * Registers all MCP App resources with the server.
 * Each app has a corresponding `ui://` resource that serves bundled HTML.
 */
export async function registerMcpApps(server: McpServer): Promise<void> {
	registerSearchWorkflowsApp(server);
}

function registerSearchWorkflowsApp(server: McpServer): void {
	// Resolve the built HTML file.
	// At runtime __dirname is packages/cli/dist/modules/mcp/apps/
	// The built HTML is at packages/cli/dist/mcp-apps/search-workflows/index.html
	const distDir = path.resolve(__dirname, '..', '..', '..', 'mcp-apps');
	const htmlPath = path.join(distDir, 'search-workflows', 'index.html');

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
