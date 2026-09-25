import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MOODBOARD_MAX_REPRESENTATIVE_ITEMS,
  MOODBOARD_MIN_ANALYSIS_ITEMS,
  MOODBOARD_RECOMMENDED_MAX_ITEMS
} from '../../src/shared/create-workspace-v2.js';
import {
  normalizeOpenAICompatibleBaseUrl,
  parseTuziChannelConnectionConfig
} from '../utils/tuzi-connection.js';
import { isOfficialGeminiEnabled } from '../utils/model-provider-routing.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 18 * 1024 * 1024;
const ANALYSIS_TIMEOUT_MS = 34_000;

export type MoodboardAnalysisItemRow = {
  id: string;
  moodboard_id: string;
  source: string;
  image_url: string;
  title?: string | null;
  prompt?: string | null;
  image_reference_id?: string | null;
  image_generation_id?: string | null;
  prompt_case_id?: string | null;
  sort_order?: number | null;
  is_representative?: boolean | null;
  metadata?: Record<string, unknown> | null;
};

export type PreparedMoodboardImage = {
  item: MoodboardAnalysisItemRow;
  imageReferenceId: string;
  mimeType: string;
  bytes: Uint8Array;
  base64: string;
};

export type MoodboardVisualAnalysis = {
  tasteProfile: string;
  keywords: string[];
  avoids: string[];
  guidelines: string[];
  representativeAssetIds: string[];
};

export class MoodboardAnalysisError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'MoodboardAnalysisError';
    this.status = status;
  }
}

function compactStrings(
  value: unknown,
  limit: number,
  maxLength: number
): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().slice(0, maxLength))
        .filter(Boolean)
    )
  ).slice(0, limit);
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() || trimmed;
}

export function parseMoodboardAnalysisResponse(
  raw: string,
  prepared: Array<Pick<PreparedMoodboardImage, 'imageReferenceId'>>
): MoodboardVisualAnalysis {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripJsonFence(raw)) as Record<string, unknown>;
  } catch {
    throw new MoodboardAnalysisError('视觉分析返回了无效数据，请重试', 502);
  }

  const tasteProfile =
    typeof parsed.tasteProfile === 'string'
      ? parsed.tasteProfile.trim().slice(0, 2000)
      : '';
  const keywords = compactStrings(parsed.keywords, 16, 80);
  const avoids = compactStrings(parsed.avoids, 16, 160);
  const guidelines = compactStrings(parsed.guidelines, 16, 300);
  if (
    !tasteProfile ||
    keywords.length < 3 ||
    avoids.length < 2 ||
    guidelines.length < 2
  ) {
    throw new MoodboardAnalysisError('视觉分析结果不完整，请重试', 502);
  }

  const indexes = Array.isArray(parsed.representativeIndexes)
    ? Array.from(
        new Set(
          parsed.representativeIndexes
            .filter(
              (value): value is number =>
                typeof value === 'number' && Number.isInteger(value)
            )
            .map((value) => value - 1)
            .filter((value) => value >= 0 && value < prepared.length)
        )
      ).slice(0, MOODBOARD_MAX_REPRESENTATIVE_ITEMS)
    : [];
  const resolvedIndexes =
    indexes.length > 0
      ? indexes
      : prepared
          .slice(0, MOODBOARD_MAX_REPRESENTATIVE_ITEMS)
          .map((_, index) => index);

  return {
    tasteProfile,
    keywords,
    avoids,
    guidelines,
    representativeAssetIds: resolvedIndexes.map(
      (index) => prepared[index].imageReferenceId
    )
  };
}

export function selectMoodboardAnalysisItems(
  items: MoodboardAnalysisItemRow[]
): MoodboardAnalysisItemRow[] {
  return [...items]
    .sort((a, b) => {
      const representativeDelta =
        Number(Boolean(b.is_representative)) -
        Number(Boolean(a.is_representative));
      if (representativeDelta !== 0) return representativeDelta;
      return (a.sort_order || 0) - (b.sort_order || 0);
    })
    .slice(0, MOODBOARD_RECOMMENDED_MAX_ITEMS);
}

export function isBlockedMoodboardImageHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal')
  ) {
    return true;
  }
  if (/^(127\.|0\.|10\.|169\.254\.|192\.168\.)/.test(normalized)) {
    return true;
  }
  const match100 = normalized.match(/^100\.(\d{1,3})\./);
  if (match100 && Number(match100[1]) >= 64 && Number(match100[1]) <= 127) {
    return true;
  }
  const match172 = normalized.match(/^172\.(\d{1,3})\./);
  if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31) {
    return true;
  }
  if (!normalized.includes(':')) return false;
  if (normalized.startsWith('::ffff:')) {
    return isBlockedMoodboardImageHostname(normalized.slice('::ffff:'.length));
  }
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  );
}

export function validateTrustedMoodboardImageUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MoodboardAnalysisError('参考图地址无效，请重新添加素材', 422);
  }
  if (
    url.protocol !== 'https:' ||
    isBlockedMoodboardImageHostname(url.hostname)
  ) {
    throw new MoodboardAnalysisError('参考图来源不受信任，请重新添加素材', 422);
  }
  return url;
}

async function readBoundedImageBody(response: Response): Promise<Uint8Array> {
  if (!response.body) {
    throw new MoodboardAnalysisError('参考图内容为空', 422);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let finished = false;
  try {
    while (!finished) {
      const { done, value } = await reader.read();
      finished = done;
      if (finished) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel('image exceeds size limit');
        throw new MoodboardAnalysisError('参考图超过 8MB，请压缩后重试', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) {
    throw new MoodboardAnalysisError('参考图内容为空', 422);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return bytes;
}

async function fetchTrustedImage(sourceUrl: string): Promise<{
  bytes: Uint8Array;
  mimeType: string;
}> {
  let url = validateTrustedMoodboardImageUrl(sourceUrl);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg' }
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirect === 3) {
          throw new MoodboardAnalysisError('参考图重定向异常', 502);
        }
        url = validateTrustedMoodboardImageUrl(
          new URL(location, url).toString()
        );
        continue;
      }
      if (!response.ok) {
        throw new MoodboardAnalysisError(
          `参考图读取失败（${response.status}）`,
          502
        );
      }
      const mimeType = (response.headers.get('content-type') || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      if (
        !['image/avif', 'image/jpeg', 'image/png', 'image/webp'].includes(
          mimeType
        )
      ) {
        throw new MoodboardAnalysisError('参考素材不是有效图片', 422);
      }
      const contentLength = Number(
        response.headers.get('content-length') || 0
      );
      if (contentLength > MAX_IMAGE_BYTES) {
        throw new MoodboardAnalysisError('参考图超过 8MB，请压缩后重试', 413);
      }
      const bytes = await readBoundedImageBody(response);
      return { bytes, mimeType };
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') {
        throw new MoodboardAnalysisError('参考图读取超时，请稍后重试', 504);
      }
      if (error instanceof MoodboardAnalysisError) throw error;
      throw new MoodboardAnalysisError('参考图读取失败，请稍后重试', 502);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new MoodboardAnalysisError('参考图读取失败', 502);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize)
    );
  }
  return btoa(binary);
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('avif')) return 'avif';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  return 'png';
}

async function resolveExistingReference(
  database: SupabaseClient,
  userId: string,
  referenceId: string
): Promise<{ sourceUrl: string; imageReferenceId: string }> {
  const { data, error } = await database
    .from('image_reference_assets')
    .select('id, storage_bucket, storage_path')
    .eq('id', referenceId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) {
    throw new MoodboardAnalysisError('参考图不存在或无权访问', 403);
  }
  const { data: signed, error: signedError } = await database.storage
    .from(data.storage_bucket)
    .createSignedUrl(data.storage_path, 60 * 10);
  if (signedError || !signed?.signedUrl) {
    throw new MoodboardAnalysisError('参考图签名失败，请稍后重试', 502);
  }
  return { sourceUrl: signed.signedUrl, imageReferenceId: data.id };
}

async function resolveItemSource(
  database: SupabaseClient,
  userId: string,
  item: MoodboardAnalysisItemRow
): Promise<{ sourceUrl: string; imageReferenceId?: string }> {
  if (item.image_reference_id) {
    return resolveExistingReference(database, userId, item.image_reference_id);
  }

  if (item.image_generation_id) {
    const { data, error } = await database
      .from('image_generations')
      .select('id, image_url, metadata')
      .eq('id', item.image_generation_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) {
      throw new MoodboardAnalysisError('图库参考图不存在或无权访问', 403);
    }
    const metadata =
      data.metadata && typeof data.metadata === 'object'
        ? (data.metadata as Record<string, unknown>)
        : {};
    const bucket =
      typeof metadata.storageBucket === 'string' ? metadata.storageBucket : '';
    const path =
      typeof metadata.storagePath === 'string' ? metadata.storagePath : '';
    if (bucket && path) {
      const { data: signed, error: signedError } = await database.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 10);
      if (signedError || !signed?.signedUrl) {
        throw new MoodboardAnalysisError('图库参考图签名失败', 502);
      }
      return { sourceUrl: signed.signedUrl };
    }
    return { sourceUrl: data.image_url };
  }

  if (item.prompt_case_id) {
    const { data, error } = await database
      .from('prompt_cases')
      .select('image_url, image_urls')
      .eq('id', item.prompt_case_id)
      .eq('is_published', true)
      .is('deleted_at', null)
      .maybeSingle();
    const imageUrl =
      data?.image_url ||
      (Array.isArray(data?.image_urls) ? data.image_urls[0] : '');
    if (error || !imageUrl) {
      throw new MoodboardAnalysisError('Prompt 案例已下架或不可用', 422);
    }
    return { sourceUrl: imageUrl };
  }

  const copiedFromMoodboardId =
    typeof item.metadata?.copiedFromMoodboardId === 'string'
      ? item.metadata.copiedFromMoodboardId
      : '';
  const copiedFromItemId =
    typeof item.metadata?.copiedFromItemId === 'string'
      ? item.metadata.copiedFromItemId
      : '';
  if (item.source === 'preset' && copiedFromMoodboardId && copiedFromItemId) {
    const { data, error } = await database
      .from('visual_moodboard_items')
      .select('image_url, moodboard_id')
      .eq('id', copiedFromItemId)
      .eq('moodboard_id', copiedFromMoodboardId)
      .maybeSingle();
    if (error || !data?.image_url) {
      throw new MoodboardAnalysisError('预设参考图已不可用', 422);
    }
    return { sourceUrl: data.image_url };
  }

  throw new MoodboardAnalysisError(
    '存在尚未入库的参考图，请删除后重新添加',
    422
  );
}

async function persistReferenceAsset(
  database: SupabaseClient,
  userId: string,
  item: MoodboardAnalysisItemRow,
  image: { bytes: Uint8Array; mimeType: string }
): Promise<string> {
  const bucket =
    process.env.IMAGE_REFERENCE_BUCKET ||
    process.env.GENERATED_IMAGE_BUCKET ||
    'user-generated-images';
  const month = new Date().toISOString().slice(0, 7).replace('-', '');
  const random = crypto.randomUUID().slice(0, 12);
  const storagePath = `image-references/${userId}/${month}/moodboard-${Date.now()}-${random}.${extensionForMimeType(image.mimeType)}`;
  const { error: uploadError } = await database.storage
    .from(bucket)
    .upload(storagePath, image.bytes, {
      contentType: image.mimeType,
      cacheControl: '31536000',
      upsert: false
    });
  if (uploadError) {
    throw new MoodboardAnalysisError('Moodboard 参考图保存失败', 500);
  }

  const { data: reference, error: insertError } = await database
    .from('image_reference_assets')
    .insert({
      user_id: userId,
      storage_bucket: bucket,
      storage_path: storagePath,
      mime_type: image.mimeType,
      file_size_bytes: image.bytes.byteLength,
      role: 'style',
      label: (item.title || 'Moodboard 参考图').slice(0, 80),
      description: (item.prompt || '').slice(0, 500) || null,
      metadata: {
        source: 'visual_moodboard',
        moodboardId: item.moodboard_id,
        moodboardItemId: item.id,
        originalSource: item.source
      }
    })
    .select('id')
    .single();
  if (insertError || !reference) {
    await database.storage.from(bucket).remove([storagePath]);
    throw new MoodboardAnalysisError('Moodboard 参考图入库失败', 500);
  }

  const { error: itemUpdateError } = await database
    .from('visual_moodboard_items')
    .update({ image_reference_id: reference.id })
    .eq('id', item.id)
    .eq('moodboard_id', item.moodboard_id);
  if (itemUpdateError) {
    await Promise.all([
      database.from('image_reference_assets').delete().eq('id', reference.id),
      database.storage.from(bucket).remove([storagePath])
    ]);
    throw new MoodboardAnalysisError('Moodboard 参考图关联失败', 500);
  }
  return reference.id;
}

export async function prepareMoodboardImages(
  database: SupabaseClient,
  userId: string,
  items: MoodboardAnalysisItemRow[]
): Promise<PreparedMoodboardImage[]> {
  const candidates = selectMoodboardAnalysisItems(items);
  const sources: Array<{
    item: MoodboardAnalysisItemRow;
    source: Awaited<ReturnType<typeof resolveItemSource>>;
    image: Awaited<ReturnType<typeof fetchTrustedImage>>;
  }> = [];
  let totalBytes = 0;
  for (const item of candidates) {
    const source = await resolveItemSource(database, userId, item);
    const image = await fetchTrustedImage(source.sourceUrl);
    totalBytes += image.bytes.byteLength;
    if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
      throw new MoodboardAnalysisError(
        'Moodboard 图片总量过大，请压缩图片后重试',
        413
      );
    }
    sources.push({ item, source, image });
  }

  const prepared = await Promise.all(
    sources.map(async ({ item, source, image }) => ({
      item,
      imageReferenceId:
        source.imageReferenceId ||
        (await persistReferenceAsset(database, userId, item, image)),
      mimeType: image.mimeType,
      bytes: image.bytes,
      base64: bytesToBase64(image.bytes)
    }))
  );

  if (prepared.length < MOODBOARD_MIN_ANALYSIS_ITEMS) {
    throw new MoodboardAnalysisError(
      `至少需要 ${MOODBOARD_MIN_ANALYSIS_ITEMS} 张可读取图片；请压缩大图或重新添加失效素材`,
      422
    );
  }
  return prepared;
}

export async function analyzePreparedMoodboardImages(
  prepared: PreparedMoodboardImage[]
): Promise<MoodboardVisualAnalysis> {
  const officialApiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY;
  const tuziConnection = parseTuziChannelConnectionConfig(
    process.env.TUZI_TEXT_CHANNEL_CONNECTION ||
      process.env.TUZI_CHANNEL_CONNECTION ||
      process.env.TUZI_NEWAPI_CHANNEL_CONNECTION ||
      process.env.TUZI_TEXT_API_KEY ||
      process.env.TUZI_API_KEY
  );
  const providerPreference = String(
    process.env.MOODBOARD_ANALYSIS_PROVIDER || ''
  )
    .trim()
    .toLowerCase();
  const attempts: Array<{
    provider: 'gemini_official' | 'tuzi';
    run: () => Promise<MoodboardVisualAnalysis>;
  }> = [];

  const addOfficial = () => {
    if (!officialApiKey || !isOfficialGeminiEnabled()) return;
    attempts.push({
      provider: 'gemini_official',
      run: () => analyzeWithOfficialGemini(prepared, officialApiKey)
    });
  };
  const addTuzi = () => {
    if (!tuziConnection.apiKey) return;
    attempts.push({
      provider: 'tuzi',
      run: () => analyzeWithTuzi(prepared, tuziConnection)
    });
  };
  if (providerPreference === 'tuzi') {
    addTuzi();
    addOfficial();
  } else {
    addOfficial();
    addTuzi();
  }
  if (attempts.length === 0) {
    throw new MoodboardAnalysisError(
      '视觉分析服务未配置，请设置 Gemini 或 Tuzi API 凭据',
      503
    );
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      return await attempt.run();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '未知视觉分析错误';
      errors.push(`${attempt.provider}: ${message}`);
      console.warn('[MoodboardAnalysis] provider failed, trying fallback', {
        provider: attempt.provider,
        error: message.slice(0, 300)
      });
    }
  }
  throw new MoodboardAnalysisError(
    `视觉分析服务暂不可用：${errors.join(' | ')}`.slice(0, 1200),
    502
  );
}

function buildMoodboardAnalysisPrompt(imageCount: number): string {
  return `请比较以下 ${imageCount} 张图片，提炼它们共同的视觉语言。图片按 1 到 ${imageCount} 编号。只返回 JSON：\n{\n  "tasteProfile": "80-240 字，描述色彩、光线、构图、材质、镜头和情绪的共同规律，不描述具体人物身份",\n  "keywords": ["4-12 个视觉关键词"],\n  "avoids": ["3-8 个应避免的视觉偏差"],\n  "guidelines": ["3-8 条可执行生成规则"],\n  "representativeIndexes": [1, 2, 3, 4]\n}\nrepresentativeIndexes 只能包含最能代表整体风格的 1-4 个有效图片编号。不要照抄单张图片，不要推断敏感身份，不要输出 markdown。`;
}

async function analyzeWithOfficialGemini(
  prepared: PreparedMoodboardImage[],
  apiKey: string
): Promise<MoodboardVisualAnalysis> {
  const model = process.env.MOODBOARD_ANALYSIS_MODEL || 'gemini-3.5-flash';
  const parts: Array<Record<string, unknown>> = [
    { text: buildMoodboardAnalysisPrompt(prepared.length) }
  ];
  prepared.forEach((image, index) => {
    parts.push({ text: `图片 ${index + 1}` });
    parts.push({
      inlineData: { mimeType: image.mimeType, data: image.base64 }
    });
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
            maxOutputTokens: 2400,
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      }
    );
    const payload = (await response.json().catch(() => ({}))) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new MoodboardAnalysisError(
        payload.error?.message || `视觉分析服务异常（${response.status}）`,
        response.status === 429 ? 429 : 502
      );
    }
    const raw = (payload.candidates?.[0]?.content?.parts || [])
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('')
      .trim();
    if (!raw) {
      throw new MoodboardAnalysisError('视觉分析没有返回结果', 502);
    }
    return parseMoodboardAnalysisResponse(raw, prepared);
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') {
      throw new MoodboardAnalysisError('视觉分析超时，请稍后重试', 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function analyzeWithTuzi(
  prepared: PreparedMoodboardImage[],
  connection: ReturnType<typeof parseTuziChannelConnectionConfig>
): Promise<MoodboardVisualAnalysis> {
  const baseUrl = normalizeOpenAICompatibleBaseUrl(
    process.env.TUZI_TEXT_BASE_URL ||
      process.env.TUZI_API_BASE_URL ||
      connection.apiBaseUrl ||
      'https://api.tu-zi.com'
  );
  const model =
    process.env.MOODBOARD_ANALYSIS_TUZI_MODEL ||
    process.env.TUZI_VLM_MODEL ||
    process.env.OPENAI_VLM_MODEL ||
    'gpt-5.5';
  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: buildMoodboardAnalysisPrompt(prepared.length) }
  ];
  prepared.forEach((image, index) => {
    content.push({ type: 'text', text: `图片 ${index + 1}` });
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:${image.mimeType};base64,${image.base64}`
      }
    });
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${connection.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content }],
        temperature: 0.2,
        max_tokens: 2400,
        stream: false
      })
    });
    if (!response.ok) {
      const failure = (await response.json().catch(() => ({}))) as {
        error?: { message?: string } | string;
        message?: string;
      };
      const providerMessage =
        typeof failure.error === 'string'
          ? failure.error
          : failure.error?.message || failure.message || '';
      throw new MoodboardAnalysisError(
        `Tuzi 视觉分析服务异常（${response.status}）${providerMessage ? `：${providerMessage.slice(0, 300)}` : ''}`,
        response.status === 429 ? 429 : 502
      );
    }
    const payload = (await response.json().catch(() => ({}))) as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ type?: string; text?: string }>;
        };
      }>;
    };
    const contentValue = payload.choices?.[0]?.message?.content;
    const raw = Array.isArray(contentValue)
      ? contentValue
          .map((part) => (typeof part.text === 'string' ? part.text : ''))
          .join('')
          .trim()
      : typeof contentValue === 'string'
        ? contentValue.trim()
        : '';
    if (!raw) {
      throw new MoodboardAnalysisError('Tuzi 视觉分析没有返回结果', 502);
    }
    return parseMoodboardAnalysisResponse(raw, prepared);
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') {
      throw new MoodboardAnalysisError('Tuzi 视觉分析超时，请稍后重试', 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
