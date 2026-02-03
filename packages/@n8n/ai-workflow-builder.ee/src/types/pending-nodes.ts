import type { INode } from 'n8n-workflow';

export interface PendingNodeEntry {
	promise: Promise<INode>;
	resolve: (node: INode) => void;
	reject: (error: Error) => void;
	count: number;
}

export type PendingNodeRegistry = Record<string, PendingNodeEntry>;
