#!/usr/bin/env tsx

/**
 * Print Code Builder Agent Prompt
 *
 * Outputs the full system prompt for the code builder agent to a markdown file.
 * Run with: pnpm print:prompt
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

import { buildCodeBuilderPrompt } from '../src/code-builder/prompts';

/**
 * Unescape curly brackets from LangChain template format
 */
function unescapeCurlyBrackets(text: string): string {
	return text.replace(/\{\{/g, '{').replace(/\}\}/g, '}');
}

const prompt = buildCodeBuilderPrompt();
const messages = prompt.promptMessages;

let output = '# Code Builder Agent Prompt\n\n';

// Extract system message (ROLE)
const systemMessage = messages[0];
const systemTemplate =
	'lc_kwargs' in systemMessage
		? (systemMessage.lc_kwargs as { prompt?: { template?: string } }).prompt?.template
		: '';

if (systemTemplate) {
	output += '# ROLE\n\n';
	output += unescapeCurlyBrackets(systemTemplate);
	output += '\n\n';
}

// Hardcoded MESSAGE section format
output += `## MESSAGE

<conversation_summary>{{conversationSummary}}</conversation_summary>
<previous_requests>{{previous_requests}}</previous_requests>
<workflow_file path="/workflow.ts">
{{escapedCode}}
</workflow_file>

User request:
{{userMessage}}
`;

const outputPath = join(__dirname, 'code-builder-prompt.md');
writeFileSync(outputPath, output);

console.log(`Prompt written to: ${outputPath}`);
