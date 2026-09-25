import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getCorsHeadersForRequest,
  getUserIdFromRequest
} from '../../utils/auth';

export const config = { runtime: 'edge' };

const MAX_PRESETS = 8;
const MAX_PROMPT_LIBRARY_ITEMS = 50;
const MAX_NAME_LENGTH = 120;
const MAX_TITLE_LENGTH = 160;
const MAX_PROMPT_LENGTH = 12000;
const MAX_NEGATIVE_PROMPT_LENGTH = 4000;

interface ImageCreatorUserLibraryDependencies {
  getCorsHeadersForRequest?: typeof getCorsHeadersForRequest;
  getUserIdFromRequest?: typeof getUserIdFromRequest;
  createSupabaseClient?: (url: string, key: string) => SupabaseClient;
}

interface UserLibraryRow {
  presets: unknown[];
  prompt_library: unknown[];
  updated_at: string;
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

function sanitizeText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function sanitizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sanitizePreset(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    id: sanitizeText(record.id, 80) || crypto.randomUUID(),
    name: sanitizeText(record.name, MAX_NAME_LENGTH) || 'Untitled preset',
    selection: sanitizeObject(record.selection),
    settings: sanitizeObject(record.settings),
    createdAt: Number.isFinite(Number(record.createdAt))
      ? Number(record.createdAt)
      : Date.now()
  };
}

function sanitizePromptLibraryItem(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const prompt = sanitizeText(record.prompt, MAX_PROMPT_LENGTH);
  if (!prompt) return null;
  return {
    id: sanitizeText(record.id, 80) || crypto.randomUUID(),
    title: sanitizeText(record.title, MAX_TITLE_LENGTH) || 'Untitled prompt',
    prompt,
    negativePrompt: sanitizeText(
      record.negativePrompt,
      MAX_NEGATIVE_PROMPT_LENGTH
    ),
    createdAt: Number.isFinite(Number(record.createdAt))
      ? Number(record.createdAt)
      : Date.now()
  };
}

function sanitizePresets(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map(sanitizePreset)
    .filter((item): item is NonNullable<ReturnType<typeof sanitizePreset>> =>
      Boolean(item)
    )
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_PRESETS);
}

function sanitizePromptLibrary(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: Array<
    NonNullable<ReturnType<typeof sanitizePromptLibraryItem>>
  > = [];
  for (const item of value.map(sanitizePromptLibraryItem)) {
    if (!item) continue;
    const key = `${item.prompt}\n---negative---\n${item.negativePrompt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_PROMPT_LIBRARY_ITEMS);
}

function rowToClient(row: UserLibraryRow | null) {
  return {
    presets: sanitizePresets(row?.presets),
    promptLibrary: sanitizePromptLibrary(row?.prompt_library),
    updatedAt: row?.updated_at
  };
}

async function loadUserLibrary(
  supabase: SupabaseClient,
  userId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { data, error } = await supabase
    .from('image_creator_user_libraries')
    .select('presets, prompt_library, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[ImageUserLibrary] load failed:', error);
    return jsonResponse(
      { error: '个人提示词库加载失败', presets: [], promptLibrary: [] },
      corsHeaders,
      500
    );
  }

  return jsonResponse(
    rowToClient((data || null) as UserLibraryRow | null),
    corsHeaders
  );
}

async function saveUserLibrary(
  supabase: SupabaseClient,
  userId: string,
  body: Record<string, unknown>,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const presets = sanitizePresets(body.presets);
  const promptLibrary = sanitizePromptLibrary(body.promptLibrary);

  const { data, error } = await supabase
    .from('image_creator_user_libraries')
    .upsert(
      {
        user_id: userId,
        presets,
        prompt_library: promptLibrary
      },
      { onConflict: 'user_id' }
    )
    .select('presets, prompt_library, updated_at')
    .single();

  if (error) {
    console.error('[ImageUserLibrary] save failed:', error);
    return jsonResponse(
      { error: '个人提示词库同步失败', presets, promptLibrary },
      corsHeaders,
      500
    );
  }

  return jsonResponse(rowToClient(data as UserLibraryRow), corsHeaders);
}

export function createImageUserLibraryHandler(
  dependencies: ImageCreatorUserLibraryDependencies = {}
) {
  const resolveCorsHeaders =
    dependencies.getCorsHeadersForRequest || getCorsHeadersForRequest;
  const resolveUserId =
    dependencies.getUserIdFromRequest || getUserIdFromRequest;
  const createSupabaseClient =
    dependencies.createSupabaseClient ||
    ((url: string, key: string) => createClient(url, key));

  return async function handler(request: Request) {
    const corsHeaders = resolveCorsHeaders(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (!['GET', 'PUT'].includes(request.method)) {
      return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
    }

    const userId = await resolveUserId(request);
    if (!userId) {
      return jsonResponse(
        { error: '请先登录', presets: [], promptLibrary: [] },
        corsHeaders,
        401
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse(
        { error: 'Supabase 未配置', presets: [], promptLibrary: [] },
        corsHeaders,
        503
      );
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    if (request.method === 'GET') {
      return loadUserLibrary(supabase, userId, corsHeaders);
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) {
      return jsonResponse({ error: 'Invalid JSON body' }, corsHeaders, 400);
    }

    return saveUserLibrary(supabase, userId, body, corsHeaders);
  };
}

export default createImageUserLibraryHandler();
