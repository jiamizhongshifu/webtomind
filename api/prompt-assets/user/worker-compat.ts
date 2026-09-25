import { getCorsHeadersForRequest } from '../../utils/auth.js';

export const PROMPT_ASSET_UPLOAD_PREFIX = 'prompt-asset-uploads';
export const MAX_PROMPT_IMPORT_CHARS = 24_000;
export const MAX_PROMPT_ASSET_IMAGE_BYTES = 8 * 1024 * 1024;

export interface PromptAssetRow {
  id: string;
  slot: string;
  title: string;
  subtitle: string;
  prompt: string;
  negative_prompt: string | null;
  tags: string[];
  thumbnail_url: string;
  visual: Record<string, unknown>;
  metadata: Record<string, unknown>;
  sort_order: number;
  created_at: string;
  updated_at: string;
  owner_user_id: string | null;
}

export type JsonResponseFactory = (data: unknown, status?: number) => Response;

export function getPromptAssetBucket(): string {
  return (
    (typeof process !== 'undefined'
      ? process.env.PROMPT_ASSET_BUCKET
      : undefined) || 'generated-images'
  );
}

export function createJsonResponder(request: Request): {
  corsHeaders: Record<string, string>;
  jsonResponse: JsonResponseFactory;
} {
  const corsHeaders = getCorsHeadersForRequest(request);
  const jsonResponse: JsonResponseFactory = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  return { corsHeaders, jsonResponse };
}

export function rowToClient(row: PromptAssetRow) {
  const metadata = row.metadata || {};
  return {
    id: row.id,
    slot: row.slot,
    title: row.title,
    subtitle: row.subtitle,
    prompt: row.prompt,
    promptZh:
      typeof metadata.promptZh === 'string' ? metadata.promptZh : null,
    negativePrompt: row.negative_prompt,
    negativePromptZh:
      typeof metadata.negativePromptZh === 'string'
        ? metadata.negativePromptZh
        : null,
    tags: row.tags || [],
    thumbnailUrl: row.thumbnail_url,
    visual: row.visual,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ownerUserId: row.owner_user_id
  };
}

export function detectExtensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('gif')) return 'gif';
  return 'png';
}

export function detectExtensionFromPath(path: string, fallback = 'png'): string {
  const match = path.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : fallback;
}

export function parseBase64Payload(
  payload: string
): { base64: string; mimeType: string } | null {
  if (!payload) return null;
  if (payload.startsWith('data:')) {
    const match = payload.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return { mimeType: match[1], base64: match[2].replace(/\s+/g, '') };
  }
  return { mimeType: 'image/png', base64: payload.replace(/\s+/g, '') };
}

export function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.ceil((base64.length * 3) / 4) - padding);
}

export function decodeBase64ToBytes(base64: string): Uint8Array | null {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function randomHex(byteLength = 8): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}

export function buildPromptAssetStoragePath(input: {
  userId: string;
  extension: string;
  prefix?: string;
  date?: Date;
}): string {
  const date = input.date || new Date();
  const month = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const prefix = input.prefix || '';
  const filename = `${prefix}${Date.now()}-${randomHex(6)}.${input.extension}`;
  return `${PROMPT_ASSET_UPLOAD_PREFIX}/${input.userId}/${month}/${filename}`;
}
