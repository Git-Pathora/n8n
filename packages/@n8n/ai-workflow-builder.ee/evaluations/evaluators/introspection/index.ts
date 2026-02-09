import type { IntrospectionEvent } from '@/tools/introspect.tool';
import type { SimpleWorkflow } from '@/types/workflow';

import type { EvaluationContext, Evaluator, Feedback } from '../../harness/harness-types';
import type { IntrospectionCollector } from '../../lifecycles/introspection-analysis';

// Re-export the type for convenience
export type { IntrospectionEvent };

/**
 * Evaluator that collects introspection events via an IntrospectionCollector.
 * Events are drained from the collector on each evaluate() call.
 */
export function createIntrospectionEvaluator(
	collector: IntrospectionCollector,
): Evaluator<EvaluationContext> {
	return {
		name: 'introspection',
		async evaluate(_workflow: SimpleWorkflow, _ctx: EvaluationContext): Promise<Feedback[]> {
			const events = collector.drain();

			if (events.length === 0) {
				return [
					{
						evaluator: 'introspection',
						metric: 'event_count',
						score: 0,
						kind: 'metric',
						comment: 'No introspection events',
					},
				];
			}

			// Summary feedback
			// Score is 1 if any events exist (presence indicator), count stored in comment
			const feedback: Feedback[] = [
				{
					evaluator: 'introspection',
					metric: 'event_count',
					score: 1,
					kind: 'metric',
					comment: `${events.length} introspection event(s)`,
				},
			];

			// Individual events as details
			for (const event of events) {
				feedback.push({
					evaluator: 'introspection',
					metric: event.category,
					score: 1,
					kind: 'detail',
					comment: event.issue,
					details: {
						category: event.category,
						source: event.source,
						timestamp: event.timestamp,
					},
				});
			}

			return feedback;
		},
	};
}
