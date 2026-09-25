import { createClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../utils/auth';

export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);
  const jsonResponse = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Supabase is not configured', skills: [] }, 503);
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '24', 10) || 24, 100);

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 优先读取公开技能（skills）
  const { data: publicSkills, error: publicError } = await supabase
    .from('skills')
    .select('id, display_name, name, description, icon, category, is_public')
    .eq('is_active', true)
    .eq('is_public', true)
    .order('use_count', { ascending: false })
    .order('sort_order', { ascending: true })
    .limit(limit);

  if (!publicError && publicSkills && publicSkills.length > 0) {
    const skills = publicSkills.map((skill) => ({
      id: skill.id,
      name: skill.display_name || skill.name,
      description: skill.description || '',
      icon: skill.icon || '🔧',
      category: skill.category || 'custom',
      source: 'skills'
    }));
    return jsonResponse({ skills });
  }

  // 回退到公共模板
  const { data: templates, error: templateError } = await supabase
    .from('skill_templates')
    .select('id, display_name, description, icon, category, sort_order')
    .order('sort_order', { ascending: true })
    .limit(limit);

  if (templateError) {
    console.error('[API] /content/skills error:', templateError, publicError);
    return jsonResponse({ error: 'Failed to load skills', skills: [] }, 500);
  }

  const skills = (templates || []).map((tpl) => ({
    id: tpl.id,
    name: tpl.display_name,
    description: tpl.description || '',
    icon: tpl.icon || '🔧',
    category: tpl.category || 'template',
    source: 'templates'
  }));

  return jsonResponse({ skills });
}
