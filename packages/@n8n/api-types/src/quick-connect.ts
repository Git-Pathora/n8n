/**
 * Quick connect option for promoting OAuth credential types.
 * Configured via N8N_QUICK_CONNECT_OPTIONS environment variable.
 */
export interface QuickConnectOption {
	packageName: string;
	credentialType: string;
	text: string;
	quickConnectType: string;
}

/**
 * Module settings for quick-connect, exposed to frontend via /rest/module-settings.
 */
export interface QuickConnectModuleSettings {
	options: QuickConnectOption[];
}
