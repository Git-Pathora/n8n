import { Logger } from '@n8n/backend-common';
import { mockInstance } from '@n8n/backend-test-utils';
import { Container } from '@n8n/di';
import { MessageEventBusDestinationTypeNames } from 'n8n-workflow';
import type { MessageEventBusDestinationDatabaseOptions } from 'n8n-workflow';
import { mock } from 'jest-mock-extended';
import { DateTime } from 'luxon';

import { EventMessageGeneric } from '@/eventbus/event-message-classes/event-message-generic';
import type {
	MessageEventBus,
	MessageWithCallback,
} from '@/eventbus/message-event-bus/message-event-bus';

import type { AuditLog } from '../../database/entities/audit-log.entity';
import { AuditLogRepository } from '../../database/repositories/audit-log.repository';
import {
	isMessageEventBusDestinationDatabaseOptions,
	MessageEventBusDestinationDatabase,
} from '../message-event-bus-destination-database.ee';

describe('MessageEventBusDestinationDatabase', () => {
	mockInstance(Logger);

	const mockEventBus = {} as MessageEventBus;
	const mockAuditLogRepository = mock<AuditLogRepository>();

	beforeEach(() => {
		jest.clearAllMocks();
		Container.set(AuditLogRepository, mockAuditLogRepository);
	});

	describe('isMessageEventBusDestinationDatabaseOptions', () => {
		it('should identify valid database options', () => {
			const validOptions: MessageEventBusDestinationDatabaseOptions = {
				__type: MessageEventBusDestinationTypeNames.database,
				label: 'Test Database',
				enabled: true,
				subscribedEvents: ['n8n.audit.*'],
				credentials: {},
				anonymizeAuditMessages: false,
			};

			expect(isMessageEventBusDestinationDatabaseOptions(validOptions)).toBe(true);
		});

		it('should reject invalid options', () => {
			expect(isMessageEventBusDestinationDatabaseOptions({})).toBe(false);
			expect(isMessageEventBusDestinationDatabaseOptions(null)).toBe(false);
			expect(isMessageEventBusDestinationDatabaseOptions({ label: 'test' })).toBe(false);
			expect(
				isMessageEventBusDestinationDatabaseOptions({
					__type: MessageEventBusDestinationTypeNames.webhook,
				}),
			).toBe(false);
		});

		it('should reject undefined', () => {
			expect(isMessageEventBusDestinationDatabaseOptions(undefined)).toBe(false);
		});
	});

	describe('constructor', () => {
		it('should initialize with default values when not provided', () => {
			const options: MessageEventBusDestinationDatabaseOptions = {
				__type: MessageEventBusDestinationTypeNames.database,
			};

			const destination = new MessageEventBusDestinationDatabase(mockEventBus, options);

			expect(destination.label).toBe('Local Database');
			expect(destination.__type).toBe(MessageEventBusDestinationTypeNames.database);
		});

		it('should use provided label', () => {
			const options: MessageEventBusDestinationDatabaseOptions = {
				__type: MessageEventBusDestinationTypeNames.database,
				label: 'Custom Database Label',
			};

			const destination = new MessageEventBusDestinationDatabase(mockEventBus, options);

			expect(destination.label).toBe('Custom Database Label');
		});

		it('should initialize audit log repository from container', () => {
			const options: MessageEventBusDestinationDatabaseOptions = {
				__type: MessageEventBusDestinationTypeNames.database,
			};

			new MessageEventBusDestinationDatabase(mockEventBus, options);

			expect(Container.get(AuditLogRepository)).toBe(mockAuditLogRepository);
		});
	});

	describe('receiveFromEventBus', () => {
		it('should save audit log with message payload', async () => {
			const validDestinationId = '12345678-1234-1234-1234-123456789abc';
			const options: MessageEventBusDestinationDatabaseOptions = {
				__type: MessageEventBusDestinationTypeNames.database,
				id: validDestinationId,
				label: 'Test Database',
				enabled: true,
				subscribedEvents: ['*'],
				anonymizeAuditMessages: false,
			};

			const destination = new MessageEventBusDestinationDatabase(mockEventBus, options);

			const mockMessage = new EventMessageGeneric({
				eventName: 'n8n.audit.user.login.success',
				message: 'User logged in',
			});
			mockMessage.payload = {
				userId: 'user-123',
				email: 'test@example.com',
			};

			const confirmCallback = jest.fn();
			const emitterPayload: MessageWithCallback = {
				msg: mockMessage,
				confirmCallback,
			};

			mockAuditLogRepository.save.mockResolvedValue({} as AuditLog);

			const result = await destination.receiveFromEventBus(emitterPayload);

			expect(result).toBe(true);
			expect(mockAuditLogRepository.save).toHaveBeenCalledWith(
				expect.objectContaining({
					eventName: 'n8n.audit.user.login.success',
					message: 'User logged in',
					userId: 'user-123',
					payload: {
						userId: 'user-123',
						email: 'test@example.com',
					},
				}),
			);
			expect(confirmCallback).toHaveBeenCalledWith(mockMessage, {
				id: validDestinationId,
				name: 'Test Database',
			});
		});

		it('should save audit log with anonymized payload when anonymization is enabled', async () => {
			const validDestinationId = '22345678-1234-1234-1234-123456789abc';
			const options: MessageEventBusDestinationDatabaseOptions = {
				__type: MessageEventBusDestinationTypeNames.database,
				id: validDestinationId,
				label: 'Test Database',
				enabled: true,
				subscribedEvents: ['*'],
				anonymizeAuditMessages: true,
			};

			const destination = new MessageEventBusDestinationDatabase(mockEventBus, options);

			const mockMessage = new EventMessageGeneric({
				eventName: 'n8n.audit.user.login.success',
				message: 'User logged in',
			});
			mockMessage.payload = {
				userId: 'user-123',
				email: 'test@example.com',
			};

			const anonymizedPayload = { userId: 'anonymized-user' };
			jest.spyOn(mockMessage, 'anonymize').mockReturnValue(anonymizedPayload);

			const confirmCallback = jest.fn();
			const emitterPayload: MessageWithCallback = {
				msg: mockMessage,
				confirmCallback,
			};

			mockAuditLogRepository.save.mockResolvedValue({} as AuditLog);

			await destination.receiveFromEventBus(emitterPayload);

			expect(mockMessage.anonymize).toHaveBeenCalled();
			expect(mockAuditLogRepository.save).toHaveBeenCalledWith(
				expect.objectContaining({
					payload: anonymizedPayload,
				}),
			);
		});

		it('should extract userId from payload.userId', async () => {
			const options: MessageEventBusDestinationDatabaseOptions = {
				__type: MessageEventBusDestinationTypeNames.database,
				enabled: true,
				subscribedEvents: ['*'],
				anonymizeAuditMessages: false,
			};

			const destination = new MessageEventBusDestinationDatabase(mockEventBus, options);

			const mockMessage = new EventMessageGeneric({
				eventName: 'n8n.audit.workflow.created',
			});
			mockMessage.payload = {
				userId: 'user-456',
				workflowId: 'workflow-123',
			};

			const emitterPayload: MessageWithCallback = {
				msg: mockMessage,
				confirmCallback: jest.fn(),
			};

			mockAuditLogRepository.save.mockResolvedValue({} as AuditLog);

			await destination.receiveFromEventBus(emitterPayload);

			expect(mockAuditLogRepository.save).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 'user-456',
				}),
			);
		});

		it('should extract userId from payload.user.id', async () => {
			const options: MessageEventBusDestinationDatabaseOptions = {
				__type: MessageEventBusDestinationTypeNames.database,
				enabled: true,
				subscribedEvents: ['*'],
				anonymizeAuditMessages: false,
			};

			const destination = new MessageEventBusDestinationDatabase(mockEventBus, options);

			const mockMessage = new EventMessageGeneric({
				eventName: 'n8n.audit.workflow.created',
			});
			mockMessage.payload = {
				user: {
					id: 'user-789',
					email: 'user@example.com',
				},
				workflowId: 'workflow-123',
			};

			const emitterPayload: MessageWithCallback = {
				msg: mockMessage,
				confirmCallback: jest.fn(),
			};

			mockAuditLogRepository.save.mockResolvedValue({} as AuditLog);

			await destination.receiveFromEventBus(emitterPayload);

			expect(mockAuditLogRepository.save).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 'user-789',
				}),
			);
		});

		it('should set userId to null when not found in payload', async () => {
			const options: MessageEventBusDestinationDatabaseOptions = {
				__type: MessageEventBusDestinationTypeNames.database,
				enabled: true,
				subscribedEvents: ['*'],
				anonymizeAuditMessages: false,
			};

			const destination = new MessageEventBusDestinationDatabase(mockEventBus, options);

			const mockMessage = new EventMessageGeneric({
				eventName: 'n8n.worker.started',
			});
			mockMessage.payload = {
				systemInfo: 'some data',
			};

			const emitterPayload: MessageWithCallback = {
				msg: mockMessage,
				confirmCallback: jest.fn(),
			};

			mockAuditLogRepository.save.mockResolvedValue({} as AuditLog);

			await destination.receiveFromEventBus(emitterPayload);

			expect(mockAuditLogRepository.save).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: null,
				}),
			);
		});

		it('should use eventName as message when message is not provided', async () => {
			const options: MessageEventBusDestinationDatabaseOptions = {
				__type: MessageEventBusDestinationTypeNames.database,
				enabled: true,
				subscribedEvents: ['*'],
				anonymizeAuditMessages: false,
			};

			const destination = new MessageEventBusDestinationDatabase(mockEventBus, options);

			const mockMessage = new EventMessageGeneric({
				eventName: 'n8n.audit.workflow.deleted',
			});
			mockMessage.payload = {};
			// Ensure message is undefined/null
			(mockMessage as any).message = undefined;

			const emitterPayload: MessageWithCallback = {
				msg: mockMessage,
				confirmCallback: jest.fn(),
			};

			mockAuditLogRepository.save.mockResolvedValue({} as AuditLog);

			await destination.receiveFromEventBus(emitterPayload);

			expect(mockAuditLogRepository.save).toHaveBeenCalledWith(
				expect.objectContaining({
					eventName: 'n8n.audit.workflow.deleted',
					message: 'n8n.audit.workflow.deleted',
				}),
			);
		});

		it('should handle timestamp conversion correctly', async () => {
			const options: MessageEventBusDestinationDatabaseOptions = {
				__type: MessageEventBusDestinationTypeNames.database,
				enabled: true,
				subscribedEvents: ['*'],
				anonymizeAuditMessages: false,
			};

			const destination = new MessageEventBusDestinationDatabase(mockEventBus, options);

			const testDate = DateTime.fromISO('2024-01-15T10:30:00.000Z');
			const mockMessage = new EventMessageGeneric({
				eventName: 'n8n.worker.stopped',
			});
			mockMessage.payload = {};
			(mockMessage as any).ts = testDate;

			const emitterPayload: MessageWithCallback = {
				msg: mockMessage,
				confirmCallback: jest.fn(),
			};

			mockAuditLogRepository.save.mockResolvedValue({} as AuditLog);

			await destination.receiveFromEventBus(emitterPayload);

			expect(mockAuditLogRepository.save).toHaveBeenCalledWith(
				expect.objectContaining({
					timestamp: testDate.toJSDate(),
				}),
			);
		});

		it('should generate UUID for audit log id', async () => {
			const options: MessageEventBusDestinationDatabaseOptions = {
				__type: MessageEventBusDestinationTypeNames.database,
				enabled: true,
				subscribedEvents: ['*'],
				anonymizeAuditMessages: false,
			};

			const destination = new MessageEventBusDestinationDatabase(mockEventBus, options);

			const mockMessage = new EventMessageGeneric({
				eventName: 'n8n.worker.stopped',
			});
			mockMessage.payload = {};

			const emitterPayload: MessageWithCallback = {
				msg: mockMessage,
				confirmCallback: jest.fn(),
			};

			mockAuditLogRepository.save.mockResolvedValue({} as AuditLog);

			await destination.receiveFromEventBus(emitterPayload);

			const savedAuditLog = mockAuditLogRepository.save.mock.calls[0][0] as AuditLog;
			expect(savedAuditLog.id).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
			);
		});

		it('should handle empty payload gracefully', async () => {
			const options: MessageEventBusDestinationDatabaseOptions = {
				__type: MessageEventBusDestinationTypeNames.database,
				enabled: true,
				subscribedEvents: ['*'],
				anonymizeAuditMessages: false,
			};

			const destination = new MessageEventBusDestinationDatabase(mockEventBus, options);

			const mockMessage = new EventMessageGeneric({
				eventName: 'n8n.worker.stopped',
			});
			mockMessage.payload = undefined as any;

			const emitterPayload: MessageWithCallback = {
				msg: mockMessage,
				confirmCallback: jest.fn(),
			};

			mockAuditLogRepository.save.mockResolvedValue({} as AuditLog);

			await destination.receiveFromEventBus(emitterPayload);

			expect(mockAuditLogRepository.save).toHaveBeenCalledWith(
				expect.objectContaining({
					payload: {},
				}),
			);
		});
	});

	describe('serialize', () => {
		it('should serialize to database options', () => {
			const validId = '33345678-1234-1234-1234-123456789abc';
			const options: MessageEventBusDestinationDatabaseOptions = {
				__type: MessageEventBusDestinationTypeNames.database,
				id: validId,
				label: 'Production Database',
				enabled: true,
				subscribedEvents: ['n8n.audit.*'],
				credentials: {},
				anonymizeAuditMessages: true,
			};

			const destination = new MessageEventBusDestinationDatabase(mockEventBus, options);
			const serialized = destination.serialize();

			expect(serialized).toEqual({
				__type: MessageEventBusDestinationTypeNames.database,
				id: validId,
				label: 'Production Database',
				enabled: true,
				subscribedEvents: ['n8n.audit.*'],
				anonymizeAuditMessages: true,
			});
		});
	});

	describe('deserialize', () => {
		it('should deserialize valid database options', () => {
			const validId = '44345678-1234-1234-1234-123456789abc';
			const validOptions: MessageEventBusDestinationDatabaseOptions = {
				__type: MessageEventBusDestinationTypeNames.database,
				id: validId,
				label: 'Test Database',
				enabled: true,
				subscribedEvents: ['n8n.audit.*'],
				credentials: {},
				anonymizeAuditMessages: false,
			};

			const destination = MessageEventBusDestinationDatabase.deserialize(
				mockEventBus,
				validOptions,
			);

			expect(destination).toBeInstanceOf(MessageEventBusDestinationDatabase);
			expect(destination?.label).toBe('Test Database');
			expect(destination?.getId()).toBe(validId);
		});

		it('should return null for invalid data without __type', () => {
			const invalidOptions = {
				id: 'database-1',
				label: 'Test',
			} as any;

			const destination = MessageEventBusDestinationDatabase.deserialize(
				mockEventBus,
				invalidOptions,
			);

			expect(destination).toBeNull();
		});

		it('should return null for wrong destination type', () => {
			const invalidOptions = {
				__type: MessageEventBusDestinationTypeNames.webhook,
				id: 'webhook-1',
			} as any;

			const destination = MessageEventBusDestinationDatabase.deserialize(
				mockEventBus,
				invalidOptions,
			);

			expect(destination).toBeNull();
		});

		it('should return null for invalid options that fail type guard', () => {
			const invalidOptions = {
				__type: 'not-a-valid-type',
				id: 'test-1',
			} as any;

			const destination = MessageEventBusDestinationDatabase.deserialize(
				mockEventBus,
				invalidOptions,
			);

			expect(destination).toBeNull();
		});
	});

	describe('toString', () => {
		it('should return JSON string of serialized destination', () => {
			const validId = '55345678-1234-1234-1234-123456789abc';
			const options: MessageEventBusDestinationDatabaseOptions = {
				__type: MessageEventBusDestinationTypeNames.database,
				id: validId,
				label: 'Test Database',
				enabled: true,
				subscribedEvents: ['*'],
				credentials: {},
				anonymizeAuditMessages: false,
			};

			const destination = new MessageEventBusDestinationDatabase(mockEventBus, options);
			const str = destination.toString();

			expect(str).toBe(JSON.stringify(destination.serialize()));
			expect(() => JSON.parse(str)).not.toThrow();

			const parsed = JSON.parse(str);
			expect(parsed.__type).toBe(MessageEventBusDestinationTypeNames.database);
			expect(parsed.label).toBe('Test Database');
		});
	});

	describe('extractUserId', () => {
		it('should return null when payload.user.id is not a string', async () => {
			const options: MessageEventBusDestinationDatabaseOptions = {
				__type: MessageEventBusDestinationTypeNames.database,
				enabled: true,
				subscribedEvents: ['*'],
				anonymizeAuditMessages: false,
			};

			const destination = new MessageEventBusDestinationDatabase(mockEventBus, options);

			const mockMessage = new EventMessageGeneric({
				eventName: 'n8n.worker.stopped',
			});
			mockMessage.payload = {
				user: {
					id: 12345, // number instead of string
				},
			};

			const emitterPayload: MessageWithCallback = {
				msg: mockMessage,
				confirmCallback: jest.fn(),
			};

			mockAuditLogRepository.save.mockResolvedValue({} as AuditLog);

			await destination.receiveFromEventBus(emitterPayload);

			expect(mockAuditLogRepository.save).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: null,
				}),
			);
		});

		it('should return null when payload.user exists but has no id', async () => {
			const options: MessageEventBusDestinationDatabaseOptions = {
				__type: MessageEventBusDestinationTypeNames.database,
				enabled: true,
				subscribedEvents: ['*'],
				anonymizeAuditMessages: false,
			};

			const destination = new MessageEventBusDestinationDatabase(mockEventBus, options);

			const mockMessage = new EventMessageGeneric({
				eventName: 'n8n.worker.stopped',
			});
			mockMessage.payload = {
				user: {
					name: 'Test User',
				},
			};

			const emitterPayload: MessageWithCallback = {
				msg: mockMessage,
				confirmCallback: jest.fn(),
			};

			mockAuditLogRepository.save.mockResolvedValue({} as AuditLog);

			await destination.receiveFromEventBus(emitterPayload);

			expect(mockAuditLogRepository.save).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: null,
				}),
			);
		});

		it('should prioritize payload.userId over payload.user.id', async () => {
			const options: MessageEventBusDestinationDatabaseOptions = {
				__type: MessageEventBusDestinationTypeNames.database,
				enabled: true,
				subscribedEvents: ['*'],
				anonymizeAuditMessages: false,
			};

			const destination = new MessageEventBusDestinationDatabase(mockEventBus, options);

			const mockMessage = new EventMessageGeneric({
				eventName: 'n8n.worker.stopped',
			});
			mockMessage.payload = {
				userId: 'direct-user-id',
				user: {
					id: 'nested-user-id',
				},
			};

			const emitterPayload: MessageWithCallback = {
				msg: mockMessage,
				confirmCallback: jest.fn(),
			};

			mockAuditLogRepository.save.mockResolvedValue({} as AuditLog);

			await destination.receiveFromEventBus(emitterPayload);

			expect(mockAuditLogRepository.save).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 'direct-user-id',
				}),
			);
		});
	});
});
