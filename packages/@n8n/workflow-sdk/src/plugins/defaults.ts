/**
 * Default Plugin Registration
 *
 * Registers the core plugins that come built-in with the workflow SDK.
 * This includes validators, composite handlers, and serializers.
 */

import type { PluginRegistry } from './registry';
import type { ValidatorPlugin, CompositeHandlerPlugin, SerializerPlugin } from './types';

// Import real validators
import {
	agentValidator,
	chainLlmValidator,
	dateMethodValidator,
	expressionPathValidator,
	expressionPrefixValidator,
	fromAiValidator,
	httpRequestValidator,
	mergeNodeValidator,
	setNodeValidator,
	toolNodeValidator,
} from './validators';

// Import real composite handlers
import { ifElseHandler, switchCaseHandler, splitInBatchesHandler } from './composite-handlers';

// Import real serializers
import { jsonSerializer } from './serializers';

// =============================================================================
// Core Validators (stubs for validators not yet extracted)
// =============================================================================

const disconnectedNodeValidator: ValidatorPlugin = {
	id: 'core:disconnected-node',
	name: 'Disconnected Node Validator',
	priority: 10,
	validateNode: () => [],
	// Note: Full implementation will check for disconnected nodes
};

// Note: Core composite handlers are now imported from ./composite-handlers

// Note: Core serializers are now imported from ./serializers

// =============================================================================
// Registration
// =============================================================================

/**
 * All core validators to register
 */
const coreValidators: ValidatorPlugin[] = [
	// Node-specific validators (high priority)
	agentValidator,
	chainLlmValidator,
	httpRequestValidator,
	toolNodeValidator,
	fromAiValidator,

	// Node-type validators (medium priority)
	setNodeValidator,
	mergeNodeValidator,

	// Expression validators (lower priority)
	expressionPrefixValidator,
	dateMethodValidator,
	expressionPathValidator, // Workflow-level validator

	// Structural validators (lowest priority, still a stub)
	disconnectedNodeValidator,
];

/**
 * All core composite handlers to register
 */
const coreCompositeHandlers: CompositeHandlerPlugin[] = [
	ifElseHandler,
	switchCaseHandler,
	splitInBatchesHandler,
];

/**
 * All core serializers to register
 */
const coreSerializers: SerializerPlugin[] = [jsonSerializer];

/**
 * Register all default plugins with the given registry.
 *
 * This function is idempotent - calling it multiple times will not
 * register duplicate plugins (existing plugins are skipped).
 *
 * @param registry The plugin registry to register with
 */
export function registerDefaultPlugins(registry: PluginRegistry): void {
	// Register validators (skip if already registered)
	for (const validator of coreValidators) {
		try {
			registry.registerValidator(validator);
		} catch {
			// Already registered, skip
		}
	}

	// Register composite handlers (skip if already registered)
	for (const handler of coreCompositeHandlers) {
		try {
			registry.registerCompositeHandler(handler);
		} catch {
			// Already registered, skip
		}
	}

	// Register serializers (skip if already registered)
	for (const serializer of coreSerializers) {
		try {
			registry.registerSerializer(serializer);
		} catch {
			// Already registered, skip
		}
	}
}
