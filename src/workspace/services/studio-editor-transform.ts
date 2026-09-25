import type { JSONContent } from '@tiptap/core';
import type { SavedSummary } from '@/services/database';

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~>#-]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function summariesToInsertBlocks(
  summaries: SavedSummary[]
): JSONContent[] {
  const nodes: JSONContent[] = [];

  summaries.forEach((summary) => {
    const heading = summary.title?.trim() || '未命名素材';

    const plainText = stripMarkdown(summary.markdown || '');
    if (plainText) {
      const previewText =
        plainText.length > 140
          ? `${plainText.slice(0, 140).trim()}...`
          : plainText;
      nodes.push({
        type: 'noteBlock',
        attrs: {
          sourceUrl: summary.url || '',
          sourceTitle: heading,
          sourceCardId: summary.id
        },
        content: [{ type: 'text', text: previewText }]
      });
    }

    // v1.3 预览卡片仅保留标题和简介，媒体由用户按需插入
  });

  return nodes;
}
