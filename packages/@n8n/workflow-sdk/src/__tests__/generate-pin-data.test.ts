import { workflow } from '../workflow-builder';
import { node, trigger, newCredential } from '../node-builder';

describe('generatePinData', () => {
	describe('basic behavior', () => {
		it('returns this for chaining', () => {
			const wf = workflow('id', 'Test');
			const result = wf.generatePinData();
			expect(result).toBe(wf);
		});

		it('does not generate pin data for nodes without output declaration', () => {
			const wf = workflow('id', 'Test')
				.add(
					node({
						type: 'n8n-nodes-base.httpRequest',
						version: 4,
						config: { name: 'HTTP' },
					}),
				)
				.generatePinData();

			const json = wf.toJSON();
			expect(json.pinData?.['HTTP']).toBeUndefined();
		});

		it('does not generate pin data for nodes with empty output array', () => {
			const wf = workflow('id', 'Test')
				.add(
					node({
						type: 'n8n-nodes-base.httpRequest',
						version: 4,
						config: { name: 'HTTP' },
						output: [],
					}),
				)
				.generatePinData();

			const json = wf.toJSON();
			expect(json.pinData?.['HTTP']).toBeUndefined();
		});
	});

	describe('nodes with newCredential()', () => {
		it('generates pin data for nodes with newCredential()', () => {
			const outputData = [{ id: 'channel-1', name: 'general' }];

			const wf = workflow('id', 'Test')
				.add(
					trigger({
						type: 'n8n-nodes-base.manualTrigger',
						version: 1,
						config: { name: 'Start' },
					}),
				)
				.then(
					node({
						type: 'n8n-nodes-base.slack',
						version: 2,
						config: {
							name: 'Slack',
							parameters: { resource: 'channel', operation: 'get' },
							credentials: { slackApi: newCredential('My Slack') },
						},
						output: outputData,
					}),
				)
				.generatePinData();

			const json = wf.toJSON();
			expect(json.pinData).toBeDefined();
			expect(json.pinData!['Slack']).toEqual(outputData);
		});

		it('preserves all items from output declaration', () => {
			const outputData = [
				{ id: 'channel-1', name: 'general' },
				{ id: 'channel-2', name: 'random' },
				{ id: 'channel-3', name: 'support' },
			];

			const wf = workflow('id', 'Test')
				.add(
					node({
						type: 'n8n-nodes-base.slack',
						version: 2,
						config: {
							name: 'Slack',
							parameters: { resource: 'channel', operation: 'getAll' },
							credentials: { slackApi: newCredential('My Slack') },
						},
						output: outputData,
					}),
				)
				.generatePinData();

			const json = wf.toJSON();
			expect(json.pinData!['Slack']).toHaveLength(3);
			expect(json.pinData!['Slack']).toEqual(outputData);
		});
	});

	describe('HTTP Request and Webhook nodes', () => {
		it('generates pin data for HTTP Request nodes without newCredential()', () => {
			const outputData = [{ response: 'data' }];

			const wf = workflow('id', 'Test')
				.add(
					node({
						type: 'n8n-nodes-base.httpRequest',
						version: 4,
						config: { name: 'HTTP Request' },
						output: outputData,
					}),
				)
				.generatePinData();

			const json = wf.toJSON();
			expect(json.pinData!['HTTP Request']).toEqual(outputData);
		});

		it('generates pin data for Webhook trigger nodes without newCredential()', () => {
			const outputData = [{ amount: 500, description: 'Test purchase' }];

			const wf = workflow('id', 'Test')
				.add(
					trigger({
						type: 'n8n-nodes-base.webhook',
						version: 2,
						config: { name: 'Webhook' },
						output: outputData,
					}),
				)
				.generatePinData();

			const json = wf.toJSON();
			expect(json.pinData!['Webhook']).toEqual(outputData);
		});
	});

	describe('skipping nodes without newCredential() and not HTTP Request/Webhook', () => {
		it('does not generate pin data for nodes with existing credentials (not newCredential)', () => {
			const wf = workflow('id', 'Test')
				.add(
					node({
						type: 'n8n-nodes-base.slack',
						version: 2,
						config: {
							name: 'Slack',
							credentials: { slackApi: { id: '1', name: 'Existing Slack' } },
						},
						output: [{ id: 'cred' }],
					}),
				)
				.generatePinData();

			const json = wf.toJSON();
			expect(json.pinData?.['Slack']).toBeUndefined();
		});

		it('does not generate pin data for nodes without any credentials', () => {
			const wf = workflow('id', 'Test')
				.add(
					node({
						type: 'n8n-nodes-base.code',
						version: 2,
						config: { name: 'Code' },
						output: [{ result: 'value' }],
					}),
				)
				.generatePinData();

			const json = wf.toJSON();
			expect(json.pinData?.['Code']).toBeUndefined();
		});
	});

	describe('skipping nodes that exist in beforeWorkflow', () => {
		it('only generates for nodes not in the before workflow', () => {
			const beforeWorkflow = {
				name: 'Before',
				nodes: [
					{
						id: '1',
						name: 'Existing Node',
						type: 'n8n-nodes-base.slack',
						typeVersion: 2,
						position: [0, 0] as [number, number],
						parameters: {},
					},
				],
				connections: {},
			};

			const wf = workflow('id', 'Test')
				.add(
					node({
						type: 'n8n-nodes-base.slack',
						version: 2,
						config: {
							name: 'Existing Node',
							credentials: { slackApi: newCredential('New Slack') },
						},
						output: [{ id: 'existing' }],
					}),
				)
				.then(
					node({
						type: 'n8n-nodes-base.slack',
						version: 2,
						config: {
							name: 'New Node',
							credentials: { slackApi: newCredential('Another Slack') },
						},
						output: [{ id: 'new' }],
					}),
				)
				.generatePinData({ beforeWorkflow });

			const json = wf.toJSON();
			expect(json.pinData?.['Existing Node']).toBeUndefined();
			expect(json.pinData!['New Node']).toEqual([{ id: 'new' }]);
		});
	});

	describe('skipping nodes that already have pin data', () => {
		it('does not overwrite existing pin data', () => {
			const originalPinData = [{ original: 'data' }];
			const newOutputData = [{ new: 'data' }];

			const wf = workflow('id', 'Test')
				.add(
					node({
						type: 'n8n-nodes-base.slack',
						version: 2,
						config: {
							name: 'Slack',
							credentials: { slackApi: newCredential('My Slack') },
							pinData: originalPinData,
						},
						output: newOutputData,
					}),
				)
				.generatePinData();

			const json = wf.toJSON();
			// Should keep the original pin data, not overwrite with output
			expect(json.pinData!['Slack']).toEqual(originalPinData);
		});
	});

	describe('combining conditions', () => {
		it('only generates for new nodes with newCredential() or HTTP Request/Webhook', () => {
			const beforeWorkflow = {
				name: 'Before',
				nodes: [
					{
						id: '1',
						name: 'Old Slack',
						type: 'n8n-nodes-base.slack',
						typeVersion: 2,
						position: [0, 0] as [number, number],
						parameters: {},
					},
				],
				connections: {},
			};

			const wf = workflow('id', 'Test')
				.add(
					node({
						type: 'n8n-nodes-base.slack',
						version: 2,
						config: {
							name: 'Old Slack',
							credentials: { slackApi: newCredential('My Slack') },
						},
						output: [{ id: 'old' }],
					}),
				)
				.then(
					node({
						type: 'n8n-nodes-base.slack',
						version: 2,
						config: {
							name: 'New With Existing Creds',
							credentials: { slackApi: { id: '1', name: 'Slack' } },
						},
						output: [{ id: 'existing-creds' }],
					}),
				)
				.then(
					node({
						type: 'n8n-nodes-base.slack',
						version: 2,
						config: {
							name: 'New With NewCredential',
							credentials: { slackApi: newCredential('Fresh Slack') },
						},
						output: [{ id: 'new-creds' }],
					}),
				)
				.then(
					node({
						type: 'n8n-nodes-base.httpRequest',
						version: 4,
						config: { name: 'HTTP Request' },
						output: [{ id: 'http' }],
					}),
				)
				.then(
					node({
						type: 'n8n-nodes-base.code',
						version: 2,
						config: { name: 'Code Node' },
						output: [{ id: 'code' }],
					}),
				)
				.generatePinData({ beforeWorkflow });

			const json = wf.toJSON();
			// Old Slack: filtered out by beforeWorkflow
			expect(json.pinData?.['Old Slack']).toBeUndefined();
			// New With Existing Creds: filtered out (no newCredential, not HTTP/Webhook)
			expect(json.pinData?.['New With Existing Creds']).toBeUndefined();
			// New With NewCredential: passes (has newCredential)
			expect(json.pinData!['New With NewCredential']).toEqual([{ id: 'new-creds' }]);
			// HTTP Request: passes (is HTTP Request type)
			expect(json.pinData!['HTTP Request']).toEqual([{ id: 'http' }]);
			// Code Node: filtered out (no newCredential, not HTTP/Webhook)
			expect(json.pinData?.['Code Node']).toBeUndefined();
		});
	});

	describe('deterministic output', () => {
		it('produces same pinData when nodes have same output declarations', () => {
			const outputData = [{ id: 'test-123' }];

			const wf1 = workflow('id', 'Test')
				.add(
					node({
						type: 'n8n-nodes-base.slack',
						version: 2,
						config: {
							name: 'Slack',
							credentials: { slackApi: newCredential('My Slack') },
						},
						output: outputData,
					}),
				)
				.generatePinData();

			const wf2 = workflow('id', 'Test')
				.add(
					node({
						type: 'n8n-nodes-base.slack',
						version: 2,
						config: {
							name: 'Slack',
							credentials: { slackApi: newCredential('My Slack') },
						},
						output: outputData,
					}),
				)
				.generatePinData();

			expect(wf1.toJSON().pinData).toEqual(wf2.toJSON().pinData);
		});
	});
});
