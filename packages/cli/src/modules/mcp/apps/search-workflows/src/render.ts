import type { App } from '@modelcontextprotocol/ext-apps';

interface WorkflowItem {
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
}

interface SearchWorkflowsData {
	data: WorkflowItem[];
	count: number;
}

function formatTimeAgo(dateStr: string): string {
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSeconds = Math.floor(diffMs / 1000);
	const diffMinutes = Math.floor(diffSeconds / 60);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffDays > 30) {
		const diffMonths = Math.floor(diffDays / 30);
		return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
	}
	if (diffDays > 0) {
		return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
	}
	if (diffHours > 0) {
		return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
	}
	if (diffMinutes > 0) {
		return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
	}
	return 'just now';
}

function formatCreatedDate(dateStr: string): string {
	const date = new Date(dateStr);
	const currentYear = new Date().getFullYear();
	const options: Intl.DateTimeFormatOptions = {
		day: 'numeric',
		month: 'long',
	};
	if (date.getFullYear() !== currentYear) {
		options.year = 'numeric';
	}
	return date.toLocaleDateString('en-US', options);
}

function createCard(workflow: WorkflowItem, app: App): HTMLElement {
	const card = document.createElement('div');
	card.className = 'workflow-card';

	// Header
	const header = document.createElement('div');
	header.className = 'workflow-card-header';

	const name = document.createElement('h3');
	name.className = 'workflow-card-name';
	name.textContent = workflow.name ?? 'Unnamed workflow';
	header.appendChild(name);

	if (workflow.active) {
		const badge = document.createElement('span');
		badge.className = 'workflow-card-badge workflow-card-badge--published';
		const dot = document.createElement('span');
		dot.className = 'badge-dot';
		badge.appendChild(dot);
		badge.appendChild(document.createTextNode('Published'));
		header.appendChild(badge);
	}

	card.appendChild(header);

	// Description row
	const description = document.createElement('div');
	description.className = 'workflow-card-description';

	if (workflow.updatedAt) {
		const updated = document.createElement('span');
		updated.textContent = `Updated ${formatTimeAgo(workflow.updatedAt)}`;
		description.appendChild(updated);
	}

	if (workflow.updatedAt && workflow.createdAt) {
		description.appendChild(document.createTextNode(' | '));
	}

	if (workflow.createdAt) {
		const created = document.createElement('span');
		created.textContent = `Created ${formatCreatedDate(workflow.createdAt)}`;
		description.appendChild(created);
	}

	card.appendChild(description);

	// Footer with chips
	const footer = document.createElement('div');
	footer.className = 'workflow-card-footer';

	if (workflow.triggerCount != null) {
		const triggerChip = document.createElement('span');
		triggerChip.className = 'workflow-card-chip';
		triggerChip.textContent = `${workflow.triggerCount} trigger${workflow.triggerCount !== 1 ? 's' : ''}`;
		footer.appendChild(triggerChip);
	}

	if (workflow.nodes.length > 0) {
		const nodeChip = document.createElement('span');
		nodeChip.className = 'workflow-card-chip';
		nodeChip.textContent = `${workflow.nodes.length} node${workflow.nodes.length !== 1 ? 's' : ''}`;
		footer.appendChild(nodeChip);
	}

	if (workflow.canExecute) {
		const execBadge = document.createElement('span');
		execBadge.className = 'workflow-card-badge workflow-card-badge--can-execute';
		execBadge.textContent = 'Can execute';
		footer.appendChild(execBadge);
	}

	card.appendChild(footer);

	// Click handler: call get_workflow_details
	card.addEventListener('click', async () => {
		try {
			await app.callServerTool({
				name: 'get_workflow_details',
				arguments: { workflowId: workflow.id },
			});
		} catch (err) {
			console.error('Failed to get workflow details:', err);
		}
	});

	return card;
}

export function renderWorkflowCards(data: SearchWorkflowsData, app: App): void {
	const container = document.getElementById('app');
	if (!container) return;

	container.innerHTML = '';

	if (data.data.length === 0) {
		const empty = document.createElement('div');
		empty.className = 'empty-state';

		const title = document.createElement('div');
		title.className = 'empty-state-title';
		title.textContent = 'No workflows found';
		empty.appendChild(title);

		const subtitle = document.createElement('div');
		subtitle.textContent = 'No workflows match your search criteria.';
		empty.appendChild(subtitle);

		container.appendChild(empty);
		return;
	}

	const list = document.createElement('div');
	list.className = 'workflow-list';

	// Header with count
	const header = document.createElement('div');
	header.className = 'workflow-list-header';

	const count = document.createElement('span');
	count.className = 'workflow-list-count';
	count.textContent = `Showing ${data.data.length} of ${data.count} workflow${data.count !== 1 ? 's' : ''}`;
	header.appendChild(count);

	list.appendChild(header);

	// Cards
	for (const workflow of data.data) {
		list.appendChild(createCard(workflow, app));
	}

	container.appendChild(list);
}

export function renderLoading(): void {
	const container = document.getElementById('app');
	if (!container) return;

	container.innerHTML = '';

	const loading = document.createElement('div');
	loading.className = 'loading-state';
	loading.textContent = 'Loading workflows...';
	container.appendChild(loading);
}
