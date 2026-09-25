import { type SupabaseClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';
import {
  assertPromptCaseAdmin,
  getSupabaseAdmin,
  PROMPT_CASE_ADMIN_EMAIL
} from './prompt-case-auth';
import {
  createAiProviderUsageTiming,
  estimateTokensFromText,
  extractOpenAICompatibleUsage,
  recordAiProviderUsage,
  resolveTokenUsageSource
} from '../utils/ai-provider-usage';
import { DEEPSEEK_V4_FLASH_0731_MODEL } from '../utils/model-registry';
import { refreshSupabaseSignedStorageUrls } from '../utils/signed-storage-url';

export const config = { runtime: 'edge' };

const PROMPT_CASE_CATEGORIES = new Set([
  'portrait',
  'cover',
  'ecommerce',
  'fashion',
  'character',
  'background',
  'poster',
  'xiaohongshu',
  'wechat-cover',
  'video',
  'featured'
]);
const DEFAULT_PROMPT_CASE_CATEGORY = 'portrait';
const PROMPT_CASE_LOCALES = new Set(['zh-CN', 'en-US']);
const PROMPT_CASE_TRANSLATION_TIMEOUT_MS = 20000;
const PROMPT_CASE_ADMIN_DEFAULT_PAGE_SIZE = 100;
const PROMPT_CASE_ADMIN_MAX_PAGE_SIZE = 200;
const PROMPT_CASE_ADMIN_LIST_COLUMNS = [
  'id',
  'image_url',
  'image_urls',
  'title',
  'title_zh',
  'title_en',
  'slug',
  'category',
  'tags',
  'model',
  'locale',
  'source_case_id',
  'featured',
  'members_only',
  'package_slug',
  'commercial_intent',
  'prompt_preview',
  'visual_recipe',
  'source_draft_id',
  'view_count',
  'copy_count',
  'generate_count',
  'author_url',
  'sort_order',
  'is_published',
  'deleted_at',
  'created_by_email',
  'created_at',
  'updated_at'
].join(',');

type PromptCaseTranslation = {
  title: string;
  prompt: string;
  tags: string[];
};

interface PromptCaseWriteInput {
  action?: string;
  id?: string;
  imageUrl?: string;
  imageUrls?: string[];
  title?: string;
  slug?: string;
  category?: string;
  tags?: string[];
  model?: string;
  locale?: string;
  featured?: boolean;
  memberOnly?: boolean;
  packageSlug?: string | null;
  commercialIntent?: string | null;
  promptPreview?: string | null;
  visualRecipe?: Record<string, unknown> | null;
  sourceDraftId?: string | null;
  prompt?: string;
  authorUrl?: string | null;
  sortOrder?: number;
  isPublished?: boolean;
  seoStatus?: 'draft' | 'review' | 'indexable' | 'retired';
  seoEvidence?: Record<string, unknown>;
  videoDurationSeconds?: number | null;
  videoUploadDate?: string | null;
}

type PromptCaseRecord = Record<string, unknown>;
type PromptCaseAdminSort =
  | 'default'
  | 'created-desc'
  | 'created-asc'
  | 'views'
  | 'copies'
  | 'generates'
  | 'generate-rate';

type PromptCaseMirrorIssue = {
  sourceId: string;
  expectedSlug: string | null;
  mirrorIds: string[];
  reasons: string[];
};

type PromptCaseMirrorStats = {
  zhSourceCount: number;
  enMirrorCount: number;
  matchedSourceCount: number;
  missingMirrorCount: number;
  duplicateMirrorSourceCount: number;
  staleMirrorCount: number;
  orphanMirrorCount: number;
};

type PromptCaseMirrorDiagnostic = {
  stats: PromptCaseMirrorStats;
  issues: {
    missingMirrors: PromptCaseMirrorIssue[];
    duplicateMirrors: PromptCaseMirrorIssue[];
    staleMirrors: PromptCaseMirrorIssue[];
    orphanMirrors: Array<{
      mirrorId: string;
      sourceCaseId: string | null;
      slug: string | null;
    }>;
  };
};

type PromptCaseMirrorRepairResult = PromptCaseMirrorDiagnostic & {
  repaired: {
    linkedMirrors: number;
    syncedMirrors: number;
    createdMirrors: number;
    skippedMissingMirrors: PromptCaseMirrorIssue[];
    skippedDuplicateMirrors: PromptCaseMirrorIssue[];
  };
};

function derivePromptPreview(prompt: string): string | null {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.length > 140
    ? `${normalized.slice(0, 140)}...`
    : normalized;
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

function inferPromptCaseTitle(prompt: unknown, fallback = 'Untitled prompt') {
  if (typeof prompt !== 'string') return fallback;
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return (
    normalized
      .replace(/^\s*\d{1,2}\s*[:：]\s*\d{1,2}\s*[，,、。.\s-]*/u, '')
      .replace(/^生成一?张(?:单张)?\s*/u, '')
      .split(/[，,。.;；\n]/u)[0]
      .trim()
      .slice(0, 28) || fallback
  );
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter(Boolean);
}

function normalizeJsonObject(
  value: unknown
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function getPromptCaseTranslationSlug(sourceId: unknown): string | null {
  if (typeof sourceId !== 'string' || !sourceId.trim()) return null;
  return `en-case-${sourceId
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 12)
    .toLowerCase()}`;
}

function getTranslationApiConfig(): {
  apiKey: string;
  baseUrl: string;
  model: string;
} | null {
  const apiKey =
    process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl:
      process.env.PROMPT_CASE_TRANSLATION_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      process.env.DEEPSEEK_BASE_URL ||
      'https://api.openai.com/v1',
    model: DEEPSEEK_V4_FLASH_0731_MODEL
  };
}

function getTranslationProvider(baseUrl: string): string {
  const normalized = baseUrl.toLowerCase();
  const usesDeepSeekKey =
    !process.env.OPENAI_API_KEY && Boolean(process.env.DEEPSEEK_API_KEY);
  if (normalized.includes('deepseek') || usesDeepSeekKey) return 'deepseek';
  if (normalized.includes('openai')) return 'openai';
  return 'openai_compatible';
}

function extractJsonObject(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function normalizeTranslation(value: unknown): PromptCaseTranslation | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : '';
  const tags = normalizeTags(record.tags).slice(0, 8);
  if (!title || !prompt) return null;
  return { title, prompt, tags };
}

async function translatePromptCaseToEnglish(
  source: Record<string, unknown>,
  userId?: string | null
): Promise<PromptCaseTranslation | null> {
  const config = getTranslationApiConfig();
  if (!config) return null;
  const provider = getTranslationProvider(config.baseUrl);
  const timing = createAiProviderUsageTiming();
  const sourcePayload = {
    title: source.title || '',
    prompt: source.prompt || '',
    tags: source.tags || [],
    category: source.category || '',
    model: source.model || ''
  };
  const requestText = JSON.stringify(sourcePayload);

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    PROMPT_CASE_TRANSLATION_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${config.baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: config.model,
          temperature: 0.2,
          max_tokens: 4096,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Translate WebToMind curated AI image prompt cases from Chinese to English. Preserve model names, aspect ratios, camera terms, safety constraints, and prompt structure. Do not invent new scenes. If the source title is empty, create a concise English title from the prompt. Return only compact JSON with keys title, prompt, tags. Tags must be short English SEO labels.'
            },
            {
              role: 'user',
              content: requestText
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn(
        '[AdminPromptCases] translation API failed:',
        response.status,
        errorText
      );
      await recordAiProviderUsage({
        userId,
        provider,
        model: config.model,
        endpoint: 'chat/completions',
        source: 'admin_prompt_case_translation',
        status: 'failed',
        inputTokens: estimateTokensFromText(requestText),
        tokenUsageSource: 'estimated',
        promptChars: requestText.length,
        latencyMs: timing.mark(),
        errorMessage: `Translation request failed: ${response.status} ${errorText.slice(0, 500)}`,
        metadata: {
          sourceCaseId: typeof source.id === 'string' ? source.id : null,
          sourceLocale: source.locale || null
        },
        startedAt: timing.startedAt
      });
      return null;
    }

    const payload = (await response.json().catch(() => null)) as {
      choices?: Array<{
        message?: { content?: string };
      }>;
    } | null;
    const content = payload?.choices?.[0]?.message?.content || '';
    const translation = normalizeTranslation(extractJsonObject(content));
    const usage = extractOpenAICompatibleUsage(payload);
    await recordAiProviderUsage({
      userId,
      provider,
      model: config.model,
      endpoint: 'chat/completions',
      source: 'admin_prompt_case_translation',
      status: translation ? 'succeeded' : 'failed',
      inputTokens: usage.inputTokens ?? estimateTokensFromText(requestText),
      outputTokens: usage.outputTokens ?? estimateTokensFromText(content),
      totalTokens: usage.totalTokens,
      tokenUsageSource: resolveTokenUsageSource({
        ...usage,
        estimated:
          !usage.totalTokens && !usage.inputTokens && !usage.outputTokens
      }),
      promptChars: requestText.length,
      responseChars: content.length,
      latencyMs: timing.mark(),
      errorMessage: translation
        ? null
        : 'Translation response could not be normalized',
      metadata: {
        sourceCaseId: typeof source.id === 'string' ? source.id : null,
        sourceLocale: source.locale || null
      },
      startedAt: timing.startedAt
    });
    return translation;
  } catch (error) {
    console.warn('[AdminPromptCases] translation unavailable:', error);
    await recordAiProviderUsage({
      userId,
      provider,
      model: config.model,
      endpoint: 'chat/completions',
      source: 'admin_prompt_case_translation',
      status: 'failed',
      inputTokens: estimateTokensFromText(requestText),
      tokenUsageSource: 'estimated',
      promptChars: requestText.length,
      latencyMs: timing.mark(),
      errorMessage: error instanceof Error ? error.message : String(error),
      metadata: {
        sourceCaseId: typeof source.id === 'string' ? source.id : null,
        sourceLocale: source.locale || null
      },
      startedAt: timing.startedAt
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function mapPromptCase(
  item: Record<string, unknown>,
  supabase: SupabaseClient,
  preloadedImageUrls?: string[]
) {
  const imageUrls = Array.isArray(item.image_urls)
    ? item.image_urls.filter((url): url is string => typeof url === 'string')
    : [];
  const imageUrl = typeof item.image_url === 'string' ? item.image_url : '';
  const normalizedImageUrls = Array.from(
    new Set([...imageUrls, imageUrl].map((url) => url.trim()).filter(Boolean))
  );
  const refreshedImageUrls =
    preloadedImageUrls ||
    (await refreshSupabaseSignedStorageUrls(supabase, normalizedImageUrls));
  const availableImageUrls = refreshedImageUrls.filter(Boolean);
  const coverImageUrl = availableImageUrls[0] || '';
  const promptZh = readTrimmedString(item.prompt_zh);
  const promptEn = readTrimmedString(item.prompt_en);
  const prompt = readTrimmedString(item.prompt) || promptZh || promptEn;
  const titleZh = readTrimmedString(item.title_zh);
  const titleEn = readTrimmedString(item.title_en);
  const title = readTrimmedString(item.title) || titleZh || titleEn;
  return {
    id: item.id,
    imageUrl: coverImageUrl,
    imageUrls: availableImageUrls,
    mediaType:
      readTrimmedString(item.media_type) === 'video' ? 'video' : 'image',
    videoUrl: readTrimmedString(item.video_url) || undefined,
    videoUrls: Array.isArray(item.video_urls)
      ? item.video_urls.filter(
          (url): url is string => typeof url === 'string' && Boolean(url.trim())
        )
      : [],
    posterUrl: coverImageUrl || undefined,
    durationSeconds:
      Number(item.video_duration_seconds) > 0
        ? Number(item.video_duration_seconds)
        : undefined,
    uploadDate: readTrimmedString(item.video_upload_date) || undefined,
    title: title || inferPromptCaseTitle(prompt),
    titleZh: titleZh || undefined,
    titleEn: titleEn || undefined,
    slug:
      typeof item.slug === 'string' && item.slug.trim()
        ? item.slug.trim()
        : undefined,
    category:
      typeof item.category === 'string' && item.category.trim()
        ? item.category.trim()
        : DEFAULT_PROMPT_CASE_CATEGORY,
    tags: normalizeTags(item.tags),
    model:
      typeof item.model === 'string' && item.model.trim()
        ? item.model.trim()
        : 'gemini-image',
    locale:
      typeof item.locale === 'string' && item.locale.trim()
        ? item.locale.trim()
        : 'zh-CN',
    sourceCaseId:
      typeof item.source_case_id === 'string' && item.source_case_id.trim()
        ? item.source_case_id.trim()
        : undefined,
    featured: Boolean(item.featured),
    memberOnly: Boolean(item.members_only),
    packageSlug:
      typeof item.package_slug === 'string' && item.package_slug.trim()
        ? item.package_slug.trim()
        : undefined,
    commercialIntent:
      typeof item.commercial_intent === 'string' &&
      item.commercial_intent.trim()
        ? item.commercial_intent.trim()
        : undefined,
    promptPreview:
      typeof item.prompt_preview === 'string' && item.prompt_preview.trim()
        ? item.prompt_preview.trim()
        : undefined,
    visualRecipe: normalizeJsonObject(item.visual_recipe),
    sourceDraftId:
      typeof item.source_draft_id === 'string' && item.source_draft_id.trim()
        ? item.source_draft_id.trim()
        : undefined,
    viewCount: Number(item.view_count || 0),
    copyCount: Number(item.copy_count || 0),
    generateCount: Number(item.generate_count || 0),
    prompt,
    promptZh: promptZh || undefined,
    promptEn: promptEn || undefined,
    authorUrl: item.author_url || undefined,
    sortOrder: item.sort_order,
    isPublished: item.is_published,
    deletedAt: item.deleted_at || undefined,
    createdByEmail: item.created_by_email || undefined,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    seoStatus: readTrimmedString(item.seo_status) || 'draft',
    seoReviewedAt: readTrimmedString(item.seo_reviewed_at) || undefined,
    seoEvidence: normalizeJsonObject(item.seo_evidence) || {}
  };
}

function getPromptCaseImageUrls(item: PromptCaseRecord): string[] {
  const imageUrls = Array.isArray(item.image_urls)
    ? item.image_urls.filter((url): url is string => typeof url === 'string')
    : [];
  const imageUrl = typeof item.image_url === 'string' ? item.image_url : '';
  return Array.from(
    new Set([...imageUrls, imageUrl].map((url) => url.trim()).filter(Boolean))
  );
}

async function mapPromptCasePage(
  items: PromptCaseRecord[],
  sb: SupabaseClient
) {
  const imageUrlsByCase = items.map(getPromptCaseImageUrls);
  const flattenedImageUrls = imageUrlsByCase.flat();
  const refreshedImageUrls = await refreshSupabaseSignedStorageUrls(
    sb,
    flattenedImageUrls
  );
  let imageOffset = 0;

  return Promise.all(
    items.map((item, index) => {
      const imageCount = imageUrlsByCase[index].length;
      const caseImageUrls = refreshedImageUrls.slice(
        imageOffset,
        imageOffset + imageCount
      );
      imageOffset += imageCount;
      return mapPromptCase(item, sb, caseImageUrls);
    })
  );
}

function buildPatch(input: PromptCaseWriteInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (input.imageUrls !== undefined) {
    const imageUrls = input.imageUrls.map((url) => url.trim()).filter(Boolean);
    patch.image_urls = imageUrls;
    patch.image_url = imageUrls[0] || '';
  } else if (input.imageUrl !== undefined) {
    const imageUrl = input.imageUrl.trim();
    patch.image_url = imageUrl;
    patch.image_urls = imageUrl ? [imageUrl] : [];
  }
  if (input.prompt !== undefined) {
    const prompt = input.prompt.trim();
    patch.prompt = prompt;
    patch.prompt_preview = derivePromptPreview(prompt);
  }
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.slug !== undefined) patch.slug = input.slug.trim() || null;
  if (input.category !== undefined)
    patch.category = input.category.trim() || DEFAULT_PROMPT_CASE_CATEGORY;
  if (input.tags !== undefined) patch.tags = normalizeTags(input.tags);
  if (input.model !== undefined)
    patch.model = input.model.trim() || 'gemini-image';
  if (input.locale !== undefined) patch.locale = input.locale.trim() || 'zh-CN';
  if (input.featured !== undefined) patch.featured = input.featured;
  if (input.memberOnly !== undefined) patch.members_only = input.memberOnly;
  if (input.packageSlug !== undefined)
    patch.package_slug = input.packageSlug?.trim() || null;
  if (input.commercialIntent !== undefined)
    patch.commercial_intent = input.commercialIntent?.trim() || null;
  if (input.promptPreview !== undefined)
    patch.prompt_preview = input.promptPreview?.trim() || null;
  if (input.visualRecipe !== undefined)
    patch.visual_recipe = normalizeJsonObject(input.visualRecipe) || {};
  if (input.sourceDraftId !== undefined)
    patch.source_draft_id = input.sourceDraftId?.trim() || null;
  if (input.authorUrl !== undefined)
    patch.author_url = input.authorUrl?.trim() || null;
  if (input.sortOrder !== undefined) patch.sort_order = Number(input.sortOrder);
  if (input.isPublished !== undefined) patch.is_published = input.isPublished;
  if (input.videoDurationSeconds !== undefined) {
    const duration = Number(input.videoDurationSeconds);
    patch.video_duration_seconds =
      Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null;
  }
  if (input.videoUploadDate !== undefined) {
    patch.video_upload_date = input.videoUploadDate?.trim() || null;
  }
  if (input.seoEvidence !== undefined) {
    patch.seo_evidence = normalizeJsonObject(input.seoEvidence) || {};
  }
  if (input.seoStatus !== undefined) {
    patch.seo_status = input.seoStatus;
    patch.seo_reviewed_at =
      input.seoStatus === 'indexable' ? new Date().toISOString() : null;
  }

  const changesSearchContent = [
    'image_url',
    'image_urls',
    'prompt',
    'title',
    'slug',
    'category',
    'tags',
    'model',
    'locale',
    'members_only',
    'package_slug',
    'commercial_intent',
    'prompt_preview',
    'author_url',
    'video_duration_seconds',
    'video_upload_date'
  ].some((key) => Object.prototype.hasOwnProperty.call(patch, key));
  if (changesSearchContent && input.seoStatus === undefined) {
    patch.seo_status = 'review';
    patch.seo_reviewed_at = null;
  }

  return patch;
}

function validatePatch(patch: Record<string, unknown>): string | null {
  if (patch.slug !== undefined && patch.slug !== null) {
    const slug = String(patch.slug);
    if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return 'slug must use lowercase letters, numbers, and hyphens only';
    }
  }
  if (
    patch.category !== undefined &&
    !PROMPT_CASE_CATEGORIES.has(String(patch.category))
  ) {
    return `category must be one of: ${Array.from(PROMPT_CASE_CATEGORIES).join(', ')}`;
  }
  if (
    patch.locale !== undefined &&
    !PROMPT_CASE_LOCALES.has(String(patch.locale))
  ) {
    return 'locale must be zh-CN or en-US';
  }
  if (
    patch.seo_status !== undefined &&
    !['draft', 'review', 'indexable', 'retired'].includes(
      String(patch.seo_status)
    )
  ) {
    return 'seoStatus must be draft, review, indexable, or retired';
  }
  if (patch.seo_status === 'indexable') {
    const evidence = normalizeJsonObject(patch.seo_evidence);
    if (
      !evidence ||
      evidence.source_verified !== true ||
      evidence.media_verified !== true
    ) {
      return 'indexable cases require source_verified and media_verified evidence';
    }
  }
  return null;
}

async function validateSlugUnique(
  sb: SupabaseClient,
  slug: unknown,
  currentId?: string
): Promise<string | null> {
  const normalizedSlug = typeof slug === 'string' ? slug.trim() : '';
  if (!normalizedSlug) return null;

  let query = sb
    .from('prompt_cases')
    .select('id')
    .eq('slug', normalizedSlug)
    .is('deleted_at', null)
    .limit(1);

  if (currentId) {
    query = query.neq('id', currentId);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingPromptCasesTable(error)) return null;
    console.error('[AdminPromptCases] slug uniqueness check failed:', error);
    return 'Failed to validate slug uniqueness';
  }

  return data && data.length > 0 ? 'Slug already exists' : null;
}

function getRecordId(record: PromptCaseRecord): string | null {
  return typeof record.id === 'string' && record.id.trim()
    ? record.id.trim()
    : null;
}

function getRecordString(
  record: PromptCaseRecord,
  field: string
): string | null {
  const value = record[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isDeletedPromptCase(record: PromptCaseRecord): boolean {
  return Boolean(record.deleted_at);
}

function isPromptCaseLocale(
  record: PromptCaseRecord,
  locale: 'zh-CN' | 'en-US'
): boolean {
  return getRecordString(record, 'locale') === locale;
}

function normalizeImageUrlsForMirror(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((url): url is string => typeof url === 'string')
    : [];
}

function valuesMatchForMirror(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      JSON.stringify(Array.isArray(left) ? left : []) ===
      JSON.stringify(Array.isArray(right) ? right : [])
    );
  }
  return (left ?? null) === (right ?? null);
}

function buildEnglishMirrorCorePatch(
  source: PromptCaseRecord
): Record<string, unknown> {
  const sourceId = getRecordId(source);
  const patch: Record<string, unknown> = {
    image_url: source.image_url,
    image_urls: normalizeImageUrlsForMirror(source.image_urls),
    category: source.category || DEFAULT_PROMPT_CASE_CATEGORY,
    model: source.model || 'gemini-image',
    source_case_id: sourceId,
    featured: Boolean(source.featured),
    members_only: Boolean(source.members_only),
    package_slug: source.package_slug || null,
    commercial_intent: source.commercial_intent || null,
    prompt_preview: source.prompt_preview || null,
    visual_recipe: normalizeJsonObject(source.visual_recipe) || {},
    source_draft_id: source.source_draft_id || null,
    author_url: source.author_url || null,
    sort_order: source.sort_order,
    is_published: source.is_published !== false,
    deleted_at: null
  };

  const expectedSlug = getPromptCaseTranslationSlug(sourceId);
  if (expectedSlug) patch.slug = expectedSlug;

  return patch;
}

function getMirrorCoreDifferences(
  source: PromptCaseRecord,
  mirror: PromptCaseRecord
): string[] {
  const patch = buildEnglishMirrorCorePatch(source);
  const differences: string[] = [];

  Object.entries(patch).forEach(([field, value]) => {
    if (!valuesMatchForMirror(mirror[field], value)) {
      differences.push(field);
    }
  });

  return differences;
}

function findEnglishMirrorsForSource(
  source: PromptCaseRecord,
  englishCases: PromptCaseRecord[]
): PromptCaseRecord[] {
  const sourceId = getRecordId(source);
  const expectedSlug = getPromptCaseTranslationSlug(sourceId);
  if (!sourceId && !expectedSlug) return [];

  return englishCases.filter((item) => {
    const sourceCaseId = getRecordString(item, 'source_case_id');
    const slug = getRecordString(item, 'slug');
    return (
      (sourceId && sourceCaseId === sourceId) ||
      (expectedSlug && slug === expectedSlug)
    );
  });
}

export function analyzePromptCaseMirrorState(
  cases: PromptCaseRecord[]
): PromptCaseMirrorDiagnostic {
  const zhSources = cases.filter(
    (item) => isPromptCaseLocale(item, 'zh-CN') && !isDeletedPromptCase(item)
  );
  const englishCases = cases.filter((item) =>
    isPromptCaseLocale(item, 'en-US')
  );
  const activeEnglishCases = englishCases.filter(
    (item) => !isDeletedPromptCase(item)
  );
  const matchedEnglishIds = new Set<string>();
  const missingMirrors: PromptCaseMirrorIssue[] = [];
  const duplicateMirrors: PromptCaseMirrorIssue[] = [];
  const staleMirrors: PromptCaseMirrorIssue[] = [];

  zhSources.forEach((source) => {
    const sourceId = getRecordId(source);
    if (!sourceId) return;
    const expectedSlug = getPromptCaseTranslationSlug(sourceId);
    const mirrors = findEnglishMirrorsForSource(source, englishCases);
    const mirrorIds = mirrors
      .map((mirror) => getRecordId(mirror))
      .filter(Boolean) as string[];

    mirrorIds.forEach((id) => matchedEnglishIds.add(id));

    if (mirrors.length === 0) {
      missingMirrors.push({
        sourceId,
        expectedSlug,
        mirrorIds: [],
        reasons: ['missingEnglishMirror']
      });
      return;
    }

    if (mirrors.length > 1) {
      duplicateMirrors.push({
        sourceId,
        expectedSlug,
        mirrorIds,
        reasons: ['duplicateEnglishMirrors']
      });
      return;
    }

    const mirror = mirrors[0];
    const coreDifferences = getMirrorCoreDifferences(source, mirror);
    const reasons = [...coreDifferences.map((field) => `coreField:${field}`)];
    if (isDeletedPromptCase(mirror)) reasons.push('mirrorSoftDeleted');
    if (reasons.length > 0) {
      staleMirrors.push({
        sourceId,
        expectedSlug,
        mirrorIds,
        reasons
      });
    }
  });

  const orphanMirrors = activeEnglishCases
    .filter((mirror) => {
      const mirrorId = getRecordId(mirror);
      return mirrorId ? !matchedEnglishIds.has(mirrorId) : true;
    })
    .map((mirror) => ({
      mirrorId: getRecordId(mirror) || '',
      sourceCaseId: getRecordString(mirror, 'source_case_id'),
      slug: getRecordString(mirror, 'slug')
    }));

  return {
    stats: {
      zhSourceCount: zhSources.length,
      enMirrorCount: activeEnglishCases.length,
      matchedSourceCount:
        zhSources.length - missingMirrors.length - duplicateMirrors.length,
      missingMirrorCount: missingMirrors.length,
      duplicateMirrorSourceCount: duplicateMirrors.length,
      staleMirrorCount: staleMirrors.length,
      orphanMirrorCount: orphanMirrors.length
    },
    issues: {
      missingMirrors,
      duplicateMirrors,
      staleMirrors,
      orphanMirrors
    }
  };
}

async function loadPromptCasesForMirrorAction(
  sb: SupabaseClient
): Promise<{ cases: PromptCaseRecord[]; error: unknown }> {
  const { data, error } = await sb.from('prompt_cases').select('*');
  return {
    cases: Array.isArray(data) ? (data as PromptCaseRecord[]) : [],
    error
  };
}

async function findExistingEnglishPromptCase(
  sb: SupabaseClient,
  source: PromptCaseRecord
): Promise<PromptCaseRecord | null> {
  const sourceId = getRecordId(source);
  const slug = getPromptCaseTranslationSlug(sourceId);
  if (!sourceId && !slug) return null;

  if (sourceId) {
    const { data, error } = await sb
      .from('prompt_cases')
      .select('*')
      .eq('locale', 'en-US')
      .eq('source_case_id', sourceId)
      .limit(2);
    if (!error && Array.isArray(data) && data.length === 1) {
      return data[0] as PromptCaseRecord;
    }
    if (!error && Array.isArray(data) && data.length > 1) {
      console.warn(
        '[AdminPromptCases] duplicate English mirrors by source_case_id:',
        sourceId
      );
      return null;
    }
    if (error && !isMissingPromptCasesTable(error)) {
      console.warn(
        '[AdminPromptCases] English case source lookup failed:',
        error
      );
    }
  }

  if (!slug) return null;
  const { data, error } = await sb
    .from('prompt_cases')
    .select('*')
    .eq('locale', 'en-US')
    .eq('slug', slug)
    .limit(2);
  if (!error && Array.isArray(data) && data.length === 1) {
    return data[0] as PromptCaseRecord;
  }
  if (!error && Array.isArray(data) && data.length > 1) {
    console.warn('[AdminPromptCases] duplicate English mirrors by slug:', slug);
  } else if (error && !isMissingPromptCasesTable(error)) {
    console.warn('[AdminPromptCases] English case slug lookup failed:', error);
  }
  return null;
}

async function upsertEnglishPromptCase(
  sb: SupabaseClient,
  source: PromptCaseRecord,
  adminEmail: string,
  adminUserId?: string | null
): Promise<'updated' | 'created' | 'skipped'> {
  if (source.locale !== 'zh-CN') return 'skipped';
  if (!source.id || !source.prompt || !source.image_url) return 'skipped';

  const translation = await translatePromptCaseToEnglish(source, adminUserId);
  if (!translation) return 'skipped';

  const patch = {
    ...buildEnglishMirrorCorePatch(source),
    title: translation.title,
    tags: translation.tags,
    locale: 'en-US',
    prompt: translation.prompt
  };

  const existing = await findExistingEnglishPromptCase(sb, source);
  const result = existing?.id
    ? await sb
        .from('prompt_cases')
        .update(patch)
        .eq('id', existing.id)
        .select('id')
        .single()
    : await sb
        .from('prompt_cases')
        .insert({
          ...patch,
          created_by_email: adminEmail
        })
        .select('id')
        .single();

  if (result.error) {
    console.warn('[AdminPromptCases] English case sync failed:', result.error);
    return 'skipped';
  }

  return existing?.id ? 'updated' : 'created';
}

export async function diagnosePromptCaseMirrors(
  sb: SupabaseClient
): Promise<{ diagnostic?: PromptCaseMirrorDiagnostic; error?: unknown }> {
  const { cases, error } = await loadPromptCasesForMirrorAction(sb);
  if (error) return { error };
  return { diagnostic: analyzePromptCaseMirrorState(cases) };
}

export async function repairPromptCaseMirrors(
  sb: SupabaseClient,
  adminEmail: string,
  adminUserId?: string | null
): Promise<{ result?: PromptCaseMirrorRepairResult; error?: unknown }> {
  const loaded = await loadPromptCasesForMirrorAction(sb);
  if (loaded.error) return { error: loaded.error };

  const before = analyzePromptCaseMirrorState(loaded.cases);
  const zhSources = loaded.cases.filter(
    (item) => isPromptCaseLocale(item, 'zh-CN') && !isDeletedPromptCase(item)
  );
  const englishCases = loaded.cases.filter((item) =>
    isPromptCaseLocale(item, 'en-US')
  );
  const duplicateSourceIds = new Set(
    before.issues.duplicateMirrors.map((issue) => issue.sourceId)
  );
  const skippedMissingMirrors: PromptCaseMirrorIssue[] = [];
  let linkedMirrors = 0;
  let syncedMirrors = 0;
  let createdMirrors = 0;

  for (const source of zhSources) {
    const sourceId = getRecordId(source);
    if (!sourceId || duplicateSourceIds.has(sourceId)) continue;

    const mirrors = findEnglishMirrorsForSource(source, englishCases);
    if (mirrors.length === 1) {
      const mirrorId = getRecordId(mirrors[0]);
      if (!mirrorId) continue;
      const differences = getMirrorCoreDifferences(source, mirrors[0]);
      if (differences.length === 0) continue;
      const { error } = await sb
        .from('prompt_cases')
        .update(buildEnglishMirrorCorePatch(source))
        .eq('id', mirrorId)
        .select('id')
        .single();
      if (error) {
        console.warn(
          '[AdminPromptCases] English mirror core repair failed:',
          error
        );
        continue;
      }
      syncedMirrors += 1;
      if (differences.includes('source_case_id')) linkedMirrors += 1;
      continue;
    }

    if (mirrors.length === 0) {
      const outcome = await upsertEnglishPromptCase(
        sb,
        source,
        adminEmail,
        adminUserId
      );
      if (outcome === 'created') {
        createdMirrors += 1;
      } else if (outcome === 'updated') {
        syncedMirrors += 1;
      } else {
        skippedMissingMirrors.push({
          sourceId,
          expectedSlug: getPromptCaseTranslationSlug(sourceId),
          mirrorIds: [],
          reasons: ['translationUnavailableOrSourceIncomplete']
        });
      }
    }
  }

  const reloaded = await loadPromptCasesForMirrorAction(sb);
  const after = reloaded.error
    ? before
    : analyzePromptCaseMirrorState(reloaded.cases);

  return {
    result: {
      ...after,
      repaired: {
        linkedMirrors,
        syncedMirrors,
        createdMirrors,
        skippedMissingMirrors,
        skippedDuplicateMirrors: before.issues.duplicateMirrors
      }
    }
  };
}

async function softDeleteEnglishPromptCase(
  sb: SupabaseClient,
  sourceId: string,
  deletedAt: string
) {
  const slug = getPromptCaseTranslationSlug(sourceId);
  if (!slug) return;
  const { error } = await sb
    .from('prompt_cases')
    .update({
      is_published: false,
      deleted_at: deletedAt
    })
    .eq('slug', slug)
    .eq('locale', 'en-US');
  if (error && !isMissingPromptCasesTable(error)) {
    console.warn('[AdminPromptCases] English case delete sync failed:', error);
  }
}

function isMissingPromptCasesTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return (
    record.code === 'PGRST205' ||
    String(record.message || '').includes('prompt_cases')
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return (
    record.code === '23505' ||
    String(record.message || '')
      .toLowerCase()
      .includes('duplicate key')
  );
}

function promptCasesSetupResponse(corsHeaders: Record<string, string>) {
  return jsonResponse(
    {
      error:
        '请先在 Supabase 执行 supabase/migrations/20260603122500_prompt_cases.sql 初始化精选案例表',
      needsSetup: true,
      cases: []
    },
    corsHeaders,
    424
  );
}

function getPromptCaseAdminSearchFilter(pattern: string): string {
  return [
    `title.ilike.${pattern}`,
    `title_zh.ilike.${pattern}`,
    `title_en.ilike.${pattern}`,
    `prompt.ilike.${pattern}`,
    `prompt_preview.ilike.${pattern}`,
    `commercial_intent.ilike.${pattern}`,
    `category.ilike.${pattern}`,
    `slug.ilike.${pattern}`
  ].join(',');
}

function promptCaseListErrorResponse(
  error: unknown,
  corsHeaders: Record<string, string>
) {
  if (isMissingPromptCasesTable(error)) {
    console.warn('[AdminPromptCases] table missing:', error);
    return promptCasesSetupResponse(corsHeaders);
  }
  console.error('[AdminPromptCases] list failed:', error);
  return jsonResponse(
    { error: 'Failed to load prompt cases', cases: [] },
    corsHeaders,
    500
  );
}

async function listCasesByGenerateRate(input: {
  sb: SupabaseClient;
  corsHeaders: Record<string, string>;
  offset: number;
  limit: number;
  featuredOnly: boolean;
  searchPattern: string;
}) {
  const metricRows: Array<{
    id: string;
    view_count?: number | null;
    generate_count?: number | null;
  }> = [];
  const metricPageSize = 1000;
  for (let from = 0; ; from += metricPageSize) {
    let metricQuery = input.sb
      .from('prompt_cases')
      .select('id,view_count,generate_count')
      .is('deleted_at', null)
      .is('source_case_id', null);
    if (input.featuredOnly) metricQuery = metricQuery.eq('featured', true);
    if (input.searchPattern) {
      metricQuery = metricQuery.or(
        getPromptCaseAdminSearchFilter(input.searchPattern)
      );
    }
    const { data, error } = await metricQuery.range(
      from,
      from + metricPageSize - 1
    );
    if (error) return promptCaseListErrorResponse(error, input.corsHeaders);
    const page = Array.isArray(data)
      ? (data as Array<{
          id: string;
          view_count?: number | null;
          generate_count?: number | null;
        }>)
      : [];
    metricRows.push(...page);
    if (page.length < metricPageSize) break;
  }

  metricRows.sort((a, b) => {
    const aViews = Math.max(0, Number(a.view_count || 0));
    const bViews = Math.max(0, Number(b.view_count || 0));
    const aGenerates = Math.max(0, Number(a.generate_count || 0));
    const bGenerates = Math.max(0, Number(b.generate_count || 0));
    const rateDiff =
      (bViews > 0 ? bGenerates / bViews : 0) -
      (aViews > 0 ? aGenerates / aViews : 0);
    if (rateDiff !== 0) return rateDiff;
    if (bGenerates !== aGenerates) return bGenerates - aGenerates;
    if (bViews !== aViews) return bViews - aViews;
    return a.id.localeCompare(b.id);
  });

  const total = metricRows.length;
  const pageIds = metricRows
    .slice(input.offset, input.offset + input.limit)
    .map((item) => item.id);
  let page: PromptCaseRecord[] = [];
  if (pageIds.length > 0) {
    const { data, error } = await input.sb
      .from('prompt_cases')
      .select(PROMPT_CASE_ADMIN_LIST_COLUMNS)
      .in('id', pageIds);
    if (error) return promptCaseListErrorResponse(error, input.corsHeaders);
    const order = new Map(pageIds.map((id, index) => [id, index]));
    page = (
      Array.isArray(data) ? (data as unknown as PromptCaseRecord[]) : []
    ).sort(
      (a, b) =>
        (order.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER)
    );
  }

  const nextOffset = input.offset + page.length;
  const hasMore = nextOffset < total;
  return jsonResponse(
    {
      cases: await mapPromptCasePage(page, input.sb),
      pagination: {
        offset: input.offset,
        limit: input.limit,
        total,
        hasMore,
        nextOffset: hasMore ? nextOffset : null
      }
    },
    input.corsHeaders
  );
}

async function listCases(
  request: Request,
  sb: SupabaseClient,
  corsHeaders: Record<string, string>
) {
  const url = new URL(request.url);
  const sortParam = url.searchParams.get('sort');
  const sortMode: PromptCaseAdminSort = [
    'created-desc',
    'created-asc',
    'views',
    'copies',
    'generates',
    'generate-rate'
  ].includes(sortParam || '')
    ? (sortParam as PromptCaseAdminSort)
    : 'default';
  const offset = Math.max(
    0,
    Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0
  );
  const requestedLimit =
    Number.parseInt(url.searchParams.get('limit') || '', 10) ||
    PROMPT_CASE_ADMIN_DEFAULT_PAGE_SIZE;
  const limit = Math.min(
    PROMPT_CASE_ADMIN_MAX_PAGE_SIZE,
    Math.max(1, requestedLimit)
  );
  const featuredOnly = url.searchParams.get('featured') === '1';
  const search = (url.searchParams.get('search') || '')
    .trim()
    .slice(0, 120)
    .replace(/[,().%_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const searchPattern = search ? `*${search}*` : '';

  if (sortMode === 'generate-rate') {
    return listCasesByGenerateRate({
      sb,
      corsHeaders,
      offset,
      limit,
      featuredOnly,
      searchPattern
    });
  }

  let query = sb
    .from('prompt_cases')
    .select(PROMPT_CASE_ADMIN_LIST_COLUMNS, { count: 'exact' })
    .is('deleted_at', null)
    .is('source_case_id', null);
  if (featuredOnly) query = query.eq('featured', true);
  if (searchPattern) {
    query = query.or(getPromptCaseAdminSearchFilter(searchPattern));
  }
  if (sortMode === 'created-asc') {
    query = query.order('created_at', { ascending: true });
  } else if (sortMode === 'views') {
    query = query.order('view_count', { ascending: false });
  } else if (sortMode === 'copies') {
    query = query.order('copy_count', { ascending: false });
  } else if (sortMode === 'generates') {
    query = query.order('generate_count', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }
  query = query.order('id', { ascending: true });
  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error) {
    return promptCaseListErrorResponse(error, corsHeaders);
  }

  const page = Array.isArray(data)
    ? (data as unknown as PromptCaseRecord[])
    : [];
  const total = typeof count === 'number' ? count : offset + page.length;
  const nextOffset = offset + page.length;
  const hasMore = nextOffset < total;
  return jsonResponse(
    {
      cases: await mapPromptCasePage(page, sb),
      pagination: {
        offset,
        limit,
        total,
        hasMore,
        nextOffset: hasMore ? nextOffset : null
      }
    },
    corsHeaders
  );
}

async function getCase(
  request: Request,
  sb: SupabaseClient,
  corsHeaders: Record<string, string>
) {
  const id = new URL(request.url).searchParams.get('id')?.trim();
  if (!id) return null;

  const { data, error } = await sb
    .from('prompt_cases')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    console.error('[AdminPromptCases] detail failed:', error);
    return jsonResponse(
      { error: 'Failed to load prompt case' },
      corsHeaders,
      500
    );
  }
  if (!data) {
    return jsonResponse({ error: 'Prompt case not found' }, corsHeaders, 404);
  }
  return jsonResponse({ case: await mapPromptCase(data, sb) }, corsHeaders);
}

async function createCase(
  input: PromptCaseWriteInput,
  sb: SupabaseClient,
  adminEmail: string,
  corsHeaders: Record<string, string>
) {
  const patch = buildPatch(input);
  const validationError = validatePatch(patch);
  if (validationError) {
    return jsonResponse({ error: validationError }, corsHeaders, 400);
  }
  const slugError = await validateSlugUnique(sb, patch.slug);
  if (slugError) {
    return jsonResponse({ error: slugError }, corsHeaders, 409);
  }
  const missing = ['image_url', 'prompt'].filter(
    (field) => typeof patch[field] !== 'string' || !String(patch[field]).trim()
  );
  if (missing.length > 0) {
    return jsonResponse(
      { error: `Missing fields: ${missing.join(', ')}` },
      corsHeaders,
      400
    );
  }

  const { data, error } = await sb
    .from('prompt_cases')
    .insert({
      ...patch,
      created_by_email: adminEmail,
      deleted_at: null
    })
    .select('*')
    .single();

  if (error) {
    if (isMissingPromptCasesTable(error)) {
      console.warn('[AdminPromptCases] table missing on create:', error);
      return promptCasesSetupResponse(corsHeaders);
    }
    if (isUniqueConstraintError(error)) {
      return jsonResponse({ error: 'Slug already exists' }, corsHeaders, 409);
    }
    console.error('[AdminPromptCases] create failed:', error);
    return jsonResponse(
      { error: 'Failed to create prompt case' },
      corsHeaders,
      500
    );
  }

  return jsonResponse({ case: await mapPromptCase(data, sb) }, corsHeaders);
}

async function handlePromptCaseAction(
  input: PromptCaseWriteInput,
  sb: SupabaseClient,
  adminEmail: string,
  adminUserId: string | null | undefined,
  corsHeaders: Record<string, string>
) {
  if (input.action === 'diagnoseMirrors') {
    const { diagnostic, error } = await diagnosePromptCaseMirrors(sb);
    if (error) {
      if (isMissingPromptCasesTable(error)) {
        console.warn(
          '[AdminPromptCases] table missing on mirror diagnosis:',
          error
        );
        return promptCasesSetupResponse(corsHeaders);
      }
      console.error('[AdminPromptCases] mirror diagnosis failed:', error);
      return jsonResponse(
        { error: 'Failed to diagnose prompt case mirrors' },
        corsHeaders,
        500
      );
    }
    return jsonResponse({ action: input.action, diagnostic }, corsHeaders);
  }

  if (input.action === 'repairMirrors') {
    const { result, error } = await repairPromptCaseMirrors(
      sb,
      adminEmail,
      adminUserId
    );
    if (error) {
      if (isMissingPromptCasesTable(error)) {
        console.warn(
          '[AdminPromptCases] table missing on mirror repair:',
          error
        );
        return promptCasesSetupResponse(corsHeaders);
      }
      console.error('[AdminPromptCases] mirror repair failed:', error);
      return jsonResponse(
        { error: 'Failed to repair prompt case mirrors' },
        corsHeaders,
        500
      );
    }
    return jsonResponse({ action: input.action, result }, corsHeaders);
  }

  return jsonResponse(
    { error: 'Unsupported prompt case action' },
    corsHeaders,
    400
  );
}

async function updateCase(
  request: Request,
  sb: SupabaseClient,
  corsHeaders: Record<string, string>
) {
  const input = (await request
    .json()
    .catch(() => ({}))) as PromptCaseWriteInput;
  if (!input.id) {
    return jsonResponse({ error: 'id is required' }, corsHeaders, 400);
  }
  const patch = buildPatch(input);
  const validationError = validatePatch(patch);
  if (validationError) {
    return jsonResponse({ error: validationError }, corsHeaders, 400);
  }
  const slugError = await validateSlugUnique(sb, patch.slug, input.id);
  if (slugError) {
    return jsonResponse({ error: slugError }, corsHeaders, 409);
  }
  if (Object.keys(patch).length === 0) {
    return jsonResponse(
      { error: 'No editable fields provided' },
      corsHeaders,
      400
    );
  }
  if (patch.image_url !== undefined && !String(patch.image_url).trim()) {
    return jsonResponse({ error: 'imageUrl is required' }, corsHeaders, 400);
  }
  if (patch.prompt !== undefined && !String(patch.prompt).trim()) {
    return jsonResponse({ error: 'prompt is required' }, corsHeaders, 400);
  }

  const { data, error } = await sb
    .from('prompt_cases')
    .update(patch)
    .eq('id', input.id)
    .is('deleted_at', null)
    .select('*')
    .single();

  if (error) {
    if (isMissingPromptCasesTable(error)) {
      console.warn('[AdminPromptCases] table missing on update:', error);
      return promptCasesSetupResponse(corsHeaders);
    }
    if (isUniqueConstraintError(error)) {
      return jsonResponse({ error: 'Slug already exists' }, corsHeaders, 409);
    }
    console.error('[AdminPromptCases] update failed:', error);
    return jsonResponse(
      { error: 'Failed to update prompt case' },
      corsHeaders,
      500
    );
  }

  return jsonResponse({ case: await mapPromptCase(data, sb) }, corsHeaders);
}

async function softDeleteCase(
  request: Request,
  sb: SupabaseClient,
  corsHeaders: Record<string, string>
) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return jsonResponse({ error: 'id is required' }, corsHeaders, 400);
  }

  const deletedAt = new Date().toISOString();
  const { data, error } = await sb
    .from('prompt_cases')
    .update({
      is_published: false,
      deleted_at: deletedAt
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    if (isMissingPromptCasesTable(error)) {
      console.warn('[AdminPromptCases] table missing on delete:', error);
      return promptCasesSetupResponse(corsHeaders);
    }
    console.error('[AdminPromptCases] delete failed:', error);
    return jsonResponse(
      { error: 'Failed to delete prompt case' },
      corsHeaders,
      500
    );
  }

  await softDeleteEnglishPromptCase(sb, id, deletedAt);

  return jsonResponse({ case: await mapPromptCase(data, sb) }, corsHeaders);
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const admin = await assertPromptCaseAdmin(request);
  if (!admin.ok) {
    return jsonResponse(
      { error: admin.error || 'Prompt case admin access required' },
      corsHeaders,
      admin.status
    );
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return jsonResponse(
      { error: 'Supabase admin is not configured' },
      corsHeaders,
      500
    );
  }

  if (request.method === 'GET') {
    return (
      (await getCase(request, sb, corsHeaders)) ||
      listCases(request, sb, corsHeaders)
    );
  }
  if (request.method === 'POST') {
    const input = (await request
      .json()
      .catch(() => ({}))) as PromptCaseWriteInput;
    if (input.action) {
      return handlePromptCaseAction(
        input,
        sb,
        admin.email || PROMPT_CASE_ADMIN_EMAIL,
        admin.userId,
        corsHeaders
      );
    }
    return createCase(
      input,
      sb,
      admin.email || PROMPT_CASE_ADMIN_EMAIL,
      corsHeaders
    );
  }
  if (request.method === 'PATCH') return updateCase(request, sb, corsHeaders);
  if (request.method === 'DELETE')
    return softDeleteCase(request, sb, corsHeaders);

  return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
}
