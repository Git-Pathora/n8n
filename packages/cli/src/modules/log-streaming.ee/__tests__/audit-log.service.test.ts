import { mock } from 'jest-mock-extended';
import { LessThan } from '@n8n/typeorm';

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

		it('should retrieve events with no filters', async () => {
			auditLogRepository.find.mockResolvedValue([mockAuditLog, mockAuditLog2]);

			const result = await service.getEvents({});

			expect(result).toHaveLength(2);
			expect(auditLogRepository.find).toHaveBeenCalledWith({
				take: 50,
				order: {
					timestamp: 'DESC',
				},
				where: {
					eventName: undefined,
					timestamp: undefined,
				},
			});
		});

		it('should filter events by eventName', async () => {
			auditLogRepository.find.mockResolvedValue([mockAuditLog]);

			const result = await service.getEvents({ eventName: 'workflow.created' });

			expect(result).toHaveLength(1);
			expect(result[0].eventName).toBe('workflow.created');
			expect(auditLogRepository.find).toHaveBeenCalledWith({
				take: 50,
				order: {
					timestamp: 'DESC',
				},
				where: {
					eventName: 'workflow.created',
					timestamp: undefined,
				},
			});
		});

		it('should filter events by after timestamp', async () => {
			const afterDate = '2024-01-01T12:00:00.000Z';
			auditLogRepository.find.mockResolvedValue([mockAuditLog2]);

			const result = await service.getEvents({ after: afterDate });

			expect(result).toHaveLength(1);
			expect(auditLogRepository.find).toHaveBeenCalledWith({
				take: 50,
				order: {
					timestamp: 'DESC',
				},
				where: {
					eventName: undefined,
					timestamp: LessThan(new Date(afterDate)),
				},
			});
		});

		it('should apply both eventName and after filters', async () => {
			const afterDate = '2023-12-31T00:00:00.000Z';
			auditLogRepository.find.mockResolvedValue([mockAuditLog]);

			const result = await service.getEvents({
				eventName: 'workflow.created',
				after: afterDate,
			});

			expect(result).toHaveLength(1);
			expect(result[0].eventName).toBe('workflow.created');
			expect(auditLogRepository.find).toHaveBeenCalledWith({
				take: 50,
				order: {
					timestamp: 'DESC',
				},
				where: {
					eventName: 'workflow.created',
					timestamp: LessThan(new Date(afterDate)),
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
			expect(auditLogRepository.find).toHaveBeenCalledWith(
				expect.objectContaining({
					take: 50,
				}),
			);
		});

		it('should order results by timestamp DESC', async () => {
			auditLogRepository.find.mockResolvedValue([mockAuditLog2, mockAuditLog]);

			await service.getEvents({});

			expect(auditLogRepository.find).toHaveBeenCalledWith(
				expect.objectContaining({
					order: {
						timestamp: 'DESC',
					},
				}),
			);
		});

		it('should return empty array when no events found', async () => {
			auditLogRepository.find.mockResolvedValue([]);

			const result = await service.getEvents({});

			expect(result).toHaveLength(0);
		});
	});
});
