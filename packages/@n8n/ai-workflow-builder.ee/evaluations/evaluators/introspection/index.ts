import type { IntrospectionEvent } from '@/tools/introspect.tool';
import type { SimpleWorkflow } from '@/types/workflow';

import type { EvaluationContext, Evaluator, Feedback } from '../../harness/harness-types';

// Re-export the type for convenience
export type { IntrospectionEvent };

/**
 * Evaluator that collects introspection events from the evaluation context.
 * Events are passed via context.introspectionEvents after workflow generation.
 */
export function createIntrospectionEvaluator(): Evaluator<EvaluationContext> {
	return {
		name: 'introspection',
		async evaluate(_workflow: SimpleWorkflow, ctx: EvaluationContext): Promise<Feedback[]> {
			// Get events from context (populated by the runner from generation result)
			const events = ctx.introspectionEvents ?? [];

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
			const feedback: Feedback[] = [
				{
					evaluator: 'introspection',
					metric: 'event_count',
					score: events.length,
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
