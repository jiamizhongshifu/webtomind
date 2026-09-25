import type { VideoGenerationCreditEstimate } from './video-generation-pricing';

export interface ArkVideoCreateInput {
  prompt: string;
  model: string;
  aspectRatio: string;
  duration: number;
  resolution: string;
  outputFormat?: 'mp4' | 'mov';
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
  referenceAudioUrls?: string[];
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  referenceMode?: 'reference' | 'first-last-frame';
  generateAudio: boolean;
  watermark?: boolean;
  webSearch?: boolean;
  safetyIdentifier?: string;
  costEstimate?: VideoGenerationCreditEstimate;
}

export interface ArkVideoHttpRequest {
  path: string;
  method: 'GET' | 'POST' | 'DELETE';
  body?: BodyInit;
  headers?: Record<string, string>;
}

export interface ArkVideoCreateResult {
  id: string;
  status: string;
  raw: unknown;
  videoUrl?: string;
  previewImageUrl?: string;
}

export interface ArkVideoStatusResult extends ArkVideoCreateResult {
  progress?: number;
  errorMessage?: string;
  /** 官方任务完成后返回的真实 billed-token 用量（usage.completion_tokens）。 */
  completionTokens?: number;
}

export function getArkVideoApiBaseUrl(): string {
  return (
    process.env.ARK_VIDEO_API_BASE_URL ||
    'https://ark.cn-beijing.volces.com/api/v3'
  ).replace(/\/+$/, '');
}

export function getArkVideoCreatePath(): string {
  return process.env.ARK_VIDEO_CREATE_PATH || '/contents/generations/tasks';
}

export function getArkVideoStatusPath(taskId: string): string {
  const template =
    process.env.ARK_VIDEO_STATUS_PATH_TEMPLATE ||
    '/contents/generations/tasks/{id}';
  return template.replace('{id}', encodeURIComponent(taskId.trim()));
}

export function getArkVideoApiKey(): string | undefined {
  const key = String(process.env.ARK_API_KEY || '').trim();
  return key || undefined;
}

export function isArkVideoGenerationEnabled(): boolean {
  return process.env.ARK_VIDEO_GENERATION_ENABLED === 'true';
}

export function isArkVideoLaunchEnabled(): boolean {
  return process.env.ARK_VIDEO_LAUNCH_ENABLED === 'true';
}

export function isArkVideoGenerationAvailable(): boolean {
  return isArkVideoGenerationEnabled() && isArkVideoLaunchEnabled();
}

export function buildArkVideoContent(input: Partial<ArkVideoCreateInput>) {
  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: input.prompt }
  ];
  const imageUrls = (input.referenceImageUrls || []).filter(Boolean);
  const hasExplicitFrames = Boolean(input.firstFrameUrl || input.lastFrameUrl);

  imageUrls.forEach((url, index) => {
    const role =
      !hasExplicitFrames && input.referenceMode === 'first-last-frame'
        ? index === 0
          ? 'first_frame'
          : 'last_frame'
        : 'reference_image';
    content.push({ type: 'image_url', image_url: { url }, role });
  });
  (input.referenceVideoUrls || []).filter(Boolean).forEach((url) => {
    content.push({
      type: 'video_url',
      video_url: { url },
      role: 'reference_video'
    });
  });
  (input.referenceAudioUrls || []).filter(Boolean).forEach((url) => {
    content.push({
      type: 'audio_url',
      audio_url: { url },
      role: 'reference_audio'
    });
  });
  if (input.firstFrameUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: input.firstFrameUrl },
      role: 'first_frame'
    });
  }
  if (input.lastFrameUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: input.lastFrameUrl },
      role: 'last_frame'
    });
  }
  return content;
}

export function buildArkVideoCreatePayload(input: ArkVideoCreateInput) {
  return {
    model: input.model,
    content: buildArkVideoContent(input),
    resolution: input.resolution,
    ratio: input.aspectRatio,
    duration: input.duration,
    ...(input.outputFormat ? { output_format: input.outputFormat } : {}),
    generate_audio: input.generateAudio,
    return_last_frame: true,
    watermark: input.watermark === true,
    ...(input.webSearch ? { tools: [{ type: 'web_search' }] } : {}),
    ...(input.safetyIdentifier
      ? { safety_identifier: input.safetyIdentifier }
      : {})
  };
}

export function buildArkVideoCreateHttpRequest(
  input: ArkVideoCreateInput
): ArkVideoHttpRequest {
  return {
    method: 'POST',
    path: getArkVideoCreatePath(),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildArkVideoCreatePayload(input))
  };
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function normalizeArkVideoCreateResponse(
  raw: unknown
): ArkVideoCreateResult {
  const record = getRecord(raw);
  const content = getRecord(record.content);
  return {
    id: getString(record.id) || '',
    status: getString(record.status) || 'submitted',
    raw,
    ...(getString(content.video_url)
      ? { videoUrl: getString(content.video_url) }
      : {}),
    ...(getString(content.last_frame_url)
      ? { previewImageUrl: getString(content.last_frame_url) }
      : {})
  };
}

function getNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function normalizeArkVideoStatusResponse(
  raw: unknown
): ArkVideoStatusResult {
  const result = normalizeArkVideoCreateResponse(raw);
  const record = getRecord(raw);
  const error = getRecord(record.error);
  const errorMessage = getString(error.message);
  const usage = getRecord(record.usage);
  return {
    ...result,
    ...(errorMessage ? { errorMessage } : {}),
    ...(getNumber(usage.completion_tokens) !== undefined
      ? { completionTokens: getNumber(usage.completion_tokens) }
      : {})
  };
}
