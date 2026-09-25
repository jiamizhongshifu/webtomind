import { getCorsHeadersForRequest } from '../../../utils/auth';
import {
  assertPromptCaseAdmin,
  createPromptCaseSlug,
  getMissingPromptDraftsResponse,
  getSupabaseAdmin,
  inferLocaleFromDraft,
  isMissingPromptCaseDraftsTable,
  jsonResponse,
  normalizeImageUrls,
  normalizeTags,
  PROMPT_CASE_ADMIN_EMAIL
} from '../_shared';
import { refreshSupabaseSignedStorageUrls } from '../../../utils/signed-storage-url';

export const config = { runtime: 'edge' };
const DEFAULT_PUBLISHED_PROMPT_CASE_CATEGORY = 'portrait';

function getDraftId(request: Request): string {
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  return decodeURIComponent(segments[segments.length - 2] || '');
}

function getSelectedImageUrl(draft: Record<string, unknown>): string {
  const imageUrls = normalizeImageUrls(draft.image_urls);
  const selected =
    typeof draft.selected_image_url === 'string'
      ? draft.selected_image_url.trim()
      : '';
  return selected || imageUrls[0] || '';
}

function derivePromptPreview(prompt: string): string | null {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.length > 140
    ? `${normalized.slice(0, 140)}...`
    : normalized;
}

function normalizePublishedTags(tags: unknown): string[] {
  return normalizeTags(tags).filter((tag) => tag !== '待审核');
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePublishedCategory(
  value: unknown,
  isVideo = false
): string {
  const category = readTrimmedString(value);
  if (category && category !== 'featured') return category;
  return isVideo ? 'video' : DEFAULT_PUBLISHED_PROMPT_CASE_CATEGORY;
}

function normalizeJsonObject(
  value: unknown
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function isLikelyVideoUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.hostname === 'video.twimg.com' ||
      /\.(?:mp4|m3u8|mov|webm)(?:$|[?#])/i.test(url.pathname) ||
      /\/(?:ext_tw_video|tweet_video|amplify_video)\//i.test(url.pathname)
    );
  } catch {
    return /\.(?:mp4|m3u8|mov|webm)(?:$|[?#])/i.test(value);
  }
}

function getDraftGenerationSettings(
  draft: Record<string, unknown>
): Record<string, unknown> {
  return draft.generation_settings &&
    typeof draft.generation_settings === 'object' &&
    !Array.isArray(draft.generation_settings)
    ? (draft.generation_settings as Record<string, unknown>)
    : {};
}

function normalizeVideoUrls(value: unknown): string[] {
  const urls = [
    ...normalizeStringArray(value),
    ...(typeof value === 'string' ? [value.trim()] : [])
  ];
  return Array.from(new Set(urls.filter(isLikelyVideoUrl)));
}

function getDraftVideoUrls(draft: Record<string, unknown>): string[] {
  const settings = getDraftGenerationSettings(draft);
  const reviewNotes =
    typeof draft.review_notes === 'string' ? draft.review_notes : '';
  const noteMatch = reviewNotes.match(/sourceVideoUrls:\s*(.+)$/im);
  return Array.from(
    new Set(
      [
        ...normalizeVideoUrls(settings.videoUrls),
        ...normalizeVideoUrls(settings.sourceVideoUrls),
        ...normalizeVideoUrls(settings.videoUrl),
        ...normalizeVideoUrls(settings.sourceVideoUrl),
        ...(noteMatch?.[1]
          ? noteMatch[1]
              .split(',')
              .map((url) => url.trim())
              .filter(Boolean)
          : [])
      ].filter(isLikelyVideoUrl)
    )
  );
}

function mapPublishedPromptCase(item: Record<string, unknown>) {
  const imageUrls = Array.from(
    new Set(
      [
        ...normalizeImageUrls(item.image_urls),
        readTrimmedString(item.image_url)
      ].filter(Boolean)
    )
  );
  const promptZh = readTrimmedString(item.prompt_zh);
  const promptEn = readTrimmedString(item.prompt_en);
  const prompt = readTrimmedString(item.prompt) || promptZh || promptEn;
  const titleZh = readTrimmedString(item.title_zh);
  const titleEn = readTrimmedString(item.title_en);
  const title = readTrimmedString(item.title) || titleZh || titleEn;
  const videoUrls = Array.from(
    new Set(
      [
        ...normalizeVideoUrls(item.video_urls),
        readTrimmedString(item.video_url)
      ].filter(Boolean)
    )
  );

  return {
    id: readTrimmedString(item.id),
    imageUrl: imageUrls[0] || '',
    imageUrls,
    mediaType:
      readTrimmedString(item.media_type) ||
      (videoUrls.length ? 'video' : 'image'),
    videoUrl: videoUrls[0] || '',
    videoUrls,
    title,
    titleZh: titleZh || undefined,
    titleEn: titleEn || undefined,
    slug: readTrimmedString(item.slug) || undefined,
    category: normalizePublishedCategory(item.category),
    tags: normalizeTags(item.tags),
    model: readTrimmedString(item.model) || 'gemini-image',
    locale: readTrimmedString(item.locale) || 'zh-CN',
    sourceCaseId: readTrimmedString(item.source_case_id) || undefined,
    featured: Boolean(item.featured),
    memberOnly: Boolean(item.members_only),
    packageSlug: readTrimmedString(item.package_slug) || undefined,
    commercialIntent: readTrimmedString(item.commercial_intent) || undefined,
    promptPreview: readTrimmedString(item.prompt_preview) || undefined,
    visualRecipe: normalizeJsonObject(item.visual_recipe),
    sourceDraftId: readTrimmedString(item.source_draft_id) || undefined,
    viewCount: Number(item.view_count || 0),
    copyCount: Number(item.copy_count || 0),
    generateCount: Number(item.generate_count || 0),
    prompt,
    promptZh: promptZh || undefined,
    promptEn: promptEn || undefined,
    authorUrl: readTrimmedString(item.author_url) || undefined,
    sortOrder: Number(item.sort_order || 0),
    isPublished: Boolean(item.is_published),
    deletedAt: readTrimmedString(item.deleted_at) || undefined,
    createdByEmail: readTrimmedString(item.created_by_email) || undefined,
    createdAt: readTrimmedString(item.created_at) || undefined,
    updatedAt: readTrimmedString(item.updated_at) || undefined
  };
}

function getDraftSourceUrl(draft: Record<string, unknown>): string | null {
  const settings = getDraftGenerationSettings(draft);
  const sourceUrl =
    typeof settings.sourceUrl === 'string' ? settings.sourceUrl.trim() : '';
  if (sourceUrl) return sourceUrl;
  const reviewNotes =
    typeof draft.review_notes === 'string' ? draft.review_notes : '';
  const noteMatch = reviewNotes.match(/sourceUrl:\s*(https?:\/\/\S+)/i);
  return noteMatch?.[1]?.trim() || null;
}

function getDraftModel(draft: Record<string, unknown>): string {
  const settings =
    draft.generation_settings && typeof draft.generation_settings === 'object'
      ? (draft.generation_settings as Record<string, unknown>)
      : {};
  const model = typeof settings.model === 'string' ? settings.model.trim() : '';
  return model || 'gpt-image-2';
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const admin = await assertPromptCaseAdmin(request);
  if (!admin.ok) {
    return jsonResponse(
      { error: admin.error || 'Prompt case admin access required' },
      corsHeaders,
      admin.status
    );
  }

  const id = getDraftId(request);
  if (!id) {
    return jsonResponse({ error: 'id is required' }, corsHeaders, 400);
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return jsonResponse(
      { error: 'Supabase admin is not configured' },
      corsHeaders,
      500
    );
  }

  const { data: draft, error: draftError } = await sb
    .from('prompt_case_drafts')
    .select('*')
    .eq('id', id)
    .single();

  if (draftError || !draft) {
    if (isMissingPromptCaseDraftsTable(draftError)) {
      return getMissingPromptDraftsResponse(corsHeaders);
    }
    return jsonResponse(
      { error: 'Prompt case draft not found' },
      corsHeaders,
      404
    );
  }

  const selectedImageUrl = getSelectedImageUrl(draft);
  if (!selectedImageUrl) {
    return jsonResponse(
      { error: 'Draft must have at least one image before publishing' },
      corsHeaders,
      400
    );
  }
  if (typeof draft.prompt !== 'string' || !draft.prompt.trim()) {
    return jsonResponse(
      { error: 'Draft prompt is required' },
      corsHeaders,
      400
    );
  }

  const imageUrls = await refreshSupabaseSignedStorageUrls(
    sb,
    Array.from(
      new Set([selectedImageUrl, ...normalizeImageUrls(draft.image_urls)])
    )
  );
  const refreshedSelectedImageUrl = imageUrls[0] || selectedImageUrl;
  const title = typeof draft.title === 'string' ? draft.title.trim() : '';
  const draftSourceUrl = getDraftSourceUrl(draft);
  const videoUrls = getDraftVideoUrls(draft);
  const isVideo = videoUrls.length > 0;
  const caseInsert = {
    image_url: refreshedSelectedImageUrl,
    image_urls: imageUrls,
    media_type: isVideo ? 'video' : 'image',
    video_url: videoUrls[0] || null,
    video_urls: videoUrls,
    title,
    slug: createPromptCaseSlug(
      title,
      id,
      typeof draft.package_slug === 'string' ? draft.package_slug : null
    ),
    category: normalizePublishedCategory(draft.category, isVideo),
    tags: normalizePublishedTags(draft.tags),
    model: getDraftModel(draft),
    locale: inferLocaleFromDraft(draft),
    featured: false,
    members_only: draft.member_only === true,
    prompt: draft.prompt.trim(),
    author_url: draftSourceUrl,
    sort_order: 0,
    is_published: true,
    deleted_at: null,
    package_slug:
      typeof draft.package_slug === 'string' ? draft.package_slug : null,
    commercial_intent:
      typeof draft.commercial_intent === 'string'
        ? draft.commercial_intent
        : null,
    prompt_preview: derivePromptPreview(draft.prompt.trim()),
    source_draft_id: id,
    created_by_email: admin.email || PROMPT_CASE_ADMIN_EMAIL
  };

  const { data: promptCase, error: caseError } = await sb
    .from('prompt_cases')
    .insert(caseInsert)
    .select('*')
    .single();

  if (caseError || !promptCase) {
    console.error('[AdminPromptCaseDrafts] publish insert failed:', caseError);
    return jsonResponse(
      { error: caseError?.message || 'Failed to publish prompt case draft' },
      corsHeaders,
      500
    );
  }

  const { error: deleteError } = await sb
    .from('prompt_case_drafts')
    .delete()
    .eq('id', id);

  if (deleteError) {
    console.error(
      '[AdminPromptCaseDrafts] publish delete failed:',
      deleteError
    );
    return jsonResponse(
      {
        error:
          deleteError.message ||
          'Prompt case was created, but draft cleanup failed',
        case: mapPublishedPromptCase(promptCase)
      },
      corsHeaders,
      500
    );
  }

  return jsonResponse(
    {
      deletedDraftId: id,
      case: mapPublishedPromptCase(promptCase)
    },
    corsHeaders
  );
}
