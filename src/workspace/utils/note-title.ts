export function stripMarkdownSyntax(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, ' ')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[>*_~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractMeaningfulTitleFromMarkdown(markdown: string): string {
  const lines = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.startsWith('![') || line.startsWith('<img')) continue;
    const cleaned = stripMarkdownSyntax(line.replace(/^#{1,6}\s+/, ''));
    if (cleaned.length >= 4) {
      return cleaned.slice(0, 40);
    }
  }

  const plain = stripMarkdownSyntax(markdown);
  return plain ? plain.slice(0, 40) : '';
}

export function resolveNoteTitle(
  title: string | undefined,
  markdown: string
): string {
  const normalizedTitle = (title || '').trim();
  const looksLikeTimestampTitle = /^对话笔记\s*[-—]/.test(normalizedTitle);
  if (normalizedTitle && !looksLikeTimestampTitle) {
    return normalizedTitle;
  }

  const inferred = extractMeaningfulTitleFromMarkdown(markdown);
  if (inferred) return inferred;

  if (normalizedTitle) return normalizedTitle;
  return '未命名笔记';
}
