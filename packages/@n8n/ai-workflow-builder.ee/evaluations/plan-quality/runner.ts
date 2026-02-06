/**
 * Plan Quality Experiment - Runner
 *
 * Main experiment runner using evaluate() from langsmith/evaluation.
 * Follows the harness pattern: target does ALL work, evaluator extracts pre-computed feedback.
 */
import type { BaseMessage } from '@langchain/core/messages';
import { Command, MemorySaver } from '@langchain/langgraph';
import { Client } from 'langsmith/client';
import { evaluate } from 'langsmith/evaluation';
import type { Run, Example } from 'langsmith/schemas';

import type { PlanOutput, PlannerQuestion, QuestionResponse } from '../../src/types/planning.js';
import { DiscoverySubgraph } from '../../src/subgraphs/discovery.subgraph.js';
import { setupLLM } from '../support/environment.js';
import { loadNodesFromFile } from '../support/load-nodes.js';

import { ALL_TEST_CASES, type PlanTestCase } from './dataset.js';
import {
	computeMetrics,
	metricsToFeedback,
	type ComputedMetrics,
	type FeedbackEntry,
} from './evaluators.js';

// ---------------------------------------------------------------------------
// Thread ID generation
// ---------------------------------------------------------------------------

let threadCounter = 0;
function nextThreadId(): string {
	return `pq-eval-${Date.now()}-${++threadCounter}`;
}

// ---------------------------------------------------------------------------
// Target output shape
// ---------------------------------------------------------------------------

export interface TargetOutput {
	prompt: string;
	plan: PlanOutput | null;
	questionsAsked: number;
	messages: BaseMessage[];
	metrics: ComputedMetrics;
}

// ---------------------------------------------------------------------------
// Auto-answer helper
// ---------------------------------------------------------------------------

function autoAnswerQuestions(questions: PlannerQuestion[]): QuestionResponse[] {
	return questions.map((q) => ({
		questionId: q.id,
		question: q.question,
		selectedOptions: q.options?.slice(0, 1) ?? [],
		customText: q.type === 'text' ? 'Use defaults' : '',
		skipped: false,
	}));
}

// ---------------------------------------------------------------------------
// Target function factory
// ---------------------------------------------------------------------------

interface TargetDeps {
	discoverySubgraph: DiscoverySubgraph;
	parsedNodeTypes: Awaited<ReturnType<typeof loadNodesFromFile>>;
	llm: Awaited<ReturnType<typeof setupLLM>>;
}

const MAX_RESUME_ATTEMPTS = 3;

function createTargetFunction(deps: TargetDeps) {
	const { discoverySubgraph, parsedNodeTypes, llm } = deps;

	return async (inputs: {
		prompt: string;
		expectedTriggerKeywords: string[];
		expectedStepKeywords: string[];
	}): Promise<TargetOutput> => {
		const { prompt, expectedTriggerKeywords, expectedStepKeywords } = inputs;

		// Create a fresh graph with its own checkpointer for each run
		const graph = discoverySubgraph.create({
			parsedNodeTypes,
			llm,
			plannerLLM: llm,
			featureFlags: { planMode: true },
			checkpointer: new MemorySaver(),
		});

		const threadId = nextThreadId();
		const config = { configurable: { thread_id: threadId } };
		const input = {
			userRequest: prompt,
			workflowJSON: { nodes: [], connections: {}, name: '' },
			mode: 'plan' as const,
			planOutput: null,
			planFeedback: null,
			planPrevious: null,
		};

		// Run the discovery subgraph
		await graph.invoke(input, config);

		let plan: PlanOutput | null = null;
		let questionsAsked = 0;

		// Loop: handle interrupts (questions or plan) with max resume attempts
		for (let attempt = 0; attempt < MAX_RESUME_ATTEMPTS; attempt++) {
			const state = await graph.getState(config);
			const interruptData = state.tasks?.[0]?.interrupts?.[0];
			const interruptValue = interruptData?.value as
				| { type: string; questions?: PlannerQuestion[]; plan?: PlanOutput }
				| undefined;

			if (!interruptValue) {
				// No interrupt -- graph completed without plan interrupt
				break;
			}

			if (interruptValue.type === 'plan') {
				// Got a plan -- extract and stop
				plan = interruptValue.plan ?? null;
				break;
			}

			if (interruptValue.type === 'questions') {
				// Got questions -- auto-answer and resume
				const questions = (interruptValue.questions ?? []) as PlannerQuestion[];
				questionsAsked += questions.length;
				const autoAnswers = autoAnswerQuestions(questions);
				await graph.invoke(new Command({ resume: autoAnswers }), config);
				// Continue loop to check for plan interrupt after resume
				continue;
			}

			// Unknown interrupt type -- break to avoid infinite loop
			break;
		}

		// Get final state for messages, nodesFound, and bestPractices
		const finalState = await graph.getState(config);
		const messages: BaseMessage[] = (finalState.values?.messages as BaseMessage[]) ?? [];
		const nodesFound = (finalState.values?.nodesFound as Array<{ nodeName: string }>) ?? [];
		const bestPractices = finalState.values?.bestPractices as string | undefined;

		// If we still don't have a plan, check one more time
		if (!plan) {
			const lastInterrupt = finalState.tasks?.[0]?.interrupts?.[0];
			const lastValue = lastInterrupt?.value as { type: string; plan?: PlanOutput } | undefined;
			if (lastValue?.type === 'plan') {
				plan = lastValue.plan ?? null;
			}
		}

		// Compute all metrics
		const metrics = computeMetrics({
			plan,
			messages,
			expectedTriggerKeywords,
			expectedStepKeywords,
			nodesFound,
			bestPractices,
		});

		return {
			prompt,
			plan,
			questionsAsked,
			messages,
			metrics,
		};
	};
}

// ---------------------------------------------------------------------------
// LangSmith feedback extractor
// ---------------------------------------------------------------------------

function createFeedbackExtractor(): (rootRun: Run, example?: Example) => Promise<FeedbackEntry[]> {
	return async (rootRun: Run, _example?: Example): Promise<FeedbackEntry[]> => {
		const outputs = rootRun.outputs;
		if (!outputs || typeof outputs !== 'object' || !('metrics' in outputs)) {
			return [{ key: 'evaluation_error', score: 0, comment: 'No metrics found in target output' }];
		}

		const metrics = outputs.metrics as ComputedMetrics;
		return metricsToFeedback(metrics);
	};
}

// ---------------------------------------------------------------------------
// Local run (console output, no LangSmith)
// ---------------------------------------------------------------------------

export interface LocalRunOptions {
	concurrency: number;
}

export async function runLocal(options: LocalRunOptions): Promise<void> {
	console.log('Setting up environment...');

	const parsedNodeTypes = loadNodesFromFile();
	const llm = await setupLLM();
	const discoverySubgraph = new DiscoverySubgraph();

	console.log(`Loaded ${parsedNodeTypes.length} node types`);

	const target = createTargetFunction({ discoverySubgraph, parsedNodeTypes, llm });

	console.log(
		`\nRunning ${ALL_TEST_CASES.length} test cases (concurrency: ${options.concurrency})...\n`,
	);
	console.log('-'.repeat(80));

	const results: Array<{ testCase: PlanTestCase; output: TargetOutput }> = [];

	// Run sequentially for local mode (simpler logging)
	for (const testCase of ALL_TEST_CASES) {
		console.log(`\nRunning: ${testCase.name}`);
		console.log(`  Prompt: "${testCase.prompt}"`);

		try {
			const output = await target({
				prompt: testCase.prompt,
				expectedTriggerKeywords: testCase.expectedTriggerKeywords,
				expectedStepKeywords: testCase.expectedStepKeywords,
			});

			results.push({ testCase, output });

			// Log result
			if (output.plan) {
				console.log(`  Plan generated: ${output.plan.steps.length} steps`);
				console.log(`  Trigger: "${output.plan.trigger}"`);
				console.log(`  Summary: "${output.plan.summary}"`);
				if (output.questionsAsked > 0) {
					console.log(`  Questions auto-answered: ${output.questionsAsked}`);
				}
			} else {
				console.log('  No plan generated');
			}

			// Log metrics
			const feedback = metricsToFeedback(output.metrics);
			const failedMetrics = feedback.filter(
				(f) =>
					f.score === 0 &&
					[
						'has_trigger',
						'has_summary',
						'steps_have_nodes',
						'no_internal_names',
						'no_placeholder_values',
						'no_credential_notes',
						'trigger_matches_intent',
						'expected_steps_covered',
					].includes(f.key),
			);
			if (failedMetrics.length > 0) {
				console.log(`  Failed metrics: ${failedMetrics.map((f) => f.key).join(', ')}`);
			} else {
				console.log('  All boolean metrics passed');
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.log(`  ERROR: ${message}`);
		}
	}

	// Print summary
	console.log('\n' + '='.repeat(80));
	console.log('SUMMARY\n');

	const successResults = results.filter((r) => r.output);
	if (successResults.length === 0) {
		console.log('No successful results.');
		return;
	}

	// Aggregate metrics
	const metricSums: Record<string, number> = {};
	const metricCounts: Record<string, number> = {};

	for (const { output } of successResults) {
		const feedback = metricsToFeedback(output.metrics);
		for (const f of feedback) {
			metricSums[f.key] = (metricSums[f.key] ?? 0) + f.score;
			metricCounts[f.key] = (metricCounts[f.key] ?? 0) + 1;
		}
	}

	const booleanMetrics = [
		'has_trigger',
		'has_summary',
		'steps_have_nodes',
		'no_internal_names',
		'no_placeholder_values',
		'no_credential_notes',
		'trigger_matches_intent',
		'expected_steps_covered',
	];

	console.log('Average scores:');
	for (const key of Object.keys(metricSums).sort()) {
		const avg = metricSums[key] / metricCounts[key];
		const isBoolean = booleanMetrics.includes(key);
		const display = isBoolean ? `${(avg * 100).toFixed(0)}%` : avg.toFixed(2);
		console.log(`  ${key}: ${display}`);
	}

	console.log(`\nTotal: ${successResults.length}/${ALL_TEST_CASES.length} completed`);
	console.log('='.repeat(80));
}

// ---------------------------------------------------------------------------
// LangSmith run
// ---------------------------------------------------------------------------

export interface LangSmithRunOptions {
	datasetName: string;
	experimentName: string;
	concurrency: number;
}

export async function runLangSmith(options: LangSmithRunOptions): Promise<void> {
	const { datasetName, experimentName, concurrency } = options;

	// Ensure tracing is enabled
	process.env.LANGSMITH_TRACING = 'true';

	const apiKey = process.env.LANGSMITH_API_KEY;
	if (!apiKey) {
		throw new Error('LANGSMITH_API_KEY environment variable is required');
	}

	console.log('Setting up environment...');

	const lsClient = new Client({ apiKey });
	const parsedNodeTypes = loadNodesFromFile();
	const llm = await setupLLM();
	const discoverySubgraph = new DiscoverySubgraph();

	console.log(`Loaded ${parsedNodeTypes.length} node types`);

	const targetFn = createTargetFunction({ discoverySubgraph, parsedNodeTypes, llm });

	// Wrap target for LangSmith evaluate() -- it receives dataset inputs
	const target = async (inputs: Record<string, unknown>): Promise<TargetOutput> => {
		const prompt = inputs.prompt as string;
		const expectedTriggerKeywords = inputs.expectedTriggerKeywords as string[];
		const expectedStepKeywords = inputs.expectedStepKeywords as string[];

		return await targetFn({ prompt, expectedTriggerKeywords, expectedStepKeywords });
	};

	const feedbackExtractor = createFeedbackExtractor();

	console.log(`\nStarting LangSmith experiment "${experimentName}" on dataset "${datasetName}"...`);
	console.log(`Concurrency: ${concurrency}\n`);

	const experimentResults = await evaluate(target, {
		data: datasetName,
		evaluators: [feedbackExtractor],
		experimentPrefix: experimentName,
		maxConcurrency: concurrency,
		client: lsClient,
	});

	// Flush pending traces
	console.log('Flushing pending traces...');
	await lsClient.awaitPendingTraceBatches();

	const expName = experimentResults.experimentName;
	console.log(`\nExperiment completed: ${expName}`);
	console.log('View results in LangSmith dashboard.');
}
