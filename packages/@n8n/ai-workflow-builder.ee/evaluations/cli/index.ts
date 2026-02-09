/**
 * V2 CLI Entry Point
 *
 * Demonstrates how to use the v2 evaluation harness.
 * Can be run directly or used as a reference for custom setups.
 */

import pLimit from 'p-limit';

import { createWorkflowGenerator } from '../harness/evaluation-helpers';
import { createLogger } from '../harness/logger';
import {
	runEvaluation,
	createConsoleLifecycle,
	mergeLifecycles,
	createLLMJudgeEvaluator,
	createProgrammaticEvaluator,
	createPairwiseEvaluator,
	createSimilarityEvaluator,
	createIntrospectionEvaluator,
	type RunConfig,
	type TestCase,
	type Evaluator,
	type EvaluationContext,
} from '../index';
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
	createIntrospectionCollector,
	createIntrospectionAnalysisLifecycle,
} from '../lifecycles/introspection-analysis';
import { setupTestEnvironment, type ResolvedStageLLMs } from '../support/environment';

/**
 * Create evaluators based on suite type.
 */
function createEvaluators(params: {
	suite: string;
	judgeLlm: ResolvedStageLLMs['judge'];
	parsedNodeTypes: Parameters<typeof createProgrammaticEvaluator>[0];
	numJudges: number;
	introspectionCollector?: ReturnType<typeof createIntrospectionCollector>;
}): Array<Evaluator<EvaluationContext>> {
	const { suite, judgeLlm, parsedNodeTypes, numJudges, introspectionCollector } = params;
	const evaluators: Array<Evaluator<EvaluationContext>> = [];

	switch (suite) {
		case 'introspection':
			if (!introspectionCollector) {
				throw new Error('Introspection suite requires an IntrospectionCollector');
			}
			evaluators.push(createIntrospectionEvaluator(introspectionCollector));
			break;
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

	// Create introspection collector if needed
	const collector = args.suite === 'introspection' ? createIntrospectionCollector() : undefined;

	// Create evaluators based on suite type
	const evaluators = createEvaluators({
		suite: args.suite,
		judgeLlm: env.llms.judge,
		parsedNodeTypes: env.parsedNodeTypes,
		numJudges: args.numJudges,
		introspectionCollector: collector,
	});

	// Create workflow generator (collector captures introspection events as side-effect)
	const generateWorkflow = createWorkflowGenerator({
		parsedNodeTypes: env.parsedNodeTypes,
		llms: env.llms,
		featureFlags: args.featureFlags,
		introspectionCollector: collector,
	});

	const llmCallLimiter = pLimit(args.concurrency);

	// Merge console lifecycle with introspection analysis lifecycle
	const mergedLifecycle = mergeLifecycles(
		createConsoleLifecycle({ verbose: args.verbose, logger }),
		collector
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
		timeoutMs: args.timeoutMs,
		context: { llmCallLimiter },
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
