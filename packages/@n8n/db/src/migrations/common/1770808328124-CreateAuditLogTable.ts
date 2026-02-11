import type { MigrationContext, ReversibleMigration } from '../migration-types';

const tableName = 'audit_log';

export class CreateAuditLogTable1770808328124 implements ReversibleMigration {
	async up({ schemaBuilder: { createTable, column, createIndex } }: MigrationContext) {
		await createTable(tableName).withColumns(
			column('id').varchar(255).primary.notNull,
			column('eventName').varchar(255).notNull,
			column('message').text.notNull,
			column('userId').varchar(255),
			column('timestamp').timestampTimezone().notNull,
			column('payload').json.notNull,
		).withTimestamps;

		await createIndex(tableName, ['timestamp']);
		await createIndex(tableName, ['eventName']);
		await createIndex(tableName, ['userId']);
	}

	async down({ schemaBuilder: { dropTable } }: MigrationContext) {
		await dropTable(tableName);
	}
}
