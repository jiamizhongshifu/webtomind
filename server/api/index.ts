/**
 * Vercel Serverless Function Entry
 * 将 Hono 应用导出为 Vercel Serverless Function
 */

import { handle } from 'hono/vercel';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { agentRoutes } from '../src/routes/agent';
import { workspaceRoutes } from '../src/routes/workspace';
import { authRoutes } from '../src/routes/auth';
import { contentRoutes } from '../src/routes/content';

// 加载环境变量
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  'https://webtomind.com,https://www.webtomind.com,chrome-extension://<your-extension-id>'
)
  .split(',')
  .map((s) => s.trim());

// 创建 Hono 应用
const app = new Hono().basePath('/api');

// ============================================
// 中间件
// ============================================

// 日志
app.use('*', logger());

// CORS - 支持 chrome-extension://* 通配符
app.use(
  '*',
  cors({
    origin: (origin) => {
      // 允许无 origin 的请求
      if (!origin) return ALLOWED_ORIGINS[0] || 'https://webtomind.com';
      // 检查是否在允许列表中
      if (ALLOWED_ORIGINS.includes(origin)) return origin;
      // 开发环境允许 localhost
      if (
        process.env.NODE_ENV !== 'production' &&
        (origin.includes('localhost') || origin.includes('127.0.0.1'))
      ) {
        return origin;
      }
      // 不允许的 origin
      return null;
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'],
    exposeHeaders: ['X-Session-ID'],
    maxAge: 86400,
    credentials: true
  })
);

// ============================================
// 路由
// ============================================

// 健康检查
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    runtime: 'vercel-serverless'
  });
});

// 公开配置（返回 Supabase anon key 等公开信息）
app.get('/config', (c) => {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

  return c.json(
    {
      supabase: {
        url: supabaseUrl,
        anonKey: supabaseAnonKey
      }
    },
    200,
    {
      'Cache-Control': 'public, max-age=3600'
    }
  );
});

// Auth API 路由
app.route('/auth', authRoutes);

// Agent API 路由
app.route('/agent', agentRoutes);

// Workspace API 路由
app.route('/workspace', workspaceRoutes);

// 官网公开内容 API 路由
app.route('/content', contentRoutes);

// 404 处理
app.notFound((c) => {
  return c.json({ error: 'Not Found', path: c.req.path }, 404);
});

// 错误处理
app.onError((err, c) => {
  console.error('[Vercel API Error]', err);
  return c.json(
    {
      error: 'Internal Server Error',
      message: err.message
    },
    500
  );
});

// 导出 Vercel handler
export default handle(app);

// 导出 HTTP 方法（Vercel 需要）
export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
