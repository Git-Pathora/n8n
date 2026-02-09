import { useToast } from '@/app/composables/useToast';
import { useI18n } from '@n8n/i18n';
import { createResultError, createResultOk, type Result } from 'n8n-workflow';

import { useCredentialsStore } from '../credentials.store';
import type { ICredentialsResponse } from '../credentials.types';

/**
 * Composable for OAuth credential type detection and authorization.
 * Used by NodeCredentials for the quick connect OAuth flow.
 */
export function useCredentialOAuth() {
	const credentialsStore = useCredentialsStore();
	const toast = useToast();
	const i18n = useI18n();

	/**
	 * Get parent types for a credential type (e.g., googleSheetsOAuth2Api extends googleOAuth2Api extends oAuth2Api).
	 */
	function getParentTypes(credentialTypeName: string, visited = new Set<string>()): string[] {
		if (visited.has(credentialTypeName)) return [];
		visited.add(credentialTypeName);

		const type = credentialsStore.getCredentialTypeByName(credentialTypeName);
		if (type?.extends === undefined) return [];

		const types: string[] = [];
		for (const typeName of type.extends) {
			types.push(typeName);
			types.push(...getParentTypes(typeName, visited));
		}
		return types;
	}

	/**
	 * Check if a credential type is an OAuth type (extends oAuth2Api or oAuth1Api).
	 */
	function isOAuthCredentialType(credentialTypeName: string): boolean {
		const parentTypes = getParentTypes(credentialTypeName);
		return (
			credentialTypeName === 'oAuth2Api' ||
			credentialTypeName === 'oAuth1Api' ||
			parentTypes.includes('oAuth2Api') ||
			parentTypes.includes('oAuth1Api')
		);
	}

	/**
	 * Check if a credential type is Google OAuth (extends googleOAuth2Api).
	 */
	function isGoogleOAuthType(credentialTypeName: string): boolean {
		const parentTypes = getParentTypes(credentialTypeName);
		return credentialTypeName === 'googleOAuth2Api' || parentTypes.includes('googleOAuth2Api');
	}

	/**
	 * Check if an OAuth credential type has all required fields managed/overwritten.
	 * This indicates the credential can be used with quick connect (just OAuth flow, no manual config).
	 * Reuses logic patterns from CredentialEdit.vue (credentialProperties + requiredPropertiesFilled).
	 */
	function hasManagedOAuthCredentials(credentialTypeName: string): boolean {
		if (!isOAuthCredentialType(credentialTypeName)) {
			return false;
		}

		const credentialType = credentialsStore.getCredentialTypeByName(credentialTypeName);
		if (!credentialType) {
			return false;
		}

		// __overwrittenProperties is set by the credentials-overwrites system (CredentialsOverwrites.applyOverwrite)
		const overwrittenProperties = credentialType.__overwrittenProperties ?? [];
		if (overwrittenProperties.length === 0) {
			return false;
		}

		// Get required properties that would need user input (excluding notice and already overwritten)
		const requiredProperties = credentialType.properties.filter(
			(prop) => prop.required === true && prop.type !== 'notice',
		);

		// All required properties must be overwritten for managed credentials
		return requiredProperties.every((prop) => overwrittenProperties.includes(prop.name));
	}

	// ---------------------------------------------------------------------------
	// authorize() helpers
	// ---------------------------------------------------------------------------

	async function getOAuthAuthorizationUrl(
		credential: ICredentialsResponse,
	): Promise<Result<string, 'api-error' | 'no-url'>> {
		const parentTypes = getParentTypes(credential.type);

		try {
			if (credential.type === 'oAuth2Api' || parentTypes.includes('oAuth2Api')) {
				return createResultOk(await credentialsStore.oAuth2Authorize(credential));
			}
			if (credential.type === 'oAuth1Api' || parentTypes.includes('oAuth1Api')) {
				return createResultOk(await credentialsStore.oAuth1Authorize(credential));
			}
		} catch (error) {
			toast.showError(
				error,
				i18n.baseText('credentialEdit.credentialEdit.showError.generateAuthorizationUrl.title'),
			);
			return createResultError('api-error' as const);
		}

		return createResultError('no-url' as const);
	}

	function isValidHttpUrl(url: string): boolean {
		try {
			const parsed = new URL(url);
			return ['http:', 'https:'].includes(parsed.protocol);
		} catch {
			return false;
		}
	}

	function showOAuthUrlError(): void {
		toast.showError(
			new Error(i18n.baseText('credentialEdit.credentialEdit.showError.invalidOAuthUrl.message')),
			i18n.baseText('credentialEdit.credentialEdit.showError.invalidOAuthUrl.title'),
		);
	}

	function openOAuthPopup(url: string, signal?: AbortSignal): Window | null {
		const params =
			'scrollbars=no,resizable=yes,status=no,titlebar=no,location=no,toolbar=no,menubar=no,width=500,height=700';
		const popup = window.open(url, 'OAuth Authorization', params);

		signal?.addEventListener('abort', () => {
			popup?.close();
		});

		return popup;
	}

	async function waitForOAuthCallback(popup: Window, signal?: AbortSignal): Promise<boolean> {
		return await new Promise((resolve) => {
			const oauthChannel = new BroadcastChannel('oauth-callback');
			let settled = false;

			const settle = (result: boolean) => {
				if (settled) return;
				settled = true;
				oauthChannel.close();
				resolve(result);
			};

			signal?.addEventListener('abort', () => {
				settle(false);
			});

			oauthChannel.addEventListener('message', (event: MessageEvent) => {
				popup.close();

				if (event.data === 'success') {
					toast.showMessage({
						title: i18n.baseText('nodeCredentials.oauth.accountConnected'),
						type: 'success',
					});
					settle(true);
				} else {
					toast.showMessage({
						title: i18n.baseText('nodeCredentials.oauth.accountConnectionFailed'),
						type: 'error',
					});
					settle(false);
				}
			});
		});
	}

	// ---------------------------------------------------------------------------
	// Public
	// ---------------------------------------------------------------------------

	/**
	 * Authorize OAuth credentials by opening a popup and listening for callback.
	 * Returns true if OAuth was successful, false if cancelled or failed.
	 */
	async function authorize(
		credential: ICredentialsResponse,
		signal?: AbortSignal,
	): Promise<boolean> {
		const urlResult = await getOAuthAuthorizationUrl(credential);
		if (!urlResult.ok) {
			if (urlResult.error === 'no-url') showOAuthUrlError();
			return false;
		}

		if (!isValidHttpUrl(urlResult.result)) {
			showOAuthUrlError();
			return false;
		}

		const popup = openOAuthPopup(urlResult.result, signal);
		if (!popup) {
			showOAuthUrlError();
			return false;
		}

		return await waitForOAuthCallback(popup, signal);
	}

	return {
		getParentTypes,
		isOAuthCredentialType,
		isGoogleOAuthType,
		hasManagedOAuthCredentials,
		authorize,
	};
}
