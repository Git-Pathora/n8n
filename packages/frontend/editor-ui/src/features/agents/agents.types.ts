export interface AgentNode {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	role: string;
	emoji: string;
	status: 'idle' | 'active' | 'busy';
	position: { x: number; y: number };
	zoneId: string | null;
}

export interface UserResponse {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	type?: string;
}

export interface ZoneLayout {
	projectId: string;
	name: string;
	icon: { type: 'icon'; value: string } | { type: 'emoji'; value: string } | null;
	memberCount: number;
	rect: { x: number; y: number; width: number; height: number };
	colorIndex: number;
}

export interface ConnectionLine {
	id: string;
	fromAgentId: string;
	toAgentId: string;
}

export interface AgentCapabilitiesResponse {
	agentId: string;
	agentName: string;
	projects: Array<{ id: string; name: string }>;
	workflows: Array<{ id: string; name: string; active: boolean }>;
	credentials: Array<{ id: string; name: string; type: string }>;
}

export interface AgentTaskDispatchResponse {
	status: 'dispatched' | 'completed' | 'error';
	summary?: string;
	steps?: Array<{ action: string; workflowName?: string; toAgent?: string; result?: string }>;
	message?: string;
}
