import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import type {
  PromptLibraryQuery,
  PromptLibrarySort
} from '@/services/agent-api';
import { canonicalizePromptLibraryLabel } from '@/shared/prompt-library';

export const PROMPT_LIBRARY_DEFAULT_LIMIT = 48;

function normalizePromptLibrarySort(value: string | null): PromptLibrarySort {
  if (value === 'featured' || value === 'hot') return value;
  return 'latest';
}

export function resolvePromptLibraryQuery(params: {
  search: string;
  locale: 'zh-CN' | 'en-US' | string;
  modelSlug?: string;
  labelSlug?: string;
  mediaType?: 'image' | 'video';
  seoOnly?: boolean;
  defaultLimit?: number;
}): PromptLibraryQuery {
  const searchParams = new URLSearchParams(params.search);
  const legacyFeaturedFilter =
    searchParams.get('filter')?.trim() === 'featured';
  const sort = legacyFeaturedFilter
    ? 'featured'
    : normalizePromptLibrarySort(searchParams.get('sort'));
  const label = canonicalizePromptLibraryLabel(
    searchParams.get('label')?.trim() ||
      searchParams.get('category')?.trim() ||
      params.labelSlug ||
      ''
  );
  const q = searchParams.get('q')?.trim() || '';
  const cursor = searchParams.get('cursor')?.trim() || '';
  const defaultLimit = params.defaultLimit || PROMPT_LIBRARY_DEFAULT_LIMIT;
  const rawLimit = searchParams.has('limit')
    ? Number(searchParams.get('limit'))
    : Number.NaN;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.max(1, Math.min(rawLimit, 100))
      : defaultLimit;

  return {
    locale: params.locale,
    model: params.modelSlug || undefined,
    label: label || undefined,
    mediaType: params.mediaType,
    seoOnly: params.seoOnly === true,
    sort,
    q: q || undefined,
    cursor: cursor || undefined,
    limit
  };
}

export function getPromptLibraryQueryKey(query: PromptLibraryQuery): string {
  return [
    'prompt-library-v2',
    query.locale,
    query.model || 'all-models',
    query.label || 'all-labels',
    query.mediaType || 'all-media',
    query.seoOnly ? 'seo-only' : 'all-statuses',
    query.sort,
    query.q || 'all-search',
    query.cursor || 'first',
    query.limit
  ].join(':');
}

export function usePromptLibraryQuery(params: {
  locale: 'zh-CN' | 'en-US' | string;
  modelSlug?: string;
  labelSlug?: string;
  mediaType?: 'image' | 'video';
  seoOnly?: boolean;
  defaultLimit?: number;
}): PromptLibraryQuery {
  const location = useLocation();
  return useMemo(
    () =>
      resolvePromptLibraryQuery({
        search: location.search,
        locale: params.locale,
        modelSlug: params.modelSlug,
        labelSlug: params.labelSlug,
        mediaType: params.mediaType,
        seoOnly: params.seoOnly,
        defaultLimit: params.defaultLimit
      }),
    [
      location.search,
      params.defaultLimit,
      params.labelSlug,
      params.locale,
      params.mediaType,
      params.modelSlug,
      params.seoOnly
    ]
  );
}
