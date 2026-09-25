/// <reference lib="dom" />

/**
 * 共享认证工具模块
 * 提供安全的 JWT 验证和用户身份获取
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Supabase client singleton (使用 ANON_KEY，让 RLS 生效)
let supabaseAuth: SupabaseClient | null = null;
let supabaseAdmin: SupabaseClient | null = null;

type SupabaseAuthVerifier = {
  getUser: (jwt?: string) => Promise<{
    data: { user: { id: string } | null };
    error: { message?: string } | null;
  }>;
};

function getSupabaseAuth(): SupabaseClient | null {
  if (!supabaseAuth) {
    const url = getRuntimeEnvValue('SUPABASE_URL');
    const key = getRuntimeEnvValue('SUPABASE_ANON_KEY');

    if (!url || !key) {
      console.warn('[Auth] Supabase not configured');
      return null;
    }

    supabaseAuth = createClient(url, key);
  }
  return supabaseAuth;
}

// Token 验证缓存 (5分钟有效)
const tokenCache = new Map<string, { userId: string; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getRuntimeEnvValue(key: string): string | undefined {
  return typeof process !== 'undefined' ? process.env[key] : undefined;
}

function decodeBase64Url(input: string): string | null {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding =
    normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const base64 = `${normalized}${padding}`;

  if (typeof atob === 'function') {
    try {
      return atob(base64);
    } catch {
      return null;
    }
  }

  if (typeof Buffer !== 'undefined') {
    try {
      return Buffer.from(base64, 'base64').toString('utf-8');
    } catch {
      return null;
    }
  }

  return null;
}

function getTokenExpiryMs(token: string): number | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payloadJson = decodeBase64Url(parts[1]);
  if (!payloadJson) return null;
  try {
    const payload = JSON.parse(payloadJson) as { exp?: number };
    if (!payload.exp) return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

/**
 * 安全验证 JWT 并获取用户 ID
 * 使用 Supabase Auth API 验证 token 签名
 */
export async function verifyTokenAndGetUserId(
  token: string
): Promise<string | null> {
  if (!token) return null;

  cleanupExpiredTokenCache();

  // 检查缓存
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.userId;
  }

  const sb = getSupabaseAuth();
  if (!sb) return null;

  try {
    const auth = sb.auth as unknown as SupabaseAuthVerifier;
    const { data, error } = await auth.getUser(token);

    if (error || !data.user) {
      console.warn('[Auth] Token verification failed:', error?.message);
      return null;
    }

    const userId = data.user.id;

    // 缓存验证结果
    const now = Date.now();
    const tokenExpiry = getTokenExpiryMs(token);
    const cacheExpiry = Math.min(now + CACHE_TTL, tokenExpiry ?? Infinity);
    if (cacheExpiry <= now) {
      return userId;
    }

    tokenCache.set(token, {
      userId,
      expiresAt: cacheExpiry
    });

    return userId;
  } catch (e) {
    console.error('[Auth] Token verification error:', e);
    return null;
  }
}

/**
 * 从请求中获取并验证用户 ID
 */
export async function getUserIdFromRequest(
  request: Request
): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;

  const token = parts[1];
  return verifyTokenAndGetUserId(token);
}

/**
 * 从请求体中的 _auth_token 获取并验证用户 ID
 * 注意：这是为了向后兼容，新代码应使用 Authorization header
 */
export async function getUserIdFromBodyToken(
  authToken: string | undefined
): Promise<string | null> {
  if (!authToken) return null;
  return verifyTokenAndGetUserId(authToken);
}

/**
 * 获取 Session ID (用于匿名用户)
 */
export function getSessionIdFromRequest(request: Request): string | null {
  return request.headers.get('X-Session-ID');
}

function cleanupExpiredTokenCache(): void {
  const now = Date.now();
  for (const [token, data] of tokenCache.entries()) {
    if (data.expiresAt < now) {
      tokenCache.delete(token);
    }
  }
}

function getAllowedOrigins(): string[] {
  return (
    getRuntimeEnvValue('ALLOWED_ORIGINS') ||
    'https://webtomind.com,https://www.webtomind.com'
  )
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function normalizeOrigin(origin: string | null): string {
  return (origin || '').trim().replace(/\/+$/, '');
}

function matchesAllowedOrigin(origin: string, pattern: string): boolean {
  if (!origin || !pattern) return false;

  if (pattern.includes('*')) {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i').test(origin);
  }

  return pattern === origin;
}

/**
 * 获取 CORS origin
 * 支持 chrome-extension://* 通配符
 */
function getCorsOrigin(origin: string | null): string {
  const normalizedOrigin = normalizeOrigin(origin);
  const allowedOrigins = getAllowedOrigins();

  // 允许无 origin 的请求（例如同源请求）
  if (!normalizedOrigin) return allowedOrigins[0] || 'https://webtomind.com';

  // 检查是否在允许列表中
  if (
    allowedOrigins.some((allowed) =>
      matchesAllowedOrigin(normalizedOrigin, allowed)
    )
  ) {
    return normalizedOrigin;
  }

  // 开发环境允许 localhost
  if (
    getRuntimeEnvValue('NODE_ENV') !== 'production' &&
    (normalizedOrigin.includes('localhost') ||
      normalizedOrigin.includes('127.0.0.1'))
  ) {
    return normalizedOrigin;
  }

  // 不允许的 origin，返回第一个允许的域名
  return allowedOrigins[0] || 'https://webtomind.com';
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': getCorsOrigin(null),
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-ID',
  'Access-Control-Allow-Credentials': 'true'
};

/**
 * 根据请求的 origin 获取动态 CORS headers
 */
export function getCorsHeadersForRequest(
  request: Request
): Record<string, string> {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(origin),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-ID',
    'Access-Control-Allow-Credentials': 'true'
  };
}

/**
 * 获取 Supabase 客户端 (使用 Service Role Key 用于服务端操作)
 * 注意：只有在用户身份已通过 verifyTokenAndGetUserId 验证后才应使用
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (supabaseAdmin) return supabaseAdmin;

  const url = getRuntimeEnvValue('SUPABASE_URL');
  const key = getRuntimeEnvValue('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) {
    console.warn('[Auth] Supabase admin not configured');
    return null;
  }

  supabaseAdmin = createClient(url, key);
  return supabaseAdmin;
}

/**
 * 后台管理员鉴权（直接引用 Open-Magiviz lib/auth-utils.ts 的 isAdmin/requireAdmin，
 * 改 users.role 为独立 admin_users 表）。
 */

export interface AdminUserInfo {
  userId: string;
  role: 'admin' | 'superadmin';
}

export async function fetchAdminRole(
  supabase: SupabaseClient,
  userId: string
): Promise<AdminUserInfo | null> {
  const { data } = await supabase
    .from('admin_users')
    .select('user_id, role')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return null;
  return { userId: data.user_id, role: data.role };
}

export async function isAdmin(request: Request): Promise<AdminUserInfo | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const userId = await getUserIdFromRequest(request);
  if (!userId) return null;
  return fetchAdminRole(supabase, userId);
}

/**
 * 供 /api/admin/* 路由使用：非管理员返回 403 响应。
 * 返回 [admin, response]——response 为 null 表示放行。
 */
export async function requireAdmin(request: Request): Promise<
  [AdminUserInfo | null, Response | null]
> {
  const admin = await isAdmin(request);
  if (admin) return [admin, null];
  const corsHeaders = getCorsHeadersForRequest(request);
  return [
    null,
    new Response(
      JSON.stringify({ error: '需要管理员权限', errorCode: 'ADMIN_REQUIRED' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    )
  ];
}
