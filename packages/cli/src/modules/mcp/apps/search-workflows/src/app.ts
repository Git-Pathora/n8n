import {
	App,
	applyDocumentTheme,
	applyHostStyleVariables,
	applyHostFonts,
} from '@modelcontextprotocol/ext-apps';

import { renderWorkflowCards, renderLoading } from './render';
import './styles.css';

const app = new App({ name: 'n8n Search Workflows', version: '1.0.0' });

renderLoading();

app.ontoolresult = (result) => {
	const data = result.structuredContent as {
		data: Array<{
			id: string;
			name: string | null;
			description?: string | null;
			active: boolean | null;
			createdAt: string | null;
			updatedAt: string | null;
			triggerCount: number | null;
			nodes: Array<{ name: string; type: string }>;
			scopes: string[];
			canExecute: boolean;
		}>;
		count: number;
	};

	if (data) {
		renderWorkflowCards(data, app);
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
