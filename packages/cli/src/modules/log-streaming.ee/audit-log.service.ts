import { AuditLogFilterDto } from '@n8n/api-types';
import { Service } from '@n8n/di';
import { LessThan } from '@n8n/typeorm';

import { AuditLog } from './database/entities';
import { AuditLogRepository } from './database/repositories/audit-log.repository';

@Service()
export class AuditLogService {
	constructor(private readonly auditLogRepository: AuditLogRepository) {}

	/**
	 * Load all destinations from database and add them to the local destinations map
	 */
	async getEvents(filter: AuditLogFilterDto): Promise<AuditLog[]> {
		return await this.auditLogRepository.find({
			take: 50,
			order: {
				timestamp: 'DESC',
			},
			where: {
				eventName: filter.eventName,
				timestamp: filter.after ? LessThan(new Date(filter.after)) : undefined,
			},
		});
	}
}
