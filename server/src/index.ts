/**
 * AI Mind Mapper Server
 * Local Node/Hono API server entry.
 */

// Load local defaults before dynamic route imports. Explicit process/CI values
// always win; a checked-out server/.env must never override production or tests.
import * as dotenv from 'dotenv';
dotenv.config({ override: false });

// Configure the global proxy when HTTPS_PROXY or HTTP_PROXY is present.
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxyUrl) {
  console.log(`[Proxy] Using proxy: ${proxyUrl}`);
  // Use undici's dispatcher so fetch-based SDK calls share the proxy.
  const { setGlobalDispatcher, ProxyAgent } = await import('undici');
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Route imports stay dynamic so dotenv has already populated process.env.
const { agentRoutes } = await import('./routes/agent.js');
const { workspaceRoutes } = await import('./routes/workspace.js');
const { authRoutes } = await import('./routes/auth.js');
const { contentRoutes } = await import('./routes/content.js');
const { debugAgentRoutes } = await import('./routes/debug-agent.js');
const { securityHeaders } = await import('./middleware/security-headers.js');

// Runtime configuration.
const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim());

// 鍒涘缓 Hono 搴旂敤
const app = new Hono();

// ============================================
// Middleware
// ============================================

// Request logging.
app.use('*', logger());
app.use('*', securityHeaders);

// CORS.
app.use(
  '*',
  cors({
    origin: (origin) => {
      // Reject requests without an origin, except same-origin browser requests.
      if (!origin) return null;
      // Only allow configured origins.
      if (ALLOWED_ORIGINS.includes(origin)) return origin;
      // Block unknown origins.
      return null;
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Session-ID',
      'X-Debug-Secret'
    ],
    exposeHeaders: ['X-Session-ID'],
    maxAge: 86400,
    credentials: true,
  })
);

// ============================================
// Routes
// ============================================

// Health check.
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Public config used by the web client.
app.get('/api/config', (c) => {
  // Seed mode: return empty config to avoid frontend Supabase connection attempts
  const isSeed =
    process.env.SEED_MOCK_DATA === '1' ||
    (process.env.NODE_ENV !== 'production' &&
      (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('example.supabase')));
  if (isSeed) {
    return c.json({
      supabase: { url: '', anonKey: '' },
    }, 200, {
      'Cache-Control': 'public, max-age=3600',
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

  return c.json({
    supabase: {
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
    },
  }, 200, {
    'Cache-Control': 'public, max-age=3600',
  });
});

// Agent API routes.
app.route('/api/agent', agentRoutes);

// Debug routes stay disabled unless explicitly enabled.
if (
  process.env.NODE_ENV !== 'production' &&
  process.env.ENABLE_DEBUG_AGENT_ROUTES === 'true'
) {
  app.route('/api/debug/agent', debugAgentRoutes);
} else {
  console.log('[Server] Debug agent routes disabled');
}

// Workspace API routes.
// Seed Data - development mock when Supabase not configured
const isSeedMode =
  process.env.SEED_MOCK_DATA === '1' ||
  (process.env.NODE_ENV !== 'production' &&
    (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('example.supabase')));
if (isSeedMode) {
  const { seedDataRoutes } = await import('./routes/seed-data.js');
  app.route('/api/workspace', seedDataRoutes);
  console.log('  Seed:    Mock data enabled (development only)');
}

app.route('/api/workspace', workspaceRoutes);

const useCreditsDevStub =
  process.env.NODE_ENV !== 'production' && process.env.CREDITS_DEV_STUB === '1';

if (useCreditsDevStub) {
  // Explicit local escape hatch only. Default local development should hit the
  // real Vercel credits endpoints so insufficient-credit flows stay testable.
  app.post('/api/credits/consume', async (c) => {
    return c.json({ success: true, remaining: 99999 });
  });
  app.get('/api/credits/balance', async (c) => {
    return c.json({ credits: 99999, plan: 'dev' });
  });
  console.log('  Credits: Dev stub enabled via CREDITS_DEV_STUB=1');
}
// Auth API routes.
app.route('/api/auth', authRoutes);

// Public content API routes.
app.route('/api/content', contentRoutes);


// ============================================
// Static files
// ============================================

// Static asset directory.
const publicDir = path.join(__dirname, '../public');

// Static asset routes.
app.use('/assets/*', serveStatic({ root: publicDir }));
app.use('/icons/*', serveStatic({ root: publicDir }));

// Root route returns the built web app when server/public exists.
app.get('/', async (c) => {
  try {
    const fs = await import('fs/promises');
    const indexPath = path.join(publicDir, 'index.html');
    const html = await fs.readFile(indexPath, 'utf-8');
    return c.html(html);
  } catch {
    // If static files have not been built yet, show a small dev guide.
    return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WebToMind Dev Server</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 100px auto; padding: 20px; }
    h1 { color: #3b82f6; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
    pre { background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>WebToMind Dev Server</h1>
  <p>The web app has not been built into <code>server/public</code> yet.</p>
  <pre>pnpm build:web</pre>
  <p>For Vite development, run the web dev server and open:</p>
  <pre>http://localhost:5173</pre>
  <hr>
  <h3>API status</h3>
  <p>API server is running.</p>
  <p>Agent endpoint: <code>POST /api/agent/chat</code></p>
  <p>Workspace endpoints: <code>/api/workspace/*</code></p>
</body>
</html>
    `);
  }
});

// SPA fallback for non-API, non-asset routes.
app.get('*', async (c) => {
  // API and static asset requests should not receive index.html.
  const path_url = c.req.path;
  if (path_url.startsWith('/api/') || path_url.startsWith('/assets/')) {
    return c.notFound();
  }

  try {
    const fs = await import('fs/promises');
    const indexPath = path.join(publicDir, 'index.html');
    const html = await fs.readFile(indexPath, 'utf-8');
    return c.html(html);
  } catch {
    return c.notFound();
  }
});

// 404 handling.
app.notFound((c) => {
  return c.json({ error: 'Not Found', path: c.req.path }, 404);
});

// Error handling.
app.onError((err, c) => {
  console.error('[Server Error]', err);
  const isDev = process.env.NODE_ENV !== 'production';
  return c.json(
    {
      error: 'Internal Server Error',
      // Avoid exposing internal error details in production.
      ...(isDev ? { message: err.message } : {}),
    },
    500
  );
});

// ============================================
// Server startup
// ============================================

console.log('========================================');
console.log('  AI Mind Mapper Server');
console.log('========================================');
console.log(`  Port:    ${PORT}`);
console.log(`  CORS:    ${ALLOWED_ORIGINS.join(', ')}`);
console.log(`  Env:     ${process.env.NODE_ENV || 'development'}`);
console.log('========================================');

serve({
  fetch: app.fetch,
  port: PORT,
});

console.log(`Server is running on http://localhost:${PORT}`);
