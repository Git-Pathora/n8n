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
			eventName: 'workflow.created',
			message: 'Workflow created',
			timestamp: new Date('2024-01-01T10:00:00.000Z'),
			payload: { workflowId: 'workflow-123' },
			createdAt: new Date('2024-01-01T10:00:00.000Z'),
			updatedAt: new Date('2024-01-01T10:00:00.000Z'),
		} as unknown as AuditLog;

		const mockAuditLog2 = {
			id: 'audit-2',
			eventName: 'workflow.updated',
			message: 'Workflow updated',
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
			expect(result[0].eventName).toBe('workflow.created');
			expect(result[1].id).toBe('audit-2');
			expect(result[1].eventName).toBe('workflow.updated');
			expect(auditLogService.getEvents).toHaveBeenCalledWith({});
		});

		it('should return events filtered by eventName', async () => {
			auditLogService.getEvents.mockResolvedValue([mockAuditLog]);

			const req = mock<AuthenticatedRequest>();
			const result = await controller.getEvents(req, {}, { eventName: 'workflow.created' });

			expect(result).toHaveLength(1);
			expect(result[0].eventName).toBe('workflow.created');
			expect(auditLogService.getEvents).toHaveBeenCalledWith({ eventName: 'workflow.created' });
		});

		it('should return events filtered by after timestamp', async () => {
			auditLogService.getEvents.mockResolvedValue([mockAuditLog2]);

			const req = mock<AuthenticatedRequest>();
			const after = '2024-01-01T12:00:00.000Z';
			const result = await controller.getEvents(req, {}, { after });

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('audit-2');
			expect(auditLogService.getEvents).toHaveBeenCalledWith({ after });
		});

		it('should return events with both filters applied', async () => {
			auditLogService.getEvents.mockResolvedValue([mockAuditLog]);

			const req = mock<AuthenticatedRequest>();
			const after = '2023-12-31T00:00:00.000Z';
			const result = await controller.getEvents(
				req,
				{},
				{
					eventName: 'workflow.created',
					after,
				},
			);

			expect(result).toHaveLength(1);
			expect(result[0].eventName).toBe('workflow.created');
			expect(auditLogService.getEvents).toHaveBeenCalledWith({
				eventName: 'workflow.created',
				after,
			});
		});

		it('should return empty array when no events found', async () => {
			auditLogService.getEvents.mockResolvedValue([]);

			const req = mock<AuthenticatedRequest>();
			const result = await controller.getEvents(req, {}, {});

			expect(result).toHaveLength(0);
			expect(auditLogService.getEvents).toHaveBeenCalledWith({});
		});

		it('should parse events and exclude extra entity fields', async () => {
			auditLogService.getEvents.mockResolvedValue([mockAuditLog]);

			const req = mock<AuthenticatedRequest>();
			const result = await controller.getEvents(req, {}, {});

			expect(result).toHaveLength(1);
			// Should include fields from auditLogEvent schema
			expect(result[0]).toHaveProperty('id');
			expect(result[0]).toHaveProperty('eventName');
			expect(result[0]).toHaveProperty('timestamp');
			expect(result[0]).toHaveProperty('payload');
			// Should not include entity-specific fields (createdAt, updatedAt, message)
			expect(result[0]).not.toHaveProperty('createdAt');
			expect(result[0]).not.toHaveProperty('updatedAt');
			expect(result[0]).not.toHaveProperty('message');
		});
	});
});
