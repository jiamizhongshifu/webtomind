/**
 * 认证中间件
 * 验证 Supabase JWT Token
 * 
 * 优化：添加内存缓存减少 Supabase Auth API 调用
 */

import { Context, Next } from 'hono';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

// Supabase 客户端（使用 anon key，通过 JWT 验证用户）
let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
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

// ============ Token 验证缓存 ============
// 缓存结构：token -> { user, expiresAt }
interface CachedUser {
  user: User;
  expiresAt: number;
}

const userCache = new Map<string, CachedUser>();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存
const MAX_CACHE_SIZE = 1000; // 最大缓存条目数

/**
 * 从 JWT 中解析过期时间（exp），失败则返回 null
 */
function getTokenExpiryMs(token: string): number | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson) as { exp?: number };
    if (!payload.exp) return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

/**
 * 清理过期缓存
 */
function cleanExpiredCache() {
  const now = Date.now();
  for (const [token, cached] of userCache.entries()) {
    if (cached.expiresAt < now) {
      userCache.delete(token);
    }
  }
}

/**
 * 从缓存获取用户，如果缓存未命中则调用 Supabase API
 */
async function getUserFromCacheOrApi(token: string): Promise<{ user: User | null; error: Error | null }> {
  // 检查缓存
  const cached = userCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    // 命中时刷新条目位置，使容量超限时 `keys().next()` 驱逐的是最久未访问条目（LRU）。
    userCache.delete(token);
    userCache.set(token, cached);
    return { user: cached.user, error: null };
  }

  // 缓存未命中，调用 Supabase API
  try {
    const supabase = getSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      // 验证失败，从缓存中移除（如果存在）
      userCache.delete(token);
      return { user: null, error: error as Error | null };
    }

    // 缓存成功验证的用户
    // 先检查缓存大小，必要时清理
    if (userCache.size >= MAX_CACHE_SIZE) {
      cleanExpiredCache();
      // 如果清理后仍然超过限制，删除最早的条目
      if (userCache.size >= MAX_CACHE_SIZE) {
        const firstKey = userCache.keys().next().value;
        if (firstKey) userCache.delete(firstKey);
      }
    }

    const now = Date.now();
    const tokenExpiry = getTokenExpiryMs(token);
    const cacheExpiry = Math.min(now + CACHE_TTL, tokenExpiry ?? Infinity);
    if (cacheExpiry <= now) {
      return { user, error: null };
    }

    userCache.set(token, {
      user,
      expiresAt: cacheExpiry
    });

    return { user, error: null };
  } catch (error) {
    return { user: null, error: error as Error };
  }
}

// 定期清理过期缓存（每分钟）
setInterval(cleanExpiredCache, 60 * 1000);

// ============ 中间件 ============

// 扩展 Context 类型
declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
    userEmail: string | undefined;
  }
}

/**
 * 从请求头中提取 Bearer Token
 */
function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

/**
 * 必须认证的中间件
 * 如果未认证，返回 401
 */
export async function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  const token = extractToken(authHeader);

  const allowExplicitDevBypass =
    process.env.NODE_ENV !== 'production' &&
    process.env.AUTH_DEV_BYPASS === '1';

  if (!token) {
    if (allowExplicitDevBypass) {
      c.set('userId', 'dev-user');
      c.set('userEmail', 'dev@localhost');
      await next();
      return;
    }
    return c.json({ error: '未提供认证令牌' }, 401);
  }

  try {
    const { user, error } = await getUserFromCacheOrApi(token);

    if (error || !user) {
      console.error('[Auth] Token verification failed:', error?.message);
      return c.json({ error: '认证令牌无效或已过期' }, 401);
    }

    // 将用户信息存储到 context 中
    c.set('userId', user.id);
    c.set('userEmail', user.email);

    await next();
  } catch (error) {
    console.error('[Auth] Middleware error:', error);
    return c.json({ error: '认证服务出错' }, 500);
  }
}

/**
 * 可选认证的中间件
 * 如果提供了 token 则验证，否则继续（userId 为 undefined）
 */
export async function optionalAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  const token = extractToken(authHeader);
  const allowExplicitDevBypass =
    process.env.NODE_ENV !== 'production' &&
    process.env.AUTH_DEV_BYPASS === '1';

  // The bypass applies only when no credentials were supplied. A provided
  // token always follows the real verification path, even in local dev.
  if (!token && allowExplicitDevBypass) {
    c.set('userId', 'dev-user');
    c.set('userEmail', 'dev@localhost');
    await next();
    return;
  }

  if (token) {
    try {
      const { user, error } = await getUserFromCacheOrApi(token);

      if (!error && user) {
        c.set('userId', user.id);
        c.set('userEmail', user.email);
      }
    } catch (error) {
      console.error('[Auth] Optional auth error:', error);
      // 继续处理，不中断请求
    }
  }

  await next();
}

/**
 * 获取当前用户 ID（用于路由处理器）
 */
export function getUserId(c: Context): string | undefined {
  return c.get('userId');
}

/**
 * 获取当前用户邮箱（用于路由处理器）
 */
export function getUserEmail(c: Context): string | undefined {
  return c.get('userEmail');
}

/**
 * 手动使某个 token 的缓存失效（用于登出等场景）
 */
export function invalidateTokenCache(token: string): void {
  userCache.delete(token);
}
