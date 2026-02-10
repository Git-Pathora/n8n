/**
 * V2 CLI Entry Point
 *
 * Demonstrates how to use the v2 evaluation harness.
 * Can be run directly or used as a reference for custom setups.
 */

import type { INodeTypeDescription } from 'n8n-workflow';
import pLimit from 'p-limit';

import type { CoordinationLogEntry } from '@/types/coordination';
import type { SimpleWorkflow } from '@/types/workflow';
import type { BuilderFeatureFlags } from '@/workflow-builder-agent';

import {
	argsToStageModels,
	getDefaultDatasetName,
	getDefaultExperimentName,
	parseEvaluationArgs,
} from './argument-parser';
import { buildCIMetadata } from './ci-metadata';
import {
	loadTestCasesFromCsv,
	loadDefaultTestCases,
	getDefaultTestCaseIds,
} from './csv-prompt-loader';
import { sendWebhookNotification } from './webhook';
import {
	consumeGenerator,
	extractSubgraphMetrics,
	getChatPayload,
} from '../harness/evaluation-helpers';
import { createLogger } from '../harness/logger';
import type { GenerationCollectors, SubgraphMetricsCollector } from '../harness/runner';
import { TokenUsageTrackingHandler } from '../harness/token-tracking-handler';
import {
	runEvaluation,
	createConsoleLifecycle,
	mergeLifecycles,
	createLLMJudgeEvaluator,
	createProgrammaticEvaluator,
	createPairwiseEvaluator,
	createSimilarityEvaluator,
	type RunConfig,
	type TestCase,
	type Evaluator,
	type EvaluationContext,
} from '../index';
import { generateRunId, isWorkflowStateValues } from '../langsmith/types';
import { createIntrospectionAnalysisLifecycle } from '../lifecycles/introspection-analysis';
import { EVAL_TYPES, EVAL_USERS } from '../support/constants';
import { setupTestEnvironment, createAgent, type ResolvedStageLLMs } from '../support/environment';

/**
 * Type guard to check if state values contain a coordination log.
 */
function hasCoordinationLog(
	values: unknown,
): values is { coordinationLog: CoordinationLogEntry[] } {
	if (!values || typeof values !== 'object') return false;
	const obj = values as Record<string, unknown>;
	return Array.isArray(obj.coordinationLog);
}

/**
 * Report subgraph metrics from coordination log and workflow.
 */
function reportSubgraphMetrics(
	collector: SubgraphMetricsCollector,
	stateValues: unknown,
	workflow: SimpleWorkflow,
): void {
	const coordinationLog = hasCoordinationLog(stateValues) ? stateValues.coordinationLog : undefined;
	const nodeCount = workflow.nodes?.length;
	const metrics = extractSubgraphMetrics(coordinationLog, nodeCount);

	if (
		metrics.discoveryDurationMs !== undefined ||
		metrics.builderDurationMs !== undefined ||
		metrics.responderDurationMs !== undefined ||
		metrics.nodeCount !== undefined
	) {
		collector(metrics);
	}
}

/**
 * Create a workflow generator function.
 * LangSmith tracing is handled via traceable() in the runner.
 * Callbacks are passed explicitly from the runner to ensure correct trace context
 * under high concurrency (avoids AsyncLocalStorage race conditions).
 */
function createWorkflowGenerator(options: {
	parsedNodeTypes: INodeTypeDescription[];
	llms: ResolvedStageLLMs;
	featureFlags?: BuilderFeatureFlags;
}): (prompt: string, collectors?: GenerationCollectors) => Promise<SimpleWorkflow> {
	const { parsedNodeTypes, llms, featureFlags } = options;

	return async (prompt: string, collectors?: GenerationCollectors): Promise<SimpleWorkflow> => {
		const runId = generateRunId();

		const agent = createAgent({
			parsedNodeTypes,
			llms,
			featureFlags,
		});

		// Create token tracking handler to capture usage from all LLM calls
		// (supervisor, discovery, builder, responder agents)
		const tokenTracker = collectors?.tokenUsage ? new TokenUsageTrackingHandler() : undefined;

		await consumeGenerator(
			agent.chat(
				getChatPayload({
					evalType: EVAL_TYPES.LANGSMITH,
					message: prompt,
					workflowId: runId,
					featureFlags,
				}),
				EVAL_USERS.LANGSMITH,
				undefined, // abortSignal
				tokenTracker ? [tokenTracker] : undefined, // externalCallbacks
			),
		);

		const state = await agent.getState(runId, EVAL_USERS.LANGSMITH);

		if (!state.values || !isWorkflowStateValues(state.values)) {
			throw new Error('Invalid workflow state: workflow or messages missing');
		}

		const workflow = state.values.workflowJSON;

		// Report accumulated token usage from all agents
		if (collectors?.tokenUsage && tokenTracker) {
			const usage = tokenTracker.getUsage();
			if (usage.inputTokens > 0 || usage.outputTokens > 0) {
				collectors.tokenUsage(usage);
			}
		}

		// Extract and report subgraph metrics from coordination log
		if (collectors?.subgraphMetrics) {
			reportSubgraphMetrics(collectors.subgraphMetrics, state.values, workflow);
		}

		// Report introspection events
		collectors?.introspectionEvents?.(state.values.introspectionEvents ?? []);

		return workflow;
	};
}

/**
 * Create evaluators based on suite type.
 */
function createEvaluators(params: {
	suite: string;
	judgeLlm: ResolvedStageLLMs['judge'];
	parsedNodeTypes: Parameters<typeof createProgrammaticEvaluator>[0];
	numJudges: number;
}): Array<Evaluator<EvaluationContext>> {
	const { suite, judgeLlm, parsedNodeTypes, numJudges } = params;
	const evaluators: Array<Evaluator<EvaluationContext>> = [];

	switch (suite) {
		case 'llm-judge':
			evaluators.push(createLLMJudgeEvaluator(judgeLlm, parsedNodeTypes));
			evaluators.push(createProgrammaticEvaluator(parsedNodeTypes));
			break;
		case 'pairwise':
			evaluators.push(createPairwiseEvaluator(judgeLlm, { numJudges }));
			evaluators.push(createProgrammaticEvaluator(parsedNodeTypes));
			break;
		case 'programmatic':
			evaluators.push(createProgrammaticEvaluator(parsedNodeTypes));
			break;
		case 'similarity':
			evaluators.push(createSimilarityEvaluator());
			break;
	}

	return evaluators;
}

/**
 * Load test cases from various sources.
 */
function loadTestCases(args: ReturnType<typeof parseEvaluationArgs>): TestCase[] {
	// From CSV file
	if (args.promptsCsv) {
		const testCases = loadTestCasesFromCsv(args.promptsCsv);
		return args.maxExamples ? testCases.slice(0, args.maxExamples) : testCases;
	}

	// Predefined test case by id
	if (args.testCase) {
		const defaultCases = loadDefaultTestCases();
		const match = defaultCases.find((tc) => tc.id === args.testCase);
		if (!match) {
			const options = getDefaultTestCaseIds().join(', ');
			throw new Error(`Unknown --test-case "${args.testCase}". Available: ${options}`);
		}

		const testCases: TestCase[] = [
			{
				prompt: match.prompt,
				id: match.id,
				context: { dos: args.dos, donts: args.donts },
			},
		];

		return args.maxExamples ? testCases.slice(0, args.maxExamples) : testCases;
	}

	// Single prompt from CLI
	if (args.prompt) {
		const testCases: TestCase[] = [
			{
				prompt: args.prompt,
				context: {
					dos: args.dos,
					donts: args.donts,
				},
			},
		];
		return args.maxExamples ? testCases.slice(0, args.maxExamples) : testCases;
	}

	// Default: use bundled test cases
	const defaultCases = loadDefaultTestCases();
	return args.maxExamples ? defaultCases.slice(0, args.maxExamples) : defaultCases;
}

/**
 * Main entry point for v2 evaluation CLI.
 */
export async function runV2Evaluation(): Promise<void> {
	const args = parseEvaluationArgs();

	if (args.backend === 'langsmith' && (args.prompt || args.promptsCsv || args.testCase)) {
		throw new Error(
			'LangSmith mode requires `--dataset` and does not support `--prompt`, `--prompts-csv`, or `--test-case`',
		);
	}

	// Setup environment with per-stage model configuration
	const logger = createLogger(args.verbose);
	const stageModels = argsToStageModels(args);
	const env = await setupTestEnvironment(stageModels, logger);

	// Validate LangSmith client early if langsmith backend is requested
	if (args.backend === 'langsmith' && !env.lsClient) {
		throw new Error('LangSmith client not initialized - check LANGSMITH_API_KEY');
	}

	// Create evaluators based on suite type
	const evaluators = createEvaluators({
		suite: args.suite,
		judgeLlm: env.llms.judge,
		parsedNodeTypes: env.parsedNodeTypes,
		numJudges: args.numJudges,
	});

	// Create workflow generator
	const generateWorkflow = createWorkflowGenerator({
		parsedNodeTypes: env.parsedNodeTypes,
		llms: env.llms,
		featureFlags: args.featureFlags,
	});

	const llmCallLimiter = pLimit(args.concurrency);

	// Merge console lifecycle with optional introspection analysis lifecycle
	const mergedLifecycle = mergeLifecycles(
		createConsoleLifecycle({ verbose: args.verbose, logger }),
		args.suite === 'introspection'
			? createIntrospectionAnalysisLifecycle({
					judgeLlm: env.llms.judge,
					outputDir: args.outputDir,
					logger,
				})
			: undefined,
	);

	const baseConfig = {
		generateWorkflow,
		evaluators,
		lifecycle: mergedLifecycle,
		logger,
		outputDir: args.outputDir,
		outputCsv: args.outputCsv,
		suite: args.suite,
		timeoutMs: args.timeoutMs,
		context: { llmCallLimiter },
		passThreshold: args.suite === 'introspection' ? 0 : undefined,
	};

	const config: RunConfig =
		args.backend === 'langsmith'
			? {
					...baseConfig,
					mode: 'langsmith',
					dataset: args.datasetName ?? getDefaultDatasetName(args.suite),
					langsmithClient: env.lsClient!,
					langsmithOptions: {
						experimentName: args.experimentName ?? getDefaultExperimentName(args.suite),
						repetitions: args.repetitions,
						concurrency: args.concurrency,
						maxExamples: args.maxExamples,
						filters: args.filters,
						experimentMetadata: {
							...buildCIMetadata(),
							...(args.suite === 'pairwise' && {
								numJudges: args.numJudges,
								scoringMethod: 'hierarchical',
							}),
						},
					},
				}
			: {
					...baseConfig,
					mode: 'local',
					dataset: loadTestCases(args),
					concurrency: args.concurrency,
				};

	// Run evaluation
	const summary = await runEvaluation(config);

	if (args.webhookUrl) {
		const dataset =
			args.backend === 'langsmith'
				? (args.datasetName ?? getDefaultDatasetName(args.suite))
				: 'local-dataset';

		await sendWebhookNotification({
			webhookUrl: args.webhookUrl,
			webhookSecret: args.webhookSecret,
			summary,
			dataset,
			suite: args.suite,
			metadata: { ...buildCIMetadata() },
			logger,
		});
	}

	// Always exit 0 on successful completion - pass/fail is informational, not an error
	process.exit(0);
}

// Run if called directly
if (require.main === module) {
	runV2Evaluation().catch((error) => {
		const logger = createLogger(true);
		const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
		logger.error(`Evaluation failed: ${message}`);
		process.exit(1);
	});
}
