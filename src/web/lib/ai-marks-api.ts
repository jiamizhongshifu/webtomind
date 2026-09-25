import { getAuthToken } from '@/services/agent-api';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 30 * 1024 * 1024;

export type AiMarksServiceStatus = {
  ok: boolean;
  health?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  code?: string;
  error?: string;
};

export type AiMarksInspectResult = {
  ok: boolean;
  kind?: string;
  suspicious?: boolean;
  report?: Record<string, unknown>;
  error?: string;
};

export type AiMarksCleanResult = {
  ok: boolean;
  kind?: string;
  cleaned?: string;
  report?: Record<string, unknown>;
  error?: string;
};

export type AiMarksCleanOptions = {
  keep_non_ai_metadata?: boolean;
  strip_all_metadata?: boolean;
  remove_pixel?: 'ctrlregen' | 'diffusion';
  remove_visible?: boolean;
  visible_mask?: string;
  visible_boxes?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  visible_padding_px?: number;
  visible_expand_px?: number;
  visible_inpaint_radius?: number;
  visible_inpaint_method?: 'telea' | 'ns';
};

function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    retryAfter?: number;
  };
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('请先登录后再使用 AI 标记清理。');
    }
    if (response.status === 429) {
      const retryAfter = Number(payload?.retryAfter);
      throw new Error(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? `请求过于频繁，请在 ${retryAfter} 秒后重试。`
          : '请求过于频繁，请稍后重试。'
      );
    }
    throw new Error(
      typeof payload?.error === 'string'
        ? payload.error
        : 'AI 标记服务请求失败。'
    );
  }
  return payload;
}

export async function getAiMarksServiceStatus(
  signal?: AbortSignal
): Promise<AiMarksServiceStatus> {
  try {
    const response = await fetch('/api/tools/ai-marks', {
      headers: { Accept: 'application/json', ...getAuthHeaders() },
      signal
    });
    return await parseResponse<AiMarksServiceStatus>(response);
  } catch (error) {
    return {
      ok: false,
      code: 'AI_MARKS_STATUS_FAILED',
      error: error instanceof Error ? error.message : 'AI 标记服务无法连接。'
    };
  }
}

async function fileToBase64(file: File, signal?: AbortSignal): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('文件超过 20 MB，请先压缩后重试。');
  }
  if (signal?.aborted)
    throw new DOMException('Request cancelled', 'AbortError');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abortError = () => new DOMException('Request cancelled', 'AbortError');
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const onAbort = () => {
      reader.abort();
      reject(abortError());
    };

    reader.onerror = () => {
      cleanup();
      reject(new Error('文件读取失败，请重试。'));
    };
    reader.onabort = () => {
      cleanup();
      reject(abortError());
    };
    reader.onload = () => {
      cleanup();
      const result = typeof reader.result === 'string' ? reader.result : '';
      const separator = result.indexOf(',');
      if (separator < 0) {
        reject(new Error('文件编码失败，请重试。'));
        return;
      }
      resolve(result.slice(separator + 1));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    reader.readAsDataURL(file);
  });
}

function textToFile(text: string): File {
  return new File([text], 'pasted-content.txt', { type: 'text/plain' });
}

async function postFile<T>(
  action: 'inspect' | 'clean',
  file: File,
  options?: AiMarksCleanOptions,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch('/api/tools/ai-marks', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    signal,
    body: JSON.stringify({
      action,
      file: await fileToBase64(file, signal),
      name: file.name,
      ...(action === 'clean' ? { options: options || {} } : {})
    })
  });
  return parseResponse<T>(response);
}

export async function inspectAiMarksFile(
  file: File | null,
  pastedText: string,
  signal?: AbortSignal
): Promise<AiMarksInspectResult> {
  return postFile<AiMarksInspectResult>(
    'inspect',
    file || textToFile(pastedText),
    undefined,
    signal
  );
}

export async function cleanAiMarksFile(
  file: File | null,
  pastedText: string,
  options: AiMarksCleanOptions,
  signal?: AbortSignal
): Promise<AiMarksCleanResult> {
  return postFile<AiMarksCleanResult>(
    'clean',
    file || textToFile(pastedText),
    options,
    signal
  );
}

export function getCapabilityMap(
  status: AiMarksServiceStatus | null,
  key: 'pixel_backends' | 'scorers' | 'text_detectors' | 'visible_removal'
): Record<string, unknown> {
  return asRecord(status?.capabilities?.[key]);
}

export function hasCapability(
  status: AiMarksServiceStatus | null,
  key: 'pixel_backends' | 'scorers' | 'text_detectors' | 'visible_removal',
  value: string
): boolean {
  const entry = getCapabilityMap(status, key)[value];
  return entry === true;
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  if (base64.length > Math.ceil((MAX_OUTPUT_BYTES * 4) / 3)) {
    throw new Error('清理结果过大，无法在浏览器中安全打开。');
  }
  const binary = atob(base64);
  if (binary.length > MAX_OUTPUT_BYTES) {
    throw new Error('清理结果超过 30 MB，无法在浏览器中安全打开。');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
}

export function getMimeTypeForFileName(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    avif: 'image/avif',
    bmp: 'image/bmp',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    epub: 'application/epub+zip',
    gif: 'image/gif',
    heic: 'image/heic',
    html: 'text/html',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    md: 'text/markdown',
    m4a: 'audio/x-m4a',
    m4v: 'video/x-m4v',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    odt: 'application/vnd.oasis.opendocument.text',
    pdf: 'application/pdf',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    png: 'image/png',
    svg: 'image/svg+xml',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    txt: 'text/plain',
    wav: 'audio/wav',
    webp: 'image/webp',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  return extension
    ? mimeTypes[extension] || 'application/octet-stream'
    : 'application/octet-stream';
}

export function formatReportValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(formatReportValue).join(', ');
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .slice(0, 4)
      .map(([key, entry]) => `${key}: ${formatReportValue(entry)}`)
      .join(' · ');
  }
  return '—';
}

export function getReportEntries(
  report: Record<string, unknown> | undefined
): Array<[string, string]> {
  return Object.entries(report || {})
    .filter(([, value]) => value !== null && value !== undefined)
    .slice(0, 6)
    .map(([key, value]) => [key, formatReportValue(value)]);
}
