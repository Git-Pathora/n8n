import { mock } from 'jest-mock-extended';
import { And, LessThanOrEqual, MoreThanOrEqual } from '@n8n/typeorm';

import type { AuditLog } from '../database/entities';
import type { AuditLogRepository } from '../database/repositories/audit-log.repository';
import { AuditLogService } from '../audit-log.service';

describe('AuditLogService', () => {
	const auditLogRepository = mock<AuditLogRepository>();

	let service: AuditLogService;

	beforeEach(() => {
		jest.clearAllMocks();
		service = new AuditLogService(auditLogRepository);
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
			userId: 'user-2',
			timestamp: new Date('2024-01-02T10:00:00.000Z'),
			payload: { workflowId: 'workflow-456' },
			createdAt: new Date('2024-01-02T10:00:00.000Z'),
			updatedAt: new Date('2024-01-02T10:00:00.000Z'),
		} as unknown as AuditLog;

		it('should retrieve events with no filters', async () => {
			auditLogRepository.find.mockResolvedValue([mockAuditLog, mockAuditLog2]);

			const result = await service.getEvents({});

			expect(result).toHaveLength(2);
			expect(auditLogRepository.find).toHaveBeenCalledWith({
				take: 50,
				order: { timestamp: 'DESC' },
				where: {},
			});
		});

		it('should filter events by eventName', async () => {
			auditLogRepository.find.mockResolvedValue([mockAuditLog]);

			const result = await service.getEvents({ eventName: 'n8n.audit.workflow.created' });

			expect(result).toHaveLength(1);
			expect(result[0].eventName).toBe('n8n.audit.workflow.created');
			expect(auditLogRepository.find).toHaveBeenCalledWith({
				take: 50,
				order: { timestamp: 'DESC' },
				where: { eventName: 'n8n.audit.workflow.created' },
			});
		});

		it('should filter events by userId', async () => {
			auditLogRepository.find.mockResolvedValue([mockAuditLog]);

			const result = await service.getEvents({ userId: 'user-1' });

			expect(result).toHaveLength(1);
			expect(auditLogRepository.find).toHaveBeenCalledWith({
				take: 50,
				order: { timestamp: 'DESC' },
				where: { userId: 'user-1' },
			});
		});

		it('should filter events by after timestamp (more recent than)', async () => {
			const afterDate = '2024-01-01T12:00:00.000Z';
			auditLogRepository.find.mockResolvedValue([mockAuditLog2]);

			const result = await service.getEvents({ after: afterDate });

			expect(result).toHaveLength(1);
			expect(auditLogRepository.find).toHaveBeenCalledWith({
				take: 50,
				order: { timestamp: 'DESC' },
				where: { timestamp: MoreThanOrEqual(new Date(afterDate)) },
			});
		});

		it('should filter events by before timestamp (older than)', async () => {
			const beforeDate = '2024-01-02T00:00:00.000Z';
			auditLogRepository.find.mockResolvedValue([mockAuditLog]);

			const result = await service.getEvents({ before: beforeDate });

			expect(result).toHaveLength(1);
			expect(auditLogRepository.find).toHaveBeenCalledWith({
				take: 50,
				order: { timestamp: 'DESC' },
				where: { timestamp: LessThanOrEqual(new Date(beforeDate)) },
			});
		});

		it('should filter events by after and before timestamp range', async () => {
			const afterDate = '2024-01-01T00:00:00.000Z';
			const beforeDate = '2024-01-03T00:00:00.000Z';
			auditLogRepository.find.mockResolvedValue([mockAuditLog, mockAuditLog2]);

			const result = await service.getEvents({ after: afterDate, before: beforeDate });

			expect(result).toHaveLength(2);
			expect(auditLogRepository.find).toHaveBeenCalledWith({
				take: 50,
				order: { timestamp: 'DESC' },
				where: {
					timestamp: And(
						MoreThanOrEqual(new Date(afterDate)),
						LessThanOrEqual(new Date(beforeDate)),
					),
				},
			});
		});

		it('should apply all filters together', async () => {
			const afterDate = '2023-12-31T00:00:00.000Z';
			const beforeDate = '2024-01-02T00:00:00.000Z';
			auditLogRepository.find.mockResolvedValue([mockAuditLog]);

			const result = await service.getEvents({
				eventName: 'n8n.audit.workflow.created',
				userId: 'user-1',
				after: afterDate,
				before: beforeDate,
			});

			expect(result).toHaveLength(1);
			expect(auditLogRepository.find).toHaveBeenCalledWith({
				take: 50,
				order: { timestamp: 'DESC' },
				where: {
					eventName: 'n8n.audit.workflow.created',
					userId: 'user-1',
					timestamp: And(
						MoreThanOrEqual(new Date(afterDate)),
						LessThanOrEqual(new Date(beforeDate)),
					),
				},
			});
		});

		it('should limit results to 50 records', async () => {
			const manyLogs = Array.from({ length: 50 }, (_, i) => ({
				...mockAuditLog,
				id: `audit-${i}`,
			}));
			auditLogRepository.find.mockResolvedValue(manyLogs);

			const result = await service.getEvents({});

			expect(result).toHaveLength(50);
			expect(auditLogRepository.find).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
		});

		it('should order results by timestamp DESC', async () => {
			auditLogRepository.find.mockResolvedValue([mockAuditLog2, mockAuditLog]);

			await service.getEvents({});

			expect(auditLogRepository.find).toHaveBeenCalledWith(
				expect.objectContaining({ order: { timestamp: 'DESC' } }),
			);
		});

		it('should return empty array when no events found', async () => {
			auditLogRepository.find.mockResolvedValue([]);

			const result = await service.getEvents({});

			expect(result).toHaveLength(0);
		});
	});
});
