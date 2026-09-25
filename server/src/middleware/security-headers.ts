import type { MiddlewareHandler } from 'hono';

const HTML_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://www.googletagmanager.com https://analytics.ahrefs.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://accounts.google.com https://*.google-analytics.com https://*.analytics.google.com https://analytics.ahrefs.com",
  "frame-src https://accounts.google.com https://www.googletagmanager.com",
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'"
].join('; ');

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();

  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(self)'
  );

  if (new URL(c.req.url).protocol === 'https:') {
    c.header('Strict-Transport-Security', 'max-age=31536000');
  }

  const contentType = c.res.headers.get('content-type')?.toLowerCase() || '';
  if (contentType.includes('text/html')) {
    c.header('Content-Security-Policy', HTML_CONTENT_SECURITY_POLICY);
  }
};
