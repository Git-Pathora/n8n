import type { SourceControlledFile } from '@n8n/api-types';
import { Container } from '@n8n/di';
import { constants as fsConstants, accessSync } from 'fs';
import { mock } from 'jest-mock-extended';
import type { Credentials } from 'n8n-core';
import { InstanceSettings } from 'n8n-core';
import type { ICredentialDataDecryptedObject } from 'n8n-workflow';
import path from 'path';

import {
	SOURCE_CONTROL_SSH_FOLDER,
	SOURCE_CONTROL_GIT_FOLDER,
} from '@/modules/source-control.ee/constants';
import {
	hasOwnerChanged,
	generateSshKeyPair,
	getRepoType,
	getTrackingInformationFromPostPushResult,
	getTrackingInformationFromPrePushResult,
	getTrackingInformationFromPullResult,
	isWorkflowModified,
	sourceControlFoldersExistCheck,
	areSameCredentials,
	getCredentialSynchableData,
	mergeRemoteCrendetialDataIntoLocalCredentialData,
} from '../source-control-helper.ee';
import type { SourceControlPreferencesService } from '@/modules/source-control.ee/source-control-preferences.service.ee';
import type { License } from '@/license';

import type { SourceControlWorkflowVersionId } from '../types/source-control-workflow-version-id';
import type { StatusExportableCredential } from '../types/exportable-credential';

function createWorkflowVersion(
	overrides: Partial<SourceControlWorkflowVersionId> = {},
): SourceControlWorkflowVersionId {
	return {
		id: 'workflow123',
		versionId: 'version1',
		filename: 'workflows/workflow123.json',
		parentFolderId: 'folder1',
		updatedAt: '2023-07-10T10:10:59.000Z',
		name: 'Test Workflow',
		...overrides,
	};
}

const pushResult: SourceControlledFile[] = [
	{
		file: 'credential_stubs/kkookWGIeey9K4Kt.json',
		id: 'kkookWGIeey9K4Kt',
		name: '(deleted)',
		type: 'credential',
		status: 'deleted',
		location: 'local',
		conflict: false,
		updatedAt: '',
		pushed: true,
	},
	{
		file: 'variable_stubs.json',
		id: 'variables',
		name: 'variables',
		type: 'variables',
		status: 'modified',
		location: 'local',
		conflict: false,
		updatedAt: '',
		pushed: true,
	},
	{
		file: 'workflows/BpFS26gViuGqrIVP.json',
		id: 'BpFS26gViuGqrIVP',
		name: 'My workflow 5',
		type: 'workflow',
		status: 'modified',
		location: 'remote',
		conflict: true,
		pushed: true,
		updatedAt: '2023-07-10T10:10:59.000Z',
	},
	{
		file: 'workflows/BpFS26gViuGqrIVP.json',
		id: 'BpFS26gViuGqrIVP',
		name: 'My workflow 5',
		type: 'workflow',
		status: 'modified',
		location: 'local',
		conflict: true,
		updatedAt: '2023-07-10T10:10:59.000Z',
	},
	{
		file: 'workflows/dAU6dNthm4TR3gXx.json',
		id: 'dAU6dNthm4TR3gXx',
		name: 'My workflow 7',
		type: 'workflow',
		status: 'created',
		location: 'local',
		conflict: false,
		pushed: true,
		updatedAt: '2023-07-10T10:02:45.186Z',
	},
	{
		file: 'workflows/haQetoXq9GxHSkft.json',
		id: 'haQetoXq9GxHSkft',
		name: 'My workflow 6',
		type: 'workflow',
		status: 'created',
		location: 'local',
		conflict: false,
		updatedAt: '2023-07-10T10:02:39.276Z',
	},
];

const pullResult: SourceControlledFile[] = [
	{
		file: 'credential_stubs/kkookWGIeey9K4Kt.json',
		id: 'kkookWGIeey9K4Kt',
		name: '(deleted)',
		type: 'credential',
		status: 'deleted',
		location: 'local',
		conflict: false,
		updatedAt: '',
	},
	{
		file: 'credential_stubs/abcdeWGIeey9K4aa.json',
		id: 'abcdeWGIeey9K4aa',
		name: 'modfied credential',
		type: 'credential',
		status: 'modified',
		location: 'local',
		conflict: false,
		updatedAt: '',
	},
	{
		file: 'workflows/BpFS26gViuGqrIVP.json',
		id: 'BpFS26gViuGqrIVP',
		name: '(deleted)',
		type: 'workflow',
		status: 'deleted',
		location: 'local',
		conflict: false,
		updatedAt: '',
	},
	{
		file: 'variable_stubs.json',
		id: 'variables',
		name: 'variables',
		type: 'variables',
		status: 'modified',
		location: 'local',
		conflict: false,
		updatedAt: '',
	},
	{
		file: 'workflows/dAU6dNthm4TR3gXx.json',
		id: 'dAU6dNthm4TR3gXx',
		name: 'My workflow 7',
		type: 'workflow',
		status: 'created',
		location: 'local',
		conflict: false,
		updatedAt: '2023-07-10T10:02:45.186Z',
	},
	{
		file: 'workflows/haQetoXq9GxHSkft.json',
		id: 'haQetoXq9GxHSkft',
		name: 'My workflow 6',
		type: 'workflow',
		status: 'modified',
		location: 'local',
		conflict: false,
		updatedAt: '2023-07-10T10:02:39.276Z',
	},
];

const license = mock<License>();
const sourceControlPreferencesService = mock<SourceControlPreferencesService>();

beforeAll(async () => {
	jest.resetAllMocks();
	license.isSourceControlLicensed.mockReturnValue(true);
	sourceControlPreferencesService.getPreferences.mockReturnValue({
		branchName: 'main',
		connected: true,
		repositoryUrl: 'git@example.com:n8ntest/n8n_testrepo.git',
		branchReadOnly: false,
		branchColor: '#5296D6',
		publicKey:
			'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDBSz2nMZAiUBWe6n89aWd5x9QMcIOaznVW3fpuCYC4L n8n deploy key',
	});
});

describe('Source Control', () => {
	it('should generate an SSH key pair', async () => {
		const keyPair = await generateSshKeyPair('ed25519');
		expect(keyPair.privateKey).toBeTruthy();
		expect(keyPair.privateKey).toContain('BEGIN OPENSSH PRIVATE KEY');
		expect(keyPair.publicKey).toBeTruthy();
		expect(keyPair.publicKey).toContain('ssh-ed25519');
	});

	it('should generate an RSA key pair', async () => {
		const keyPair = await generateSshKeyPair('rsa');
		expect(keyPair.privateKey).toBeTruthy();
		expect(keyPair.privateKey).toContain('BEGIN OPENSSH PRIVATE KEY');
		expect(keyPair.publicKey).toBeTruthy();
		expect(keyPair.publicKey).toContain('ssh-rsa');
	});

	it('should check for git and ssh folders and create them if required', async () => {
		const { n8nFolder } = Container.get(InstanceSettings);
		const sshFolder = path.join(n8nFolder, SOURCE_CONTROL_SSH_FOLDER);
		const gitFolder = path.join(n8nFolder, SOURCE_CONTROL_GIT_FOLDER);
		let hasThrown = false;
		try {
			accessSync(sshFolder, fsConstants.F_OK);
		} catch (error) {
			hasThrown = true;
		}
		expect(hasThrown).toBeTruthy();
		hasThrown = false;
		try {
			accessSync(gitFolder, fsConstants.F_OK);
		} catch (error) {
			hasThrown = true;
		}
		expect(hasThrown).toBeTruthy();
		// create missing folders
		expect(sourceControlFoldersExistCheck([gitFolder, sshFolder], true)).toBe(false);
		// find folders this time
		expect(sourceControlFoldersExistCheck([gitFolder, sshFolder], true)).toBe(true);
		expect(accessSync(sshFolder, fsConstants.F_OK)).toBeUndefined();
		expect(accessSync(gitFolder, fsConstants.F_OK)).toBeUndefined();
	});

	it('should get repo type from url', async () => {
		expect(getRepoType('git@github.com:n8ntest/n8n_testrepo.git')).toBe('github');
		expect(getRepoType('git@gitlab.com:n8ntest/n8n_testrepo.git')).toBe('gitlab');
		expect(getRepoType('git@mygitea.io:n8ntest/n8n_testrepo.git')).toBe('other');
	});

	it('should get tracking information from pre-push results', () => {
		const userId = 'userId';
		const trackingResult = getTrackingInformationFromPrePushResult(userId, pushResult);
		expect(trackingResult).toEqual({
			userId,
			workflowsEligible: 3,
			workflowsEligibleWithConflicts: 1,
			credsEligible: 1,
			credsEligibleWithConflicts: 0,
			variablesEligible: 1,
		});
	});

	it('should get tracking information from post-push results', () => {
		const userId = 'userId';
		const trackingResult = getTrackingInformationFromPostPushResult(userId, pushResult);
		expect(trackingResult).toEqual({
			userId,
			workflowsPushed: 2,
			workflowsEligible: 3,
			credsPushed: 1,
			variablesPushed: 1,
		});
	});

	it('should get tracking information from pull results', () => {
		const userId = 'userId';
		const trackingResult = getTrackingInformationFromPullResult(userId, pullResult);
		expect(trackingResult).toEqual({
			userId,
			credConflicts: 1,
			workflowConflicts: 1,
			workflowUpdates: 3,
		});
	});
});

describe('isWorkflowModified', () => {
	it('should detect modifications when version IDs differ', () => {
		const local = createWorkflowVersion();
		const remote = createWorkflowVersion({ versionId: 'version2' });

		expect(isWorkflowModified(local, remote)).toBe(true);
	});

	it('should detect modifications when parent folder IDs differ', () => {
		const local = createWorkflowVersion();
		const remote = createWorkflowVersion({ parentFolderId: 'folder2' });

		expect(isWorkflowModified(local, remote)).toBe(true);
	});

	it('should not detect modifications when version IDs and parent folder IDs are the same', () => {
		const local = createWorkflowVersion();
		const remote = createWorkflowVersion();

		expect(isWorkflowModified(local, remote)).toBe(false);
	});

	it('should not consider it modified when remote parent folder ID is undefined', () => {
		const local = createWorkflowVersion();
		const remote = createWorkflowVersion({ parentFolderId: undefined });

		expect(isWorkflowModified(local, remote)).toBe(false);
	});

	it('should detect modifications when parent folder IDs differ and remote parent folder ID is defined', () => {
		const local = createWorkflowVersion({ parentFolderId: null });
		const remote = createWorkflowVersion();

		expect(isWorkflowModified(local, remote)).toBe(true);
	});

	it('should handle null parent folder IDs correctly', () => {
		const local = createWorkflowVersion({ parentFolderId: null });
		const remote = createWorkflowVersion({ parentFolderId: null });

		expect(isWorkflowModified(local, remote)).toBe(false);
	});

	it('should detect modifications when owner changes', () => {
		const local = createWorkflowVersion({
			owner: {
				type: 'personal',
				projectId: 'project1',
				projectName: 'Project 1',
			},
		});
		const remote = createWorkflowVersion({
			owner: {
				type: 'team',
				projectId: 'team1',
				projectName: 'Team 1',
			},
		});

		expect(isWorkflowModified(local, remote)).toBe(true);
	});
});

describe('hasOwnerChanged', () => {
	describe('team project comparisons', () => {
		it('should return true when team projects have different IDs', () => {
			const owner1 = {
				type: 'team' as const,
				projectId: 'team1',
				projectName: 'Team 1',
			};
			const owner2 = {
				type: 'team' as const,
				projectId: 'team2',
				projectName: 'Team 2',
			};

			expect(hasOwnerChanged(owner1, owner2)).toBe(true);
		});

		it('should return false when team projects have the same ID', () => {
			const owner = {
				type: 'team' as const,
				projectId: 'team1',
				projectName: 'Team 1',
			};

			expect(hasOwnerChanged(owner, { ...owner })).toBe(false);
		});

		it('should return true when personal project changes to team project', () => {
			const owner1 = {
				type: 'personal' as const,
				projectId: 'personal1',
				projectName: 'Personal 1',
			};
			const owner2 = {
				type: 'team' as const,
				projectId: 'team1',
				projectName: 'Team 1',
			};

			expect(hasOwnerChanged(owner1, owner2)).toBe(true);
		});

		it('should return true when team project changes to personal project', () => {
			const owner1 = {
				type: 'team' as const,
				projectId: 'team1',
				projectName: 'Team 1',
			};
			const owner2 = {
				type: 'personal' as const,
				projectId: 'personal1',
				projectName: 'Personal 1',
			};

			expect(hasOwnerChanged(owner1, owner2)).toBe(true);
		});
	});

	describe('personal project comparisons (always ignored)', () => {
		it('should return false when both are personal projects with different IDs', () => {
			const owner1 = {
				type: 'personal' as const,
				projectId: 'personal1',
				projectName: 'Personal 1',
			};
			const owner2 = {
				type: 'personal' as const,
				projectId: 'personal2',
				projectName: 'Personal 2',
			};

			// Personal projects are not synced via source control
			expect(hasOwnerChanged(owner1, owner2)).toBe(false);
		});

		it('should return false when both are personal projects with same ID', () => {
			const owner = {
				type: 'personal' as const,
				projectId: 'personal1',
				projectName: 'Personal 1',
			};

			expect(hasOwnerChanged(owner, { ...owner })).toBe(false);
		});

		it('should return false when both owners are undefined', () => {
			expect(hasOwnerChanged(undefined, undefined)).toBe(false);
		});

		it('should return false when personal owner compared to undefined', () => {
			const owner = {
				type: 'personal' as const,
				projectId: 'personal1',
				projectName: 'Personal 1',
			};

			// Personal projects are local-only, so undefined vs personal is not a real change
			expect(hasOwnerChanged(undefined, owner)).toBe(false);
			expect(hasOwnerChanged(owner, undefined)).toBe(false);
		});
	});

	describe('team project with undefined', () => {
		it('should return true when team owner compared to undefined', () => {
			const teamOwner = {
				type: 'team' as const,
				projectId: 'team1',
				projectName: 'Team 1',
			};

			// Team projects are synced, so undefined vs team is a real change
			expect(hasOwnerChanged(undefined, teamOwner)).toBe(true);
			expect(hasOwnerChanged(teamOwner, undefined)).toBe(true);
		});
	});
});

describe('readTagAndMappingsFromSourceControlFile', () => {
	beforeEach(() => {
		// Reset module registry so we can unmock properly
		jest.resetModules();
		jest.unmock('node:fs/promises');
	});

	it('should return default mapping if the file path is not valid', async () => {
		const filePath = 'invalid/path/tags-and-mappings.json';
		// Import the function after resetting modules
		const { readTagAndMappingsFromSourceControlFile } = await import(
			'@/modules/source-control.ee/source-control-helper.ee'
		);
		const result = await readTagAndMappingsFromSourceControlFile(filePath);
		expect(result).toEqual({
			tags: [],
			mappings: [],
		});
	});
});

describe('readFoldersFromSourceControlFile', () => {
	beforeEach(() => {
		// Reset module registry so we can unmock properly
		jest.resetModules();
		jest.unmock('node:fs/promises');
	});

	it('should return default folders if the file path is not valid', async () => {
		const filePath = 'invalid/path/folders.json';
		// Import the function after resetting modules
		const { readFoldersFromSourceControlFile } = await import(
			'@/modules/source-control.ee/source-control-helper.ee'
		);
		const result = await readFoldersFromSourceControlFile(filePath);
		expect(result).toEqual({
			folders: [],
		});
	});
});

describe('readDataTablesFromSourceControlFile', () => {
	beforeEach(() => {
		// Reset module registry so we can unmock properly
		jest.resetModules();
		jest.unmock('node:fs/promises');
	});

	it('should return empty array if the file path is not valid (ENOENT)', async () => {
		const filePath = 'invalid/path/data_tables.json';
		// Import the function after resetting modules
		const { readDataTablesFromSourceControlFile } = await import(
			'@/modules/source-control.ee/source-control-helper.ee'
		);
		const result = await readDataTablesFromSourceControlFile(filePath);
		expect(result).toEqual([]);
	});

	it('should parse valid data table JSON successfully', async () => {
		const mockDataTables = [
			{
				id: 'dt1',
				name: 'Test Table',
				projectId: 'project1',
				columns: [
					{ id: 'col1', name: 'Column 1', type: 'string', index: 0 },
					{ id: 'col2', name: 'Column 2', type: 'number', index: 1 },
				],
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-02T00:00:00.000Z',
			},
		];

		// Mock fsReadFile to return valid JSON
		jest.doMock('node:fs/promises', () => ({
			readFile: jest.fn().mockResolvedValue(JSON.stringify(mockDataTables)),
		}));

		// Import the function after mocking
		const { readDataTablesFromSourceControlFile } = await import(
			'@/modules/source-control.ee/source-control-helper.ee'
		);

		const result = await readDataTablesFromSourceControlFile('valid/path/data_tables.json');
		expect(result).toEqual(mockDataTables);
	});
});

describe('areSameCredentials', () => {
	const mockCredential = (
		overrides: Partial<StatusExportableCredential> = {},
	): StatusExportableCredential => {
		return {
			filename: 'cred1.json',
			id: 'cred1',
			name: 'My Credential',
			type: 'credential',
			ownedBy: {
				type: 'team',
				projectId: 'project1',
				projectName: 'Project 1',
				teamId: 'team1',
				teamName: 'Team 1',
			},
			data: {},
			isGlobal: false,
			...overrides,
		};
	};

	it('should return true when credentials are the same', () => {
		const creds1 = mockCredential();
		const creds2 = mockCredential();

		expect(areSameCredentials(creds1, creds2)).toBe(true);
	});

	it('should return true when plain string secrets are different (sanitized to empty)', () => {
		const creds1 = mockCredential({ data: { accessToken: 'access token' } });
		const creds2 = mockCredential({ data: { accessToken: 'different access token' } });

		// Plain strings are sanitized to empty strings, so they're considered equal
		expect(areSameCredentials(creds1, creds2)).toBe(true);
	});

	it('should return false when synchable data (expressions) are different', () => {
		const creds1 = mockCredential({ data: { apiKey: '={{ $json.key1 }}' } });
		const creds2 = mockCredential({ data: { apiKey: '={{ $json.key2 }}' } });

		expect(areSameCredentials(creds1, creds2)).toBe(false);
	});

	it('should return false when synchable data (numbers) are different', () => {
		const creds1 = mockCredential({ data: { port: 8080 } });
		const creds2 = mockCredential({ data: { port: 9090 } });

		expect(areSameCredentials(creds1, creds2)).toBe(false);
	});

	it('should return true when data has same sanitized values', () => {
		const creds1 = mockCredential({ data: { port: 8080, expression: '={{ $json.key }}' } });
		const creds2 = mockCredential({ data: { port: 8080, expression: '={{ $json.key }}' } });

		expect(areSameCredentials(creds1, creds2)).toBe(true);
	});

	it('should return false when names are different', () => {
		const creds1 = mockCredential();
		const creds2 = mockCredential({ name: 'Different Name' });

		expect(areSameCredentials(creds1, creds2)).toBe(false);
	});

	it('should return false when types are different', () => {
		const creds1 = mockCredential();
		const creds2 = mockCredential({ type: 'different type' });

		expect(areSameCredentials(creds1, creds2)).toBe(false);
	});

	it('should return false when ownedBy are different', () => {
		const creds1 = mockCredential();
		const creds2 = mockCredential({
			ownedBy: {
				type: 'personal',
				personalEmail: 'test2@example.com',
				projectId: 'project2',
				projectName: 'Project 2',
			},
		});

		expect(areSameCredentials(creds1, creds2)).toBe(false);
	});

	it('should return false when isGlobal are different', () => {
		const creds1 = mockCredential();
		const creds2 = mockCredential({ isGlobal: true });

		expect(areSameCredentials(creds1, creds2)).toBe(false);
	});

	it('should return true when both have undefined data', () => {
		const creds1 = mockCredential({ data: undefined });
		const creds2 = mockCredential({ data: undefined });

		expect(areSameCredentials(creds1, creds2)).toBe(true);
	});

	it('should return false when one has data and the other is undefined', () => {
		const creds1 = mockCredential({ data: { port: 8080 } });
		const creds2 = mockCredential({ data: undefined });

		expect(areSameCredentials(creds1, creds2)).toBe(false);
	});

	it('should return true when both have empty objects', () => {
		const creds1 = mockCredential({ data: {} });
		const creds2 = mockCredential({ data: {} });

		expect(areSameCredentials(creds1, creds2)).toBe(true);
	});

	it('should return false when nested synchable data differs', () => {
		const creds1 = mockCredential({
			data: {
				auth: {
					port: 8080,
					apiKey: '={{ $json.key }}',
				},
			},
		});
		const creds2 = mockCredential({
			data: {
				auth: {
					port: 9090,
					apiKey: '={{ $json.key }}',
				},
			},
		});

		expect(areSameCredentials(creds1, creds2)).toBe(false);
	});

	it('should ignore oauthTokenData differences', () => {
		const creds1 = mockCredential({
			data: {
				port: 8080,
				oauthTokenData: { accessToken: 'token1' },
			},
		});
		const creds2 = mockCredential({
			data: {
				port: 8080,
				oauthTokenData: { accessToken: 'token2' },
			},
		});

		// oauthTokenData is not synchable, so it's ignored in comparison
		expect(areSameCredentials(creds1, creds2)).toBe(true);
	});
});

describe('getCredentialSynchableData', () => {
	function createMockCredentials(data: ICredentialDataDecryptedObject): Credentials {
		const credentials = mock<Credentials>();
		credentials.getData.mockReturnValue(data);
		return credentials;
	}

	it('should preserve expressions', () => {
		const data = {
			apiKey: '={{ $json.key }}',
			host: '={{ $vars.host }}',
		};

		const result = getCredentialSynchableData(createMockCredentials(data));

		expect(result.apiKey).toBe('={{ $json.key }}');
		expect(result.host).toBe('={{ $vars.host }}');
	});

	it('should preserve numbers', () => {
		const data = {
			port: 8080,
			timeout: 30000,
			retries: 3,
		};

		const result = getCredentialSynchableData(createMockCredentials(data));

		expect(result.port).toBe(8080);
		expect(result.timeout).toBe(30000);
		expect(result.retries).toBe(3);
	});

	it('should omit plain strings (not synchable)', () => {
		const data = {
			apiKey: 'secret123',
			password: 'mypassword',
			token: 'bearer-token',
		};

		const result = getCredentialSynchableData(createMockCredentials(data));

		// Plain strings are not synchable, so they're omitted from the result
		expect(result.apiKey).toBeUndefined();
		expect(result.password).toBeUndefined();
		expect(result.token).toBeUndefined();
	});

	it('should recursively handle nested objects', () => {
		const data = {
			auth: {
				apiKey: 'secret',
				username: '={{ $vars.user }}',
			},
			config: {
				port: 443,
				timeout: 5000,
			},
		};

		const result = getCredentialSynchableData(createMockCredentials(data));

		expect(result.auth).toBeDefined();
		expect((result.auth as any).apiKey).toBeUndefined(); // Plain strings omitted
		expect((result.auth as any).username).toBe('={{ $vars.user }}');
		expect(result.config).toBeDefined();
		expect((result.config as any).port).toBe(443);
		expect((result.config as any).timeout).toBe(5000);
	});

	it('should omit null values and plain strings', () => {
		const data = {
			apiKey: 'secret',
			emptyField: null,
			port: 8080,
		} as any;

		const result = getCredentialSynchableData(createMockCredentials(data));

		expect(result.apiKey).toBeUndefined(); // Plain strings omitted
		expect(result.emptyField).toBeUndefined(); // Null values omitted
		expect(result.port).toBe(8080);
	});

	it('should recursively process arrays as objects and omit booleans', () => {
		const data = {
			apiKey: 'secret',
			enabled: true,
			tags: ['tag1', 'tag2'],
			port: 8080,
		};

		const result = getCredentialSynchableData(createMockCredentials(data));

		expect(result.apiKey).toBeUndefined(); // Plain strings omitted
		expect(result.enabled).toBeUndefined(); // Booleans omitted
		expect(result.tags).toBeDefined(); // Arrays are processed as objects
		expect(result.port).toBe(8080);
	});

	it('should handle mixed data types correctly', () => {
		const data = {
			host: 'localhost',
			port: 8080,
			expression: '={{ $json.value }}',
			enabled: true,
			tags: ['a', 'b'],
			nested: {
				apiKey: 'secret',
				timeout: 3000,
			},
		};

		const result = getCredentialSynchableData(createMockCredentials(data));

		expect(result.host).toBeUndefined(); // Plain strings omitted
		expect(result.port).toBe(8080);
		expect(result.expression).toBe('={{ $json.value }}');
		expect(result.enabled).toBeUndefined(); // Booleans omitted
		expect(result.tags).toBeDefined(); // Arrays processed as objects
		expect(result.nested).toBeDefined();
		expect((result.nested as any).apiKey).toBeUndefined(); // Plain strings omitted
		expect((result.nested as any).timeout).toBe(3000);
	});

	it('should exclude oauthTokenData', () => {
		const data = {
			apiKey: 'secret123',
			oauthTokenData: {
				accessToken: 'token123',
				refreshToken: 'refresh123',
			},
			port: 8080,
		};

		const result = getCredentialSynchableData(createMockCredentials(data));

		expect(result.apiKey).toBeUndefined(); // Plain strings omitted
		expect(result.oauthTokenData).toBeUndefined(); // Explicitly excluded
		expect(result.port).toBe(8080);
	});
});

describe('mergeCredentialData', () => {
	it('should merge expressions from remote and preserve local secrets', () => {
		const local = {
			apiKey: 'local-secret',
			host: 'localhost',
		};
		const remote = {
			apiKey: '={{ $json.key }}',
			// host is omitted from remote (plain strings not synchable)
		};

		const result = mergeRemoteCrendetialDataIntoLocalCredentialData({ local, remote });

		expect(result.apiKey).toBe('={{ $json.key }}'); // Expression from remote
		expect(result.host).toBe('localhost'); // Local value preserved
	});

	it('should merge numbers from remote', () => {
		const local = {
			port: 3000,
			timeout: 5000,
		};
		const remote = {
			port: 8080,
			timeout: 30000,
		};

		const result = mergeRemoteCrendetialDataIntoLocalCredentialData({ local, remote });

		expect(result.port).toBe(8080);
		expect(result.timeout).toBe(30000);
	});

	it('should preserve local secrets when remote omits plain strings', () => {
		const local = {
			apiKey: 'local-secret-123',
			password: 'local-password',
		};
		const remote = {
			// Plain strings not included in remote (not synchable)
		};

		const result = mergeRemoteCrendetialDataIntoLocalCredentialData({ local, remote });

		expect(result.apiKey).toBe('local-secret-123');
		expect(result.password).toBe('local-password');
	});

	it('should recursively merge nested objects', () => {
		const local = {
			auth: {
				apiKey: 'local-secret',
				username: 'user1',
			},
			config: {
				port: 3000,
			},
		};
		const remote = {
			auth: {
				apiKey: '={{ $vars.key }}',
				// username omitted (plain strings not synchable)
			},
			config: {
				port: 8080,
			},
		};

		const result = mergeRemoteCrendetialDataIntoLocalCredentialData({ local, remote });

		expect((result.auth as any).apiKey).toBe('={{ $vars.key }}'); // Expression from remote
		expect((result.auth as any).username).toBe('user1'); // Local value preserved
		expect((result.config as any).port).toBe(8080); // Number from remote
	});

	it('should merge arrays as objects and ignore booleans from remote', () => {
		const local = {
			apiKey: 'secret',
			port: 3000,
		};
		const remote = {
			// apiKey omitted (plain string not synchable)
			port: 8080,
			enabled: true, // Booleans not synchable, will be omitted by sanitize
			tags: ['tag1', 'tag2'], // Arrays processed as objects
		};

		const result = mergeRemoteCrendetialDataIntoLocalCredentialData({ local, remote });

		expect(result.apiKey).toBe('secret'); // Local preserved
		expect(result.port).toBe(8080); // Number from remote
		expect(result.enabled).toBeUndefined(); // Booleans not synchable
		expect(result.tags).toBeDefined(); // Arrays are merged as objects
	});

	it('should handle mismatched types (local string, remote object)', () => {
		const local = {
			config: 'simple-config',
			apiKey: 'secret',
		};
		const remote = {
			config: {
				port: 8080,
				timeout: 3000,
			},
		};

		const result = mergeRemoteCrendetialDataIntoLocalCredentialData({ local, remote });

		// Remote object overwrites local string
		expect(result.config).toBeDefined();
		expect((result.config as any).port).toBe(8080);
		expect((result.config as any).timeout).toBe(3000);
		expect(result.apiKey).toBe('secret'); // Local preserved
	});

	it('should handle null values in remote (sanitized away)', () => {
		const local = {
			apiKey: 'secret',
			port: 3000,
		};
		const remote = {
			// apiKey omitted (plain strings not synchable)
			nullField: null, // Will be omitted by sanitization
		} as any;

		const result = mergeRemoteCrendetialDataIntoLocalCredentialData({ local, remote });

		expect(result.apiKey).toBe('secret'); // Local preserved
		expect(result.nullField).toBeUndefined(); // Null values not synchable
		expect(result.port).toBe(3000); // Local preserved
	});

	it('should preserve local fields not in remote', () => {
		const local = {
			apiKey: 'secret',
			port: 3000,
			extraField: 'local-only',
		};
		const remote = {
			port: 8080,
			// Other fields omitted from remote
		};

		const result = mergeRemoteCrendetialDataIntoLocalCredentialData({ local, remote });

		expect(result.apiKey).toBe('secret'); // Local preserved
		expect(result.port).toBe(8080); // Merged from remote
		expect(result.extraField).toBe('local-only'); // Local preserved
	});
});

describe('getCredentialSynchableData + merge consistency', () => {
	function createMockCredentials(data: ICredentialDataDecryptedObject): Credentials {
		const credentials = mock<Credentials>();
		credentials.getData.mockReturnValue(data);
		return credentials;
	}

	it('should round-trip numbers correctly', () => {
		const original = {
			port: 8080,
			apiKey: 'secret123',
			timeout: 30000,
		};

		// Sanitize for export (simulates push to remote)
		const sanitized = getCredentialSynchableData(createMockCredentials(original));

		// Plain strings (apiKey) are omitted, numbers preserved
		expect(sanitized.port).toBe(8080);
		expect(sanitized.timeout).toBe(30000);
		expect(sanitized.apiKey).toBeUndefined();

		// Merge back (simulates pull from remote)
		const merged = mergeRemoteCrendetialDataIntoLocalCredentialData({
			local: original,
			remote: sanitized,
		});

		expect(merged.port).toBe(8080); // Number synced from remote
		expect(merged.timeout).toBe(30000); // Number synced from remote
		expect(merged.apiKey).toBe('secret123'); // Local secret preserved (not in remote)
	});

	it('should round-trip expressions correctly', () => {
		const original = {
			apiKey: '={{ $json.key }}',
			host: 'localhost',
		};

		// Sanitize for export
		const sanitized = getCredentialSynchableData(createMockCredentials(original));

		// Expressions preserved, plain strings omitted
		expect(sanitized.apiKey).toBe('={{ $json.key }}');
		expect(sanitized.host).toBeUndefined();

		// Merge back
		const merged = mergeRemoteCrendetialDataIntoLocalCredentialData({
			local: original,
			remote: sanitized,
		});

		expect(merged.apiKey).toBe('={{ $json.key }}'); // Expression synced from remote
		expect(merged.host).toBe('localhost'); // Local secret preserved (not in remote)
	});

	it('should round-trip nested objects correctly', () => {
		const original = {
			auth: {
				apiKey: 'secret',
				port: 443,
				expression: '={{ $vars.token }}',
			},
		};

		const sanitized = getCredentialSynchableData(createMockCredentials(original));
		const merged = mergeRemoteCrendetialDataIntoLocalCredentialData({
			local: original,
			remote: sanitized,
		});

		expect((merged.auth as any).apiKey).toBe('secret'); // Local secret preserved
		expect((merged.auth as any).port).toBe(443); // Number preserved
		expect((merged.auth as any).expression).toBe('={{ $vars.token }}'); // Expression preserved
	});

	it('should handle complete credential lifecycle', () => {
		const original = {
			host: 'api.example.com',
			port: 443,
			apiKey: 'secret-api-key',
			timeout: 30000,
			expression: '={{ $json.value }}',
			retries: 3,
		};

		// Step 1: Sanitize for export (simulate push)
		const sanitized = getCredentialSynchableData(createMockCredentials(original));
		expect(sanitized.host).toBeUndefined(); // Plain string omitted
		expect(sanitized.port).toBe(443); // Number kept
		expect(sanitized.apiKey).toBeUndefined(); // Secret omitted
		expect(sanitized.timeout).toBe(30000); // Number kept
		expect(sanitized.expression).toBe('={{ $json.value }}'); // Expression kept
		expect(sanitized.retries).toBe(3); // Number kept

		// Step 2: Merge sanitized data back (simulate pull)
		const merged = mergeRemoteCrendetialDataIntoLocalCredentialData({
			local: original,
			remote: sanitized,
		});
		expect(merged.host).toBe('api.example.com'); // Local secret preserved
		expect(merged.port).toBe(443); // Number synced
		expect(merged.apiKey).toBe('secret-api-key'); // Local secret preserved
		expect(merged.timeout).toBe(30000); // Number synced
		expect(merged.expression).toBe('={{ $json.value }}'); // Expression synced
		expect(merged.retries).toBe(3); // Number synced
	});
});
