import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getCorsHeadersForRequest,
  getUserIdFromRequest
} from '../../utils/auth';

export const config = { runtime: 'edge' };

const MAX_RECIPES = 60;
const MAX_SCENES = 12;
const MAX_CHARACTER_IDS = 2;
const MAX_REFERENCE_IDS = 8;
const ALLOWED_RECIPE_TYPES = new Set([
  'character_scene_pack',
  'style_batch_pack'
]);

interface ImageRecipesHandlerDependencies {
  getCorsHeadersForRequest?: typeof getCorsHeadersForRequest;
  getUserIdFromRequest?: typeof getUserIdFromRequest;
  createSupabaseClient?: (url: string, key: string) => SupabaseClient;
}

interface RecipeScene {
  id: string;
  name: string;
  prompt: string;
  negativePrompt?: string;
  imageCount: number;
  sortOrder: number;
}

interface RecipeRow {
  id: string;
  name: string;
  description: string | null;
  recipe_type: string;
  settings: Record<string, unknown>;
  selection: Record<string, unknown>;
  character_card_ids: string[] | null;
  character_reference_groups: unknown[];
  scenes: RecipeScene[];
  metadata: Record<string, unknown>;
  created_at: string;
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

function sanitizeUuidList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean)
    )
  ).slice(0, max);
}

function sanitizeReferenceGroups(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((group) => group && typeof group === 'object')
    .slice(0, MAX_CHARACTER_IDS)
    .map((group) => {
      const record = group as Record<string, unknown>;
      return {
        characterCardId: sanitizeText(record.characterCardId, 80) || undefined,
        label: sanitizeText(record.label, 80) || 'Character',
        description: sanitizeText(record.description, 300) || undefined,
        referenceImageIds: sanitizeUuidList(
          record.referenceImageIds,
          MAX_REFERENCE_IDS
        )
      };
    });
}

function sanitizeScene(value: unknown, index: number): RecipeScene | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const prompt = sanitizeText(record.prompt, 5000);
  if (!prompt) return null;
  const imageCount = Math.max(
    1,
    Math.min(4, Math.floor(Number(record.imageCount) || 1))
  );
  return {
    id: sanitizeText(record.id, 80) || crypto.randomUUID(),
    name: sanitizeText(record.name, 80) || `Scene ${index + 1}`,
    prompt,
    negativePrompt: sanitizeText(record.negativePrompt, 2000) || undefined,
    imageCount,
    sortOrder: Number.isFinite(Number(record.sortOrder))
      ? Number(record.sortOrder)
      : index
  };
}

function sanitizeScenes(value: unknown): RecipeScene[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((scene, index) => sanitizeScene(scene, index))
    .filter((scene): scene is RecipeScene => Boolean(scene))
    .slice(0, MAX_SCENES)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function sanitizeRecipeType(value: unknown): string {
  const type = sanitizeText(value, 60);
  return ALLOWED_RECIPE_TYPES.has(type) ? type : 'character_scene_pack';
}

function flattenReferenceIds(groups: unknown[]): string[] {
  return Array.from(
    new Set(
      groups.flatMap((group) => {
        const record =
          group && typeof group === 'object'
            ? (group as Record<string, unknown>)
            : {};
        return Array.isArray(record.referenceImageIds)
          ? record.referenceImageIds.filter(
              (id): id is string => typeof id === 'string'
            )
          : [];
      })
    )
  );
}

async function getMissingIds(
  supabase: SupabaseClient,
  userId: string,
  characterIds: string[],
  referenceIds: string[]
): Promise<{
  missingCharacterCardIds: string[];
  missingReferenceImageIds: string[];
}> {
  const [cardResult, referenceResult] = await Promise.all([
    characterIds.length
      ? supabase
          .from('image_character_cards')
          .select('id')
          .eq('user_id', userId)
          .is('deleted_at', null)
          .in('id', characterIds)
      : Promise.resolve({ data: [], error: null }),
    referenceIds.length
      ? supabase
          .from('image_reference_assets')
          .select('id')
          .eq('user_id', userId)
          .is('deleted_at', null)
          .in('id', referenceIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (cardResult.error || referenceResult.error) {
    console.error('[ImageRecipes] missing id lookup failed:', {
      cardError: cardResult.error,
      referenceError: referenceResult.error
    });
  }

  const existingCards = new Set(
    ((cardResult.data || []) as Array<{ id: string }>).map((row) => row.id)
  );
  const existingReferences = new Set(
    ((referenceResult.data || []) as Array<{ id: string }>).map((row) => row.id)
  );
  return {
    missingCharacterCardIds: characterIds.filter(
      (id) => !existingCards.has(id)
    ),
    missingReferenceImageIds: referenceIds.filter(
      (id) => !existingReferences.has(id)
    )
  };
}

async function rowToClient(
  supabase: SupabaseClient,
  userId: string,
  row: RecipeRow
) {
  const characterCardIds = row.character_card_ids || [];
  const characterReferenceGroups = Array.isArray(row.character_reference_groups)
    ? row.character_reference_groups
    : [];
  const missing = await getMissingIds(
    supabase,
    userId,
    characterCardIds,
    flattenReferenceIds(characterReferenceGroups)
  );
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    recipeType: row.recipe_type,
    settings: row.settings || {},
    selection: row.selection || {},
    characterCardIds,
    characterReferenceGroups,
    scenes: Array.isArray(row.scenes) ? row.scenes : [],
    metadata: row.metadata || {},
    ...missing,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listRecipes(
  supabase: SupabaseClient,
  userId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { data, error } = await supabase
    .from('image_creator_recipes')
    .select(
      'id, name, description, recipe_type, settings, selection, character_card_ids, character_reference_groups, scenes, metadata, created_at, updated_at'
    )
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(MAX_RECIPES);

  if (error) {
    console.error('[ImageRecipes] list failed:', error);
    return jsonResponse(
      { error: '场景套件加载失败', recipes: [] },
      corsHeaders,
      500
    );
  }

  const recipes = await Promise.all(
    ((data || []) as RecipeRow[]).map((row) =>
      rowToClient(supabase, userId, row)
    )
  );
  return jsonResponse({ recipes }, corsHeaders);
}

async function upsertRecipe(
  supabase: SupabaseClient,
  userId: string,
  body: Record<string, unknown>,
  corsHeaders: Record<string, string>,
  id?: string
): Promise<Response> {
  const name = sanitizeText(body.name, 100);
  const scenes = sanitizeScenes(body.scenes);
  if (!name) {
    return jsonResponse({ error: '套件名称不能为空' }, corsHeaders, 400);
  }
  if (scenes.length === 0) {
    return jsonResponse({ error: '至少需要 1 个场景提示词' }, corsHeaders, 400);
  }

  const payload = {
    user_id: userId,
    name,
    description: sanitizeText(body.description, 300) || null,
    recipe_type: sanitizeRecipeType(body.recipeType),
    settings: sanitizeObject(body.settings),
    selection: sanitizeObject(body.selection),
    character_card_ids: sanitizeUuidList(
      body.characterCardIds,
      MAX_CHARACTER_IDS
    ),
    character_reference_groups: sanitizeReferenceGroups(
      body.characterReferenceGroups
    ),
    scenes,
    metadata: sanitizeObject(body.metadata),
    deleted_at: null
  };

  const query = id
    ? supabase
        .from('image_creator_recipes')
        .update(payload)
        .eq('id', id)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .select(
          'id, name, description, recipe_type, settings, selection, character_card_ids, character_reference_groups, scenes, metadata, created_at, updated_at'
        )
        .maybeSingle()
    : supabase
        .from('image_creator_recipes')
        .insert(payload)
        .select(
          'id, name, description, recipe_type, settings, selection, character_card_ids, character_reference_groups, scenes, metadata, created_at, updated_at'
        )
        .single();

  const { data, error } = await query;
  if (error) {
    console.error('[ImageRecipes] save failed:', error);
    return jsonResponse({ error: '场景套件保存失败' }, corsHeaders, 500);
  }
  if (!data) {
    return jsonResponse(
      { error: '场景套件不存在或无权访问' },
      corsHeaders,
      404
    );
  }

  const recipe = await rowToClient(supabase, userId, data as RecipeRow);
  return jsonResponse({ recipe }, corsHeaders, id ? 200 : 201);
}

async function deleteRecipe(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { data, error } = await supabase
    .from('image_creator_recipes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[ImageRecipes] delete failed:', error);
    return jsonResponse({ error: '场景套件删除失败' }, corsHeaders, 500);
  }
  if (!data) {
    return jsonResponse(
      { error: '场景套件不存在或无权访问' },
      corsHeaders,
      404
    );
  }

  return jsonResponse({ success: true, id }, corsHeaders);
}

export function createImageRecipesHandler(
  dependencies: ImageRecipesHandlerDependencies = {}
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

    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) {
      return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
    }

    const userId = await resolveUserId(request);
    if (!userId) {
      return jsonResponse({ error: '请先登录', recipes: [] }, corsHeaders, 401);
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse(
        { error: 'Supabase 未配置', recipes: [] },
        corsHeaders,
        503
      );
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);
    const url = new URL(request.url);

    if (request.method === 'GET') {
      return listRecipes(supabase, userId, corsHeaders);
    }

    const id = url.searchParams.get('id')?.trim();
    if (request.method === 'DELETE') {
      if (!id)
        return jsonResponse({ error: 'id is required' }, corsHeaders, 400);
      return deleteRecipe(supabase, userId, id, corsHeaders);
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) {
      return jsonResponse({ error: 'Invalid JSON body' }, corsHeaders, 400);
    }
    if (request.method === 'PATCH' && !id) {
      return jsonResponse({ error: 'id is required' }, corsHeaders, 400);
    }
    return upsertRecipe(supabase, userId, body, corsHeaders, id || undefined);
  };
}

export default createImageRecipesHandler();
