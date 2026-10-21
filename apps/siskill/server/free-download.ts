import { createClient } from '@supabase/supabase-js';
import releases from '../free-releases.json';
export type FreeRelease = {
  slug: string;
  version: string;
  sha256: string;
  bytes: number;
  objectKey: string;
  license: string;
};
type ObjectBody = { size: number; arrayBuffer(): Promise<ArrayBuffer> };
export type FreeDownloadEnv = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SISKILL_FREE_PACKAGES?: { get(key: string): Promise<ObjectBody | null> };
};
const failure = (error: string, status: number) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
// A separate reviewed allowlist prevents paid package keys from being requested.
export async function freeDownload(
  request: Request,
  env: FreeDownloadEnv,
  approved: readonly FreeRelease[] = releases,
  authenticate = async (token: string): Promise<boolean> => {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return false;
    const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await db.auth.getUser(token);
    return !error && Boolean(data.user && !data.user.is_anonymous);
  }
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return failure('METHOD_NOT_ALLOWED', 405);
  const path = new URL(request.url).pathname;
  const release = approved.find(
    (r) => path === `/api/siskill/free/${r.slug}/${r.version}`
  );
  if (!release) return failure('FREE_RELEASE_NOT_FOUND', 404);
  const token = request.headers
    .get('Authorization')
    ?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return failure('AUTH_REQUIRED', 401);
  try {
    if (!(await authenticate(token))) return failure('AUTH_REQUIRED', 401);
  } catch {
    return failure('AUTH_UNAVAILABLE', 503);
  }
  if (!env.SISKILL_FREE_PACKAGES) return failure('DOWNLOAD_UNAVAILABLE', 503);
  try {
    const object = await env.SISKILL_FREE_PACKAGES.get(release.objectKey);
    if (
      !object ||
      object.size !== release.bytes ||
      object.size > 8 * 1024 * 1024
    )
      return failure('DOWNLOAD_UNAVAILABLE', 503);
    const bytes = await object.arrayBuffer();
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    )
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    if (bytes.byteLength !== release.bytes || hash !== release.sha256)
      return failure('PACKAGE_INTEGRITY_FAILED', 503);
    return new Response(request.method === 'HEAD' ? null : bytes, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${release.slug}-${release.version}.tar.gz"`,
        'Content-Length': String(bytes.byteLength),
        'X-Content-SHA256': hash,
        'Cache-Control': 'private, no-store',
        Vary: 'Authorization',
        'X-Robots-Tag': 'noindex',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch {
    return failure('DOWNLOAD_UNAVAILABLE', 503);
  }
}
