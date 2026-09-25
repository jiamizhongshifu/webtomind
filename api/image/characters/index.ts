import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getCorsHeadersForRequest,
  getUserIdFromRequest
} from '../../utils/auth';
import {
  MAX_CHARACTER_REFERENCES_PER_GROUP,
  type ImageCharacterCard,
  type ImageCharacterCardReference
} from '../../../src/shared/image-reference-types';

export const config = { runtime: 'edge' };

type ImageCharactersDeps = {
  getCorsHeadersForRequest: typeof getCorsHeadersForRequest;
  getUserIdFromRequest: typeof getUserIdFromRequest;
  createSupabaseClient: typeof createClient;
};

const SIGNED_URL_EXPIRES_IN = 60 * 60 * 24;
const MAX_CHARACTER_CARDS = 40;

interface CharacterCardRow {
  id: string;
  name: string;
  description: string | null;
  locked_traits: unknown;
  created_at: string;
  updated_at: string;
}

interface CharacterReferenceLinkRow {
  card_id: string;
  reference_asset_id: string;
  position: number;
}

interface ReferenceRow {
  id: string;
  role: string;
  label: string | null;
  storage_bucket: string;
  storage_path: string;
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

function sanitizeStringArray(value: unknown, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const item of value) {
    const text = sanitizeText(item, 120);
    if (text && !items.includes(text)) items.push(text);
    if (items.length >= max) break;
  }
  return items;
}

function sanitizeReferenceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean)
    )
  ).slice(0, MAX_CHARACTER_REFERENCES_PER_GROUP);
}

async function rowToReference(
  supabase: SupabaseClient,
  row: ReferenceRow
): Promise<ImageCharacterCardReference> {
  const { data, error } = await supabase.storage
    .from(row.storage_bucket)
    .createSignedUrl(row.storage_path, SIGNED_URL_EXPIRES_IN);

  if (error) {
    console.error('[ImageCharacters] signed URL failed:', {
      id: row.id,
      error
    });
  }

  return {
    id: row.id,
    role:
      row.role === 'style' ||
      row.role === 'pose' ||
      row.role === 'scene' ||
      row.role === 'product'
        ? row.role
        : 'character',
    label: row.label || '角色参考图',
    thumbnailUrl: data?.signedUrl || ''
  };
}

async function assertReferenceOwnership(
  supabase: SupabaseClient,
  userId: string,
  referenceIds: string[]
): Promise<void> {
  if (referenceIds.length === 0) return;
  const { data, error } = await supabase
    .from('image_reference_assets')
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .in('id', referenceIds);

  if (error) {
    console.error('[ImageCharacters] reference ownership check failed:', error);
    throw new Error('参考图校验失败');
  }
  if ((data || []).length !== referenceIds.length) {
    throw new Error('参考图不存在或无权访问');
  }
}

async function replaceCharacterReferences(
  supabase: SupabaseClient,
  cardId: string,
  referenceIds: string[]
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('image_character_card_references')
    .delete()
    .eq('card_id', cardId);

  if (deleteError) {
    throw new Error(`角色参考图更新失败: ${deleteError.message}`);
  }

  if (referenceIds.length === 0) return;
  const rows = referenceIds.map((referenceId, index) => ({
    card_id: cardId,
    reference_asset_id: referenceId,
    position: index
  }));
  const { error: insertError } = await supabase
    .from('image_character_card_references')
    .insert(rows);

  if (insertError) {
    throw new Error(`角色参考图保存失败: ${insertError.message}`);
  }
}

async function hydrateCards(
  supabase: SupabaseClient,
  cards: CharacterCardRow[]
): Promise<ImageCharacterCard[]> {
  if (cards.length === 0) return [];
  const cardIds = cards.map((card) => card.id);
  const { data: linksData, error: linksError } = await supabase
    .from('image_character_card_references')
    .select('card_id, reference_asset_id, position')
    .in('card_id', cardIds)
    .order('position', { ascending: true });

  if (linksError) {
    throw new Error(`角色参考图加载失败: ${linksError.message}`);
  }

  const links = (linksData || []) as CharacterReferenceLinkRow[];
  const referenceIds = Array.from(
    new Set(links.map((link) => link.reference_asset_id))
  );
  const referenceMap = new Map<string, ImageCharacterCardReference>();
  if (referenceIds.length > 0) {
    const { data: referenceRows, error: referenceError } = await supabase
      .from('image_reference_assets')
      .select('id, role, label, storage_bucket, storage_path')
      .is('deleted_at', null)
      .in('id', referenceIds);

    if (referenceError) {
      throw new Error(`角色参考图签名失败: ${referenceError.message}`);
    }
    const references = await Promise.all(
      ((referenceRows || []) as ReferenceRow[]).map((row) =>
        rowToReference(supabase, row)
      )
    );
    references.forEach((reference) => referenceMap.set(reference.id, reference));
  }

  const linksByCard = new Map<string, CharacterReferenceLinkRow[]>();
  links.forEach((link) => {
    linksByCard.set(link.card_id, [
      ...(linksByCard.get(link.card_id) || []),
      link
    ]);
  });

  return cards.map((card) => {
    const references = (linksByCard.get(card.id) || [])
      .map((link) => referenceMap.get(link.reference_asset_id))
      .filter(
        (reference): reference is ImageCharacterCardReference =>
          Boolean(reference)
      );
    const lockedTraits = sanitizeStringArray(card.locked_traits);
    return {
      id: card.id,
      name: card.name,
      description: card.description || undefined,
      lockedTraits,
      referenceImageIds: references.map((reference) => reference.id),
      references,
      createdAt: card.created_at,
      updatedAt: card.updated_at
    };
  });
}

async function listCharacters(
  supabase: SupabaseClient,
  userId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { data, error } = await supabase
    .from('image_character_cards')
    .select('id, name, description, locked_traits, created_at, updated_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(MAX_CHARACTER_CARDS);

  if (error) {
    console.error('[ImageCharacters] list failed:', error);
    return jsonResponse(
      { error: '角色卡加载失败', characters: [] },
      corsHeaders,
      500
    );
  }

  try {
    const characters = await hydrateCards(
      supabase,
      (data || []) as CharacterCardRow[]
    );
    return jsonResponse({ characters }, corsHeaders);
  } catch (error) {
    console.error('[ImageCharacters] hydrate failed:', error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : '角色卡加载失败',
        characters: []
      },
      corsHeaders,
      500
    );
  }
}

async function loadOneCharacter(
  supabase: SupabaseClient,
  userId: string,
  cardId: string
): Promise<ImageCharacterCard | null> {
  const { data, error } = await supabase
    .from('image_character_cards')
    .select('id, name, description, locked_traits, created_at, updated_at')
    .eq('id', cardId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data) return null;
  const [card] = await hydrateCards(supabase, [data as CharacterCardRow]);
  return card || null;
}

async function createCharacter(
  supabase: SupabaseClient,
  userId: string,
  body: Record<string, unknown>,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const name = sanitizeText(body.name, 80);
  if (!name) {
    return jsonResponse({ error: '角色名称不能为空' }, corsHeaders, 400);
  }

  const referenceImageIds = sanitizeReferenceIds(body.referenceImageIds);
  try {
    await assertReferenceOwnership(supabase, userId, referenceImageIds);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : '参考图校验失败' },
      corsHeaders,
      400
    );
  }

  const { data, error } = await supabase
    .from('image_character_cards')
    .insert({
      user_id: userId,
      name,
      description: sanitizeText(body.description, 500) || null,
      locked_traits: sanitizeStringArray(body.lockedTraits),
      metadata: {
        source: 'image_create_page'
      }
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    console.error('[ImageCharacters] create failed:', error);
    return jsonResponse({ error: '角色卡创建失败' }, corsHeaders, 500);
  }

  try {
    await replaceCharacterReferences(supabase, data.id, referenceImageIds);
    const character = await loadOneCharacter(supabase, userId, data.id);
    return jsonResponse({ success: true, character }, corsHeaders);
  } catch (error) {
    console.error('[ImageCharacters] create references failed:', error);
    await supabase
      .from('image_character_cards')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', data.id)
      .eq('user_id', userId);
    return jsonResponse(
      { error: error instanceof Error ? error.message : '角色卡创建失败' },
      corsHeaders,
      500
    );
  }
}

async function updateCharacter(
  supabase: SupabaseClient,
  userId: string,
  body: Record<string, unknown>,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const id = sanitizeText(body.id, 80);
  if (!id) return jsonResponse({ error: 'id is required' }, corsHeaders, 400);

  const existing = await loadOneCharacter(supabase, userId, id);
  if (!existing) {
    return jsonResponse({ error: '角色卡不存在' }, corsHeaders, 404);
  }

  const referenceImageIds = Array.isArray(body.referenceImageIds)
    ? sanitizeReferenceIds(body.referenceImageIds)
    : existing.referenceImageIds;
  try {
    await assertReferenceOwnership(supabase, userId, referenceImageIds);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : '参考图校验失败' },
      corsHeaders,
      400
    );
  }

  const update: Record<string, unknown> = {};
  if ('name' in body) {
    const name = sanitizeText(body.name, 80);
    if (!name) {
      return jsonResponse({ error: '角色名称不能为空' }, corsHeaders, 400);
    }
    update.name = name;
  }
  if ('description' in body) {
    update.description = sanitizeText(body.description, 500) || null;
  }
  if ('lockedTraits' in body) {
    update.locked_traits = sanitizeStringArray(body.lockedTraits);
  }

  if (Object.keys(update).length > 0) {
    const { error } = await supabase
      .from('image_character_cards')
      .update(update)
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (error) {
      console.error('[ImageCharacters] update failed:', error);
      return jsonResponse({ error: '角色卡更新失败' }, corsHeaders, 500);
    }
  }

  try {
    if (Array.isArray(body.referenceImageIds)) {
      await replaceCharacterReferences(supabase, id, referenceImageIds);
    }
    const character = await loadOneCharacter(supabase, userId, id);
    return jsonResponse({ success: true, character }, corsHeaders);
  } catch (error) {
    console.error('[ImageCharacters] update references failed:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : '角色卡更新失败' },
      corsHeaders,
      500
    );
  }
}

async function deleteCharacter(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { data: existing, error: loadError } = await supabase
    .from('image_character_cards')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (loadError) {
    console.error('[ImageCharacters] delete owner check failed:', loadError);
    return jsonResponse({ error: '角色卡删除失败' }, corsHeaders, 500);
  }

  if (!existing) {
    return jsonResponse({ error: '角色卡不存在' }, corsHeaders, 404);
  }

  const { error } = await supabase
    .from('image_character_cards')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (error) {
    console.error('[ImageCharacters] delete failed:', error);
    return jsonResponse({ error: '角色卡删除失败' }, corsHeaders, 500);
  }

  return jsonResponse({ success: true, id }, corsHeaders);
}

export function createImageCharactersHandler(deps: ImageCharactersDeps) {
  return async function handler(request: Request): Promise<Response> {
    const corsHeaders = deps.getCorsHeadersForRequest(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) {
      return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
    }

    const userId = await deps.getUserIdFromRequest(request);
    if (!userId) {
      return jsonResponse(
        { error: '请先登录', characters: [] },
        corsHeaders,
        401
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse(
        { error: 'Supabase 未配置', characters: [] },
        corsHeaders,
        503
      );
    }

    const supabase = deps.createSupabaseClient(supabaseUrl, supabaseKey);

    if (request.method === 'GET') {
      return listCharacters(supabase, userId, corsHeaders);
    }

    if (request.method === 'DELETE') {
      const id = new URL(request.url).searchParams.get('id')?.trim();
      if (!id)
        return jsonResponse({ error: 'id is required' }, corsHeaders, 400);
      return deleteCharacter(supabase, userId, id, corsHeaders);
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (request.method === 'POST') {
      return createCharacter(supabase, userId, body, corsHeaders);
    }
    return updateCharacter(supabase, userId, body, corsHeaders);
  };
}

export default createImageCharactersHandler({
  getCorsHeadersForRequest,
  getUserIdFromRequest,
  createSupabaseClient: createClient
});
