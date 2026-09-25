/**
 * 认证路由
 * 处理用户认证相关的 API
 */

import { Hono } from 'hono';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { requireAuth, getUserId, getUserEmail } from '../middleware/auth.js';

export const authRoutes = new Hono();

// Supabase 客户端
let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error('SUPABASE_URL 和 SUPABASE_ANON_KEY 环境变量未设置');
    }

    supabase = createClient(url, key);
  }
  return supabase;
}

// ============================================
// 获取当前用户信息
// ============================================

authRoutes.get('/me', requireAuth, async (c) => {
  try {
    const userId = getUserId(c);
    const userEmail = getUserEmail(c);

    if (!userId) {
      return c.json({ error: '用户未认证' }, 401);
    }

    // Dev mode: return mock profile
    if (userId === 'dev-user') {
      return c.json({
        user: {
          id: userId,
          email: userEmail || 'dev@localhost',
          username: 'Dev User',
          avatar_url: null,
          created_at: new Date().toISOString(),
          member_number: 1,
          member_number_formatted: 'No.0001',
          days_joined: 1
        }
      });
    }

    // 获取用户 profile
    const { data: profile, error } = await getSupabase()
      .from('profiles')
      .select('username, avatar_url, member_number, created_at')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[Auth] Get profile error:', error);
      return c.json({ error: '获取用户信息失败' }, 500);
    }

    // 计算加入天数
    const daysJoined = profile?.created_at
      ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // 格式化编号
    const memberNumberFormatted = profile?.member_number
      ? `No.${String(profile.member_number).padStart(4, '0')}`
      : null;

    return c.json({
      user: {
        id: userId,
        email: userEmail,
        username: profile?.username || userEmail,
        avatar_url: profile?.avatar_url,
        created_at: profile?.created_at,
        member_number: profile?.member_number,
        member_number_formatted: memberNumberFormatted,
        days_joined: daysJoined
      }
    });
  } catch (error) {
    console.error('[Auth] /me error:', error);
    return c.json({ error: '服务器错误' }, 500);
  }
});

// ============================================
// 更新用户资料
// ============================================

authRoutes.patch('/profile', requireAuth, async (c) => {
  try {
    const userId = getUserId(c);
    const body = await c.req.json();
    const { username, avatar_url } = body;

    if (!userId) {
      return c.json({ error: '用户未认证' }, 401);
    }

    const updateData: Record<string, unknown> = {};
    if (username !== undefined) updateData.username = username;
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url;

    if (Object.keys(updateData).length === 0) {
      return c.json({ error: '没有要更新的字段' }, 400);
    }

    const { error } = await getSupabase()
      .from('profiles')
      .update(updateData)
      .eq('id', userId);

    if (error) {
      console.error('[Auth] Update profile error:', error);
      return c.json({ error: '更新用户信息失败' }, 500);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('[Auth] /profile PATCH error:', error);
    return c.json({ error: '服务器错误' }, 500);
  }
});

// ============================================
// 验证 Token（用于插件检查登录状态）
// ============================================

authRoutes.post('/verify', async (c) => {
  try {
    const body = await c.req.json();
    const { token } = body;

    if (!token) {
      return c.json({ valid: false, error: '未提供 token' });
    }

    const { data: { user }, error } = await getSupabase().auth.getUser(token);

    if (error || !user) {
      return c.json({ valid: false, error: 'Token 无效或已过期' });
    }

    // 获取 profile
    const { data: profile } = await getSupabase()
      .from('profiles')
      .select('username, avatar_url, member_number, created_at')
      .eq('id', user.id)
      .single();

    // 计算加入天数
    const daysJoined = profile?.created_at
      ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // 格式化编号
    const memberNumberFormatted = profile?.member_number
      ? `No.${String(profile.member_number).padStart(4, '0')}`
      : null;

    return c.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        username: profile?.username || user.email,
        avatar_url: profile?.avatar_url,
        member_number: profile?.member_number,
        member_number_formatted: memberNumberFormatted,
        days_joined: daysJoined
      }
    });
  } catch (error) {
    console.error('[Auth] /verify error:', error);
    return c.json({ valid: false, error: '验证失败' });
  }
});

// ============================================
// 为插件生成扩展 Token（从 Web 登录后传递给插件）
// ============================================

authRoutes.post('/extension-token', requireAuth, async (c) => {
  try {
    const userId = getUserId(c);
    const userEmail = getUserEmail(c);

    if (!userId) {
      return c.json({ error: '用户未认证' }, 401);
    }

    // 获取 profile
    const { data: profile } = await getSupabase()
      .from('profiles')
      .select('username, avatar_url, member_number, created_at')
      .eq('id', userId)
      .single();

    // 计算加入天数
    const daysJoined = profile?.created_at
      ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // 格式化编号
    const memberNumberFormatted = profile?.member_number
      ? `No.${String(profile.member_number).padStart(4, '0')}`
      : null;

    // 返回用户信息（前端会将 access_token 传递给插件）
    return c.json({
      user: {
        id: userId,
        email: userEmail,
        username: profile?.username || userEmail,
        avatar_url: profile?.avatar_url,
        member_number: profile?.member_number,
        member_number_formatted: memberNumberFormatted,
        days_joined: daysJoined
      }
    });
  } catch (error) {
    console.error('[Auth] /extension-token error:', error);
    return c.json({ error: '服务器错误' }, 500);
  }
});
