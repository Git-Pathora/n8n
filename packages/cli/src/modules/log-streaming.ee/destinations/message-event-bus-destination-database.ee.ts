import { Container } from '@n8n/di';
import type {
	MessageEventBusDestinationDatabaseOptions,
	MessageEventBusDestinationOptions,
} from 'n8n-workflow';
import { MessageEventBusDestinationTypeNames } from 'n8n-workflow';
import { v4 as uuid } from 'uuid';

import type {
	MessageEventBus,
	MessageWithCallback,
} from '@/eventbus/message-event-bus/message-event-bus';

import { AuditLog } from '../database/entities/audit-log.entity';
import { AuditLogRepository } from '../database/repositories/audit-log.repository';
import { MessageEventBusDestination } from './message-event-bus-destination.ee';

export const isMessageEventBusDestinationDatabaseOptions = (
	candidate: unknown,
): candidate is MessageEventBusDestinationDatabaseOptions => {
	const o = candidate as MessageEventBusDestinationDatabaseOptions;
	if (!o) return false;
	return o.__type === MessageEventBusDestinationTypeNames.database;
};

export class MessageEventBusDestinationDatabase
	extends MessageEventBusDestination
	implements MessageEventBusDestinationDatabaseOptions
{
	private readonly auditLogRepository: AuditLogRepository;

	constructor(
		eventBusInstance: MessageEventBus,
		options: MessageEventBusDestinationDatabaseOptions,
	) {
		super(eventBusInstance, options);
		this.__type = options.__type ?? MessageEventBusDestinationTypeNames.database;
		this.label = options.label ?? 'Local Database';

		this.auditLogRepository = Container.get(AuditLogRepository);
		this.logger.debug(`MessageEventBusDestinationDatabase with id ${this.getId()} initialized`);
	}

	async receiveFromEventBus(emitterPayload: MessageWithCallback): Promise<boolean> {
		const { msg, confirmCallback } = emitterPayload;

		const payload = (this.anonymizeAuditMessages ? msg.anonymize() : msg.payload) ?? {};

		const auditLog = Object.assign(new AuditLog(), {
			id: uuid(),
			eventName: msg.eventName,
			message: msg.message ?? msg.eventName,
			timestamp: msg.ts.toJSDate(),
			payload,
		});
		await this.auditLogRepository.save(auditLog);

		confirmCallback(msg, { id: this.id, name: this.label });
		return true;
	}

	serialize(): MessageEventBusDestinationDatabaseOptions {
		return {
			...super.serialize(),
		};
	}

	static deserialize(
		eventBusInstance: MessageEventBus,
		data: MessageEventBusDestinationOptions,
	): MessageEventBusDestinationDatabase | null {
		if (
			'__type' in data &&
			data.__type === MessageEventBusDestinationTypeNames.database &&
			isMessageEventBusDestinationDatabaseOptions(data)
		) {
			return new MessageEventBusDestinationDatabase(eventBusInstance, data);
		}
		return null;
	}

	toString() {
		return JSON.stringify(this.serialize());
	}
}
