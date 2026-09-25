import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getCorsHeadersForRequest,
  getUserIdFromRequest
} from '../../utils/auth';
import {
  MAX_IMAGE_REFERENCE_IDS,
  type ImageCharacterReferenceGroup,
  type ImageConsistencyCheckResult
} from '../../../src/shared/image-reference-types';
import { isOfficialGeminiEnabled } from '../../utils/model-provider-routing';
import { normalizeOpenAICompatibleBaseUrl } from '../../utils/tuzi-connection';
import {
  readResponseArrayBufferWithLimit,
  fetchModelWithTimeout
} from '../../utils/model-fetch';
import { fetchTrustedRemoteWithTimeout } from '../../utils/safe-remote-url';
import {
  consumeModelRateLimit,
  createModelRateLimitResponse
} from '../../utils/model-rate-limit';

export const config = { runtime: 'edge' };

const SIGNED_URL_EXPIRES_IN = 60 * 60;

interface ImageGenerationMetadata {
  storageBucket?: string;
  storagePath?: string;
  referenceImageIds?: string[];
  referenceMode?: string;
  characterCardIds?: string[];
  characterReferenceGroups?: ImageCharacterReferenceGroup[];
}

interface ImageGenerationRow {
  id: string;
  user_id: string;
  image_url: string;
  prompt: string;
  metadata: ImageGenerationMetadata | null;
}

interface ReferenceRow {
  id: string;
  label: string | null;
  role: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
}

interface InlineImage {
  mimeType: string;
  base64: string;
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

function sanitizeReferenceGroups(
  value: unknown
): ImageCharacterReferenceGroup[] {
  if (!Array.isArray(value)) return [];
  const groups: ImageCharacterReferenceGroup[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const referenceImageIds = Array.isArray(raw.referenceImageIds)
      ? raw.referenceImageIds
          .filter((id): id is string => typeof id === 'string')
          .map((id) => id.trim())
          .filter(Boolean)
          .slice(0, MAX_IMAGE_REFERENCE_IDS)
      : [];
    if (referenceImageIds.length === 0) continue;
    const characterCardId =
      typeof raw.characterCardId === 'string'
        ? raw.characterCardId.trim()
        : '';
    const description =
      typeof raw.description === 'string'
        ? raw.description.trim().slice(0, 300)
        : '';
    groups.push({
      ...(characterCardId ? { characterCardId } : {}),
      label:
        typeof raw.label === 'string' && raw.label.trim()
          ? raw.label.trim().slice(0, 80)
          : groups.length === 0
            ? 'Character A'
            : 'Character B',
      ...(description ? { description } : {}),
      referenceImageIds
    });
    if (groups.length >= 2) break;
  }
  return groups;
}

function flattenReferenceIds(groups: ImageCharacterReferenceGroup[]): string[] {
  return Array.from(
    new Set(groups.flatMap((group) => group.referenceImageIds))
  ).slice(0, MAX_IMAGE_REFERENCE_IDS);
}

function getFallbackConsistencyResult(
  groups: ImageCharacterReferenceGroup[],
  reason: string
): ImageConsistencyCheckResult {
  const groupLabels = groups.map((group) => group.label).join(' / ');
  return {
    score: groups.length > 0 ? 0.72 : 0,
    verdict: groups.length > 0 ? 'unknown' : 'needs_repair',
    matchedTraits: groups.length > 0 ? ['已绑定角色参考图'] : [],
    driftedTraits:
      groups.length > 0
        ? ['当前环境未完成 VLM 视觉复核']
        : ['缺少角色参考图'],
    repairPrompt: [
      groupLabels
        ? `保持 ${groupLabels} 的脸型、发型、服装轮廓、体态比例与参考图一致。`
        : '先绑定角色参考图再进行一致性生成。',
      '如果画面中有两个人物，请严格区分 Character A 与 Character B，不要融合、交换或平均化五官和服装特征。',
      '仅调整场景、姿势、镜头和光线，不改变角色身份锚点。',
      reason ? `检查说明：${reason}` : ''
    ]
      .filter(Boolean)
      .join('\n'),
    usedFallback: true
  };
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as Record<
          string,
          unknown
        >;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function normalizeStringArray(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function normalizeConsistencyResult(
  value: Record<string, unknown>,
  model: string
): ImageConsistencyCheckResult {
  const score = Math.max(
    0,
    Math.min(1, Number(value.score ?? value.consistencyScore ?? 0))
  );
  const verdict =
    value.verdict === 'pass' || value.verdict === 'needs_repair'
      ? value.verdict
      : score >= 0.82
        ? 'pass'
        : 'needs_repair';
  const repairPrompt =
    typeof value.repairPrompt === 'string' && value.repairPrompt.trim()
      ? value.repairPrompt.trim()
      : '强化角色身份锚点：保持脸型、发型、服装轮廓和体态比例与参考图一致，只改变场景、姿势、镜头和光线。';
  return {
    score,
    verdict,
    matchedTraits: normalizeStringArray(value.matchedTraits),
    driftedTraits: normalizeStringArray(value.driftedTraits),
    repairPrompt,
    model
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function downloadInlineImage(url: string): Promise<InlineImage> {
  const response = await fetchTrustedRemoteWithTimeout(url, {}, 20_000);
  if (!response.ok) {
    throw new Error(`image download failed: ${response.status}`);
  }
  const mimeType = response.headers.get('content-type') || 'image/png';
  if (!mimeType.startsWith('image/')) throw new Error('image download returned non-image content');
  return {
    mimeType,
    base64: arrayBufferToBase64(
      await readResponseArrayBufferWithLimit(response, 8 * 1024 * 1024, {
        timeoutMs: 30_000,
        label: 'consistency image download'
      })
    )
  };
}

async function resolveGenerationImageUrl(
  supabase: SupabaseClient,
  row: ImageGenerationRow
): Promise<string> {
  const bucket = row.metadata?.storageBucket;
  const path = row.metadata?.storagePath;
  if (!bucket || !path) return row.image_url;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_EXPIRES_IN);
  if (error || !data?.signedUrl) {
    throw new Error('生成图签名失败');
  }
  return data.signedUrl;
}

async function loadReferenceRows(
  supabase: SupabaseClient,
  userId: string,
  referenceIds: string[]
): Promise<ReferenceRow[]> {
  if (referenceIds.length === 0) return [];
  const { data, error } = await supabase
    .from('image_reference_assets')
    .select('id, label, role, storage_bucket, storage_path, mime_type')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .in('id', referenceIds);
  if (error) {
    throw new Error(`参考图加载失败: ${error.message}`);
  }
  const rows = (data || []) as ReferenceRow[];
  if (rows.length !== referenceIds.length) {
    throw new Error('参考图不存在或无权访问');
  }
  return rows;
}

async function resolveReferenceImageUrl(
  supabase: SupabaseClient,
  row: ReferenceRow
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(row.storage_bucket)
    .createSignedUrl(row.storage_path, SIGNED_URL_EXPIRES_IN);
  if (error || !data?.signedUrl) {
    throw new Error('参考图签名失败');
  }
  return data.signedUrl;
}

function buildGeminiPrompt(
  prompt: string,
  groups: ImageCharacterReferenceGroup[],
  references: ReferenceRow[]
): string {
  const groupText = groups
    .map((group, index) => {
      const alias = index === 0 ? 'Character A' : 'Character B';
      return `${alias}: ${group.label}; refs=${group.referenceImageIds.length}; ${group.description || ''}`;
    })
    .join('\n');
  const referenceText = references
    .map((row, index) => `${index + 1}. ${row.label || row.role} (${row.id})`)
    .join('\n');
  return `You are an image consistency reviewer for an AI image generation product.
Compare the first image (generated output) against the following reference images and character groups.

Original generation prompt:
${prompt}

Character groups:
${groupText || 'None'}

Reference image order:
${referenceText || 'None'}

Return only JSON with this schema:
{
  "score": 0.0-1.0,
  "verdict": "pass" | "needs_repair",
  "matchedTraits": ["short visible traits that stayed consistent"],
  "driftedTraits": ["short visible traits that changed or are uncertain"],
  "repairPrompt": "one concise prompt paragraph that tells the image model exactly how to repair identity drift"
}

Be strict about face identity, hairstyle, outfit identity, body proportion, and A/B character separation.`;
}

async function callGeminiConsistencyCheck(params: {
  generatedImage: InlineImage;
  referenceImages: InlineImage[];
  prompt: string;
  model: string;
}): Promise<Record<string, unknown>> {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('VLM key is not configured');
  }

  const response = await fetchModelWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: params.prompt },
              {
                inlineData: {
                  mimeType: params.generatedImage.mimeType,
                  data: params.generatedImage.base64
                }
              },
              ...params.referenceImages.map((image) => ({
                inlineData: {
                  mimeType: image.mimeType,
                  data: image.base64
                }
              }))
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      })
    },
    { timeoutMs: 35_000, label: 'official Gemini consistency check' }
  );

  const data = (await response.json().catch(() => ({}))) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(data.error?.message || `VLM check failed: ${response.status}`);
  }
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim() || '';
  const parsed = extractJsonObject(text);
  if (!parsed) {
    throw new Error('VLM response was not valid JSON');
  }
  return parsed;
}

async function callTuziConsistencyCheck(params: {
  generatedImage: InlineImage;
  referenceImages: InlineImage[];
  prompt: string;
}): Promise<{ parsed: Record<string, unknown>; model: string }> {
  const apiKey = process.env.TUZI_TEXT_API_KEY || process.env.TUZI_API_KEY;
  if (!apiKey) throw new Error('Tuzi VLM key is not configured');
  const baseURL = normalizeOpenAICompatibleBaseUrl(
    process.env.TUZI_TEXT_BASE_URL || process.env.TUZI_API_BASE_URL || 'https://api.tu-zi.com'
  );
  const model = process.env.TUZI_VISION_MODEL || 'gemini-3.5-flash';
  const images = [params.generatedImage, ...params.referenceImages];
  const response = await fetchModelWithTimeout(
    `${baseURL}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: params.prompt },
              ...images.map((image) => ({
                type: 'image_url',
                image_url: { url: `data:${image.mimeType};base64,${image.base64}` }
              }))
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 1600,
        response_format: { type: 'json_object' }
      })
    },
    { timeoutMs: 35_000, label: 'Tuzi consistency check' }
  );
  const data = (await response.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(data.error?.message || `Tuzi VLM failed: ${response.status}`);
  const parsed = extractJsonObject(data.choices?.[0]?.message?.content || '');
  if (!parsed) throw new Error('Tuzi VLM response was not valid JSON');
  return { parsed, model };
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse({ error: '请先登录' }, corsHeaders, 401);
  }
  const rateLimit = await consumeModelRateLimit({
    userId,
    bucket: 'image_consistency_check',
    maxRequests: 6
  });
  if (!rateLimit.allowed) return createModelRateLimitResponse(rateLimit, corsHeaders);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Supabase 未配置' }, corsHeaders, 503);
  }

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const generationId =
    typeof body.generationId === 'string' ? body.generationId.trim() : '';
  if (!generationId) {
    return jsonResponse({ error: 'generationId is required' }, corsHeaders, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: generation, error } = await supabase
    .from('image_generations')
    .select('id, user_id, image_url, prompt, metadata')
    .eq('id', generationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !generation) {
    return jsonResponse({ error: '生成记录不存在' }, corsHeaders, 404);
  }

  const row = generation as ImageGenerationRow;
  const groups =
    sanitizeReferenceGroups(body.characterReferenceGroups).length > 0
      ? sanitizeReferenceGroups(body.characterReferenceGroups)
      : sanitizeReferenceGroups(row.metadata?.characterReferenceGroups);
  const referenceIds =
    flattenReferenceIds(groups).length > 0
      ? flattenReferenceIds(groups)
      : Array.isArray(row.metadata?.referenceImageIds)
        ? row.metadata.referenceImageIds.slice(0, MAX_IMAGE_REFERENCE_IDS)
        : [];

  if (referenceIds.length === 0) {
    return jsonResponse(
      {
        consistency: getFallbackConsistencyResult(groups, '缺少参考图')
      },
      corsHeaders
    );
  }

  try {
    const references = await loadReferenceRows(supabase, userId, referenceIds);
    const generatedUrl = await resolveGenerationImageUrl(supabase, row);
    const [generatedImage, ...referenceImages] = await Promise.all([
      downloadInlineImage(generatedUrl),
      ...references.map(async (reference) =>
        downloadInlineImage(await resolveReferenceImageUrl(supabase, reference))
      )
    ]);
    const prompt = buildGeminiPrompt(
      typeof body.prompt === 'string' ? body.prompt : row.prompt,
      groups,
      references
    );
    let model = process.env.TUZI_VISION_MODEL || 'gemini-3.5-flash';
    let parsed: Record<string, unknown>;
    try {
      const tuzi = await callTuziConsistencyCheck({ generatedImage, referenceImages, prompt });
      parsed = tuzi.parsed;
      model = tuzi.model;
    } catch (tuziError) {
      if (!isOfficialGeminiEnabled()) throw tuziError;
      model = process.env.IMAGE_CONSISTENCY_MODEL || process.env.STUDIO_AI_MODEL || 'gemini-3.5-flash';
      parsed = await callGeminiConsistencyCheck({ generatedImage, referenceImages, model, prompt });
    }
    return jsonResponse(
      {
        consistency: normalizeConsistencyResult(parsed, model)
      },
      corsHeaders
    );
  } catch (caught) {
    console.warn('[ImageConsistency] fallback result:', caught);
    return jsonResponse(
      {
        consistency: getFallbackConsistencyResult(
          groups,
          caught instanceof Error ? caught.message : 'VLM 检查失败'
        )
      },
      corsHeaders
    );
  }
}
