import type { DiscoverySearchResult } from '@/services/create-workspace-v2-api';

export function composeDiscoverySearchQuery(
  visualQuery: string,
  userQuery: string
): string {
  return [visualQuery, userQuery]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ');
}

export function createDiscoverySearchFailure(
  query: string,
  error: unknown,
  isEnglish: boolean
): { result: DiscoverySearchResult; message: string } {
  return {
    result: { query, images: [], moodboards: [] },
    message:
      error instanceof Error && error.message.trim()
        ? error.message
        : isEnglish
          ? 'Discovery is temporarily unavailable.'
          : '灵感内容暂时不可用'
  };
}
