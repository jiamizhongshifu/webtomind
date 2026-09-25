export const IMAGE_SESSION_TITLE_MAX_CHARACTERS = 48;

export function deriveImageSessionTitle(
  prompt: unknown,
  fallback = '未命名创作'
): string {
  const normalized =
    typeof prompt === 'string' ? prompt.replace(/\s+/gu, ' ').trim() : '';
  if (!normalized) return fallback;
  return Array.from(normalized)
    .slice(0, IMAGE_SESSION_TITLE_MAX_CHARACTERS)
    .join('');
}
