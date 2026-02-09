import type { QuickConnectOption } from '@n8n/api-types';
import { computed } from 'vue';

import { useSettingsStore } from '@/app/stores/settings.store';

/**
 * Composable for quick connect detection.
 * Used to determine when to show quick connect UI for credential types.
 */
export function useQuickConnect() {
	const settingsStore = useSettingsStore();

	const quickConnectOptions = computed<QuickConnectOption[]>(
		() => settingsStore.moduleSettings['quick-connect']?.options ?? [],
	);

	/**
	 * Check if quick connect is configured for a credential type.
	 */
	function hasQuickConnect(credentialTypeName: string, nodeType: string): boolean {
		return quickConnectOptions.value.some(
			(option) =>
				option.credentialType === credentialTypeName &&
				option.packageName === nodeType.split('.')[0],
		);
	}

	return {
		quickConnectOptions,
		hasQuickConnect,
	};
}
