import type { ICredentialsResponse } from '../credentials.types';
import { useCredentialsStore } from '../credentials.store';
import { useToast } from '@/app/composables/useToast';
import { useI18n } from '@n8n/i18n';

/**
 * Composable for OAuth credential type detection and authorization.
 * Shared between CredentialEdit and NodeCredentials.
 */
export function useCredentialOAuth() {
	const credentialsStore = useCredentialsStore();
	const toast = useToast();
	const i18n = useI18n();

	/**
	 * Get parent types for a credential type (e.g., googleSheetsOAuth2Api extends googleOAuth2Api extends oAuth2Api).
	 */
	function getParentTypes(credentialTypeName: string): string[] {
		const type = credentialsStore.getCredentialTypeByName(credentialTypeName);
		if (type?.extends === undefined) return [];

		const types: string[] = [];
		for (const typeName of type.extends) {
			types.push(typeName);
			types.push(...getParentTypes(typeName));
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
	 * Authorize OAuth credentials by opening a popup and listening for callback.
	 */
	async function authorizeOAuth(
		credential: ICredentialsResponse,
		options?: { onSuccess?: () => void },
	): Promise<void> {
		const credentialTypeName = credential.type;
		const types = getParentTypes(credentialTypeName);

		let url: string | undefined;
		try {
			if (credentialTypeName === 'oAuth2Api' || types.includes('oAuth2Api')) {
				url = await credentialsStore.oAuth2Authorize(credential);
			} else if (credentialTypeName === 'oAuth1Api' || types.includes('oAuth1Api')) {
				url = await credentialsStore.oAuth1Authorize(credential);
			}
		} catch (error) {
			toast.showError(
				error,
				i18n.baseText('credentialEdit.credentialEdit.showError.generateAuthorizationUrl.title'),
			);
			return;
		}

		if (!url) {
			toast.showError(
				new Error(i18n.baseText('credentialEdit.credentialEdit.showError.invalidOAuthUrl.message')),
				i18n.baseText('credentialEdit.credentialEdit.showError.invalidOAuthUrl.title'),
			);
			return;
		}

		try {
			const parsedUrl = new URL(url);
			if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
				throw new Error('Invalid protocol');
			}
		} catch {
			toast.showError(
				new Error(i18n.baseText('credentialEdit.credentialEdit.showError.invalidOAuthUrl.message')),
				i18n.baseText('credentialEdit.credentialEdit.showError.invalidOAuthUrl.title'),
			);
			return;
		}

		const params =
			'scrollbars=no,resizable=yes,status=no,titlebar=no,location=no,toolbar=no,menubar=no,width=500,height=700';
		const oauthPopup = window.open(url, 'OAuth Authorization', params);

		const oauthChannel = new BroadcastChannel('oauth-callback');
		const receiveMessage = (event: MessageEvent) => {
			if (event.data === 'success') {
				oauthChannel.removeEventListener('message', receiveMessage);
				oauthChannel.close();
				oauthPopup?.close();
				options?.onSuccess?.();
			}
		};
		oauthChannel.addEventListener('message', receiveMessage);
	}

	return {
		getParentTypes,
		isOAuthCredentialType,
		isGoogleOAuthType,
		authorizeOAuth,
	};
}
