export interface GenerateRequest {
  content: string;
  style?: string;
  slideCount?: number;
  language?: 'auto' | 'zh' | 'en';
  title?: string;
}

export type NormalizedGenerateRequest = Required<
  Pick<GenerateRequest, 'content' | 'style' | 'slideCount' | 'language'>
> &
  Pick<GenerateRequest, 'title'>;

type NormalizedRequestResult =
  | { ok: true; value: NormalizedGenerateRequest }
  | { ok: false; status: number; error: string };

const DEFAULT_ALLOWED_ORIGINS = 'https://webtomind.com,https://www.webtomind.com';

function getRuntimeEnvValue(key: string): string | undefined {
  return typeof process !== 'undefined' ? process.env[key] : undefined;
}

function getAllowedOrigins(): string[] {
  return (getRuntimeEnvValue('ALLOWED_ORIGINS') || DEFAULT_ALLOWED_ORIGINS)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getPptCorsOrigin(origin: string | undefined): string {
  const allowedOrigins = getAllowedOrigins();
  if (!origin) return allowedOrigins[0] || 'https://webtomind.com';
  if (allowedOrigins.includes(origin)) return origin;
  if (
    getRuntimeEnvValue('NODE_ENV') !== 'production' &&
    (origin.includes('localhost') || origin.includes('127.0.0.1'))
  ) {
    return origin;
  }
  return allowedOrigins[0] || 'https://webtomind.com';
}

export function normalizeGenerateRequest(
  body: unknown
): NormalizedRequestResult {
  const payload =
    body && typeof body === 'object'
      ? (body as Partial<GenerateRequest>)
      : {};
  const content = typeof payload.content === 'string' ? payload.content : '';

  if (!content || content.trim().length < 50) {
    return {
      ok: false,
      status: 400,
      error: '内容太短，请提供至少 50 个字符的内容'
    };
  }

  const requestedSlideCount =
    typeof payload.slideCount === 'number' && Number.isFinite(payload.slideCount)
      ? payload.slideCount
      : 10;
  const language =
    payload.language === 'zh' || payload.language === 'en'
      ? payload.language
      : 'auto';

  return {
    ok: true,
    value: {
      content,
      style: typeof payload.style === 'string' ? payload.style : 'blueprint',
      slideCount: Math.min(Math.max(requestedSlideCount, 5), 20),
      language,
      title:
        typeof payload.title === 'string' && payload.title.trim()
          ? payload.title.trim()
          : undefined
    }
  };
}

function randomHex(byteLength = 6): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}

export function sanitizePptFileName(title: string): string {
  return `${title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_') || 'presentation'}.pptx`;
}

export function buildPptStoragePath(input: {
  userId: string;
  fileName: string;
  date?: Date;
}): string {
  const date = input.date || new Date();
  const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `${input.userId}/${yearMonth}/pptx/${Date.now()}-${randomHex()}-${input.fileName}`;
}
