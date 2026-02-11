import {
	App,
	applyDocumentTheme,
	applyHostStyleVariables,
	applyHostFonts,
} from '@modelcontextprotocol/ext-apps';

import { renderLoading, renderExecutionResult, renderInputForm } from './render';
import type { ExecutionResult, WorkflowDetails } from './render';
import './styles.css';

const app = new App({ name: 'n8n Execute Workflow', version: '1.0.0' });

renderLoading();

let currentWorkflowId: string | null = null;

function isExecutionResult(data: unknown): data is ExecutionResult {
	return (
		typeof data === 'object' &&
		data !== null &&
		'success' in data &&
		typeof (data as Record<string, unknown>).success === 'boolean'
	);
}

function isWorkflowDetails(data: unknown): data is WorkflowDetails {
	return typeof data === 'object' && data !== null && 'workflow' in data && 'triggerInfo' in data;
}

app.ontoolresult = (result) => {
	const data = result.structuredContent;

	if (isWorkflowDetails(data)) {
		renderInputForm(data, currentWorkflowId, app);
	} else if (isExecutionResult(data)) {
		currentWorkflowId = data.workflowId ?? null;
		renderExecutionResult(data);

		// Load workflow details to render the input form
		if (currentWorkflowId) {
			app
				.callServerTool({
					name: 'get_workflow_details',
					arguments: { workflowId: currentWorkflowId },
				})
				.catch((err: unknown) => {
					console.error('Failed to load workflow details:', err);
				});
		}
	}
};

function applyHostContext(ctx: {
	theme?: string;
	styles?: { variables?: Record<string, string | undefined>; css?: { fonts?: string } };
}) {
	if (ctx.theme) {
		applyDocumentTheme(ctx.theme as 'light' | 'dark');
	}
	if (ctx.styles?.variables) {
		applyHostStyleVariables(ctx.styles.variables as Parameters<typeof applyHostStyleVariables>[0]);
	}
	if (ctx.styles?.css?.fonts) {
		applyHostFonts(ctx.styles.css.fonts);
	}
}

app.onhostcontextchanged = (ctx) => {
	applyHostContext(ctx);
};

app.onerror = console.error;

app.connect().then(() => {
	const ctx = app.getHostContext();
	if (ctx) {
		applyHostContext(ctx);
	}
});
