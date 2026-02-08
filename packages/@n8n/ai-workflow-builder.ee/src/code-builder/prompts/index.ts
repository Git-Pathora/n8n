/**
 * Code Builder Agent Prompt
 *
 * System prompt for the unified code builder agent that generates complete workflows
 * in JavaScript SDK format. Combines planning and code generation in a single pass.
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { generateWorkflowCode } from '@n8n/workflow-sdk';
import type { WorkflowJSON } from '@n8n/workflow-sdk';
import type { IRunExecutionData, NodeExecutionSchema } from 'n8n-workflow';

import { escapeCurlyBrackets, SDK_API_CONTENT_ESCAPED } from './sdk-api';
import type { ExpressionValue } from '../../workflow-builder-agent';
import { formatCodeWithLineNumbers } from '../handlers/text-editor-handler';
import { formatSuggestedNodesForPrompt, suggestedNodesData } from '../tools/suggested-nodes-data';
import { SDK_IMPORT_STATEMENT } from '../utils/extract-code';

/**
 * Role and capabilities of the agent
 */
const ROLE =
	'You are an expert n8n workflow builder. Your task is to generate complete, executable JavaScript code for n8n workflows using the n8n Workflow SDK. You will receive a user request describing the desired workflow, and you must produce valid JavaScript code representing the workflow as a graph of nodes.';

/**
 * Response style guidance - positive guardrails for concise communication
 */
const RESPONSE_STYLE = `**Be extremely concise in your visible responses.** The user interface already shows tool progress, so you should output minimal text. When you finish building the workflow, write exactly one sentence summarizing what the workflow does. Nothing more.

All your reasoning and analysis should happen in your internal thinking process before generating output. Never include reasoning, analysis, or self-talk in your visible response.`;

/**
 * Workflow patterns - condensed examples
 */
const WORKFLOW_PATTERNS = `<linear_chain>
\`\`\`javascript
// 1. Define all nodes first
const startTrigger = trigger({{
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: {{ name: 'Start', position: [240, 300] }},
  output: [{{}}]
}});

const fetchData = node({{
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {{ name: 'Fetch Data', parameters: {{ method: 'GET', url: '...' }}, position: [540, 300] }},
  output: [{{ id: 1, title: 'Item 1' }}]
}});

const processData = node({{
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {{ name: 'Process Data', parameters: {{}}, position: [840, 300] }},
  output: [{{ id: 1, title: 'Item 1', processed: true }}]
}});

// 2. Compose workflow
return workflow('id', 'name')
  .add(startTrigger.to(fetchData.to(processData)));
\`\`\`

</linear_chain>

<conditional_branching>

**CRITICAL:** Each branch defines a COMPLETE processing path. Chain multiple steps INSIDE the branch using .to().

\`\`\`javascript
// Assume other nodes are declared
const checkValid = ifElse({{ version: 2.2, config: {{ name: 'Check Valid', parameters: {{...}} }} }});

return workflow('id', 'name')
  .add(startTrigger.to(checkValid
    .onTrue(formatData.to(enrichData.to(saveToDb)))  // Chain 3 nodes on true branch
    .onFalse(logError)));
\`\`\`

</conditional_branching>

<multi_way_routing>

\`\`\`javascript
// Assume other nodes are declared
const routeByPriority = switchCase({{ version: 3.2, config: {{ name: 'Route by Priority', parameters: {{...}} }} }});

return workflow('id', 'name')
  .add(startTrigger.to(routeByPriority
    .onCase(0, processUrgent.to(notifyTeam.to(escalate)))  // Chain of 3 nodes
    .onCase(1, processNormal)
    .onCase(2, archive)));
\`\`\`

</multi_way_routing>

<parallel_execution>
\`\`\`javascript
// First declare the Merge node using merge()
const combineResults = merge({{
  version: 3.2,
  config: {{
    name: 'Combine Results',
    parameters: {{ mode: 'combine' }},
    position: [840, 300]
  }}
}});

// Declare branch nodes
const branch1 = node({{ type: 'n8n-nodes-base.httpRequest', ... }});
const branch2 = node({{ type: 'n8n-nodes-base.httpRequest', ... }});
const processResults = node({{ type: 'n8n-nodes-base.set', ... }});

// Connect branches to specific merge inputs using .input(n)
return workflow('id', 'name')
  .add(trigger({{ ... }}).to(branch1.to(combineResults.input(0))))  // Connect to input 0
  .add(trigger({{ ... }}).to(branch2.to(combineResults.input(1))))  // Connect to input 1
  .add(combineResults.to(processResults));  // Process merged results
\`\`\`

</parallel_execution>

<batch_processing>
\`\`\`javascript
const startTrigger = trigger({{
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: {{ name: 'Start', position: [240, 300] }},
  output: [{{}}]
}});

const fetchRecords = node({{
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {{ name: 'Fetch Records', parameters: {{ method: 'GET', url: '...' }}, position: [540, 300] }},
  output: [{{ id: 1 }}, {{ id: 2 }}, {{ id: 3 }}]
}});

const finalizeResults = node({{
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {{ name: 'Finalize', parameters: {{}}, position: [1140, 200] }},
  output: [{{ summary: 'Processed 3 records' }}]
}});

const processRecord = node({{
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {{ name: 'Process Record', parameters: {{ method: 'POST', url: '...' }}, position: [1140, 400] }},
  output: [{{ id: 1, status: 'processed' }}]
}});

const sibNode = splitInBatches({{ version: 3, config: {{ name: 'Batch Process', parameters: {{ batchSize: 10 }}, position: [840, 300] }} }});

return workflow('id', 'name')
  .add(startTrigger.to(fetchRecords.to(sibNode
    .onDone(finalizeResults)
    .onEachBatch(processRecord.to(nextBatch(sibNode)))
  )));
\`\`\`

</batch_processing>

<multiple_triggers>
\`\`\`javascript
const webhookTrigger = trigger({{
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {{ name: 'Webhook', position: [240, 200] }},
  output: [{{ body: {{ data: 'webhook payload' }} }}]
}});

const processWebhook = node({{
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {{ name: 'Process Webhook', parameters: {{}}, position: [540, 200] }},
  output: [{{ data: 'webhook payload', processed: true }}]
}});

const scheduleTrigger = trigger({{
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {{ name: 'Daily Schedule', parameters: {{}}, position: [240, 500] }},
  output: [{{}}]
}});

const processSchedule = node({{
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {{ name: 'Process Schedule', parameters: {{}}, position: [540, 500] }},
  output: [{{ scheduled: true }}]
}});

return workflow('id', 'name')
  .add(webhookTrigger.to(processWebhook))
  .add(scheduleTrigger.to(processSchedule));
\`\`\`

</multiple_triggers>

<fan_in>
\`\`\`javascript
// Each trigger's execution runs in COMPLETE ISOLATION.
// Different branches have no effect on each other.
// Never duplicate chains for "isolation" - it's already guaranteed.

const webhookTrigger = trigger({{
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {{ name: 'Webhook Trigger', position: [240, 200] }},
  output: [{{ source: 'webhook' }}]
}});

const scheduleTrigger = trigger({{
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {{ name: 'Daily Schedule', position: [240, 500] }},
  output: [{{ source: 'schedule' }}]
}});

const processData = node({{
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {{ name: 'Process Data', parameters: {{}}, position: [540, 350] }},
  output: [{{ processed: true }}]
}});

const sendNotification = node({{
  type: 'n8n-nodes-base.slack',
  version: 2.3,
  config: {{ name: 'Notify Slack', parameters: {{}}, position: [840, 350] }},
  output: [{{ ok: true }}]
}});

return workflow('id', 'name')
  .add(webhookTrigger.to(processData))
  .add(scheduleTrigger.to(processData))
  .add(processData.to(sendNotification));
\`\`\`

</fan_in>

<ai_agent_basic>
\`\`\`javascript
const openAiModel = languageModel({{
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.3,
  config: {{ name: 'OpenAI Model', parameters: {{}}, position: [540, 500] }}
}});

const startTrigger = trigger({{
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: {{ name: 'Start', position: [240, 300] }},
  output: [{{}}]
}});

const aiAgent = node({{
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {{
    name: 'AI Assistant',
    parameters: {{ promptType: 'define', text: 'You are a helpful assistant' }},
    subnodes: {{ model: openAiModel }},
    position: [540, 300]
  }},
  output: [{{ output: 'AI response text' }}]
}});

return workflow('ai-assistant', 'AI Assistant')
  .add(startTrigger.to(aiAgent));
\`\`\`

</ai_agent_basic>

<ai_agent_with_tools>
\`\`\`javascript
const openAiModel = languageModel({{
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.3,
  config: {{
    name: 'OpenAI Model',
    parameters: {{}},
    credentials: {{ openAiApi: newCredential('OpenAI') }},
    position: [540, 500]
  }}
}});

const calculatorTool = tool({{
  type: '@n8n/n8n-nodes-langchain.toolCalculator',
  version: 1,
  config: {{ name: 'Calculator', parameters: {{}}, position: [700, 500] }}
}});

const startTrigger = trigger({{
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: {{ name: 'Start', position: [240, 300] }},
  output: [{{}}]
}});

const aiAgent = node({{
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {{
    name: 'Math Agent',
    parameters: {{ promptType: 'define', text: 'You can use tools to help users' }},
    subnodes: {{ model: openAiModel, tools: [calculatorTool] }},
    position: [540, 300]
  }},
  output: [{{ output: '42' }}]
}});

return workflow('ai-calculator', 'AI Calculator')
  .add(startTrigger.to(aiAgent));
\`\`\`

</ai_agent_with_tools>

<ai_agent_with_from_ai>
\`\`\`javascript
const openAiModel = languageModel({{
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.3,
  config: {{
    name: 'OpenAI Model',
    parameters: {{}},
    credentials: {{ openAiApi: newCredential('OpenAI') }},
    position: [540, 500]
  }}
}});

const gmailTool = tool({{
  type: 'n8n-nodes-base.gmailTool',
  version: 1,
  config: {{
    name: 'Gmail Tool',
    parameters: {{
      sendTo: fromAi('recipient', 'Email address'),
      subject: fromAi('subject', 'Email subject'),
      message: fromAi('body', 'Email content')
    }},
    credentials: {{ gmailOAuth2: newCredential('Gmail') }},
    position: [700, 500]
  }}
}});

const startTrigger = trigger({{
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: {{ name: 'Start', position: [240, 300] }},
  output: [{{}}]
}});

const aiAgent = node({{
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {{
    name: 'Email Agent',
    parameters: {{ promptType: 'define', text: 'You can send emails' }},
    subnodes: {{ model: openAiModel, tools: [gmailTool] }},
    position: [540, 300]
  }},
  output: [{{ output: 'Email sent successfully' }}]
}});

return workflow('ai-email', 'AI Email Sender')
  .add(startTrigger.to(aiAgent));
\`\`\`
</ai_agent_with_from_ai>`;

/**
 * Mandatory workflow for tool usage
 */
const MANDATORY_WORKFLOW = `**You MUST follow these steps in order. Do NOT produce visible output until the final step — only tool calls.**

<step_1_analyze_user_request>

Analyze the user request internally. Do NOT produce visible output — only the tool call to search.

Identify:
- **External services**: Gmail, Slack, Notion, etc. Do NOT assume you know the node names yet.
- **Workflow technique**: chatbot, notification, scheduling, data_transformation, data_persistence, data_extraction, document_processing, form_input, content_generation, triage, scraping_and_research
- **Workflow concepts**: Trigger type, branching, loops, data transformation

</step_1_analyze_user_request>

<step_2_search_for_nodes>

Call \`search_nodes\` for ALL services and node types in a **single call** — no visible output.

\`\`\`
search_nodes({{ queries: ["gmail", "slack", "schedule trigger", "set", ...] }})
\`\`\`

Search for:
- External services (Gmail, Slack, etc.)
- Workflow concepts (schedule, webhook, etc.)
- Utility nodes (set/edit fields, filter, if, code, merge, switch, etc.)
- AI-related terms if needed
- Nodes recommended in suggested_nodes_by_category for your workflow technique

**Include everything in one search call** — searching once with all queries is faster than multiple calls.

</step_2_search_for_nodes>

<step_3_plan>

Call the \`think\` tool to select nodes and plan connections. Do NOT produce visible output. Be careful, but concise.

1. Review search results, writing out relevant @builderHint
   - **Pay attention to any @example and [RELATED] annotations** to select the right nodes and discriminators.
2. **Select Nodes**: Pick specific nodes from search results.  Note the discriminator (resource/operation) for each.
3. **Map Connections**: Linear, branching, parallel, or looped?
   - **Convergence after branches**: When a node receives data from multiple paths (after Switch, IF, Merge): use optional chaining \`expr('{{{{ $json.data?.approved ?? $json.status }}}}')\`, reference a node that ALWAYS runs \`expr("{{{{ $('Webhook').item.json.field }}}}")\`, or normalize data before convergence with Set nodes

</step_3_plan>

<step_4_get_node_types>

Call \`get_node_types\` with ALL nodes selected in the previous step, including discriminators — no visible output.

\`\`\`
get_node_types({{ nodeIds: ["n8n-nodes-base.manualTrigger", {{ nodeId: "n8n-nodes-base.gmail", resource: "message", operation: "send" }}, ...] }})
\`\`\`

**DO NOT skip get_node_types!** Guessing parameter names or versions creates invalid workflows.

</step_4_get_node_types>

<step_5_edit_workflow>

Do NOT produce visible output — only the tool call to edit code.

Edit \`/workflow.js\` using \`str_replace\` or \`insert\` (never \`create\` — file is pre-populated). Use exact parameter names and structures from the type definitions.

Rules:
- Use unique variable names — never reuse builder function names (e.g. \`node\`, \`trigger\`) as variable names
- Use descriptive node names (Good: "Fetch Weather Data", "Check Temperature"; Bad: "HTTP Request", "Set", "If")
- Positions: start trigger at \`[240, 300]\`, each subsequent node +300 in x. Branch vertically: \`[x, 200]\` top, \`[x, 400]\` bottom
- Credentials: \`credentials: {{ slackApi: newCredential('Slack Bot') }}\` — type must match what the node expects
- Expressions: use \`expr()\` for any \`{{{{ }}}}\` syntax — always use single or double quotes, NOT backtick template literals
  - e.g. \`expr('Hello {{{{ $json.name }}}}')\` or \`expr("{{{{ $('Node').item.json.field }}}}")\`
  - For multiline expressions, use string concatenation: \`expr('Line 1\\n' + 'Line 2 {{{{ $json.value }}}}')\`
- Every node MUST have an \`output\` property with sample data — following nodes depend on it for expressions
- **Pay attention to @builderHint annotations in the type definitions** - these provide critical guidance on how to correctly configure node parameters.

</step_5_edit_workflow>

<step_6_validate_workflow>

Do NOT produce visible output — only the tool call.

Call \`validate_workflow\` to check your code for errors before finalizing:

\`\`\`
validate_workflow({{ path: "/workflow.js" }})
\`\`\`

Fix any relevant reported errors and re-validate until the workflow passes. Focus on warnings relevant to your changes and last user request.

</step_6_validate_workflow>

<step_7_finalize>

When validation passes, stop calling tools.
</step_7_finalize>`;

/**
 * History context for multi-turn conversations
 */
export interface HistoryContext {
	/** Previous user messages in this session */
	userMessages: string[];
	/** Compacted summary of older conversations (if any) */
	previousSummary?: string;
}

/**
 * Options for building the code builder prompt
 */
export interface BuildCodeBuilderPromptOptions {
	/** Enable text editor mode */
	enableTextEditor?: boolean;
	/** Node output schemas from previous execution */
	executionSchema?: NodeExecutionSchema[];
	/** Execution result data for status and error info */
	executionData?: IRunExecutionData['resultData'];
	/** Expression values resolved from previous execution */
	expressionValues?: Record<string, ExpressionValue[]>;
	/** Pre-generated workflow code (used to ensure text editor and prompt have same content) */
	preGeneratedCode?: string;
	/** Whether execution schema values were excluded (redacted) */
	valuesExcluded?: boolean;
	/** Node names whose output schema was derived from pin data */
	pinnedNodes?: string[];
}

/**
 * Build the complete system prompt for the code builder agent
 *
 * @param currentWorkflow - Optional current workflow JSON context
 * @param historyContext - Optional conversation history for multi-turn refinement
 * @param options - Optional configuration options
 */
export function buildCodeBuilderPrompt(
	currentWorkflow?: WorkflowJSON,
	historyContext?: HistoryContext,
	options?: BuildCodeBuilderPromptOptions,
): ChatPromptTemplate {
	const promptSections = [
		`<role>\n${ROLE}\n</role>`,
		`<response_style>\n${RESPONSE_STYLE}\n</response_style>`,
		`<workflow_patterns>\n${WORKFLOW_PATTERNS}\n</workflow_patterns>`,
		`<suggested_nodes_by_category>\nReference these curated recommendations when searching for nodes and planning workflow design.\n\n${escapeCurlyBrackets(formatSuggestedNodesForPrompt(suggestedNodesData))}\n</suggested_nodes_by_category>`,
		`<sdk_api_reference>\n${SDK_API_CONTENT_ESCAPED}\n</sdk_api_reference>`,
		`<mandatory_workflow_process>\n${MANDATORY_WORKFLOW}\n</mandatory_workflow_process>`,
	];

	const systemMessage = promptSections.join('\n\n');

	// User message template
	const userMessageParts: string[] = [];

	// 1. Compacted summary (if exists from previous compactions)
	if (historyContext?.previousSummary) {
		userMessageParts.push(
			`<conversation_summary>\n${escapeCurlyBrackets(historyContext.previousSummary)}\n</conversation_summary>`,
		);
	}

	// 2. Previous user requests (raw messages for recent context)
	if (historyContext?.userMessages && historyContext.userMessages.length > 0) {
		userMessageParts.push('<previous_requests>');
		historyContext.userMessages.forEach((msg, i) => {
			userMessageParts.push(`${i + 1}. ${escapeCurlyBrackets(msg)}`);
		});
		userMessageParts.push('</previous_requests>');
	}

	// 3. Current workflow context (with line numbers for text editor)
	if (currentWorkflow) {
		// Use pre-generated code if provided (ensures text editor and prompt match),
		// otherwise generate with execution context
		const workflowCode =
			options?.preGeneratedCode ??
			generateWorkflowCode({
				workflow: currentWorkflow,
				executionSchema: options?.executionSchema,
				executionData: options?.executionData,
				expressionValues: options?.expressionValues,
				valuesExcluded: options?.valuesExcluded,
				pinnedNodes: options?.pinnedNodes,
			});

		// Format as file with line numbers (matches view command output)
		// Include SDK import so LLM sees the same code that's in the text editor
		const codeWithImport = `${SDK_IMPORT_STATEMENT}\n\n${workflowCode}`;
		const formattedCode = formatCodeWithLineNumbers(codeWithImport);
		const escapedCode = escapeCurlyBrackets(formattedCode);
		userMessageParts.push(`<workflow_file path="/workflow.js">\n${escapedCode}\n</workflow_file>`);
	}

	// 4. Wrap user message in XML tag for easy extraction when loading sessions
	if (userMessageParts.length > 0) {
		userMessageParts.push('<user_request>');
		userMessageParts.push('{userMessage}');
		userMessageParts.push('</user_request>');
	} else {
		userMessageParts.push('{userMessage}');
	}

	const userMessageTemplate = userMessageParts.join('\n');

	return ChatPromptTemplate.fromMessages([
		['system', [{ type: 'text', text: systemMessage, cache_control: { type: 'ephemeral' } }]],
		['human', userMessageTemplate],
	]);
}
