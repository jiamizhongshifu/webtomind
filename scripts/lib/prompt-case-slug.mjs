function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugifyPromptCase(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function shortId(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 10)
    .toLowerCase();
}

export function buildStablePromptCaseSlug(row) {
  const existingSlug = normalizeWhitespace(row.slug);
  if (existingSlug) return existingSlug;

  const tags = Array.isArray(row.tags) ? row.tags.join(' ') : '';
  const descriptiveBase = slugifyPromptCase(
    [
      row.model,
      row.title_en,
      row.titleEn,
      row.title,
      row.title_zh,
      row.titleZh,
      row.category,
      tags
    ].join(' ')
  );
  const seenTokens = new Set();
  const base =
    descriptiveBase
      .split('-')
      .filter(Boolean)
      .filter((token) => {
        if (seenTokens.has(token)) return false;
        seenTokens.add(token);
        return true;
      })
      .slice(0, 12)
      .join('-') || 'prompt-case';
  const suffix = shortId(row.id);

  return suffix ? `${base}-${suffix}` : base;
}
