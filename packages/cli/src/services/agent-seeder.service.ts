import { Logger } from '@n8n/backend-common';
import {
	GLOBAL_MEMBER_ROLE,
	ProjectRepository,
	SharedWorkflowRepository,
	UserRepository,
	WorkflowRepository,
} from '@n8n/db';
import { Service } from '@n8n/di';
import type { IConnections, INode } from 'n8n-workflow';
import { v4 as uuid } from 'uuid';

const AGENT_USERS = [
	{
		firstName: 'Docs Curator',
		lastName: '📚',
		email: 'agent-docs-curator@internal.n8n.local',
		role: 'Knowledge Base',
	},
	{
		firstName: 'Issue Triager',
		lastName: '🔍',
		email: 'agent-issue-triager@internal.n8n.local',
		role: 'Bug Analysis',
	},
	{
		firstName: 'QA Agent',
		lastName: '🤖',
		email: 'agent-qa@internal.n8n.local',
		role: 'Test Strategy',
	},
	{
		firstName: 'Messenger',
		lastName: '💬',
		email: 'agent-messenger@internal.n8n.local',
		role: 'Comms & Alerts',
	},
];

interface DemoWorkflow {
	name: string;
	nodes: INode[];
	connections: IConnections;
}

const QA_DEMO_WORKFLOWS: DemoWorkflow[] = [
	{
		name: 'Get Bug Count',
		nodes: [
			{
				id: uuid(),
				name: 'Manual Trigger',
				type: 'n8n-nodes-base.manualTrigger',
				typeVersion: 1,
				position: [0, 0],
				parameters: {},
			},
			{
				id: uuid(),
				name: 'Bug Count',
				type: 'n8n-nodes-base.code',
				typeVersion: 2,
				position: [220, 0],
				parameters: {
					jsCode: `// Simulated bug count from issue tracker
const bugs = {
  critical: Math.floor(Math.random() * 5),
  high: Math.floor(Math.random() * 12) + 3,
  medium: Math.floor(Math.random() * 25) + 8,
  low: Math.floor(Math.random() * 40) + 10,
};
bugs.total = bugs.critical + bugs.high + bugs.medium + bugs.low;
bugs.timestamp = new Date().toISOString();
return [{ json: bugs }];`,
				},
			},
		],
		connections: {
			'Manual Trigger': {
				main: [[{ node: 'Bug Count', type: 'main', index: 0 }]],
			},
		},
	},
	{
		name: 'Get CI Failures',
		nodes: [
			{
				id: uuid(),
				name: 'Manual Trigger',
				type: 'n8n-nodes-base.manualTrigger',
				typeVersion: 1,
				position: [0, 0],
				parameters: {},
			},
			{
				id: uuid(),
				name: 'CI Failures',
				type: 'n8n-nodes-base.code',
				typeVersion: 2,
				position: [220, 0],
				parameters: {
					jsCode: `// Simulated CI pipeline failures
const pipelines = ['unit-tests', 'integration-tests', 'e2e-tests', 'lint', 'typecheck', 'build'];
const failures = pipelines
  .filter(() => Math.random() > 0.6)
  .map(name => ({
    pipeline: name,
    branch: ['master', 'develop', 'feat/auth-rework'][Math.floor(Math.random() * 3)],
    failedAt: new Date(Date.now() - Math.floor(Math.random() * 86400000)).toISOString(),
    error: ['timeout', 'assertion failed', 'OOM killed', 'dependency error'][Math.floor(Math.random() * 4)],
  }));
return [{ json: { totalFailures: failures.length, failures, checkedAt: new Date().toISOString() } }];`,
				},
			},
		],
		connections: {
			'Manual Trigger': {
				main: [[{ node: 'CI Failures', type: 'main', index: 0 }]],
			},
		},
	},
	{
		name: 'Get Flaky Tests',
		nodes: [
			{
				id: uuid(),
				name: 'Manual Trigger',
				type: 'n8n-nodes-base.manualTrigger',
				typeVersion: 1,
				position: [0, 0],
				parameters: {},
			},
			{
				id: uuid(),
				name: 'Flaky Tests',
				type: 'n8n-nodes-base.code',
				typeVersion: 2,
				position: [220, 0],
				parameters: {
					jsCode: `// Simulated flaky test detection
const testSuites = ['auth.spec.ts', 'workflow.spec.ts', 'execution.spec.ts', 'api.spec.ts', 'nodes.spec.ts'];
const flakyTests = testSuites
  .filter(() => Math.random() > 0.5)
  .map(suite => ({
    suite,
    test: 'should ' + ['handle timeout', 'retry on failure', 'process webhook', 'validate input'][Math.floor(Math.random() * 4)],
    failRate: Math.floor(Math.random() * 30) + 5 + '%',
    lastFlake: new Date(Date.now() - Math.floor(Math.random() * 604800000)).toISOString(),
  }));
return [{ json: { flakyCount: flakyTests.length, tests: flakyTests, scannedAt: new Date().toISOString() } }];`,
				},
			},
		],
		connections: {
			'Manual Trigger': {
				main: [[{ node: 'Flaky Tests', type: 'main', index: 0 }]],
			},
		},
	},
];

const MESSENGER_DEMO_WORKFLOWS: DemoWorkflow[] = [
	{
		name: 'Send Team Alert',
		nodes: [
			{
				id: uuid(),
				name: 'Manual Trigger',
				type: 'n8n-nodes-base.manualTrigger',
				typeVersion: 1,
				position: [0, 0],
				parameters: {},
			},
			{
				id: uuid(),
				name: 'Send Alert',
				type: 'n8n-nodes-base.code',
				typeVersion: 2,
				position: [220, 0],
				parameters: {
					jsCode: `// Simulated team alert
const alert = {
  channel: '#engineering',
  message: $input.first().json.message ?? 'Alert from agent system',
  sentAt: new Date().toISOString(),
  status: 'delivered',
};
return [{ json: alert }];`,
				},
			},
		],
		connections: {
			'Manual Trigger': {
				main: [[{ node: 'Send Alert', type: 'main', index: 0 }]],
			},
		},
	},
];

@Service()
export class AgentSeederService {
	constructor(
		private readonly logger: Logger,
		private readonly userRepository: UserRepository,
		private readonly workflowRepository: WorkflowRepository,
		private readonly sharedWorkflowRepository: SharedWorkflowRepository,
		private readonly projectRepository: ProjectRepository,
	) {}

	async seed() {
		const existingAgents = await this.userRepository.find({ where: { type: 'agent' } });
		if (existingAgents.length === 0) {
			this.logger.info('Seeding agent users...');

			for (const agent of AGENT_USERS) {
				await this.userRepository.createUserWithProject({
					email: agent.email,
					firstName: agent.firstName,
					lastName: agent.lastName,
					password: null,
					type: 'agent',
					role: GLOBAL_MEMBER_ROLE,
				});
				this.logger.info(`Created agent user: ${agent.firstName}`);
			}

			this.logger.info(`Seeded ${AGENT_USERS.length} agent users`);
		} else {
			this.logger.debug(`Found ${existingAgents.length} agent users, skipping user seed`);
		}

		await this.seedQaWorkflows();
		await this.seedMessengerWorkflows();
	}

	private async seedQaWorkflows() {
		const qaUser = await this.userRepository.findOne({
			where: { email: 'agent-qa@internal.n8n.local' },
		});

		if (!qaUser) {
			this.logger.warn('QA Agent user not found, skipping workflow seed');
			return;
		}

		const qaProject = await this.projectRepository.getPersonalProjectForUser(qaUser.id);
		if (!qaProject) {
			this.logger.warn('QA Agent project not found, skipping workflow seed');
			return;
		}

		const existingWorkflows = await this.workflowRepository.find({
			where: QA_DEMO_WORKFLOWS.map((w) => ({ name: w.name })),
			select: ['name'],
		});
		const existingNames = new Set(existingWorkflows.map((w) => w.name));
		const toCreate = QA_DEMO_WORKFLOWS.filter((w) => !existingNames.has(w.name));

		if (toCreate.length === 0) {
			this.logger.debug('QA Agent demo workflows already exist, skipping');
			return;
		}

		this.logger.info(`Seeding ${toCreate.length} QA Agent demo workflows...`);

		for (const demo of toCreate) {
			const workflow = this.workflowRepository.create({
				name: demo.name,
				nodes: demo.nodes,
				connections: demo.connections,
				active: false,
				versionId: uuid(),
				settings: { executionOrder: 'v1' },
			});

			const saved = await this.workflowRepository.save(workflow);
			await this.sharedWorkflowRepository.makeOwner([saved.id], qaProject.id);
			this.logger.info(`Created demo workflow: ${demo.name} (${saved.id})`);
		}

		this.logger.info(`Seeded ${toCreate.length} demo workflows for QA Agent`);
	}

	private async seedMessengerWorkflows() {
		const messengerUser = await this.userRepository.findOne({
			where: { email: 'agent-messenger@internal.n8n.local' },
		});

		if (!messengerUser) {
			this.logger.warn('Messenger Agent user not found, skipping workflow seed');
			return;
		}

		const messengerProject = await this.projectRepository.getPersonalProjectForUser(
			messengerUser.id,
		);
		if (!messengerProject) {
			this.logger.warn('Messenger Agent project not found, skipping workflow seed');
			return;
		}

		const existingWorkflows = await this.workflowRepository.find({
			where: MESSENGER_DEMO_WORKFLOWS.map((w) => ({ name: w.name })),
			select: ['name'],
		});
		const existingNames = new Set(existingWorkflows.map((w) => w.name));
		const toCreate = MESSENGER_DEMO_WORKFLOWS.filter((w) => !existingNames.has(w.name));

		if (toCreate.length === 0) {
			this.logger.debug('Messenger Agent demo workflows already exist, skipping');
			return;
		}

		this.logger.info(`Seeding ${toCreate.length} Messenger Agent demo workflows...`);

		for (const demo of toCreate) {
			const workflow = this.workflowRepository.create({
				name: demo.name,
				nodes: demo.nodes,
				connections: demo.connections,
				active: false,
				versionId: uuid(),
				settings: { executionOrder: 'v1' },
			});

			const saved = await this.workflowRepository.save(workflow);
			await this.sharedWorkflowRepository.makeOwner([saved.id], messengerProject.id);
			this.logger.info(`Created demo workflow: ${demo.name} (${saved.id})`);
		}

		this.logger.info(`Seeded ${toCreate.length} demo workflows for Messenger Agent`);
	}
}
