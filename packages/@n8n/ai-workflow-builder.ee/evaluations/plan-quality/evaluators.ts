/**
 * Plan Quality Experiment - Evaluators
 *
 * All metric evaluation functions for plan quality assessment.
 * Each evaluator takes the raw target output and returns a metric value.
 */
import type { BaseMessage } from '@langchain/core/messages';
import { isAIMessage } from '@langchain/core/messages';

import type { PlanOutput } from '../../src/types/planning.js';

// ---------------------------------------------------------------------------
// Blocklists
// ---------------------------------------------------------------------------

const CREDENTIAL_NOISE = [
	'api key',
	'api-key',
	'apikey',
	'credentials',
	'credential',
	'connect your',
	'authenticate',
	'sign up',
	'create an account',
	'make sure you have',
	"you'll need to connect",
	'you will need to connect',
	"you'll need access",
	'you will need access',
];

const PLACEHOLDER_PATTERNS = [
	'placeholder',
	'<__placeholder',
	'your_email',
	'your-api',
	'your_api',
	'example.com',
	'your-domain',
	'YOUR_',
	'your_password',
];

const INTERNAL_PATTERNS = ['n8n-nodes-base', '@n8n/'];

// ---------------------------------------------------------------------------
// Metric computation
// ---------------------------------------------------------------------------

export interface MetricsInput {
	plan: PlanOutput | null;
	messages: BaseMessage[];
	expectedTriggerKeywords: string[];
	expectedStepKeywords: string[];
	nodesFound: Array<{ nodeName: string }>;
	bestPractices: string | undefined;
}

export interface ComputedMetrics {
	// Booleans
	has_trigger: boolean;
	has_summary: boolean;
	steps_have_nodes: boolean;
	no_internal_names: boolean;
	no_placeholder_values: boolean;
	no_credential_notes: boolean;
	trigger_matches_intent: boolean;
	expected_steps_covered: boolean;
	// Numbers
	step_count: number;
	summary_length: number;
	notes_count: number;
	suggested_nodes_count: number;
	best_practices_fetched: number;
	nodes_found_count: number;
}

/**
 * Compute all quality metrics from the raw target output.
 */
export function computeMetrics(input: MetricsInput): ComputedMetrics {
	const { plan, messages, expectedTriggerKeywords, expectedStepKeywords } = input;

	return {
		// Booleans
		has_trigger: computeHasTrigger(plan),
		has_summary: computeHasSummary(plan),
		steps_have_nodes: computeStepsHaveNodes(plan),
		no_internal_names: computeNoInternalNames(plan),
		no_placeholder_values: computeNoPlaceholderValues(plan),
		no_credential_notes: computeNoCredentialNotes(plan),
		trigger_matches_intent: computeTriggerMatchesIntent(plan, expectedTriggerKeywords),
		expected_steps_covered: computeExpectedStepsCovered(plan, expectedStepKeywords),
		// Numbers
		step_count: plan?.steps.length ?? 0,
		summary_length: plan?.summary.length ?? 0,
		notes_count: (plan?.additionalSpecs ?? []).length,
		suggested_nodes_count: computeSuggestedNodesCount(plan),
		best_practices_fetched:
			countToolCalls(messages, 'get_documentation') || (input.bestPractices ? 1 : 0),
		nodes_found_count: input.nodesFound.length,
	};
}

// ---------------------------------------------------------------------------
// Individual metric functions
// ---------------------------------------------------------------------------

/**
 * plan.trigger is a non-empty string.
 */
function computeHasTrigger(plan: PlanOutput | null): boolean {
	return plan !== null && typeof plan.trigger === 'string' && plan.trigger.length > 0;
}

/**
 * plan.summary is a non-empty string.
 */
function computeHasSummary(plan: PlanOutput | null): boolean {
	return plan !== null && typeof plan.summary === 'string' && plan.summary.length > 0;
}

/**
 * At least one step has a non-empty suggestedNodes array.
 */
function computeStepsHaveNodes(plan: PlanOutput | null): boolean {
	if (!plan) return false;
	return plan.steps.some((step) => step.suggestedNodes && step.suggestedNodes.length > 0);
}

/**
 * No "n8n-nodes-base" or "@n8n/" in summary, trigger, step descriptions, subSteps, or notes.
 */
function computeNoInternalNames(plan: PlanOutput | null): boolean {
	if (!plan) return true;
	const textsToCheck = collectAllPlanText(plan);
	return !textsToCheck.some((text) =>
		INTERNAL_PATTERNS.some((pattern) => text.toLowerCase().includes(pattern.toLowerCase())),
	);
}

/**
 * No placeholder values in any plan text.
 */
function computeNoPlaceholderValues(plan: PlanOutput | null): boolean {
	if (!plan) return true;
	const textsToCheck = collectAllPlanText(plan);
	return !textsToCheck.some((text) =>
		PLACEHOLDER_PATTERNS.some((pattern) => text.toLowerCase().includes(pattern.toLowerCase())),
	);
}

/**
 * No notes containing credential noise terms.
 */
function computeNoCredentialNotes(plan: PlanOutput | null): boolean {
	if (!plan) return true;
	const notes = plan.additionalSpecs ?? [];
	return !notes.some((note) =>
		CREDENTIAL_NOISE.some((term) => note.toLowerCase().includes(term.toLowerCase())),
	);
}

/**
 * At least one expectedTriggerKeyword found in plan.trigger (case-insensitive).
 */
function computeTriggerMatchesIntent(
	plan: PlanOutput | null,
	expectedTriggerKeywords: string[],
): boolean {
	if (expectedTriggerKeywords.length === 0) return true;
	if (!plan || !plan.trigger) return false;
	const triggerLower = plan.trigger.toLowerCase();
	return expectedTriggerKeywords.some((kw) => triggerLower.includes(kw.toLowerCase()));
}

/**
 * At least 50% of expectedStepKeywords found across all step descriptions + subSteps (case-insensitive).
 */
function computeExpectedStepsCovered(
	plan: PlanOutput | null,
	expectedStepKeywords: string[],
): boolean {
	if (expectedStepKeywords.length === 0) return true;
	if (!plan) return false;

	const allStepText = plan.steps
		.flatMap((step) => [step.description, ...(step.subSteps ?? [])])
		.join(' ')
		.toLowerCase();

	const matchedCount = expectedStepKeywords.filter((kw) =>
		allStepText.includes(kw.toLowerCase()),
	).length;

	return matchedCount / expectedStepKeywords.length >= 0.5;
}

/**
 * Total count of all suggestedNodes across all steps.
 */
function computeSuggestedNodesCount(plan: PlanOutput | null): number {
	if (!plan) return 0;
	return plan.steps.reduce((total, step) => total + (step.suggestedNodes?.length ?? 0), 0);
}

/**
 * Count AIMessages with tool_calls containing a specific tool name.
 */
function countToolCalls(messages: BaseMessage[], toolName: string): number {
	let count = 0;
	for (const msg of messages) {
		if (isAIMessage(msg) && msg.tool_calls) {
			for (const tc of msg.tool_calls) {
				if (tc.name === toolName) {
					count++;
				}
			}
		}
	}
	return count;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collect all user-facing text from a plan for blocklist checking.
 */
function collectAllPlanText(plan: PlanOutput): string[] {
	const texts: string[] = [plan.summary, plan.trigger];

	for (const step of plan.steps) {
		texts.push(step.description);
		if (step.subSteps) {
			texts.push(...step.subSteps);
		}
	}

	if (plan.additionalSpecs) {
		texts.push(...plan.additionalSpecs);
	}

	return texts;
}

// ---------------------------------------------------------------------------
// Convert metrics to LangSmith feedback format
// ---------------------------------------------------------------------------

export interface FeedbackEntry {
	key: string;
	score: number;
	comment?: string;
}

/**
 * Convert ComputedMetrics to an array of LangSmith feedback entries.
 * Booleans become 0/1, numbers pass through as-is.
 */
export function metricsToFeedback(metrics: ComputedMetrics): FeedbackEntry[] {
	return Object.entries(metrics).map(([key, value]) => ({
		key,
		score: typeof value === 'boolean' ? (value ? 1 : 0) : value,
	}));
}
