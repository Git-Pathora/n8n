import type { AuthenticatedRequest } from '@n8n/db';
import { mock } from 'jest-mock-extended';

import type { AuditLog } from '../database/entities';
import { AuditLogController } from '../audit-log.controller';
import type { AuditLogService } from '../audit-log.service';

describe('AuditLogController', () => {
	const auditLogService = mock<AuditLogService>();

	let controller: AuditLogController;

	beforeEach(() => {
		jest.clearAllMocks();
		controller = new AuditLogController(auditLogService);
	});

	describe('getEvents', () => {
		const mockAuditLog = {
			id: 'audit-1',
			eventName: 'n8n.audit.workflow.created',
			message: 'Workflow created',
			userId: 'user-1',
			timestamp: new Date('2024-01-01T10:00:00.000Z'),
			payload: { workflowId: 'workflow-123' },
			createdAt: new Date('2024-01-01T10:00:00.000Z'),
			updatedAt: new Date('2024-01-01T10:00:00.000Z'),
		} as unknown as AuditLog;

		const mockAuditLog2 = {
			id: 'audit-2',
			eventName: 'n8n.audit.workflow.updated',
			message: 'Workflow updated',
			userId: null,
			timestamp: new Date('2024-01-02T10:00:00.000Z'),
			payload: { workflowId: 'workflow-456' },
			createdAt: new Date('2024-01-02T10:00:00.000Z'),
			updatedAt: new Date('2024-01-02T10:00:00.000Z'),
		} as unknown as AuditLog;

		it('should return events with no filters', async () => {
			auditLogService.getEvents.mockResolvedValue([mockAuditLog, mockAuditLog2]);

			const req = mock<AuthenticatedRequest>();
			const result = await controller.getEvents(req, {}, {});

			expect(result).toHaveLength(2);
			expect(result[0].id).toBe('audit-1');
			expect(result[0].eventName).toBe('n8n.audit.workflow.created');
			expect(result[1].id).toBe('audit-2');
			expect(result[1].eventName).toBe('n8n.audit.workflow.updated');
			expect(auditLogService.getEvents).toHaveBeenCalledWith({});
		});

		it('should pass eventName filter to service', async () => {
			auditLogService.getEvents.mockResolvedValue([mockAuditLog]);

			const req = mock<AuthenticatedRequest>();
			const result = await controller.getEvents(
				req,
				{},
				{ eventName: 'n8n.audit.workflow.created' },
			);

			expect(result).toHaveLength(1);
			expect(result[0].eventName).toBe('n8n.audit.workflow.created');
			expect(auditLogService.getEvents).toHaveBeenCalledWith({
				eventName: 'n8n.audit.workflow.created',
			});
		});

		it('should pass userId filter to service', async () => {
			auditLogService.getEvents.mockResolvedValue([mockAuditLog]);

			const req = mock<AuthenticatedRequest>();
			const result = await controller.getEvents(req, {}, { userId: 'user-1' });

			expect(result).toHaveLength(1);
			expect(auditLogService.getEvents).toHaveBeenCalledWith({ userId: 'user-1' });
		});

		it('should pass after filter to service', async () => {
			auditLogService.getEvents.mockResolvedValue([mockAuditLog2]);

			const req = mock<AuthenticatedRequest>();
			const after = '2024-01-01T12:00:00.000Z';
			const result = await controller.getEvents(req, {}, { after });

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('audit-2');
			expect(auditLogService.getEvents).toHaveBeenCalledWith({ after });
		});

		it('should pass before filter to service', async () => {
			auditLogService.getEvents.mockResolvedValue([mockAuditLog]);

			const req = mock<AuthenticatedRequest>();
			const before = '2024-01-02T00:00:00.000Z';
			const result = await controller.getEvents(req, {}, { before });

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('audit-1');
			expect(auditLogService.getEvents).toHaveBeenCalledWith({ before });
		});

		it('should pass all filters to service', async () => {
			auditLogService.getEvents.mockResolvedValue([mockAuditLog]);

			const req = mock<AuthenticatedRequest>();
			const query = {
				eventName: 'n8n.audit.workflow.created',
				userId: 'user-1',
				after: '2023-12-31T00:00:00.000Z',
				before: '2024-01-02T00:00:00.000Z',
			};
			const result = await controller.getEvents(req, {}, query);

			expect(result).toHaveLength(1);
			expect(auditLogService.getEvents).toHaveBeenCalledWith(query);
		});

		it('should return empty array when no events found', async () => {
			auditLogService.getEvents.mockResolvedValue([]);

			const req = mock<AuthenticatedRequest>();
			const result = await controller.getEvents(req, {}, {});

			expect(result).toHaveLength(0);
			expect(auditLogService.getEvents).toHaveBeenCalledWith({});
		});

		it('should parse events through auditLogEvent schema and strip extra fields', async () => {
			auditLogService.getEvents.mockResolvedValue([mockAuditLog]);

			const req = mock<AuthenticatedRequest>();
			const result = await controller.getEvents(req, {}, {});

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveProperty('id');
			expect(result[0]).toHaveProperty('eventName');
			expect(result[0]).toHaveProperty('timestamp');
			expect(result[0]).toHaveProperty('payload');
			expect(result[0]).toHaveProperty('userId');
			// Entity-specific fields should be stripped by zod parse
			expect(result[0]).not.toHaveProperty('createdAt');
			expect(result[0]).not.toHaveProperty('updatedAt');
			expect(result[0]).not.toHaveProperty('message');
		});

		it('should handle events with null userId', async () => {
			auditLogService.getEvents.mockResolvedValue([mockAuditLog2]);

			const req = mock<AuthenticatedRequest>();
			const result = await controller.getEvents(req, {}, {});

			expect(result).toHaveLength(1);
			expect(result[0].userId).toBeNull();
		});
	});
});
