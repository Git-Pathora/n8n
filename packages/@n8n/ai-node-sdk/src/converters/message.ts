import * as LangchainMessages from '@langchain/core/messages';

import type * as N8nMessages from '../types/message';

function convertToN8nRole(role: LangchainMessages.MessageType): N8nMessages.MessageRole {
	switch (role) {
		case 'system':
			return 'system';
		case 'human':
			return 'human';
		case 'ai':
			return 'ai';
		case 'tool':
			return 'tool';
		default:
			return 'human';
	}
}

function mapLcContentToN8nContent(
	content: string | LangchainMessages.ContentBlock | LangchainMessages.ContentBlock[],
): N8nMessages.MessageContent[] {
	if (typeof content === 'string') {
		return [
			{
				type: 'text',
				text: content,
			},
		];
	}
	const blocks = Array.isArray(content) ? content : [content];
	return blocks
		.map((block) => {
			let content: N8nMessages.MessageContent | null = null;
			if (block.type === 'text') {
				const textBlock = block as LangchainMessages.ContentBlock.Text;
				content = {
					type: 'text',
					text: textBlock.text,
				};
			}
			if (block.type === 'reasoning') {
				const reasoningBlock = block as LangchainMessages.ContentBlock.Reasoning;
				content = {
					type: 'reasoning',
					text: reasoningBlock.reasoning,
				};
			}
			if (block.type === 'file') {
				const fileBlock = block as LangchainMessages.ContentBlock.Multimodal.File;
				content = {
					type: 'file',
					mediaType: fileBlock.mimeType!,
					data: fileBlock.data!,
				};
			}
			if (block.type === 'tool_call') {
				const toolCallBlock = block as LangchainMessages.ContentBlock.Tools.ToolCall;
				content = {
					type: 'tool-call',
					toolCallId: toolCallBlock.id!,
					toolName: toolCallBlock.name,
					input: JSON.stringify(toolCallBlock.args),
				};
			}
			if (block.type === 'tool-result') {
				const toolResultBlock = block as LangchainMessages.ContentBlock.Tools.ServerToolCallResult;
				content = {
					type: 'tool-result',
					toolCallId: toolResultBlock.toolCallId,
					result: toolResultBlock.output,
					isError: toolResultBlock.status === 'error',
				};
			}
			if (!content) {
				return null;
			}
			return content;
		})
		.filter((content): content is N8nMessages.MessageContent => content !== null);
}

export function convertToN8nMessage(msg: LangchainMessages.BaseMessage): N8nMessages.Message {
	if (LangchainMessages.ToolMessage.isInstance(msg)) {
		return {
			role: 'tool',
			content: [
				{
					type: 'tool-result',
					toolCallId: msg.tool_call_id,
					result: mapLcContentToN8nContent(msg.content),
					isError: false,
					providerMetadata: msg.metadata,
				},
			],
		};
	}
	if (LangchainMessages.AIMessage.isInstance(msg)) {
		const content = mapLcContentToN8nContent(msg.content);
		const toolsCalls = msg.tool_calls;
		if (toolsCalls?.length) {
			const mappedToolsCalls = toolsCalls.map<N8nMessages.ContentToolCall>((toolCall) => ({
				type: 'tool-call',
				toolCallId: toolCall.id,
				toolName: toolCall.name,
				input: JSON.stringify(toolCall.args),
				providerMetadata: msg.response_metadata,
			}));
			content.push(...mappedToolsCalls);
		}
	}
	if (LangchainMessages.SystemMessage.isInstance(msg)) {
		return {
			role: 'system',
			content: mapLcContentToN8nContent(msg.content),
			id: msg.id,
			name: msg.name,
		};
	}
	if (LangchainMessages.HumanMessage.isInstance(msg)) {
		return {
			role: 'human',
			content: mapLcContentToN8nContent(msg.content),
			id: msg.id,
			name: msg.name,
		};
	}
	if (LangchainMessages.BaseMessage.isInstance(msg)) {
		return {
			role: convertToN8nRole(msg.type),
			content: mapLcContentToN8nContent(msg.content),
			id: msg.id,
			name: msg.name,
		};
	}
	throw new Error(`Provided message is not a valid Langchain message: ${JSON.stringify(msg)}`);
}
