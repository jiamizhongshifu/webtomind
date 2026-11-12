import { createHash, randomBytes } from 'node:crypto';
import { readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AGENTS, agentSkillsDir } from './agents.mjs';
import { CliError, EXIT } from './errors.mjs';
import { normalizeSkillEntries, readTarGz, writeEntries } from './tar.mjs';

export const MARKER_FILE = '.webtomind-skill.json';
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readMarker(directory) {
  try {
    return JSON.parse(await readFile(join(directory, MARKER_FILE), 'utf8'));
  } catch {
    return null;
  }
}

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Downloads a Skill archive from the signed URL and verifies its SHA-256
 * before anything touches the filesystem.
 */
export async function downloadVerified({ url, sha256, sizeBytes, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new CliError('DOWNLOAD_FAILED', `Download failed: ${error.message}`);
  }
  if (!response.ok) {
    throw new CliError('DOWNLOAD_FAILED', `Download failed with HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (typeof sizeBytes === 'number' && sizeBytes > 0 && bytes.byteLength !== sizeBytes) {
    throw new CliError(
      'SIZE_MISMATCH',
      `Downloaded ${bytes.byteLength} bytes, expected ${sizeBytes}. Nothing was installed.`,
      { exitCode: EXIT.INTEGRITY }
    );
  }
  const actual = sha256Hex(bytes);
  if (actual !== String(sha256).toLowerCase()) {
    throw new CliError(
      'SHA256_MISMATCH',
      `SHA-256 mismatch (expected ${sha256}, got ${actual}). Nothing was installed.`,
      { exitCode: EXIT.INTEGRITY, details: { expected: sha256, actual } }
    );
  }
  return bytes;
}

/**
 * @param {{
 *   api: ReturnType<typeof import('./api.mjs').createApiClient>,
 *   slug: string, agent?: string | null, target?: string | null,
 *   version?: string | null, force?: boolean,
 *   home?: string, env?: Record<string, string | undefined>,
 *   fetchImpl?: typeof fetch, now?: () => Date
 * }} options
 */
export async function installSkill(options) {
  const { api, slug, agent = null, target = null, version = null, force = false } = options;
  if (!SLUG_PATTERN.test(slug || '')) {
    throw new CliError('USAGE', `Invalid Skill slug: ${slug}`, { exitCode: EXIT.USAGE });
  }
  const baseDir = target
    ? resolve(target)
    : agentSkillsDir(agent, { home: options.home, env: options.env });
  const destination = join(baseDir, slug);

  const existingMarker = await readMarker(destination);
  if ((await exists(destination)) && !existingMarker && !force) {
    throw new CliError(
      'TARGET_EXISTS',
      `${destination} exists and was not installed by webtomind-cli. Use --force to replace it.`,
      { exitCode: EXIT.USAGE }
    );
  }

  const grant = await api.install({ slug, version: version || undefined, agent: target ? null : agent });
  if (existingMarker?.version === grant.version && existingMarker?.sha256 === grant.sha256 && !force) {
    return { status: 'unchanged', slug, version: grant.version, path: destination };
  }

  const bytes = await downloadVerified({
    url: grant.downloadUrl,
    sha256: grant.sha256,
    sizeBytes: grant.sizeBytes,
    fetchImpl: options.fetchImpl
  });
  const entries = normalizeSkillEntries(readTarGz(bytes));

  // Extract beside the destination, then swap, so a failure never leaves a
  // half-written Skill in the agent's directory.
  const suffix = randomBytes(4).toString('hex');
  const staging = join(baseDir, `.${slug}.staging-${suffix}`);
  const backup = join(baseDir, `.${slug}.previous-${suffix}`);
  try {
    await writeEntries(entries, staging);
    await writeFile(
      join(staging, MARKER_FILE),
      JSON.stringify(
        {
          slug,
          version: grant.version,
          sha256: grant.sha256,
          agent: target ? null : agent,
          installedAt: (options.now?.() ?? new Date()).toISOString(),
          source: api.baseUrl
        },
        null,
        2
      )
    );
    const hadPrevious = await exists(destination);
    if (hadPrevious) await rename(destination, backup);
    try {
      await rename(staging, destination);
    } catch (error) {
      if (hadPrevious) await rename(backup, destination);
      throw error;
    }
    if (hadPrevious) await rm(backup, { recursive: true, force: true });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  return {
    status: existingMarker ? 'updated' : 'installed',
    slug,
    version: grant.version,
    path: destination,
    entitlementSource: grant.entitlementSource
  };
}

/** Skills installed by webtomind-cli across all agent directories. */
export async function listInstalled({ home, env, extraDirs = [] } = {}) {
  const directories = [
    ...AGENTS.map((agent) => ({ agent, dir: agentSkillsDir(agent, { home, env }) })),
    ...extraDirs.map((dir) => ({ agent: null, dir: resolve(dir) }))
  ];
  const installed = [];
  for (const { agent, dir } of directories) {
    let names = [];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const marker = await readMarker(join(dir, name));
      if (marker?.slug === name) {
        installed.push({ agent, slug: name, version: marker.version, path: join(dir, name) });
      }
    }
  }
  return installed;
}
