import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { IntrospectionEvent } from '../../src/tools/introspect.tool';
import type { EvaluationLifecycle, ExampleResult } from '../harness/harness-types';
import type { EvalLogger } from '../harness/logger';
import { summarizeIntrospectionResults } from '../summarizers/introspection-summarizer';

export interface IntrospectionCollector {
	addEvents(events: IntrospectionEvent[]): void;
	/** Drain all collected events, resetting the internal buffer. */
	drain(): IntrospectionEvent[];
}

export function createIntrospectionCollector(): IntrospectionCollector {
	let collected: IntrospectionEvent[] = [];
	return {
		addEvents(events) {
			collected.push(...events);
		},
		drain() {
			const events = collected;
			collected = [];
			return events;
		},
	};
}

export interface IntrospectionAnalysisOptions {
	judgeLlm: BaseChatModel;
	outputDir?: string;
	logger: EvalLogger;
}

export function createIntrospectionAnalysisLifecycle(
	options: IntrospectionAnalysisOptions,
): Partial<EvaluationLifecycle> {
	const collectedResults: ExampleResult[] = [];

	return {
		onExampleComplete(_index, result) {
			collectedResults.push(result);
		},

		async onEnd() {
			if (collectedResults.length === 0) return;

			const { judgeLlm, outputDir, logger } = options;

			logger.info('\n📊 Running introspection analysis...\n');

			const summary = await summarizeIntrospectionResults(collectedResults, judgeLlm);

			logger.info('=== Introspection Analysis ===\n');
			logger.info(`Total events: ${summary.totalEvents}`);
			logger.info(`Category breakdown: ${JSON.stringify(summary.categoryBreakdown, null, 2)}`);
			logger.info('\n--- LLM Analysis ---\n');
			logger.info(summary.llmAnalysis);

			if (outputDir) {
				const summaryContent = `# Introspection Summary

## Overview
- **Total Events:** ${summary.totalEvents}
- **Category Breakdown:** ${JSON.stringify(summary.categoryBreakdown, null, 2)}

## LLM Analysis

${summary.llmAnalysis}
`;
				const summaryPath = path.join(outputDir, 'introspection-summary.md');
				await fs.writeFile(summaryPath, summaryContent);
				logger.info(`\nSummary saved to: ${summaryPath}`);
			}
		},
	};
}
