import type { App } from '@modelcontextprotocol/ext-apps';

// Types

export interface ExecutionResult {
	success: boolean;
	executionId: string | null;
	workflowId?: string;
	workflowName?: string | null;
	result?: unknown;
	error?: unknown;
}

interface WorkflowNode {
	name: string;
	type: string;
	parameters?: Record<string, unknown>;
	disabled?: boolean;
}

export interface WorkflowDetails {
	workflow: {
		id: string;
		name: string | null;
		nodes: WorkflowNode[];
		[key: string]: unknown;
	};
	triggerInfo: string;
}

interface FormField {
	fieldLabel: string;
	fieldType: string;
	requiredField?: boolean;
	placeholder?: string;
	fieldOptions?: { values: Array<{ option: string }> };
}

// Constants

const TRIGGER_TYPES = {
	SCHEDULE: 'n8n-nodes-base.scheduleTrigger',
	WEBHOOK: 'n8n-nodes-base.webhook',
	FORM: 'n8n-nodes-base.formTrigger',
	CHAT: '@n8n/n8n-nodes-langchain.chatTrigger',
} as const;

const TRIGGER_LABELS: Record<string, string> = {
	[TRIGGER_TYPES.SCHEDULE]: 'Schedule',
	[TRIGGER_TYPES.WEBHOOK]: 'Webhook',
	[TRIGGER_TYPES.FORM]: 'Form',
	[TRIGGER_TYPES.CHAT]: 'Chat',
};

const SUPPORTED_TRIGGER_TYPES = new Set<string>(Object.values(TRIGGER_TYPES));

// Helpers

function findTriggerNode(nodes: WorkflowNode[]): WorkflowNode | null {
	return (
		nodes.find((node) => SUPPORTED_TRIGGER_TYPES.has(node.type) && node.disabled !== true) ?? null
	);
}

function getFormFields(node: WorkflowNode): FormField[] {
	const formFields = node.parameters?.formFields;
	if (typeof formFields !== 'object' || formFields === null) return [];

	const values = (formFields as Record<string, unknown>).values;
	if (!Array.isArray(values)) return [];

	return values.filter(
		(v): v is FormField =>
			typeof v === 'object' && v !== null && typeof (v as FormField).fieldLabel === 'string',
	);
}

function mapFieldType(fieldType: string): string {
	switch (fieldType) {
		case 'number':
			return 'number';
		case 'email':
			return 'email';
		case 'password':
			return 'password';
		case 'date':
			return 'date';
		default:
			return 'text';
	}
}

function createFieldGroup(label: string, forId: string): HTMLElement {
	const group = document.createElement('div');
	group.className = 'form-group';

	const labelEl = document.createElement('label');
	labelEl.className = 'form-label';
	labelEl.htmlFor = forId;
	labelEl.textContent = label;
	group.appendChild(labelEl);

	return group;
}

function safeParseJson(value: string): Record<string, unknown> | undefined {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	try {
		return JSON.parse(trimmed) as Record<string, unknown>;
	} catch {
		return undefined;
	}
}

// Rendering

export function renderLoading(): void {
	const container = document.getElementById('app');
	if (!container) return;

	container.innerHTML = '';

	const loading = document.createElement('div');
	loading.className = 'loading-state';
	loading.textContent = 'Loading...';
	container.appendChild(loading);
}

export function renderExecutionResult(data: ExecutionResult): void {
	const container = document.getElementById('app');
	if (!container) return;

	container.innerHTML = '';

	const section = document.createElement('div');
	section.className = 'result-section';

	const status = document.createElement('div');
	status.className = `result-status ${data.success ? 'result-status--success' : 'result-status--error'}`;

	const dot = document.createElement('span');
	dot.className = 'status-dot';
	status.appendChild(dot);
	status.appendChild(
		document.createTextNode(data.success ? 'Execution succeeded' : 'Execution failed'),
	);
	section.appendChild(status);

	if (data.workflowName) {
		const name = document.createElement('div');
		name.className = 'result-detail';
		name.textContent = data.workflowName;
		section.appendChild(name);
	}

	if (data.executionId) {
		const execId = document.createElement('div');
		execId.className = 'result-detail result-detail--muted';
		execId.textContent = `Execution ID: ${data.executionId}`;
		section.appendChild(execId);
	}

	if (data.error) {
		const error = document.createElement('div');
		error.className = 'result-error';
		error.textContent =
			typeof data.error === 'string' ? data.error : JSON.stringify(data.error, null, 2);
		section.appendChild(error);
	}

	container.appendChild(section);

	// Placeholder for the input form that will load next
	const formLoading = document.createElement('div');
	formLoading.className = 'loading-state';
	formLoading.id = 'form-loading';
	formLoading.textContent = 'Loading workflow inputs...';
	container.appendChild(formLoading);
}

export function renderInputForm(
	details: WorkflowDetails,
	workflowId: string | null,
	app: App,
): void {
	const container = document.getElementById('app');
	if (!container) return;

	// Remove loading placeholder if present
	document.getElementById('form-loading')?.remove();

	// Remove any previous form
	container.querySelector('.input-form-section')?.remove();

	// If no result section, this is a fresh render
	if (!container.querySelector('.result-section')) {
		container.innerHTML = '';
	}

	const wfId = workflowId ?? details.workflow.id;
	const triggerNode = findTriggerNode(details.workflow.nodes);

	const section = document.createElement('div');
	section.className = 'input-form-section';

	// Header
	const header = document.createElement('div');
	header.className = 'form-header';

	const title = document.createElement('h3');
	title.className = 'form-title';
	title.textContent = details.workflow.name ?? 'Execute Workflow';
	header.appendChild(title);

	if (triggerNode) {
		const badge = document.createElement('span');
		badge.className = 'trigger-badge';
		badge.textContent = TRIGGER_LABELS[triggerNode.type] ?? 'Trigger';
		header.appendChild(badge);
	}

	section.appendChild(header);

	if (!triggerNode) {
		const notice = document.createElement('div');
		notice.className = 'form-notice';
		notice.textContent = 'This workflow does not have a supported trigger node.';
		section.appendChild(notice);
		container.appendChild(section);
		return;
	}

	// Input fields
	const formBody = document.createElement('div');
	formBody.className = 'form-body';
	formBody.id = 'input-form-body';

	switch (triggerNode.type) {
		case TRIGGER_TYPES.CHAT:
			renderChatInputs(formBody);
			break;
		case TRIGGER_TYPES.FORM:
			renderFormInputs(formBody, triggerNode);
			break;
		case TRIGGER_TYPES.WEBHOOK:
			renderWebhookInputs(formBody);
			break;
		case TRIGGER_TYPES.SCHEDULE:
			renderScheduleInputs(formBody);
			break;
	}

	section.appendChild(formBody);

	// Execute button
	const actions = document.createElement('div');
	actions.className = 'form-actions';

	const executeBtn = document.createElement('button');
	executeBtn.className = 'execute-button';
	executeBtn.textContent = 'Execute Workflow';
	executeBtn.addEventListener('click', () => {
		void handleExecute(executeBtn, triggerNode.type, wfId, app);
	});

	actions.appendChild(executeBtn);
	section.appendChild(actions);

	container.appendChild(section);
}

async function handleExecute(
	button: HTMLButtonElement,
	triggerType: string,
	workflowId: string,
	app: App,
): Promise<void> {
	button.disabled = true;
	button.textContent = 'Executing...';

	try {
		const inputs = collectInputs(triggerType);
		await app.callServerTool({
			name: 'execute_workflow',
			arguments: { workflowId, ...inputs },
		});
	} catch (err) {
		console.error('Failed to execute workflow:', err);
	} finally {
		button.disabled = false;
		button.textContent = 'Execute Workflow';
	}
}

// Trigger-specific input renderers

function renderChatInputs(container: HTMLElement): void {
	const group = createFieldGroup('Message', 'chat-input');

	const textarea = document.createElement('textarea');
	textarea.id = 'chat-input';
	textarea.className = 'form-textarea';
	textarea.placeholder = 'Enter your message...';
	textarea.rows = 4;
	group.appendChild(textarea);

	container.appendChild(group);
}

function renderFormInputs(container: HTMLElement, node: WorkflowNode): void {
	const fields = getFormFields(node);

	if (fields.length === 0) {
		const group = createFieldGroup('Form Data (JSON)', 'form-data-json');
		const textarea = document.createElement('textarea');
		textarea.id = 'form-data-json';
		textarea.className = 'form-textarea form-textarea--code';
		textarea.placeholder = '{ "field1": "value1" }';
		textarea.rows = 6;
		group.appendChild(textarea);
		container.appendChild(group);
		return;
	}

	for (const field of fields) {
		const fieldId = `form-field-${field.fieldLabel.replace(/\s+/g, '-').toLowerCase()}`;
		const group = createFieldGroup(field.fieldLabel + (field.requiredField ? ' *' : ''), fieldId);

		let input: HTMLElement;

		if (field.fieldType === 'textarea') {
			const textarea = document.createElement('textarea');
			textarea.id = fieldId;
			textarea.className = 'form-textarea';
			textarea.placeholder = field.placeholder ?? '';
			textarea.rows = 3;
			textarea.dataset.fieldLabel = field.fieldLabel;
			input = textarea;
		} else if (field.fieldType === 'dropdown' && field.fieldOptions?.values) {
			const select = document.createElement('select');
			select.id = fieldId;
			select.className = 'form-select';
			select.dataset.fieldLabel = field.fieldLabel;

			const emptyOption = document.createElement('option');
			emptyOption.value = '';
			emptyOption.textContent = 'Select...';
			select.appendChild(emptyOption);

			for (const opt of field.fieldOptions.values) {
				const option = document.createElement('option');
				option.value = opt.option;
				option.textContent = opt.option;
				select.appendChild(option);
			}
			input = select;
		} else {
			const textInput = document.createElement('input');
			textInput.id = fieldId;
			textInput.className = 'form-input';
			textInput.type = mapFieldType(field.fieldType);
			textInput.placeholder = field.placeholder ?? '';
			textInput.dataset.fieldLabel = field.fieldLabel;
			input = textInput;
		}

		group.appendChild(input);
		container.appendChild(group);
	}
}

function renderWebhookInputs(container: HTMLElement): void {
	// Method
	const methodGroup = createFieldGroup('HTTP Method', 'webhook-method');
	const methodSelect = document.createElement('select');
	methodSelect.id = 'webhook-method';
	methodSelect.className = 'form-select';

	for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
		const option = document.createElement('option');
		option.value = method;
		option.textContent = method;
		methodSelect.appendChild(option);
	}

	methodGroup.appendChild(methodSelect);
	container.appendChild(methodGroup);

	// Body
	const bodyGroup = createFieldGroup('Body (JSON)', 'webhook-body');
	const bodyTextarea = document.createElement('textarea');
	bodyTextarea.id = 'webhook-body';
	bodyTextarea.className = 'form-textarea form-textarea--code';
	bodyTextarea.placeholder = '{}';
	bodyTextarea.rows = 6;
	bodyGroup.appendChild(bodyTextarea);
	container.appendChild(bodyGroup);

	// Query
	const queryGroup = createFieldGroup('Query Parameters (JSON)', 'webhook-query');
	const queryTextarea = document.createElement('textarea');
	queryTextarea.id = 'webhook-query';
	queryTextarea.className = 'form-textarea form-textarea--code';
	queryTextarea.placeholder = '{}';
	queryTextarea.rows = 3;
	queryGroup.appendChild(queryTextarea);
	container.appendChild(queryGroup);

	// Headers
	const headersGroup = createFieldGroup('Headers (JSON)', 'webhook-headers');
	const headersTextarea = document.createElement('textarea');
	headersTextarea.id = 'webhook-headers';
	headersTextarea.className = 'form-textarea form-textarea--code';
	headersTextarea.placeholder = '{}';
	headersTextarea.rows = 3;
	headersGroup.appendChild(headersTextarea);
	container.appendChild(headersGroup);
}

function renderScheduleInputs(container: HTMLElement): void {
	const notice = document.createElement('div');
	notice.className = 'form-notice';
	notice.textContent =
		'This workflow runs on a schedule and does not require any inputs. Click Execute to run it now.';
	container.appendChild(notice);
}

// Input collection

function collectInputs(triggerType: string): { inputs?: Record<string, unknown> } {
	switch (triggerType) {
		case TRIGGER_TYPES.CHAT:
			return collectChatInputs();
		case TRIGGER_TYPES.FORM:
			return collectFormInputs();
		case TRIGGER_TYPES.WEBHOOK:
			return collectWebhookInputs();
		case TRIGGER_TYPES.SCHEDULE:
			return {};
		default:
			return {};
	}
}

function collectChatInputs(): { inputs?: Record<string, unknown> } {
	const textarea = document.getElementById('chat-input') as HTMLTextAreaElement | null;
	const chatInput = textarea?.value?.trim();
	if (!chatInput) return {};
	return { inputs: { type: 'chat', chatInput } };
}

function collectFormInputs(): { inputs?: Record<string, unknown> } {
	const formBody = document.getElementById('input-form-body');
	if (!formBody) return {};

	// JSON fallback textarea
	const jsonTextarea = document.getElementById('form-data-json') as HTMLTextAreaElement | null;
	if (jsonTextarea) {
		const formData = safeParseJson(jsonTextarea.value) ?? {};
		return { inputs: { type: 'form', formData } };
	}

	// Collect from individual fields
	const formData: Record<string, unknown> = {};
	const inputs = formBody.querySelectorAll('[data-field-label]');
	for (const input of inputs) {
		const label = (input as HTMLElement).dataset.fieldLabel;
		if (!label) continue;

		if (input instanceof HTMLInputElement) {
			formData[label] = input.type === 'number' ? Number(input.value) : input.value;
		} else if (input instanceof HTMLTextAreaElement) {
			formData[label] = input.value;
		} else if (input instanceof HTMLSelectElement) {
			formData[label] = input.value;
		}
	}

	return { inputs: { type: 'form', formData } };
}

function collectWebhookInputs(): { inputs?: Record<string, unknown> } {
	const method = (document.getElementById('webhook-method') as HTMLSelectElement | null)?.value;

	const webhookData: Record<string, unknown> = {};
	if (method) webhookData.method = method;

	const body = safeParseJson(
		(document.getElementById('webhook-body') as HTMLTextAreaElement | null)?.value ?? '',
	);
	if (body) webhookData.body = body;

	const query = safeParseJson(
		(document.getElementById('webhook-query') as HTMLTextAreaElement | null)?.value ?? '',
	);
	if (query) webhookData.query = query;

	const headers = safeParseJson(
		(document.getElementById('webhook-headers') as HTMLTextAreaElement | null)?.value ?? '',
	);
	if (headers) webhookData.headers = headers;

	return { inputs: { type: 'webhook', webhookData } };
}
