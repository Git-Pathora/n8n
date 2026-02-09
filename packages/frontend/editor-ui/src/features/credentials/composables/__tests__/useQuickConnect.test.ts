import { describe, it, expect, beforeEach } from 'vitest';
import { createTestingPinia } from '@pinia/testing';
import { setActivePinia } from 'pinia';
import { useQuickConnect } from '../useQuickConnect';
import { useSettingsStore } from '@/app/stores/settings.store';
import { mockedStore } from '@/__tests__/utils';

describe('useQuickConnect', () => {
	let settingsStore: ReturnType<typeof mockedStore<typeof useSettingsStore>>;

	beforeEach(() => {
		const pinia = createTestingPinia({ stubActions: false });
		setActivePinia(pinia);
		settingsStore = mockedStore(useSettingsStore);
	});

	it('should return true when credential type matches quick connect config', () => {
		settingsStore.moduleSettings = {
			'quick-connect': {
				options: [
					{
						packageName: 'n8n-nodes-base',
						credentialType: 'googleSheetsOAuth2Api',
						text: 'Google Sheets',
						quickConnectType: 'oauth',
					},
				],
			},
		};

		const { hasQuickConnect } = useQuickConnect();
		expect(hasQuickConnect('googleSheetsOAuth2Api', 'n8n-nodes-base.googleSheets')).toBe(true);
	});

	it('should return false when credential type does not match', () => {
		settingsStore.moduleSettings = {
			'quick-connect': {
				options: [
					{
						packageName: 'n8n-nodes-base',
						credentialType: 'googleSheetsOAuth2Api',
						text: 'Google Sheets',
						quickConnectType: 'oauth',
					},
				],
			},
		};

		const { hasQuickConnect } = useQuickConnect();
		expect(hasQuickConnect('slackOAuth2Api', 'n8n-nodes-base.slack')).toBe(false);
	});

	it('should return false when package name does not match', () => {
		settingsStore.moduleSettings = {
			'quick-connect': {
				options: [
					{
						packageName: 'n8n-nodes-base',
						credentialType: 'googleSheetsOAuth2Api',
						text: 'Google Sheets',
						quickConnectType: 'oauth',
					},
				],
			},
		};

		const { hasQuickConnect } = useQuickConnect();
		expect(hasQuickConnect('googleSheetsOAuth2Api', 'other-package.googleSheets')).toBe(false);
	});

	it('should return false when module settings are missing', () => {
		settingsStore.moduleSettings = {};

		const { hasQuickConnect } = useQuickConnect();
		expect(hasQuickConnect('googleSheetsOAuth2Api', 'n8n-nodes-base.googleSheets')).toBe(false);
	});

	it('should return false when options array is empty', () => {
		settingsStore.moduleSettings = {
			'quick-connect': {
				options: [],
			},
		};

		const { hasQuickConnect } = useQuickConnect();
		expect(hasQuickConnect('googleSheetsOAuth2Api', 'n8n-nodes-base.googleSheets')).toBe(false);
	});

	it('should extract package name from node type by splitting on first dot', () => {
		settingsStore.moduleSettings = {
			'quick-connect': {
				options: [
					{
						packageName: '@n8n',
						credentialType: 'openAiApi',
						text: 'OpenAI',
						quickConnectType: 'oauth',
					},
				],
			},
		};

		const { hasQuickConnect } = useQuickConnect();
		// '@n8n.openAi' splits on first '.' to get package '@n8n'
		expect(hasQuickConnect('openAiApi', '@n8n.openAi')).toBe(true);
	});
});
