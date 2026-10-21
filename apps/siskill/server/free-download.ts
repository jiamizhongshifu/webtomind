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
  approved: readonly FreeRelease[] = releases
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return failure('METHOD_NOT_ALLOWED', 405);
  const path = new URL(request.url).pathname;
  const release = approved.find(
    (r) => path === `/api/siskill/free/${r.slug}/${r.version}`
  );
  if (!release) return failure('FREE_RELEASE_NOT_FOUND', 404);
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
        'Cache-Control': 'public, max-age=3600',
        'X-Robots-Tag': 'noindex',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch {
    return failure('DOWNLOAD_UNAVAILABLE', 503);
  }
}
