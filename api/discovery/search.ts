import { searchKreaDiscoveryFeed } from '../../src/shared/krea-discovery.js';
import { searchKreaGalleryMoodboards } from '../../src/shared/krea-gallery-moodboards.js';
import { getCorsHeadersForRequest } from '../utils/auth.js';
import {
  formatMoodboard,
  moodboardDatabase,
  moodboardOptions,
  moodboardSelect,
  sanitizeText
} from '../moodboards/shared.js';
import { isSupabaseSignedStorageUrl } from '../utils/signed-storage-url.js';

export const config = { runtime: 'edge' };

const DISCOVERY_IMAGE_LIMIT = 18;
const DISCOVERY_MOODBOARD_LIMIT = 12;
const DISCOVERY_MAX_PAGE_SIZE = 36;

type DiscoveryKind = 'all' | 'images' | 'moodboards';

function readBoundedInteger(
  value: string | null,
  fallback: number,
  maximum: number
): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, maximum);
}

function discoveryJson(
  request: Request,
  data: unknown,
  status = 200,
  cacheable = false
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...getCorsHeadersForRequest(request),
      'Content-Type': 'application/json',
      'Cache-Control': cacheable
        ? 'public, max-age=60, stale-while-revalidate=300'
        : 'no-store'
    }
  });
}

export function buildDiscoverySearchTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .replace(/[%_,().]/g, ' ')
        .split(/[\s，、;；|/]+/)
        .map((term) =>
          term
            .trim()
            .replace(/[^a-zA-Z0-9\u3400-\u9fff-]+/g, '')
            .slice(0, 48)
        )
        .filter((term) => term.length >= 2)
    )
  ).slice(0, 8);
}

function buildSearchOrFilter(terms: string[], fields: string[]): string {
  return terms
    .flatMap((term) => fields.map((field) => `${field}.ilike.%${term}%`))
    .join(',');
}

export default async function handler(request: Request): Promise<Response> {
  const options = moodboardOptions(request);
  if (options) return options;
  if (request.method !== 'GET')
    return discoveryJson(request, { error: 'Method not allowed' }, 405);
  const url = new URL(request.url);
  const query = sanitizeText(url.searchParams.get('q'), 160);
  const locale = url.searchParams.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
  const requestedKind = url.searchParams.get('kind');
  const kind: DiscoveryKind =
    requestedKind === 'images' || requestedKind === 'moodboards'
      ? requestedKind
      : 'all';
  const offset = readBoundedInteger(url.searchParams.get('offset'), 0, 10_000);
  const requestedLimit = readBoundedInteger(
    url.searchParams.get('limit'),
    0,
    DISCOVERY_MAX_PAGE_SIZE
  );
  const imageLimit = requestedLimit || DISCOVERY_IMAGE_LIMIT;
  const moodboardLimit = requestedLimit || DISCOVERY_MOODBOARD_LIMIT;
  const searchTerms = buildDiscoverySearchTerms(query);

  try {
    const rawKreaImages =
      kind === 'moodboards'
        ? []
        : searchKreaDiscoveryFeed(searchTerms, imageLimit + 1, offset);
    const kreaImages = rawKreaImages.slice(0, imageLimit).map((image) => ({
      ...image,
      kind: 'krea' as const,
      promptPreview: image.prompt.slice(0, 240),
      promptLocked: false,
      memberOnly: false,
      model: 'Krea 2',
      href: '/image'
    }));

    const kreaMoodboards =
      kind === 'images' ? [] : searchKreaGalleryMoodboards(searchTerms);
    let rawMoodboards: unknown[] = [];
    if (kind !== 'images') {
      const staticPageEnd = Math.min(
        kreaMoodboards.length,
        offset + moodboardLimit + 1
      );
      const staticPage = kreaMoodboards.slice(offset, staticPageEnd);
      const remainingSlots = moodboardLimit + 1 - staticPage.length;
      if (remainingSlots > 0) {
        const database = moodboardDatabase(request);
        if (database instanceof Response) return database;
        const databaseOffset = Math.max(0, offset - kreaMoodboards.length);
        const moodboardQuery = database
          .from('visual_moodboards')
          .select(moodboardSelect)
          .eq('visibility', 'public')
          .eq('moderation_status', 'active')
          .order('published_at', { ascending: false })
          .order('id', { ascending: true })
          .range(databaseOffset, databaseOffset + remainingSlots - 1);
        if (searchTerms.length) {
          moodboardQuery.or(
            buildSearchOrFilter(searchTerms, [
              'name',
              'description',
              'taste_profile'
            ])
          );
        }
        const moodboardResult = await moodboardQuery;
        if (moodboardResult.error)
          throw new Error(moodboardResult.error.message);
        rawMoodboards = moodboardResult.data || [];
      }
    }

    const moodboardPage = [
      ...kreaMoodboards.slice(offset, offset + moodboardLimit + 1),
      ...rawMoodboards.map((row) => formatMoodboard(row as never))
    ];
    const moodboards = moodboardPage.slice(0, moodboardLimit);
    const containsSignedUrls = moodboards.some((board) =>
      (board.items || []).some((item) =>
        isSupabaseSignedStorageUrl(item.imageUrl)
      )
    );

    return discoveryJson(
      request,
      {
        query,
        locale,
        images: kreaImages,
        moodboards,
        pagination: {
          images: {
            nextOffset: offset + kreaImages.length,
            hasMore: rawKreaImages.length > imageLimit
          },
          moodboards: {
            nextOffset: offset + moodboards.length,
            hasMore: moodboardPage.length > moodboardLimit
          }
        }
      },
      200,
      !containsSignedUrls
    );
  } catch (error) {
    return discoveryJson(
      request,
      {
        error: error instanceof Error ? error.message : 'Discovery query failed'
      },
      500
    );
  }
}
