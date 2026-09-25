const PROMPT_QUERY_SEPARATOR_PATTERN =
  /\?(?=(?:caseId|caseSlug|case|label|category|package|sort|view|filter|q|card)=)/g;

export function normalizePromptLibrarySearch(search: string): string {
  const rawSearch = search.startsWith('?') ? search.slice(1) : search;
  if (!rawSearch) return '';

  const parsed = new URLSearchParams(
    rawSearch.replace(PROMPT_QUERY_SEPARATOR_PATTERN, '&')
  );
  const normalized = new URLSearchParams();
  const seenKeys = new Set<string>();

  for (const [key, value] of parsed.entries()) {
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    normalized.set(key, value);
  }

  const query = normalized.toString();
  return query ? `?${query}` : '';
}
