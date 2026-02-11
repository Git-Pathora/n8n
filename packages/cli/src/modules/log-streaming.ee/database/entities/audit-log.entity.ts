import { DateTimeColumn, JsonColumn, WithTimestampsAndStringId } from '@n8n/db';
import { Column, Entity, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'audit_log' })
export class AuditLog extends WithTimestampsAndStringId {
	@PrimaryColumn('varchar')
	id: string;

	@Column('varchar', { length: 255 })
	eventName: string;

	@Column('text')
	message: string;

	@Column('varchar', { length: 255, nullable: true })
	userId: string | null;

	@DateTimeColumn()
	timestamp: Date;

	@JsonColumn()
	payload: Record<string, unknown>;
}
