import type { Callbacks } from '@langchain/core/callbacks/manager';
import { getLangchainCallbacks } from 'langsmith/langchain';
import { v4 as uuid } from 'uuid';

import type { IntrospectionEvent } from '@/tools/introspect.tool';
import type { SimpleWorkflow } from '@/types/workflow';
import type { BuilderFeatureFlags, ChatPayload } from '@/workflow-builder-agent';

import type { LlmCallLimiter } from './harness-types';
import { generateRunId, isWorkflowStateValues } from '../langsmith/types';
import type { IntrospectionCollector } from '../lifecycles/introspection-analysis';
import { EVAL_TYPES, EVAL_USERS, DEFAULTS } from '../support/constants';
import { createAgent, type CreateAgentOptions } from '../support/environment';

/**
 * Get LangChain callbacks that bridge the current traceable context.
 * Returns undefined if not in a traceable context.
 */
export async function getTracingCallbacks(): Promise<Callbacks | undefined> {
	try {
		return await getLangchainCallbacks();
	} catch {
		return undefined;
	}
}

export async function consumeGenerator<T>(gen: AsyncGenerator<T>) {
	for await (const _ of gen) {
		/* consume all */
	}
}

export async function runWithOptionalLimiter<T>(
	fn: () => Promise<T>,
	limiter?: LlmCallLimiter,
): Promise<T> {
	return limiter ? await limiter(fn) : await fn();
}

export async function withTimeout<T>(args: {
	promise: Promise<T>;
	timeoutMs?: number;
	label: string;
}): Promise<T> {
	// NOTE:
	// - This is a best-effort timeout. It does NOT cancel/abort the underlying work.
	// - If the underlying work supports cancellation (e.g. AbortSignal), plumb that through instead.
	// - When combined with `p-limit`, prefer applying the timeout *inside* the limited function so the
	//   limiter slot is released when the timeout triggers.
	const { promise, timeoutMs, label } = args;
	if (typeof timeoutMs !== 'number') return await promise;
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new Error(`Invalid timeoutMs (${String(timeoutMs)}) for ${label}`);
	}

	let timer: NodeJS.Timeout | undefined;
	try {
		const timeout = new Promise<never>((_resolve, reject) => {
			timer = setTimeout(
				() => reject(new Error(`Timed out after ${timeoutMs}ms in ${label}`)),
				timeoutMs,
			);
		});
		return await Promise.race([promise, timeout]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

export interface GetChatPayloadOptions {
	evalType: string;
	message: string;
	workflowId: string;
	featureFlags?: BuilderFeatureFlags;
}

export function getChatPayload(options: GetChatPayloadOptions): ChatPayload {
	const { evalType, message, workflowId, featureFlags } = options;

	return {
		id: `${evalType}-${uuid()}`,
		featureFlags: featureFlags ?? DEFAULTS.FEATURE_FLAGS,
		message,
		workflowContext: {
			currentWorkflow: { id: workflowId, nodes: [], connections: {} },
		},
	};
}

/**
 * Options for createWorkflowGenerator - same as agent creation options
 */
export type WorkflowGeneratorOptions = Omit<CreateAgentOptions, 'experimentName'> & {
	/** Optional collector for introspection events */
	introspectionCollector?: IntrospectionCollector;
};

/**
 * Workflow generator function type.
 * Returns the generated workflow.
 */
export type WorkflowGenerator = (prompt: string, callbacks?: Callbacks) => Promise<SimpleWorkflow>;

/**
 * Creates a workflow generator that returns a SimpleWorkflow.
 * When an IntrospectionCollector is provided, introspection events are collected as a side-effect.
 *
 * @param options - Agent configuration options (parsedNodeTypes, llms, featureFlags, introspectionCollector)
 * @returns Generator function that returns a SimpleWorkflow
 */
export function createWorkflowGenerator(options: WorkflowGeneratorOptions): WorkflowGenerator {
	const { featureFlags, introspectionCollector } = options;

	return async (prompt: string, callbacks?: Callbacks): Promise<SimpleWorkflow> => {
		const runId = generateRunId();

		const agent = createAgent(options);

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
				callbacks,
			),
		);

		const state = await agent.getState(runId, EVAL_USERS.LANGSMITH);

		if (!state.values || !isWorkflowStateValues(state.values)) {
			throw new Error('Invalid workflow state: workflow or messages missing');
		}

		// Collect introspection events as a side-effect if collector is provided
		if (introspectionCollector) {
			const events = (state.values.introspectionEvents ?? []) as IntrospectionEvent[];
			introspectionCollector.addEvents(events);
		}

		return state.values.workflowJSON;
	};
}
