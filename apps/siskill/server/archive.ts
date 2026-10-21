import type { CommerceEnv } from './handler';
import { CommerceError } from './policy';
export async function verifiedArchive(
  env: CommerceEnv,
  release: { object_key: string; sha256: string; bytes: number }
) {
  if (
    !env.SISKILL_PACKAGES ||
    !/^siskill\/[a-z0-9/_.-]+$/.test(release.object_key) ||
    release.object_key.includes('..') ||
    release.bytes <= 0 ||
    release.bytes > 32 * 1024 * 1024
  )
    throw new CommerceError('DOWNLOAD_UNAVAILABLE', 503);
  const object = await env.SISKILL_PACKAGES.get(release.object_key);
  if (!object || object.size !== release.bytes)
    throw new CommerceError('DOWNLOAD_UNAVAILABLE', 503);
  const bytes = await new Response(object.body).arrayBuffer();
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  if (bytes.byteLength !== release.bytes || hash !== release.sha256)
    throw new CommerceError('PACKAGE_INTEGRITY_FAILED', 503);
  return bytes;
}
