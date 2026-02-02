import Markdown from 'markdown-it';
import markdownLink from 'markdown-it-link-attributes';

import { useI18n } from '../../../composables/useI18n';

export interface ContentSegment {
	type: 'text' | 'thinking';
	content: string;
}

/**
 * Parse content to extract thinking tags as segments.
 * - Complete tags: extracted as thinking segments
 * - Incomplete tags (streaming): hidden along with content after
 * - Text before/between tags: extracted as text segments
 */
export function parseThinkingSegments(content: string): ContentSegment[] {
	const segments: ContentSegment[] = [];
	const regex = /<n8n_thinking>([\s\S]*?)<\/n8n_thinking>/gi;
	let lastIndex = 0;
	let match;

	while ((match = regex.exec(content)) !== null) {
		// Add text before the thinking tag
		if (match.index > lastIndex) {
			segments.push({ type: 'text', content: content.slice(lastIndex, match.index) });
		}
		// Add thinking content
		segments.push({ type: 'thinking', content: match[1].trim() });
		lastIndex = regex.lastIndex;
	}

	// Handle remaining text (and incomplete thinking tags for streaming)
	const remaining = content.slice(lastIndex);
	const incompleteTagIndex = remaining.indexOf('<n8n_thinking>');
	if (incompleteTagIndex !== -1) {
		// Only include text before incomplete tag
		if (incompleteTagIndex > 0) {
			segments.push({ type: 'text', content: remaining.slice(0, incompleteTagIndex) });
		}
	} else if (remaining) {
		segments.push({ type: 'text', content: remaining });
	}

	return segments;
}

export function useMarkdown() {
	const { t } = useI18n();

	const md = new Markdown({
		breaks: true,
	});

	md.use(markdownLink, {
		attrs: {
			target: '_blank',
			rel: 'noopener',
		},
	});

	function renderMarkdown(content: string) {
		try {
			return md.render(content);
		} catch (e) {
			console.error(`Error parsing markdown content ${content}`);
			return `<p>${t('assistantChat.errorParsingMarkdown')}</p>`;
		}
	}

	return {
		renderMarkdown,
	};
}
