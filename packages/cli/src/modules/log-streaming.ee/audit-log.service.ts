import type { AuditLogFilterDto } from '@n8n/api-types';
import { Service } from '@n8n/di';
import type { FindOptionsWhere } from '@n8n/typeorm';
import { LessThan, MoreThan, And } from '@n8n/typeorm';

import type { AuditLog } from './database/entities';
import { AuditLogRepository } from './database/repositories/audit-log.repository';

@Service()
export class AuditLogService {
	constructor(private readonly auditLogRepository: AuditLogRepository) {}

	async getEvents(filter: AuditLogFilterDto): Promise<AuditLog[]> {
		const where: FindOptionsWhere<AuditLog> = {};

		if (filter.eventName) {
			where.eventName = filter.eventName;
		}

		if (filter.userId) {
			where.userId = filter.userId;
		}

		if (filter.after && filter.before) {
			where.timestamp = And(MoreThan(new Date(filter.after)), LessThan(new Date(filter.before)));
		} else if (filter.after) {
			where.timestamp = MoreThan(new Date(filter.after));
		} else if (filter.before) {
			where.timestamp = LessThan(new Date(filter.before));
		}

		return await this.auditLogRepository.find({
			take: 50,
			order: { timestamp: 'DESC' },
			where,
		});
	}
}
