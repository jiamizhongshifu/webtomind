export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type NodeLike = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: NodeLike[];
};

function renderInline(nodes: NodeLike[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') {
        return escapeHtml(node.text || '');
      }
      return '';
    })
    .join('');
}

function renderBlock(node: NodeLike): string {
  const type = node.type || '';
  const children = node.content || [];

  if (type === 'heading') {
    const level = Number(node.attrs?.level || 2);
    const tag = level >= 1 && level <= 3 ? `h${level}` : 'h2';
    return `<${tag}>${renderInline(children)}</${tag}>`;
  }

  if (type === 'noteBlock' || type === 'blockquote') {
    const body =
      type === 'noteBlock'
        ? `<p>${renderInline(children)}</p>`
        : children.map(renderBlock).join('');
    const sourceUrl = String(node.attrs?.sourceUrl || '');
    const sourceTitle = String(node.attrs?.sourceTitle || '');
    const sourceMeta =
      sourceUrl || sourceTitle
        ? `<div class="note-source">${escapeHtml(sourceTitle || sourceUrl)}</div>`
        : '';
    return `<blockquote class="note-block">${body}${sourceMeta}</blockquote>`;
  }

  if (type === 'image') {
    const src = String(node.attrs?.src || '');
    if (!src) return '';
    const alt = escapeHtml(String(node.attrs?.alt || ''));
    return `<figure><img src="${escapeHtml(src)}" alt="${alt}" /></figure>`;
  }

  if (type === 'paragraph') {
    return `<p>${renderInline(children)}</p>`;
  }

  return '';
}

export function renderStudioDocToHtml(
  content: Record<string, unknown>
): string {
  const root = content as NodeLike;
  const blocks = Array.isArray(root.content) ? root.content : [];
  const html = blocks.map(renderBlock).join('');
  return html || '<p></p>';
}
