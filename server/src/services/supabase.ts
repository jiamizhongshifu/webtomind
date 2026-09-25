/**
 * Supabase 鏁版嵁搴撴湇鍔?
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 鏁版嵁搴撶被鍨嬪畾涔?
export interface Summary {
  id: string;
  title: string;
  url: string;
  markdown: string;
  tags: string[];
  user_id?: string;
  content_type?: 'article' | 'image' | 'video'; // 鍐呭绫诲瀷
  created_at: string;
  updated_at: string;
}

export interface Shortcut {
  id: string;
  name: string;
  prompt: string;
  reference_ids: string[];
  sort_order: number;
  user_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  source_url: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface BlogPost {
  id: string;
  slug: string;
  locale: 'zh-CN' | 'en-US';
  title: string;
  excerpt: string;
  tag: string;
  body_markdown: string;
  cover_image: string | null;
  is_published: boolean;
  sort_order: number;
  published_at: string;
  created_at: string;
  updated_at: string;
}

export interface ProductUpdate {
  id: string;
  version: string;
  locale: 'zh-CN' | 'en-US';
  title: string;
  highlights: string[];
  is_published: boolean;
  sort_order: number;
  published_at: string;
  created_at: string;
  updated_at: string;
}

export interface PublicSkillCard {
  id: string;
  display_name: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  is_public: boolean;
}

export interface PromptAsset {
  id: string;
  slot:
    | 'character'
    | 'expression'
    | 'pose'
    | 'top'
    | 'bottom'
    | 'shoes'
    | 'background'
    | 'style'
    | 'lighting'
    | 'visualEffect'
    | 'layoutDesign'
    | 'accessory'
    | 'prop'
    | 'lens'
    | 'shot'
    | 'makeup';
  title: string;
  subtitle: string;
  prompt: string;
  negative_prompt: string | null;
  tags: string[];
  thumbnail_url: string;
  source_batch_id: string | null;
  visual: Record<string, unknown>;
  metadata: Record<string, unknown>;
  sort_order: number;
  is_published: boolean;
  published_at: string;
  created_at: string;
  updated_at: string;
}

// Supabase 瀹㈡埛绔崟渚?
let supabase: SupabaseClient | null = null;

/**
 * 鑾峰彇 Supabase 瀹㈡埛绔?
 */
export function getSupabase(): SupabaseClient {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are not configured');
    }

    supabase = createClient(url, key);
  }
  return supabase;
}

// ============================================
// 鎬荤粨/绗旇 CRUD
// ============================================

/**
 * 鑾峰彇鎵€鏈夋€荤粨
 * @param userId 鍙€夌殑鐢ㄦ埛ID锛屽鏋滄彁渚涘垯鍙繑鍥炶鐢ㄦ埛鐨勬暟鎹紝鍚﹀垯杩斿洖绌烘暟缁?
 * @param options 鍒嗛〉閫夐」
 */
export async function getAllSummaries(
  userId?: string,
  options?: { limit?: number; offset?: number; projectId?: string }
): Promise<Summary[]> {
  // 瀹夊叏鎬э細濡傛灉娌℃湁鎻愪緵 userId锛岃繑鍥炵┖鏁扮粍鑰屼笉鏄墍鏈夋暟鎹?
  if (!userId) {
    console.warn('[Supabase] getAllSummaries called without userId, returning empty array for security');
    return [];
  }

  const limit = options?.limit || 50; // 榛樿姣忛〉 50 鏉?
  const offset = options?.offset || 0;
  const projectId = options?.projectId?.trim();

  let query = getSupabase()
    .from('summaries')
    .select('*')
    .eq('user_id', userId);

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data || [];
}

/**
 * 鑾峰彇鍗曚釜鎬荤粨
 * @param id 鎬荤粨ID
 * @param userId 鍙€夌殑鐢ㄦ埛ID锛屽鏋滄彁渚涘垯楠岃瘉鎵€鏈夋潈锛屽惁鍒欒繑鍥?null
 */
export async function getSummaryById(id: string, userId?: string, projectId?: string): Promise<Summary | null> {
  // 瀹夊叏鎬э細濡傛灉娌℃湁鎻愪緵 userId锛岃繑鍥?null
  if (!userId) {
    console.warn('[Supabase] getSummaryById called without userId, returning null for security');
    return null;
  }

  let query = getSupabase()
    .from('summaries')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId);

  if (projectId?.trim()) {
    query = query.eq('project_id', projectId.trim());
  }

  const { data, error } = await query.single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * 鍒涘缓鎬荤粨
 */
export async function createSummary(data: {
  title: string;
  url: string;
  markdown: string;
  tags?: string[];
  user_id?: string;
  content_type?: 'article' | 'image' | 'video';
  project_id?: string;
}): Promise<Summary> {
  const { data: result, error } = await getSupabase()
    .from('summaries')
    .insert({
      title: data.title,
      url: data.url,
      markdown: data.markdown,
      tags: data.tags || [],
      user_id: data.user_id,
      content_type: data.content_type,
      project_id: data.project_id
    })
    .select()
    .single();

  if (error) throw error;
  return result;
}

/**
 * 鏇存柊鎬荤粨
 * @param id 鎬荤粨ID
 * @param data 鏇存柊鏁版嵁
 * @param userId 鐢ㄦ埛ID锛堝繀闇€锛岀敤浜庨獙璇佹墍鏈夋潈锛?
 */
export async function updateSummary(
  id: string,
  data: { title?: string; markdown?: string; tags?: string[] },
  userId: string
): Promise<void> {
  if (!userId) {
    throw new Error('userId is required for updateSummary');
  }

  const { error } = await getSupabase()
    .from('summaries')
    .update(data)
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}

/**
 * 鍒犻櫎鎬荤粨
 * @param id 鎬荤粨ID
 * @param userId 鐢ㄦ埛ID锛堝繀闇€锛岀敤浜庨獙璇佹墍鏈夋潈锛?
 */
export async function deleteSummary(id: string, userId: string): Promise<void> {
  if (!userId) {
    throw new Error('userId is required for deleteSummary');
  }

  const supabase = getSupabase();

  const { error, count } = await supabase
    .from('summaries')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;

  // 妫€鏌ユ槸鍚︾湡鐨勫垹闄や簡鏁版嵁
  if (count === 0) {
    console.warn('[Supabase] Delete affected 0 rows, id:', id, 'userId:', userId);
  } else {
    console.log('[Supabase] Deleted', count, 'row(s), id:', id);
  }
}

// ============================================
// 蹇嵎鎸囦护 CRUD
// ============================================

/**
 * 鑾峰彇鎵€鏈夊揩鎹锋寚浠?
 * @param userId 鍙€夌殑鐢ㄦ埛ID锛屽鏋滄彁渚涘垯鍙繑鍥炶鐢ㄦ埛鐨勬暟鎹紝鍚﹀垯杩斿洖绌烘暟缁?
 */
export async function getAllShortcuts(userId?: string): Promise<Shortcut[]> {
  // 瀹夊叏鎬э細濡傛灉娌℃湁鎻愪緵 userId锛岃繑鍥炵┖鏁扮粍鑰屼笉鏄墍鏈夋暟鎹?
  if (!userId) {
    console.warn('[Supabase] getAllShortcuts called without userId, returning empty array for security');
    return [];
  }

  const { data, error } = await getSupabase()
    .from('shortcuts')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * 鑾峰彇鍗曚釜蹇嵎鎸囦护
 * @param id 蹇嵎鎸囦护ID
 * @param userId 鍙€夌殑鐢ㄦ埛ID锛屽鏋滄彁渚涘垯楠岃瘉鎵€鏈夋潈锛屽惁鍒欒繑鍥?null
 */
export async function getShortcutById(id: string, userId?: string): Promise<Shortcut | null> {
  // 瀹夊叏鎬э細濡傛灉娌℃湁鎻愪緵 userId锛岃繑鍥?null
  if (!userId) {
    console.warn('[Supabase] getShortcutById called without userId, returning null for security');
    return null;
  }

  const { data, error } = await getSupabase()
    .from('shortcuts')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * 鍒涘缓蹇嵎鎸囦护
 */
export async function createShortcut(data: {
  name: string;
  prompt: string;
  reference_ids?: string[];
  user_id?: string;
}): Promise<Shortcut> {
  // 鑾峰彇褰撳墠鐢ㄦ埛鐨勬渶澶ф帓搴忓€?
  let maxOrderQuery = getSupabase()
    .from('shortcuts')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);

  if (data.user_id) {
    maxOrderQuery = maxOrderQuery.eq('user_id', data.user_id);
  }

  const { data: maxOrder } = await maxOrderQuery.single();

  const sortOrder = (maxOrder?.sort_order ?? -1) + 1;

  const { data: result, error } = await getSupabase()
    .from('shortcuts')
    .insert({
      name: data.name,
      prompt: data.prompt,
      reference_ids: data.reference_ids || [],
      sort_order: sortOrder,
      user_id: data.user_id
    })
    .select()
    .single();

  if (error) throw error;
  return result;
}

/**
 * 鏇存柊蹇嵎鎸囦护
 * @param id 蹇嵎鎸囦护ID
 * @param data 鏇存柊鏁版嵁
 * @param userId 鐢ㄦ埛ID锛堝繀闇€锛岀敤浜庨獙璇佹墍鏈夋潈锛?
 */
export async function updateShortcut(
  id: string,
  data: { name?: string; prompt?: string; reference_ids?: string[]; sort_order?: number },
  userId: string
): Promise<void> {
  if (!userId) {
    throw new Error('userId is required for updateShortcut');
  }

  const { error } = await getSupabase()
    .from('shortcuts')
    .update(data)
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}

/**
 * 鍒犻櫎蹇嵎鎸囦护
 * @param id 蹇嵎鎸囦护ID
 * @param userId 鐢ㄦ埛ID锛堝繀闇€锛岀敤浜庨獙璇佹墍鏈夋潈锛?
 */
export async function deleteShortcut(id: string, userId: string): Promise<void> {
  if (!userId) {
    throw new Error('userId is required for deleteShortcut');
  }

  const { error } = await getSupabase()
    .from('shortcuts')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}

// ============================================
// 绗旇 CRUD锛圓gent 宸ュ叿浣跨敤锛?
// ============================================

/**
 * 鑾峰彇鎵€鏈夌瑪璁?
 * @param userId 鐢ㄦ埛ID锛堝己鍒剁櫥褰曟ā寮忎笅蹇呴渶锛?
 */
export async function getAllNotes(userId: string): Promise<Note[]> {
  const { data, error } = await getSupabase()
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * 鑾峰彇鍗曚釜绗旇
 * @param id 绗旇ID
 * @param userId 鐢ㄦ埛ID锛堝己鍒剁櫥褰曟ā寮忎笅蹇呴渶锛?
 */
export async function getNoteById(id: string, userId: string): Promise<Note | null> {
  const { data, error } = await getSupabase()
    .from('notes')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * 鍒涘缓绗旇
 * @param data 绗旇鏁版嵁
 * @param userId 鐢ㄦ埛ID锛堝己鍒剁櫥褰曟ā寮忎笅蹇呴渶锛?
 */
export async function createNote(data: {
  title: string;
  content: string;
  tags?: string[];
  source_url?: string;
}, userId: string): Promise<Note> {
  const { data: result, error } = await getSupabase()
    .from('notes')
    .insert({
      title: data.title,
      content: data.content,
      tags: data.tags || [],
      source_url: data.source_url || null,
      user_id: userId
    })
    .select()
    .single();

  if (error) throw error;
  return result;
}

/**
 * 鏇存柊绗旇
 * @param id 绗旇ID
 * @param data 鏇存柊鏁版嵁
 * @param userId 鐢ㄦ埛ID锛堝己鍒剁櫥褰曟ā寮忎笅蹇呴渶锛?
 */
export async function updateNote(
  id: string,
  data: { title?: string; content?: string; tags?: string[] },
  userId: string
): Promise<void> {
  const { error } = await getSupabase()
    .from('notes')
    .update(data)
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}

/**
 * 鍒犻櫎绗旇
 * @param id 绗旇ID
 * @param userId 鐢ㄦ埛ID锛堝己鍒剁櫥褰曟ā寮忎笅蹇呴渶锛?
 */
export async function deleteNote(id: string, userId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('notes')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}

// ============================================
// 瀹樼綉鍐呭锛堝叕寮€璇诲彇锛?
// ============================================

export async function getPublishedBlogPosts(
  locale: 'zh-CN' | 'en-US',
  limit = 20
): Promise<BlogPost[]> {
  const { data, error } = await getSupabase()
    .from('blog_posts')
    .select('*')
    .eq('locale', locale)
    .eq('is_published', true)
    .lte('published_at', new Date().toISOString())
    .order('sort_order', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as BlogPost[];
}

export async function getPublishedBlogPostBySlug(
  locale: 'zh-CN' | 'en-US',
  slug: string
): Promise<BlogPost | null> {
  const { data, error } = await getSupabase()
    .from('blog_posts')
    .select('*')
    .eq('locale', locale)
    .eq('slug', slug)
    .eq('is_published', true)
    .lte('published_at', new Date().toISOString())
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return (data as BlogPost | null) || null;
}

export async function getPublishedProductUpdates(
  locale: 'zh-CN' | 'en-US',
  limit = 20
): Promise<ProductUpdate[]> {
  const { data, error } = await getSupabase()
    .from('product_updates')
    .select('*')
    .eq('locale', locale)
    .eq('is_published', true)
    .lte('published_at', new Date().toISOString())
    .order('sort_order', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as ProductUpdate[];
}

export async function getPublicSkills(limit = 24): Promise<PublicSkillCard[]> {
  const { data, error } = await getSupabase()
    .from('skills')
    .select('id, display_name, name, description, icon, category, is_public')
    .eq('is_active', true)
    .eq('is_public', true)
    .order('use_count', { ascending: false })
    .order('sort_order', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data || []) as PublicSkillCard[];
}

export async function getPublishedPromptAssets(options?: {
  slot?: PromptAsset['slot'];
  limit?: number;
}): Promise<PromptAsset[]> {
  const limit = Math.min(options?.limit || 200, 500);
  let query = getSupabase()
    .from('prompt_assets')
    .select('*')
    .eq('is_published', true)
    .lte('published_at', new Date().toISOString());

  if (options?.slot) {
    query = query.eq('slot', options.slot);
  }

  const { data, error } = await query
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data || []) as PromptAsset[];
}

// ============================================
// 用户技能设置
// ============================================

export interface UserSkillSettings {
  id: string;
  user_id: string;
  skill_id: string;
  settings: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export async function getUserSkillSettings(
  userId: string,
  skillId: string
): Promise<UserSkillSettings | null> {
  const { data, error } = await getSupabase()
    .from('user_skill_settings')
    .select('*')
    .eq('user_id', userId)
    .eq('skill_id', skillId)
    .maybeSingle();

  if (error) throw error;
  return data as UserSkillSettings | null;
}

export async function upsertUserSkillSettings(
  userId: string,
  skillId: string,
  settings: Record<string, unknown>,
  enabled: boolean
): Promise<UserSkillSettings> {
  const { data, error } = await getSupabase()
    .from('user_skill_settings')
    .upsert(
      {
        user_id: userId,
        skill_id: skillId,
        settings,
        enabled
      },
      { onConflict: 'user_id,skill_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data as UserSkillSettings;
}
