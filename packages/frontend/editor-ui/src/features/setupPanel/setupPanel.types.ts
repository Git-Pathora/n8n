import type { INodeUi } from '@/Interface';

export interface NodeCredentialRequirement {
	credentialType: string;
	credentialDisplayName: string;
	selectedCredentialId?: string;
	issues: string[];
}

export interface NodeSetupState {
	node: INodeUi;
	credentialRequirements: NodeCredentialRequirement[];
	isComplete: boolean;
}
