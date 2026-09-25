import { SupabaseClient, createClient } from '@supabase/supabase-js';
import {
  sanitizeLegacyAutoNegativePrompt,
  type NegativePromptSource
} from '../../src/shared/image-negative-prompt.js';
import type { ImagePromptRecipeAudit } from '../../src/shared/image-prompt-recipe-audit.js';
import { getCorsHeadersForRequest, getUserIdFromRequest } from '../utils/auth';
import {
  buildClientMediaUrls,
  createMediaStorageAdapters,
  getVariantRecord,
  getVariantLocators,
  locatorFromRecord,
  safeMarkMediaObjectsDeleted
} from '../utils/media-storage/index.js';
import type { MediaVariant } from '../utils/media-storage/index.js';

export const config = { runtime: 'edge' };

type ImageHistoryDeps = {
  getCorsHeadersForRequest: typeof getCorsHeadersForRequest;
  getUserIdFromRequest: typeof getUserIdFromRequest;
  createSupabaseClient: typeof createClient;
};

const HISTORY_SIGNED_URL_EXPIRES_IN = 60 * 60 * 24;
const HISTORY_DEFAULT_LIMIT = 12;
const HISTORY_MAX_PAGE_SIZE = 60;
const HISTORY_LEGACY_ALL_LIMIT = 120;
const HISTORY_MAX_BATCH_IDS = 60;

interface ImageGenerationMetadata {
  isFavorite?: boolean;
  storageBucket?: string;
  storagePath?: string;
  thumbnailStoragePath?: string;
  previewStoragePath?: string;
  width?: number;
  height?: number;
  byteSize?: number;
  resultImageSize?: string;
  controlImageSize?: string;
  outputFormat?: string;
  referenceImageIds?: string[];
  referenceMode?: string;
  characterCardIds?: string[];
  characterReferenceGroups?: unknown;
  imageCount?: number;
  requestedImageCount?: number;
  sourceGenerationId?: string;
  editInstruction?: string;
  editMode?: 'context_locked';
  appSlug?: string;
  appOperation?: string;
  sourceApp?: string;
  storageProvider?: 'supabase' | 'r2';
  media?: unknown;
  negativePromptSource?: NegativePromptSource;
  recipeAudit?: ImagePromptRecipeAudit;
}

interface ImageGenerationRow {
  id: string;
  image_url: string;
  prompt: string;
  negative_prompt: string | null;
  model_label: string | null;
  provider: string;
  provider_model: string;
  aspect_ratio: string | null;
  quality: string | null;
  asset_ids: string[] | null;
  metadata: ImageGenerationMetadata | null;
  created_at: string;
}

interface ImageHistoryItem {
  id: string;
  imageUrl: string;
  imageUrlExpiresIn?: number;
  thumbnailUrl?: string;
  previewUrl?: string;
  storageBucket?: string;
  storagePath?: string;
  thumbnailStoragePath?: string;
  previewStoragePath?: string;
  width?: number;
  height?: number;
  prompt: string;
  negativePrompt?: string;
  modelLabel?: string;
  provider: string;
  model: string;
  aspectRatio?: string;
  imageSize?: string;
  actualImageSize?: string;
  requestedImageSize?: string;
  imageCount?: number;
  requestedImageCount?: number;
  quality?: string;
  outputFormat?: string;
  assetIds: string[];
  referenceImageIds: string[];
  referenceMode?: string;
  characterCardIds: string[];
  characterReferenceGroups: unknown[];
  sourceGenerationId?: string;
  editInstruction?: string;
  editMode?: 'context_locked';
  appSlug?: string;
  appOperation?: string;
  sourceApp?: string;
  recipeAudit?: ImagePromptRecipeAudit;
  isFavorite: boolean;
  createdAt: string;
}

function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

function inferMediaContentType(key: string, configured?: string): string {
  if (configured?.trim()) return configured;
  const normalized = key.toLowerCase().split('?')[0];
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.gif')) return 'image/gif';
  if (normalized.endsWith('.avif')) return 'image/avif';
  if (normalized.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

async function downloadHistoryImageBytes(
  adapter: ReturnType<typeof createMediaStorageAdapters>['r2'],
  record: NonNullable<ReturnType<typeof getVariantRecord>>
): Promise<ArrayBuffer | null> {
  const proxyUrl = process.env.LOCAL_R2_MEDIA_PROXY_URL?.trim();
  const proxyToken = process.env.LOCAL_R2_MEDIA_PROXY_TOKEN?.trim();
  if (record.provider === 'r2' && proxyUrl && proxyToken) {
    const url = new URL('/r2', proxyUrl);
    url.searchParams.set('bucket', record.bucket);
    url.searchParams.set('key', record.key);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${proxyToken}` }
    });
    return response.ok ? response.arrayBuffer() : null;
  }
  return adapter?.downloadObject(locatorFromRecord(record)) || null;
}

async function loadHistoryImageContent(
  supabase: SupabaseClient,
  userId: string,
  generationId: string,
  variant: MediaVariant,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { data, error } = await supabase
    .from('image_generations')
    .select('id, image_url, metadata')
    .eq('id', generationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[ImageHistory] load image content failed:', error);
    return jsonResponse({ error: 'Failed to load image' }, corsHeaders, 500);
  }
  if (!data) {
    return jsonResponse({ error: 'Image not found' }, corsHeaders, 404);
  }

  const row = data as Pick<ImageGenerationRow, 'id' | 'image_url' | 'metadata'>;
  const record =
    getVariantRecord(row.metadata, variant) ||
    (variant !== 'original'
      ? getVariantRecord(row.metadata, 'original')
      : null);
  if (!record) {
    return jsonResponse(
      { error: 'Image storage metadata is unavailable' },
      corsHeaders,
      404
    );
  }

  const adapters = createMediaStorageAdapters({
    supabase,
    defaultBucket: row.metadata?.storageBucket || 'user-generated-images'
  });
  const adapter = adapters[record.provider];
  if (!adapter) {
    return jsonResponse(
      { error: 'Image storage is unavailable' },
      corsHeaders,
      503
    );
  }

  const bytes = await downloadHistoryImageBytes(adapter, record);
  if (!bytes) {
    return jsonResponse({ error: 'Image object not found' }, corsHeaders, 404);
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': inferMediaContentType(record.key, record.contentType),
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, max-age=300, stale-while-revalidate=60',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function extractStorageLookupFromImageUrl(
  rawImageUrl: string
): { bucket: string; path: string } | null {
  const normalized = rawImageUrl.replace(/&amp;/g, '&').trim();
  if (!normalized) return null;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  const markers = ['/storage/v1/object/sign/', '/storage/v1/object/public/'];
  const marker = markers.find((item) => parsed.pathname.includes(item));
  if (!marker) return null;

  const encodedObjectPath = parsed.pathname.slice(
    parsed.pathname.indexOf(marker) + marker.length
  );
  const objectPath = decodeURIComponent(encodedObjectPath);
  const separatorIndex = objectPath.indexOf('/');
  if (separatorIndex <= 0) return null;

  return {
    bucket: objectPath.slice(0, separatorIndex),
    path: objectPath.slice(separatorIndex + 1)
  };
}

async function toHistoryItem(
  supabase: SupabaseClient,
  item: ImageGenerationRow
): Promise<ImageHistoryItem> {
  const storageBucket = item.metadata?.storageBucket;
  const mediaUrls = await buildClientMediaUrls(
    createMediaStorageAdapters({
      supabase,
      defaultBucket: storageBucket || 'user-generated-images'
    }),
    item.metadata,
    HISTORY_SIGNED_URL_EXPIRES_IN,
    { imageUrl: item.image_url }
  );
  const actualImageSize =
    item.metadata?.width && item.metadata?.height
      ? `${item.metadata.width}x${item.metadata.height}`
      : undefined;
  const requestedImageSize =
    item.metadata?.controlImageSize || item.metadata?.resultImageSize;
  return {
    id: item.id,
    imageUrl: mediaUrls.imageUrl || item.image_url,
    imageUrlExpiresIn: mediaUrls.imageUrlExpiresIn,
    thumbnailUrl: mediaUrls.thumbnailUrl,
    previewUrl: mediaUrls.previewUrl,
    storageBucket,
    storagePath: item.metadata?.storagePath,
    thumbnailStoragePath: item.metadata?.thumbnailStoragePath,
    previewStoragePath: item.metadata?.previewStoragePath,
    width: item.metadata?.width,
    height: item.metadata?.height,
    prompt: item.prompt,
    negativePrompt: sanitizeLegacyAutoNegativePrompt(
      item.negative_prompt,
      item.metadata?.negativePromptSource
    ),
    modelLabel: item.model_label || undefined,
    provider: item.provider,
    model: item.provider_model,
    aspectRatio: item.aspect_ratio || undefined,
    imageSize:
      item.metadata?.resultImageSize ||
      item.metadata?.controlImageSize ||
      undefined,
    actualImageSize,
    requestedImageSize,
    imageCount:
      typeof item.metadata?.imageCount === 'number'
        ? item.metadata.imageCount
        : undefined,
    requestedImageCount:
      typeof item.metadata?.requestedImageCount === 'number'
        ? item.metadata.requestedImageCount
        : undefined,
    quality: item.quality || undefined,
    outputFormat: item.metadata?.outputFormat || undefined,
    assetIds: item.asset_ids || [],
    referenceImageIds: Array.isArray(item.metadata?.referenceImageIds)
      ? item.metadata.referenceImageIds
      : [],
    referenceMode: item.metadata?.referenceMode || undefined,
    characterCardIds: Array.isArray(item.metadata?.characterCardIds)
      ? item.metadata.characterCardIds
      : [],
    characterReferenceGroups: Array.isArray(
      item.metadata?.characterReferenceGroups
    )
      ? item.metadata.characterReferenceGroups
      : [],
    sourceGenerationId:
      typeof item.metadata?.sourceGenerationId === 'string'
        ? item.metadata.sourceGenerationId
        : undefined,
    editInstruction:
      typeof item.metadata?.editInstruction === 'string'
        ? item.metadata.editInstruction
        : undefined,
    editMode:
      item.metadata?.editMode === 'context_locked'
        ? item.metadata.editMode
        : undefined,
    appSlug:
      typeof item.metadata?.appSlug === 'string'
        ? item.metadata.appSlug
        : undefined,
    appOperation:
      typeof item.metadata?.appOperation === 'string'
        ? item.metadata.appOperation
        : undefined,
    sourceApp:
      typeof item.metadata?.sourceApp === 'string'
        ? item.metadata.sourceApp
        : undefined,
    recipeAudit: item.metadata?.recipeAudit,
    isFavorite: item.metadata?.isFavorite === true,
    createdAt: item.created_at
  };
}

async function updateHistoryFavorite(
  supabase: SupabaseClient,
  userId: string,
  generationId: string,
  isFavorite: boolean,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { data: existing, error: loadError } = await supabase
    .from('image_generations')
    .select('metadata')
    .eq('id', generationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (loadError) {
    console.error('[ImageHistory] favorite load failed:', loadError);
    return jsonResponse(
      { error: 'Failed to update favorite' },
      corsHeaders,
      500
    );
  }
  if (!existing) {
    return jsonResponse({ error: 'Image not found' }, corsHeaders, 404);
  }

  const metadata =
    existing.metadata && typeof existing.metadata === 'object'
      ? (existing.metadata as ImageGenerationMetadata)
      : {};
  const { error: updateError } = await supabase
    .from('image_generations')
    .update({ metadata: { ...metadata, isFavorite } })
    .eq('id', generationId)
    .eq('user_id', userId);

  if (updateError) {
    console.error('[ImageHistory] favorite update failed:', updateError);
    return jsonResponse(
      { error: 'Failed to update favorite' },
      corsHeaders,
      500
    );
  }

  return jsonResponse(
    { success: true, id: generationId, isFavorite },
    corsHeaders
  );
}

async function loadHistoryItem(
  supabase: SupabaseClient,
  userId: string,
  generationId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { data, error } = await supabase
    .from('image_generations')
    .select(
      'id, image_url, prompt, negative_prompt, model_label, provider, provider_model, aspect_ratio, quality, asset_ids, metadata, created_at'
    )
    .eq('id', generationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[ImageHistory] single item load failed:', error);
    return jsonResponse(
      { error: 'Failed to load image history item' },
      corsHeaders,
      500
    );
  }

  if (!data) {
    return jsonResponse({ error: 'Image not found' }, corsHeaders, 404);
  }

  const item = await toHistoryItem(supabase, data as ImageGenerationRow);
  return jsonResponse({ item }, corsHeaders);
}

async function loadHistoryItemsByIds(
  supabase: SupabaseClient,
  userId: string,
  generationIds: string[],
  corsHeaders: Record<string, string>
): Promise<Response> {
  const uniqueIds = Array.from(
    new Set(generationIds.map((id) => id.trim()))
  ).filter(Boolean);
  if (uniqueIds.length === 0) {
    return jsonResponse({ items: [], missingIds: [] }, corsHeaders);
  }
  if (uniqueIds.length > HISTORY_MAX_BATCH_IDS) {
    return jsonResponse(
      { error: `ids supports at most ${HISTORY_MAX_BATCH_IDS} values` },
      corsHeaders,
      400
    );
  }

  const { data, error } = await supabase
    .from('image_generations')
    .select(
      'id, image_url, prompt, negative_prompt, model_label, provider, provider_model, aspect_ratio, quality, asset_ids, metadata, created_at'
    )
    .eq('user_id', userId)
    .in('id', uniqueIds);

  if (error) {
    console.error('[ImageHistory] batch load failed:', error);
    return jsonResponse(
      { error: 'Failed to load image history items' },
      corsHeaders,
      500
    );
  }

  const rowsById = new Map(
    ((data || []) as ImageGenerationRow[]).map((row) => [row.id, row])
  );
  const orderedRows = uniqueIds
    .map((id) => rowsById.get(id))
    .filter((row): row is ImageGenerationRow => Boolean(row));
  const items = await Promise.all(
    orderedRows.map((row) => toHistoryItem(supabase, row))
  );
  return jsonResponse(
    {
      items,
      missingIds: uniqueIds.filter((id) => !rowsById.has(id))
    },
    corsHeaders
  );
}

async function loadHistoryItemByImageUrl(
  supabase: SupabaseClient,
  userId: string,
  imageUrl: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const lookup = extractStorageLookupFromImageUrl(imageUrl);
  if (!lookup) {
    return jsonResponse({ error: 'Unsupported image URL' }, corsHeaders, 400);
  }

  if (!lookup.path.startsWith(`${userId}/`)) {
    return jsonResponse({ error: 'Image not found' }, corsHeaders, 404);
  }

  const { data, error } = await supabase
    .from('image_generations')
    .select(
      'id, image_url, prompt, negative_prompt, model_label, provider, provider_model, aspect_ratio, quality, asset_ids, metadata, created_at'
    )
    .eq('user_id', userId)
    .filter('metadata->>storageBucket', 'eq', lookup.bucket)
    .filter('metadata->>storagePath', 'eq', lookup.path)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[ImageHistory] item lookup by URL failed:', {
      bucket: lookup.bucket,
      path: lookup.path,
      error
    });
    return jsonResponse(
      { error: 'Failed to refresh image URL' },
      corsHeaders,
      500
    );
  }

  if (!data) {
    return jsonResponse({ error: 'Image not found' }, corsHeaders, 404);
  }

  const item = await toHistoryItem(supabase, data as ImageGenerationRow);
  return jsonResponse({ item }, corsHeaders);
}

async function deleteHistoryItem(
  supabase: SupabaseClient,
  userId: string,
  generationId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { data: item, error: loadError } = await supabase
    .from('image_generations')
    .select('id, metadata')
    .eq('id', generationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (loadError) {
    console.error('[ImageHistory] delete load failed:', loadError);
    return jsonResponse({ error: 'Failed to delete image' }, corsHeaders, 500);
  }
  if (!item) {
    return jsonResponse({ error: 'Image not found' }, corsHeaders, 404);
  }

  const metadata = (item.metadata || null) as ImageGenerationMetadata | null;
  const storageBucket = metadata?.storageBucket || 'user-generated-images';
  const locators = getVariantLocators(metadata);
  if (locators.length > 0) {
    const adapters = createMediaStorageAdapters({
      supabase,
      defaultBucket: storageBucket
    });
    try {
      for (const provider of ['supabase', 'r2'] as const) {
        const adapter = adapters[provider];
        const providerLocators = locators.filter(
          (locator) => locator.provider === provider
        );
        if (!adapter || providerLocators.length === 0) continue;
        await adapter.deleteObjects(providerLocators);
      }
    } catch (storageError) {
      console.error('[ImageHistory] storage remove failed:', {
        generationId,
        storageBucket,
        error: storageError
      });
      return jsonResponse(
        { error: 'Failed to delete image file' },
        corsHeaders,
        500
      );
    }

    await safeMarkMediaObjectsDeleted(supabase, locators, {
      logPrefix: '[ImageHistory] media_objects delete mark failed'
    });
  }

  const { error: deleteError } = await supabase
    .from('image_generations')
    .delete()
    .eq('id', generationId)
    .eq('user_id', userId);

  if (deleteError) {
    console.error('[ImageHistory] delete row failed:', deleteError);
    return jsonResponse({ error: 'Failed to delete image' }, corsHeaders, 500);
  }

  return jsonResponse({ success: true, id: generationId }, corsHeaders);
}

export function createImageHistoryHandler(deps: ImageHistoryDeps) {
  return async function handler(request: Request): Promise<Response> {
    const corsHeaders = deps.getCorsHeadersForRequest(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (
      request.method !== 'GET' &&
      request.method !== 'PATCH' &&
      request.method !== 'DELETE'
    ) {
      return jsonResponse(
        { error: 'Method not allowed', items: [] },
        corsHeaders,
        405
      );
    }

    const userId = await deps.getUserIdFromRequest(request);
    if (!userId) {
      return jsonResponse({ error: '请先登录', items: [] }, corsHeaders, 401);
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse(
        { error: 'Supabase not configured', items: [] },
        corsHeaders,
        500
      );
    }

    const url = new URL(request.url);
    const supabase = deps.createSupabaseClient(supabaseUrl, supabaseKey);
    if (request.method === 'PATCH') {
      const generationId = url.searchParams.get('id')?.trim();
      if (!generationId) {
        return jsonResponse({ error: 'id is required' }, corsHeaders, 400);
      }
      const body = (await request.json().catch(() => null)) as {
        isFavorite?: unknown;
      } | null;
      if (typeof body?.isFavorite !== 'boolean') {
        return jsonResponse(
          { error: 'isFavorite must be a boolean' },
          corsHeaders,
          400
        );
      }
      return updateHistoryFavorite(
        supabase,
        userId,
        generationId,
        body.isFavorite,
        corsHeaders
      );
    }
    if (request.method === 'DELETE') {
      const generationId = url.searchParams.get('id')?.trim();
      if (!generationId) {
        return jsonResponse({ error: 'id is required' }, corsHeaders, 400);
      }
      return deleteHistoryItem(supabase, userId, generationId, corsHeaders);
    }

    const generationId = url.searchParams.get('id')?.trim();
    if (generationId) {
      const requestedContent = url.searchParams.get('content')?.trim();
      if (requestedContent) {
        const variant: MediaVariant =
          requestedContent === 'thumbnail' || requestedContent === 'preview'
            ? requestedContent
            : 'original';
        return loadHistoryImageContent(
          supabase,
          userId,
          generationId,
          variant,
          corsHeaders
        );
      }
      return loadHistoryItem(supabase, userId, generationId, corsHeaders);
    }

    const batchIds = url.searchParams.get('ids');
    if (batchIds !== null) {
      return loadHistoryItemsByIds(
        supabase,
        userId,
        batchIds.split(','),
        corsHeaders
      );
    }

    const imageUrl = url.searchParams.get('imageUrl')?.trim();
    if (imageUrl) {
      return loadHistoryItemByImageUrl(supabase, userId, imageUrl, corsHeaders);
    }

    const rawLimit =
      url.searchParams.get('limit') || String(HISTORY_DEFAULT_LIMIT);
    const shouldLoadAll = rawLimit === 'all';
    const requestedLimit = shouldLoadAll
      ? HISTORY_LEGACY_ALL_LIMIT
      : parseInt(rawLimit, 10) || HISTORY_DEFAULT_LIMIT;
    const limit = Math.max(
      1,
      Math.min(
        requestedLimit,
        shouldLoadAll ? HISTORY_LEGACY_ALL_LIMIT : HISTORY_MAX_PAGE_SIZE
      )
    );
    const offset = Math.max(
      0,
      parseInt(url.searchParams.get('offset') || '0', 10) || 0
    );

    let query = supabase
      .from('image_generations')
      .select(
        'id, image_url, prompt, negative_prompt, model_label, provider, provider_model, aspect_ratio, quality, asset_ids, metadata, created_at',
        { count: 'exact' }
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (url.searchParams.get('favorite') === 'true') {
      query = query.filter('metadata->>isFavorite', 'eq', 'true');
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[ImageHistory] load failed:', error);
      return jsonResponse(
        { error: 'Failed to load image history', items: [] },
        corsHeaders,
        500
      );
    }

    const rows = (data || []) as ImageGenerationRow[];
    const items = await Promise.all(
      rows.map((item) => toHistoryItem(supabase, item))
    );

    return jsonResponse({ items, total: count ?? items.length }, corsHeaders);
  };
}

export default createImageHistoryHandler({
  getCorsHeadersForRequest,
  getUserIdFromRequest,
  createSupabaseClient: createClient
});
