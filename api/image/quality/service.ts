import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createAiProviderUsageTiming,
  extractGeminiUsage,
  extractOpenAICompatibleUsage,
  recordAiProviderUsage,
  resolveTokenUsageSource
} from '../../utils/ai-provider-usage.js';
import {
  buildClientMediaUrls,
  createMediaStorageAdapters
} from '../../utils/media-storage/index.js';
import {
  fetchModelWithTimeout,
  readResponseArrayBufferWithLimit
} from '../../utils/model-fetch.js';
import { isOfficialGeminiEnabled } from '../../utils/model-provider-routing.js';
import { fetchTrustedRemoteWithTimeout } from '../../utils/safe-remote-url.js';
import {
  normalizeOpenAICompatibleBaseUrl,
  parseTuziChannelConnectionConfig
} from '../../utils/tuzi-connection.js';
import type { ImagePromptRecipeAudit } from '../../../src/shared/image-prompt-recipe-audit.js';
import {
  calculateImageVisualQualityOverallScore,
  getImageVisualQualityGrade,
  IMAGE_VISUAL_QUALITY_EVALUATOR_VERSION,
  IMAGE_VISUAL_QUALITY_SCHEMA_VERSION,
  imageVisualQualityDimensions,
  isCurrentImageVisualQualityAudit,
  type ImageVisualQualityAudit,
  type ImageVisualQualityAuditState,
  type ImageVisualQualityDimension,
  type ImageVisualQualityDimensionScore,
  type ImageVisualQualityFinding,
  type ImageVisualQualitySeverity
} from '../../../src/shared/image-visual-quality.js';

const SIGNED_URL_EXPIRES_IN = 60 * 60;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VLM_RESPONSE_BYTES = 1024 * 1024;
const EVALUATION_LEASE_MS = 3 * 60 * 1000;
const DEFAULT_SWEEP_LIMIT = 1;
const DEFAULT_SWEEP_LOOKBACK_HOURS = 48;
const DEFAULT_SWEEP_MAX_ATTEMPTS = 3;

export interface ImageVisualQualityGenerationRow {
  id: string;
  user_id: string;
  image_url: string;
  prompt: string;
  negative_prompt: string | null;
  provider: string;
  provider_model: string;
  aspect_ratio: string | null;
  quality: string | null;
  asset_ids: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface InlineImage {
  mimeType: string;
  base64: string;
}

async function recordImageVisualQualityUsage(input: {
  provider: 'gemini' | 'tuzi';
  model: string;
  endpoint: string;
  status: 'succeeded' | 'failed';
  requestId?: string;
  promptChars: number;
  responseText?: string;
  usageData?: unknown;
  fallbackOf?: string | null;
  fallbackUsed?: boolean;
  latencyMs: number;
  startedAt: Date;
  error?: unknown;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const usage =
    input.status === 'succeeded'
      ? input.provider === 'gemini'
        ? extractGeminiUsage(input.usageData)
        : extractOpenAICompatibleUsage(input.usageData)
      : { inputTokens: null, outputTokens: null, totalTokens: null };
  await recordAiProviderUsage({
    provider: input.provider,
    model: input.model,
    endpoint: input.endpoint,
    source: 'image_visual_quality',
    status: input.status,
    requestId: input.requestId,
    fallbackOf: input.fallbackOf,
    fallbackUsed: input.fallbackUsed,
    ...usage,
    tokenUsageSource:
      input.status === 'succeeded' ? resolveTokenUsageSource(usage) : 'none',
    promptChars: input.promptChars,
    responseChars: input.responseText?.length,
    imageCount: 1,
    latencyMs: input.latencyMs,
    errorMessage:
      input.error instanceof Error
        ? input.error.message
        : input.error === undefined
          ? null
          : String(input.error),
    startedAt: input.startedAt,
    completedAt: new Date(),
    metadata: input.metadata
  });
}

export class ImageVisualQualityError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = 'ImageVisualQualityError';
    this.code = code;
    this.status = status;
  }
}

function getVlmApiKey(): string {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    ''
  ).trim();
}

type TuziVlmConnection = ReturnType<typeof parseTuziChannelConnectionConfig> & {
  source: string;
};

function getTuziVlmConnections(): TuziVlmConnection[] {
  const candidates: Array<{
    source: string;
    value?: string;
    apiBaseUrl?: string;
  }> = [
    {
      source: 'text',
      value:
        process.env.TUZI_TEXT_CHANNEL_CONNECTION ||
        process.env.TUZI_TEXT_API_KEY,
      apiBaseUrl: process.env.TUZI_TEXT_BASE_URL
    },
    {
      source: 'default',
      value:
        process.env.TUZI_CHANNEL_CONNECTION ||
        process.env.TUZI_NEWAPI_CHANNEL_CONNECTION ||
        process.env.TUZI_API_KEY,
      apiBaseUrl: process.env.TUZI_API_BASE_URL
    },
    {
      source: 'deepsearch',
      value: process.env.TUZI_X_DEEPSEARCH_API_KEY,
      apiBaseUrl: process.env.TUZI_X_DEEPSEARCH_API_BASE_URL
    },
    {
      source: 'official',
      value: process.env.TUZI_OFFICIAL_API_KEY,
      apiBaseUrl: process.env.TUZI_API_BASE_URL
    },
    {
      source: 'official_discount',
      value: process.env.TUZI_OFFICIAL_DISCOUNT_API_KEY,
      apiBaseUrl: process.env.TUZI_API_BASE_URL
    }
  ];
  const seen = new Set<string>();
  const connections: TuziVlmConnection[] = [];
  for (const candidate of candidates) {
    const parsed = parseTuziChannelConnectionConfig(candidate.value);
    if (!parsed.apiKey || seen.has(parsed.apiKey)) continue;
    seen.add(parsed.apiKey);
    connections.push({
      ...parsed,
      apiBaseUrl: parsed.apiBaseUrl || candidate.apiBaseUrl,
      source: candidate.source
    });
  }
  return connections;
}

function getTuziVlmApiKey(): string {
  return getTuziVlmConnections()[0]?.apiKey || '';
}

export function getImageVisualQualityModel(): string {
  return (
    process.env.IMAGE_VISUAL_QUALITY_MODEL ||
    process.env.IMAGE_CONSISTENCY_MODEL ||
    process.env.STUDIO_AI_MODEL ||
    'gemini-3.5-flash'
  ).trim();
}

function getImageVisualQualityModelChain(): string[] {
  const fallbackModels = (
    process.env.IMAGE_VISUAL_QUALITY_FALLBACK_MODELS || 'gemini-2.5-flash'
  )
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  return Array.from(new Set([getImageVisualQualityModel(), ...fallbackModels]));
}

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
    : '';
}

function normalizeTextArray(value: unknown, maxItems = 5): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeText(item, 240))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function normalizeConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.5;
  const normalized = parsed > 1 ? parsed / 100 : parsed;
  return Math.max(0, Math.min(1, Math.round(normalized * 100) / 100));
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
    if (start < 0 || end <= start) return null;
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

function normalizeDimensionScore(
  dimension: ImageVisualQualityDimension,
  rawValue: unknown
): ImageVisualQualityDimensionScore {
  const raw = toRecord(rawValue);
  const score = normalizeScore(raw.score);
  const alwaysApplicable =
    dimension === 'prompt_coherence' || dimension === 'technical_integrity';
  const applicable = alwaysApplicable || raw.applicable !== false;
  return {
    applicable,
    score: applicable ? score : null,
    evidence: normalizeTextArray(raw.evidence)
  };
}

function normalizeFinding(value: unknown): ImageVisualQualityFinding | null {
  const raw = toRecord(value);
  const dimension = raw.dimension;
  if (
    typeof dimension !== 'string' ||
    !imageVisualQualityDimensions.includes(
      dimension as ImageVisualQualityDimension
    )
  ) {
    return null;
  }
  const severity: ImageVisualQualitySeverity =
    raw.severity === 'critical' ||
    raw.severity === 'major' ||
    raw.severity === 'minor'
      ? raw.severity
      : 'minor';
  const evidence = normalizeText(raw.evidence, 320);
  const suggestion = normalizeText(raw.suggestion, 360);
  if (!evidence || !suggestion) return null;
  return {
    dimension: dimension as ImageVisualQualityDimension,
    severity,
    evidence,
    suggestion
  };
}

export function normalizeImageVisualQualityResponse(input: {
  value: Record<string, unknown>;
  model: string;
  row: Pick<ImageVisualQualityGenerationRow, 'asset_ids' | 'metadata'>;
  evaluatedAt?: string;
}): ImageVisualQualityAudit {
  const rawDimensions = toRecord(input.value.dimensions);
  const missingDimensions = imageVisualQualityDimensions.filter(
    (dimension) =>
      !Object.prototype.hasOwnProperty.call(rawDimensions, dimension)
  );
  if (missingDimensions.length > 0) {
    throw new ImageVisualQualityError(
      'VLM_RESPONSE_INVALID',
      `视觉评分缺少维度: ${missingDimensions.join(', ')}`
    );
  }

  const dimensions = Object.fromEntries(
    imageVisualQualityDimensions.map((dimension) => [
      dimension,
      normalizeDimensionScore(dimension, rawDimensions[dimension])
    ])
  ) as Record<ImageVisualQualityDimension, ImageVisualQualityDimensionScore>;
  const invalidApplicable = imageVisualQualityDimensions.filter((dimension) => {
    const item = dimensions[dimension];
    return item.applicable && item.score === null;
  });
  if (invalidApplicable.length > 0) {
    throw new ImageVisualQualityError(
      'VLM_RESPONSE_INVALID',
      `视觉评分包含无效分数: ${invalidApplicable.join(', ')}`
    );
  }

  const overallScore = calculateImageVisualQualityOverallScore(dimensions);
  const metadata = toRecord(input.row.metadata);
  const recipeAudit = toRecord(
    metadata.recipeAudit
  ) as Partial<ImagePromptRecipeAudit>;
  return {
    schemaVersion: IMAGE_VISUAL_QUALITY_SCHEMA_VERSION,
    evaluatorVersion: IMAGE_VISUAL_QUALITY_EVALUATOR_VERSION,
    evaluatedAt: input.evaluatedAt || new Date().toISOString(),
    model: input.model,
    overallScore,
    grade: getImageVisualQualityGrade(overallScore),
    confidence: normalizeConfidence(input.value.confidence),
    summary:
      normalizeText(input.value.summary, 420) ||
      '已完成提示词与生成画面的一致性检查。',
    dimensions,
    findings: Array.isArray(input.value.findings)
      ? input.value.findings
          .map(normalizeFinding)
          .filter((item): item is ImageVisualQualityFinding => Boolean(item))
          .slice(0, 8)
      : [],
    repairPrompt: normalizeText(input.value.repairPrompt, 800),
    assetIds: Array.isArray(input.row.asset_ids)
      ? input.row.asset_ids.filter(
          (item): item is string => typeof item === 'string' && Boolean(item)
        )
      : [],
    recipeSelectionSource:
      typeof recipeAudit.selectionSource === 'string'
        ? recipeAudit.selectionSource
        : undefined,
    recipeCompilerVersion:
      typeof recipeAudit.compilerVersion === 'string'
        ? recipeAudit.compilerVersion
        : undefined
  };
}

export function buildImageVisualQualityPrompt(
  row: ImageVisualQualityGenerationRow
): string {
  const metadata = toRecord(row.metadata);
  const recipeAudit = toRecord(metadata.recipeAudit);
  const assetIds = Array.isArray(row.asset_ids) ? row.asset_ids : [];
  return `You are the automated visual QA reviewer for an AI image creation product.
Evaluate the generated image against its exact generation prompt. This is not a beauty contest: judge instruction adherence, internal coherence, and visible technical integrity.

Generation prompt:
${row.prompt.slice(0, 16000)}

Negative prompt:
${(row.negative_prompt || 'None').slice(0, 4000)}

Generation context:
- provider/model: ${row.provider}/${row.provider_model}
- aspect ratio: ${row.aspect_ratio || 'unspecified'}
- quality: ${row.quality || 'unspecified'}
- selected asset ids: ${assetIds.join(', ') || 'none'}
- recipe selection source: ${normalizeText(recipeAudit.selectionSource, 80) || 'unknown'}
- recipe compiler version: ${normalizeText(recipeAudit.compilerVersion, 80) || 'unknown'}

Score these dimensions from 0 to 100:
1. prompt_coherence (10%): the prompt describes one executable frame without duplicated full recipes or mutually impossible instructions.
2. subject_scene_adherence (20%): visible subject identity/type and scene/world match the prompt and relate naturally.
3. wardrobe_material_adherence (15%): specified garment silhouette, styling, material, reflectance, translucency, texture, and wearability are visibly respected.
4. pose_expression_adherence (15%): specified body action, head/shoulder logic, gaze, expression, and micro-expression are visibly respected without contradictory anatomy.
5. framing_camera_adherence (10%): framing, viewpoint, lens feeling, distance, crop, perspective, and foreground/background layering match.
6. lighting_style_adherence (10%): light direction, hardness, contrast, color, atmosphere, and requested imaging style match.
7. technical_integrity (20%): anatomy, hands, facial structure, object continuity, occlusion, text, edges, duplicated parts, and obvious generation artifacts are technically sound.

Rules:
- Use only visible evidence and the supplied prompt. Do not infer hidden intent.
- prompt_coherence and technical_integrity are always applicable.
- For other dimensions, set applicable=false and score=null only when the prompt contains no testable requirement for that dimension.
- A creative or surreal scene is not an error when the prompt asks for it.
- Do not punish unconventional fashion materials merely for being unrealistic; judge whether the requested material behavior is visible and coherent.
- Penalize a prompt that concatenates two complete, conflicting scene recipes even if the image happens to look attractive.
- Keep evidence concrete and observable. Do not use vague words such as "nice", "bad", or "AI-like" without naming the visible symptom.
- The repairPrompt must preserve successful elements and only correct the largest misses.

Return JSON only, exactly following this shape:
{
  "confidence": 0.0,
  "summary": "one concise evidence-based summary",
  "dimensions": {
    "prompt_coherence": {"applicable": true, "score": 0, "evidence": ["..."]},
    "subject_scene_adherence": {"applicable": true, "score": 0, "evidence": ["..."]},
    "wardrobe_material_adherence": {"applicable": true, "score": 0, "evidence": ["..."]},
    "pose_expression_adherence": {"applicable": true, "score": 0, "evidence": ["..."]},
    "framing_camera_adherence": {"applicable": true, "score": 0, "evidence": ["..."]},
    "lighting_style_adherence": {"applicable": true, "score": 0, "evidence": ["..."]},
    "technical_integrity": {"applicable": true, "score": 0, "evidence": ["..."]}
  },
  "findings": [
    {"dimension": "technical_integrity", "severity": "critical|major|minor", "evidence": "visible issue", "suggestion": "specific correction"}
  ],
  "repairPrompt": "one concise image-generation instruction"
}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function downloadInlineImage(url: string): Promise<InlineImage> {
  let response: Response;
  try {
    response = await fetchTrustedRemoteWithTimeout(url, {}, 20_000);
  } catch {
    throw new ImageVisualQualityError(
      'IMAGE_DOWNLOAD_FAILED',
      '生成图片下载失败'
    );
  }
  if (!response.ok) {
    throw new ImageVisualQualityError(
      'IMAGE_DOWNLOAD_FAILED',
      `生成图片下载失败: ${response.status}`
    );
  }
  const mimeType = (response.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!mimeType.startsWith('image/')) {
    throw new ImageVisualQualityError(
      'IMAGE_CONTENT_TYPE_INVALID',
      '生成图片响应类型无效'
    );
  }
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > MAX_IMAGE_BYTES) {
    throw new ImageVisualQualityError(
      'IMAGE_TOO_LARGE',
      '生成图片超过视觉评分大小限制',
      413
    );
  }
  let buffer: ArrayBuffer;
  try {
    buffer = await readResponseArrayBufferWithLimit(response, MAX_IMAGE_BYTES, {
      timeoutMs: 30_000,
      label: 'visual quality image download'
    });
  } catch (error) {
    throw new ImageVisualQualityError(
      error instanceof Error && error.message.includes('exceeds')
        ? 'IMAGE_TOO_LARGE'
        : 'IMAGE_DOWNLOAD_FAILED',
      error instanceof Error && error.message.includes('exceeds')
        ? '生成图片超过视觉评分大小限制'
        : '生成图片下载失败',
      error instanceof Error && error.message.includes('exceeds') ? 413 : 502
    );
  }
  return {
    mimeType,
    base64: arrayBufferToBase64(buffer)
  };
}

async function readVlmJson<T>(response: Response): Promise<T> {
  const buffer = await readResponseArrayBufferWithLimit(
    response,
    MAX_VLM_RESPONSE_BYTES,
    { timeoutMs: 10_000, label: 'visual quality model response' }
  );
  const raw = new TextDecoder().decode(buffer);
  try {
    return JSON.parse(raw || '{}') as T;
  } catch {
    return {} as T;
  }
}

async function resolveGenerationImageUrl(
  supabase: SupabaseClient,
  row: ImageVisualQualityGenerationRow
): Promise<string> {
  const metadata = toRecord(row.metadata);
  const mediaUrls = await buildClientMediaUrls(
    createMediaStorageAdapters({
      supabase,
      defaultBucket:
        typeof metadata.storageBucket === 'string'
          ? metadata.storageBucket
          : 'user-generated-images'
    }),
    metadata,
    SIGNED_URL_EXPIRES_IN,
    { imageUrl: row.image_url }
  );
  const url = mediaUrls.imageUrl || row.image_url;
  if (!url) {
    throw new ImageVisualQualityError(
      'IMAGE_URL_UNAVAILABLE',
      '生成图片地址不可用'
    );
  }
  return url;
}

async function callGeminiVisualQuality(params: {
  image: InlineImage;
  prompt: string;
  model: string;
  requestId?: string;
}): Promise<Record<string, unknown>> {
  if (!isOfficialGeminiEnabled()) {
    throw new ImageVisualQualityError(
      'VLM_NOT_CONFIGURED',
      '官方 Gemini 视觉评分未启用',
      503
    );
  }
  const apiKey = getVlmApiKey();
  if (!apiKey) {
    throw new ImageVisualQualityError(
      'VLM_NOT_CONFIGURED',
      '视觉评分模型未配置',
      503
    );
  }
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent`;
  const timing = createAiProviderUsageTiming();
  try {
    const response = await fetchModelWithTimeout(
      `${endpoint}?key=${apiKey}`,
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
                    mimeType: params.image.mimeType,
                    data: params.image.base64
                  }
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        })
      },
      { timeoutMs: 35_000, label: 'official Gemini visual quality' }
    );
    const data = await readVlmJson<{
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
      usageMetadata?: Record<string, unknown>;
    }>(response);
    if (!response.ok) {
      const upstreamMessage = normalizeText(data.error?.message, 240);
      throw new ImageVisualQualityError(
        response.status === 429 || response.status === 503
          ? 'VLM_TEMPORARILY_UNAVAILABLE'
          : 'VLM_REQUEST_FAILED',
        upstreamMessage || `视觉评分模型请求失败: ${response.status}`
      );
    }
    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || '')
        .join('')
        .trim() || '';
    const parsed = extractJsonObject(text);
    if (!parsed) {
      throw new ImageVisualQualityError(
        'VLM_RESPONSE_INVALID',
        '视觉评分模型返回了无效 JSON'
      );
    }
    await recordImageVisualQualityUsage({
      provider: 'gemini',
      model: params.model,
      endpoint,
      status: 'succeeded',
      requestId: params.requestId,
      promptChars: params.prompt.length,
      responseText: text,
      usageData: data,
      latencyMs: timing.mark(),
      startedAt: timing.startedAt,
      metadata: { transport: 'official_gemini' }
    });
    return parsed;
  } catch (error) {
    await recordImageVisualQualityUsage({
      provider: 'gemini',
      model: params.model,
      endpoint,
      status: 'failed',
      requestId: params.requestId,
      promptChars: params.prompt.length,
      latencyMs: timing.mark(),
      startedAt: timing.startedAt,
      error,
      metadata: { transport: 'official_gemini' }
    });
    throw error;
  }
}

function readOpenAICompatibleContent(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!Array.isArray(value)) return '';
  return value
    .map((part) => {
      const record = toRecord(part);
      return typeof record.text === 'string' ? record.text : '';
    })
    .join('')
    .trim();
}

async function callTuziVisualQuality(params: {
  image: InlineImage;
  prompt: string;
  model: string;
  requestId?: string;
}): Promise<Record<string, unknown>> {
  const connections = getTuziVlmConnections();
  if (connections.length === 0) {
    throw new ImageVisualQualityError(
      'VLM_NOT_CONFIGURED',
      'Tuzi 视觉评分模型未配置',
      503
    );
  }
  const gatewayToken = (
    process.env.CLOUDFLARE_AI_GATEWAY_RUN_TOKEN || ''
  ).trim();
  let lastError: unknown;
  for (const [connectionIndex, connection] of connections.entries()) {
    const timing = createAiProviderUsageTiming();
    let endpoint = '';
    try {
      const baseURL = normalizeOpenAICompatibleBaseUrl(
        process.env.TUZI_TEXT_BASE_URL ||
          process.env.TUZI_IMAGE_API_BASE_URL ||
          connection.apiBaseUrl ||
          process.env.TUZI_API_BASE_URL ||
          'https://api.tu-zi.com'
      );
      endpoint = `${baseURL}/chat/completions`;
      const gatewayHeaders: Record<string, string> =
        gatewayToken &&
        new URL(baseURL).hostname === 'gateway.ai.cloudflare.com'
          ? { 'cf-aig-authorization': `Bearer ${gatewayToken}` }
          : {};
      const response = await fetchModelWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${connection.apiKey}`,
            ...gatewayHeaders
          },
          body: JSON.stringify({
            model: params.model,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: params.prompt },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${params.image.mimeType};base64,${params.image.base64}`
                    }
                  }
                ]
              }
            ],
            temperature: 0.1,
            max_tokens: 2400,
            response_format: { type: 'json_object' }
          })
        },
        { timeoutMs: 35_000, label: 'Tuzi visual quality' }
      );
      const data = await readVlmJson<{
        choices?: Array<{ message?: { content?: unknown } }>;
        error?: { message?: string } | string;
        usage?: Record<string, unknown>;
      }>(response);
      if (!response.ok) {
        const upstreamMessage = normalizeText(
          typeof data.error === 'string' ? data.error : data.error?.message,
          240
        );
        throw new ImageVisualQualityError(
          response.status === 429 || response.status === 503
            ? 'VLM_TEMPORARILY_UNAVAILABLE'
            : 'VLM_REQUEST_FAILED',
          upstreamMessage || `Tuzi 视觉评分模型请求失败: ${response.status}`
        );
      }
      const responseText = readOpenAICompatibleContent(
        data.choices?.[0]?.message?.content
      );
      const parsed = extractJsonObject(responseText);
      if (!parsed) {
        throw new ImageVisualQualityError(
          'VLM_RESPONSE_INVALID',
          'Tuzi 视觉评分模型返回了无效 JSON'
        );
      }
      await recordImageVisualQualityUsage({
        provider: 'tuzi',
        model: params.model,
        endpoint,
        status: 'succeeded',
        requestId: params.requestId,
        fallbackOf: connectionIndex > 0 ? 'tuzi_connection' : null,
        fallbackUsed: connectionIndex > 0,
        promptChars: params.prompt.length,
        responseText,
        usageData: data,
        latencyMs: timing.mark(),
        startedAt: timing.startedAt,
        metadata: {
          connectionSource: connection.source,
          connectionIndex,
          gateway: Boolean(gatewayHeaders['cf-aig-authorization'])
        }
      });
      if (connectionIndex > 0) {
        console.info('[ImageVisualQuality] Tuzi connection recovered:', {
          source: connection.source,
          connectionIndex,
          model: params.model
        });
      }
      return parsed;
    } catch (error) {
      await recordImageVisualQualityUsage({
        provider: 'tuzi',
        model: params.model,
        endpoint: endpoint || 'tuzi_visual_quality',
        status: 'failed',
        requestId: params.requestId,
        fallbackOf: connectionIndex > 0 ? 'tuzi_connection' : null,
        fallbackUsed: connectionIndex > 0,
        promptChars: params.prompt.length,
        latencyMs: timing.mark(),
        startedAt: timing.startedAt,
        error,
        metadata: {
          connectionSource: connection.source,
          connectionIndex
        }
      });
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new ImageVisualQualityError(
        'VLM_REQUEST_FAILED',
        'Tuzi 视觉评分模型请求失败'
      );
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function callVisualQualityWithFallback(params: {
  image: InlineImage;
  prompt: string;
  requestId?: string;
}): Promise<{ parsed: Record<string, unknown>; model: string }> {
  const configuredModels = getImageVisualQualityModelChain();
  const tuziModels = Array.from(
    new Set(
      [process.env.TUZI_VISION_MODEL?.trim(), ...configuredModels].filter(
        (model): model is string => Boolean(model)
      )
    )
  );
  const providers: Array<{
    label: 'tuzi' | 'official_gemini';
    models: string[];
    call: (input: {
      image: InlineImage;
      prompt: string;
      model: string;
      requestId?: string;
    }) => Promise<Record<string, unknown>>;
  }> = [];
  if (getTuziVlmApiKey()) {
    providers.push({
      label: 'tuzi',
      models: tuziModels,
      call: callTuziVisualQuality
    });
  }
  if (isOfficialGeminiEnabled() && getVlmApiKey()) {
    providers.push({
      label: 'official_gemini',
      models: configuredModels,
      call: callGeminiVisualQuality
    });
  }
  if (providers.length === 0) {
    throw new ImageVisualQualityError(
      'VLM_NOT_CONFIGURED',
      '视觉评分模型未配置',
      503
    );
  }
  let lastError: unknown;
  for (const provider of providers) {
    for (const [modelIndex, model] of provider.models.entries()) {
      const attempts = modelIndex === 0 ? 2 : 1;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          const parsed = await provider.call({ ...params, model });
          if (provider.label !== 'tuzi' || modelIndex > 0 || attempt > 1) {
            console.info('[ImageVisualQuality] VLM recovered:', {
              provider: provider.label,
              model,
              modelIndex,
              attempt
            });
          }
          return { parsed, model };
        } catch (error) {
          lastError = error;
          if (attempt < attempts) {
            await wait(750 * attempt);
          }
        }
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new ImageVisualQualityError('VLM_REQUEST_FAILED', '视觉评分模型请求失败');
}

async function loadGenerationRow(
  supabase: SupabaseClient,
  generationId: string,
  userId?: string
): Promise<ImageVisualQualityGenerationRow> {
  let query = supabase
    .from('image_generations')
    .select(
      'id, user_id, image_url, prompt, negative_prompt, provider, provider_model, aspect_ratio, quality, asset_ids, metadata, created_at'
    )
    .eq('id', generationId);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    throw new ImageVisualQualityError(
      'GENERATION_NOT_FOUND',
      '生成记录不存在',
      404
    );
  }
  return data as ImageVisualQualityGenerationRow;
}

async function persistMetadataPatch(
  supabase: SupabaseClient,
  generationId: string,
  patch: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { data: current, error: loadError } = await supabase
    .from('image_generations')
    .select('metadata')
    .eq('id', generationId)
    .maybeSingle();
  if (loadError || !current) {
    throw new ImageVisualQualityError(
      'PERSIST_FAILED',
      '视觉评分元数据读取失败',
      500
    );
  }
  const metadata = { ...toRecord(current.metadata), ...patch };
  const { error } = await supabase
    .from('image_generations')
    .update({ metadata })
    .eq('id', generationId);
  if (error) {
    throw new ImageVisualQualityError(
      'PERSIST_FAILED',
      '视觉评分结果保存失败',
      500
    );
  }
  return metadata;
}

function getAuditState(metadata: unknown): ImageVisualQualityAuditState | null {
  const raw = toRecord(toRecord(metadata).visualQualityAuditState);
  if (
    raw.evaluatorVersion !== IMAGE_VISUAL_QUALITY_EVALUATOR_VERSION ||
    (raw.status !== 'evaluating' &&
      raw.status !== 'completed' &&
      raw.status !== 'failed')
  ) {
    return null;
  }
  return raw as unknown as ImageVisualQualityAuditState;
}

function getErrorCode(error: unknown): string {
  return error instanceof ImageVisualQualityError
    ? error.code
    : 'VISUAL_QUALITY_UNKNOWN_ERROR';
}

function getSafeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '视觉评分失败';
  return normalizeText(message, 240) || '视觉评分失败';
}

function buildRetryAt(attempts: number): string {
  const delayMs = Math.min(
    6 * 60 * 60 * 1000,
    5 * 60 * 1000 * 2 ** Math.max(0, attempts - 1)
  );
  return new Date(Date.now() + delayMs).toISOString();
}

export async function scoreImageGenerationVisualQuality(params: {
  supabase: SupabaseClient;
  generationId: string;
  userId?: string;
  force?: boolean;
}): Promise<{ audit: ImageVisualQualityAudit; cached: boolean }> {
  const row = await loadGenerationRow(
    params.supabase,
    params.generationId,
    params.userId
  );
  const metadata = toRecord(row.metadata);
  if (
    !params.force &&
    isCurrentImageVisualQualityAudit(metadata.visualQualityAudit)
  ) {
    return {
      audit: metadata.visualQualityAudit,
      cached: true
    };
  }

  const previousState = getAuditState(metadata);
  if (
    !params.force &&
    previousState?.status === 'evaluating' &&
    previousState.leaseExpiresAt &&
    new Date(previousState.leaseExpiresAt).getTime() > Date.now()
  ) {
    throw new ImageVisualQualityError(
      'VISUAL_QUALITY_IN_PROGRESS',
      '视觉评分正在进行中',
      409
    );
  }
  if (
    !params.force &&
    previousState?.status === 'failed' &&
    previousState.nextRetryAt &&
    new Date(previousState.nextRetryAt).getTime() > Date.now()
  ) {
    throw new ImageVisualQualityError(
      'VISUAL_QUALITY_RETRY_DEFERRED',
      '视觉评分将在退避期结束后自动重试',
      429
    );
  }
  const attempts = Math.max(0, Number(previousState?.attempts || 0)) + 1;
  const startedAt = new Date().toISOString();
  const evaluatingState: ImageVisualQualityAuditState = {
    status: 'evaluating',
    evaluatorVersion: IMAGE_VISUAL_QUALITY_EVALUATOR_VERSION,
    attempts,
    updatedAt: startedAt,
    leaseExpiresAt: new Date(Date.now() + EVALUATION_LEASE_MS).toISOString()
  };
  await persistMetadataPatch(params.supabase, row.id, {
    visualQualityAuditState: evaluatingState
  });

  try {
    const imageUrl = await resolveGenerationImageUrl(params.supabase, row);
    const image = await downloadInlineImage(imageUrl);
    const scored = await callVisualQualityWithFallback({
      image,
      prompt: buildImageVisualQualityPrompt(row),
      requestId: row.id
    });
    const audit = normalizeImageVisualQualityResponse({
      value: scored.parsed,
      model: scored.model,
      row
    });
    const completedState: ImageVisualQualityAuditState = {
      status: 'completed',
      evaluatorVersion: IMAGE_VISUAL_QUALITY_EVALUATOR_VERSION,
      attempts,
      updatedAt: audit.evaluatedAt
    };
    await persistMetadataPatch(params.supabase, row.id, {
      visualQualityAudit: audit,
      visualQualityAuditState: completedState
    });
    console.info(
      JSON.stringify({
        event: 'image_visual_quality_scored',
        generation_id: row.id,
        evaluator_version: audit.evaluatorVersion,
        model: audit.model,
        overall_score: audit.overallScore,
        grade: audit.grade,
        confidence: audit.confidence,
        attempts
      })
    );
    return { audit, cached: false };
  } catch (error) {
    const failedState: ImageVisualQualityAuditState = {
      status: 'failed',
      evaluatorVersion: IMAGE_VISUAL_QUALITY_EVALUATOR_VERSION,
      attempts,
      updatedAt: new Date().toISOString(),
      nextRetryAt: buildRetryAt(attempts),
      lastErrorCode: getErrorCode(error),
      lastErrorMessage: getSafeErrorMessage(error)
    };
    try {
      await persistMetadataPatch(params.supabase, row.id, {
        visualQualityAuditState: failedState
      });
    } catch (persistError) {
      console.error('[ImageVisualQuality] failed state persistence failed:', {
        generationId: row.id,
        errorCode: getErrorCode(persistError)
      });
    }
    throw error;
  }
}

export function shouldScoreImageVisualQualitySweepRow(
  row: ImageVisualQualityGenerationRow
): boolean {
  const metadata = toRecord(row.metadata);
  if (isCurrentImageVisualQualityAudit(metadata.visualQualityAudit))
    return false;
  const state = getAuditState(metadata);
  const maxAttempts = parseBoundedInteger(
    process.env.IMAGE_VISUAL_QUALITY_MAX_ATTEMPTS,
    DEFAULT_SWEEP_MAX_ATTEMPTS,
    1,
    10
  );
  if (Number(state?.attempts || 0) >= maxAttempts) return false;
  const now = Date.now();
  if (state?.status === 'evaluating' && state.leaseExpiresAt) {
    const leaseExpiresAt = new Date(state.leaseExpiresAt).getTime();
    if (Number.isFinite(leaseExpiresAt) && leaseExpiresAt > now) return false;
  }
  if (state?.status === 'failed' && state.nextRetryAt) {
    const nextRetryAt = new Date(state.nextRetryAt).getTime();
    if (Number.isFinite(nextRetryAt) && nextRetryAt > now) return false;
  }
  return true;
}

export async function findImageVisualQualitySweepCandidates(params: {
  supabase: SupabaseClient;
  cutoff: Date;
  limit: number;
  pageSize?: number;
  maxScanRows?: number;
}): Promise<{
  scanned: number;
  candidates: ImageVisualQualityGenerationRow[];
}> {
  const pageSize = params.pageSize || 50;
  const maxScanRows = params.maxScanRows || 500;
  const candidates: ImageVisualQualityGenerationRow[] = [];
  let scanned = 0;
  for (
    let offset = 0;
    offset < maxScanRows && candidates.length < params.limit;
    offset += pageSize
  ) {
    const { data, error } = await params.supabase
      .from('image_generations')
      .select(
        'id, user_id, image_url, prompt, negative_prompt, provider, provider_model, aspect_ratio, quality, asset_ids, metadata, created_at'
      )
      .gte('created_at', params.cutoff.toISOString())
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) {
      throw new ImageVisualQualityError(
        'SWEEP_QUERY_FAILED',
        '视觉评分待处理任务查询失败',
        500
      );
    }
    const rows = (data || []) as ImageVisualQualityGenerationRow[];
    scanned += rows.length;
    candidates.push(
      ...rows
        .filter(shouldScoreImageVisualQualitySweepRow)
        .slice(0, params.limit - candidates.length)
    );
    if (rows.length < pageSize) break;
  }
  return { scanned, candidates };
}

export async function runImageVisualQualitySweep(
  input: {
    limit?: number;
    lookbackHours?: number;
  } = {}
): Promise<{
  scanned: number;
  attempted: number;
  completed: number;
  failed: number;
  skippedReason?: string;
}> {
  const enabled = !['0', 'false', 'off'].includes(
    (process.env.IMAGE_VISUAL_QUALITY_AUTO_ENABLED || 'false').toLowerCase()
  );
  if (!enabled) {
    return {
      scanned: 0,
      attempted: 0,
      completed: 0,
      failed: 0,
      skippedReason: 'disabled'
    };
  }
  if (!getTuziVlmApiKey() && (!isOfficialGeminiEnabled() || !getVlmApiKey())) {
    return {
      scanned: 0,
      attempted: 0,
      completed: 0,
      failed: 0,
      skippedReason: 'vlm_not_configured'
    };
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return {
      scanned: 0,
      attempted: 0,
      completed: 0,
      failed: 0,
      skippedReason: 'supabase_not_configured'
    };
  }

  const limit =
    input.limit ??
    parseBoundedInteger(
      process.env.IMAGE_VISUAL_QUALITY_SWEEP_LIMIT,
      DEFAULT_SWEEP_LIMIT,
      1,
      5
    );
  const lookbackHours =
    input.lookbackHours ??
    parseBoundedInteger(
      process.env.IMAGE_VISUAL_QUALITY_LOOKBACK_HOURS,
      DEFAULT_SWEEP_LOOKBACK_HOURS,
      1,
      168
    );
  const supabase = createClient(supabaseUrl, supabaseKey);
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const { scanned, candidates } = await findImageVisualQualitySweepCandidates({
    supabase,
    cutoff,
    limit
  });
  let completed = 0;
  let failed = 0;
  for (const row of candidates) {
    try {
      await scoreImageGenerationVisualQuality({
        supabase,
        generationId: row.id
      });
      completed += 1;
    } catch (auditError) {
      failed += 1;
      console.warn('[ImageVisualQuality] sweep item failed:', {
        generationId: row.id,
        errorCode: getErrorCode(auditError)
      });
    }
  }
  return {
    scanned,
    attempted: candidates.length,
    completed,
    failed
  };
}
