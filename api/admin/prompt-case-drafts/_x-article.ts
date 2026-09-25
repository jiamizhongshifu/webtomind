type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asRecordArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is UnknownRecord =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      )
    : [];
}

function normalizeMultiline(value: unknown): string {
  return typeof value === 'string'
    ? value
        .replace(/\u00a0/g, ' ')
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : '';
}

function getArticle(payload: UnknownRecord): UnknownRecord | null {
  return asRecord(payload.article);
}

function getArticleContent(article: UnknownRecord): UnknownRecord | null {
  return (
    asRecord(article.content) ||
    asRecord(article.content_state) ||
    asRecord(article.contentState) ||
    asRecord(article.body)
  );
}

function stripMarkdownFence(value: string): string {
  return normalizeMultiline(
    value.replace(/^```[^\n]*\n?/u, '').replace(/\n?```$/u, '')
  );
}

function getArticleMarkdownPrompts(article: UnknownRecord): string[] {
  const content = getArticleContent(article);
  if (!content) return [];

  const entityMap = Array.isArray(content.entityMap)
    ? asRecordArray(content.entityMap).map((entry) => asRecord(entry.value))
    : Object.values(asRecord(content.entityMap) || {}).map(asRecord);

  return entityMap
    .filter((entry): entry is UnknownRecord => Boolean(entry))
    .filter((entry) => String(entry.type || '').toUpperCase() === 'MARKDOWN')
    .map((entry) =>
      stripMarkdownFence(normalizeMultiline(asRecord(entry.data)?.markdown))
    )
    .filter(Boolean);
}

function getArticleBlockText(article: UnknownRecord): string {
  const content = getArticleContent(article);
  if (!content) return '';

  return asRecordArray(content.blocks)
    .map((block) => normalizeMultiline(block.text))
    .filter(Boolean)
    .join('\n\n');
}

export function getXArticleText(payload: UnknownRecord): string {
  const article = getArticle(payload);
  if (!article) return '';

  const markdownPrompts = getArticleMarkdownPrompts(article);
  if (markdownPrompts.length > 0) {
    return `Prompt:\n${markdownPrompts.join('\n\n')}`;
  }

  const title = normalizeMultiline(article.title);
  const body = getArticleBlockText(article);
  const preview = normalizeMultiline(
    article.preview_text || article.previewText || article.preview
  );
  return [title, body || preview].filter(Boolean).join('\n\n');
}

function mediaUrlRecord(value: unknown): UnknownRecord | null {
  const url = normalizeMultiline(value);
  return url ? { type: 'photo', media_url_https: url } : null;
}

export function getXArticleMediaItems(payload: UnknownRecord): UnknownRecord[] {
  const article = getArticle(payload);
  if (!article) return [];

  const coverMedia = asRecord(article.cover_media || article.coverMedia);
  const coverInfo = asRecord(coverMedia?.media_info || coverMedia?.mediaInfo);
  const directCover = mediaUrlRecord(
    coverInfo?.original_img_url ||
      coverInfo?.originalImgUrl ||
      article.image ||
      article.image_url ||
      article.imageUrl
  );
  const articleMedia = asRecordArray(
    article.media_entities || article.mediaEntities
  ).map((item) => {
    const info = asRecord(item.media_info || item.mediaInfo);
    return (
      mediaUrlRecord(
        info?.original_img_url ||
          info?.originalImgUrl ||
          item.media_url_https ||
          item.media_url ||
          item.url
      ) || item
    );
  });

  return [directCover, ...articleMedia].filter((item): item is UnknownRecord =>
    Boolean(item)
  );
}
