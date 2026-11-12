// Pure helpers for scripts/publish-skills.mjs: deterministic archives and the
// mapping from a content-repository skill.json to skill_catalog rows.
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync, lstatSync } from 'node:fs';
import path from 'node:path';

const BLOCK = 512;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/;
const OUTPUT_TYPES = new Set(['image', 'slides', 'video', 'web']);
// Content manifests use agent names as users type them; the catalog uses the
// CLI's --agent names.
const AGENT_ALIASES = {
  'claude-code': 'claude-code',
  codex: 'codex',
  cursor: 'cursor',
  'gemini-cli': 'gemini',
  gemini: 'gemini',
  'kimi-code': 'kimi-code',
  antigravity: 'antigravity',
  trae: 'trae'
};
const MEDIA_CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf'
};
const DISPLAYABLE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4']);
export const MAX_EXAMPLE_MEDIA_PER_VERSION = 8;

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function mediaContentType(file) {
  return MEDIA_CONTENT_TYPES[path.extname(file).toLowerCase()] || null;
}

/** Sorted relative file list; rejects symlinks and hidden entries. */
export function listPackageFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith('.')) {
        throw new Error(`Hidden entry not allowed: ${path.relative(root, path.join(dir, name))}`);
      }
      const full = path.join(dir, name);
      if (lstatSync(full).isSymbolicLink()) {
        throw new Error(`Symlink not allowed: ${path.relative(root, full)}`);
      }
      if (statSync(full).isDirectory()) walk(full);
      else files.push(path.relative(root, full).split(path.sep).join('/'));
    }
  };
  walk(root);
  return files;
}

function writeOctal(header, offset, length, value) {
  header.write(value.toString(8).padStart(length - 1, '0') + '\0', offset, length, 'ascii');
}

function tarHeader(name, size, mode) {
  const header = Buffer.alloc(BLOCK, 0);
  const nameBytes = Buffer.from(name, 'utf8');
  if (nameBytes.length <= 100) {
    nameBytes.copy(header, 0);
  } else {
    const cut = name.lastIndexOf('/', name.length - 1);
    const prefix = Buffer.from(name.slice(0, cut), 'utf8');
    const base = Buffer.from(name.slice(cut + 1), 'utf8');
    if (cut <= 0 || prefix.length > 155 || base.length > 100) {
      throw new Error(`Path too long for ustar: ${name}`);
    }
    base.copy(header, 0);
    prefix.copy(header, 345);
  }
  writeOctal(header, 100, 8, mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header.write('0', 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return header;
}

/**
 * Builds a gzip-compressed ustar archive with every file under `<slug>/`.
 * Fixed mtime, owner and ordering make the same content hash the same.
 */
export function buildDeterministicArchive(root, slug) {
  const chunks = [];
  for (const file of listPackageFiles(root)) {
    const data = readFileSync(path.join(root, file));
    const mode = file.startsWith('scripts/') ? 0o755 : 0o644;
    chunks.push(tarHeader(`${slug}/${file}`, data.length, mode), data);
    const pad = (BLOCK - (data.length % BLOCK)) % BLOCK;
    if (pad) chunks.push(Buffer.alloc(pad, 0));
  }
  chunks.push(Buffer.alloc(BLOCK * 2, 0));
  return gzipSync(Buffer.concat(chunks), { level: 9, mtime: 0 });
}

function localized(value, field) {
  const zh = typeof value?.zh === 'string' ? value.zh.trim() : '';
  const en = typeof value?.en === 'string' ? value.en.trim() : '';
  if (!zh && !en) throw new Error(`${field} needs zh or en text`);
  return {
    ...(zh ? { 'zh-CN': zh } : {}),
    ...(en ? { 'en-US': en } : {})
  };
}

function firstSentence(text) {
  // CJK full stops end a sentence directly; Latin ones need following space.
  const match = text.match(/^(.+?(?:[。！？]|[.!?](?=\s|$)))/);
  return (match ? match[1] : text).slice(0, 160);
}

/** Validates a skill.json and maps it to catalog, version and example rows. */
export function mapManifest(manifest, { dirName }) {
  const slug = manifest?.slug;
  if (!SLUG_PATTERN.test(slug || '') || slug.length > 80) throw new Error(`Invalid slug: ${slug}`);
  if (slug !== dirName) throw new Error(`slug ${slug} does not match directory ${dirName}`);
  if (!VERSION_PATTERN.test(manifest.version || '')) {
    throw new Error(`${slug}: invalid version ${manifest.version}`);
  }
  if (manifest.tier !== 'free' && manifest.tier !== 'premium') {
    throw new Error(`${slug}: tier must be free or premium`);
  }
  if (!OUTPUT_TYPES.has(manifest.output_type)) {
    throw new Error(`${slug}: unknown output_type ${manifest.output_type}`);
  }
  if (manifest.permissions?.network !== 'none' || manifest.permissions?.credentials !== 'none') {
    throw new Error(`${slug}: v1 Skills must declare network and credentials as none`);
  }
  const agents = [];
  for (const agent of manifest.agents || []) {
    const mapped = AGENT_ALIASES[agent];
    if (!mapped) throw new Error(`${slug}: unknown agent ${agent}`);
    if (!agents.includes(mapped)) agents.push(mapped);
  }
  if (agents.length === 0) throw new Error(`${slug}: declare at least one agent`);

  const description = localized(manifest.description, `${slug}.description`);
  const summary = Object.fromEntries(
    Object.entries(description).map(([locale, text]) => [locale, firstSentence(text)])
  );
  const current = (manifest.changelog || []).find((entry) => entry.version === manifest.version);
  if (!current) throw new Error(`${slug}: changelog must include ${manifest.version}`);

  const examples = [];
  for (const example of manifest.examples || []) {
    if (example.real_run !== true) continue;
    const files = (example.files || [example.path]).filter(Boolean);
    const displayable = files.filter((file) => DISPLAYABLE.has(path.extname(file).toLowerCase()));
    const video = displayable.find((file) => file.endsWith('.mp4'));
    const poster = displayable.find((file) => !file.endsWith('.mp4')) || null;
    const title = localized(example.title, `${slug}.examples.title`);
    if (video) {
      examples.push({ file: video, posterFile: poster, title });
    } else {
      for (const file of displayable) examples.push({ file, posterFile: null, title });
    }
  }

  return {
    slug,
    version: manifest.version,
    catalog: {
      slug,
      name: localized(manifest.name, `${slug}.name`),
      summary,
      description,
      output_types: [manifest.output_type],
      scene_tags: (manifest.scenarios || []).slice(0, 20),
      languages: manifest.languages || [],
      tier: manifest.tier
    },
    version_row: {
      version: manifest.version,
      compatible_agents: agents,
      changelog: localized(current.notes, `${slug}.changelog`)
    },
    examples: examples.slice(0, MAX_EXAMPLE_MEDIA_PER_VERSION).map((example, index) => ({
      ...example,
      media_type: manifest.output_type,
      sort_order: index
    }))
  };
}

// The detail API exposes each archive's SHA-256, so the object key carries a
// random component that never leaves the database.
export function archiveObjectKey(slug, version, nonce) {
  if (!/^[a-f0-9]{32,}$/.test(nonce || '')) throw new Error('archive key nonce must be random hex');
  return `skills/${slug}/${version}/${nonce}.tar.gz`;
}

export function exampleObjectKey(slug, version, file) {
  return `skill-examples/${slug}/${version}/${file.replace(/^examples\//, '')}`;
}
