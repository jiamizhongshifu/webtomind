import { gunzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { CliError, EXIT } from './errors.mjs';

const BLOCK = 512;
const MAX_ENTRIES = 5000;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

function readString(buffer, offset, length) {
  const slice = buffer.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString('utf8');
}

function readOctal(buffer, offset, length) {
  const text = readString(buffer, offset, length).trim();
  return text ? parseInt(text, 8) : 0;
}

function parsePax(content) {
  const records = {};
  let rest = content.toString('utf8');
  while (rest.length > 0) {
    const space = rest.indexOf(' ');
    const length = Number(rest.slice(0, space));
    if (!Number.isInteger(length) || length <= 0) break;
    const record = rest.slice(space + 1, length - 1);
    const equals = record.indexOf('=');
    records[record.slice(0, equals)] = record.slice(equals + 1);
    rest = rest.slice(length);
  }
  return records;
}

function invalid(message) {
  return new CliError('ARCHIVE_INVALID', message, { exitCode: EXIT.INTEGRITY });
}

/** Rejects absolute paths, drive letters, backslashes and `..` segments. */
export function safeRelativePath(name) {
  if (!name || name.includes('\0') || name.includes('\\')) {
    throw invalid(`Unsafe archive path: ${JSON.stringify(name)}`);
  }
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) {
    throw invalid(`Absolute archive path: ${name}`);
  }
  const normalized = posix.normalize(name).replace(/\/+$/, '');
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.split('/').includes('..')
  ) {
    throw invalid(`Archive path escapes the target: ${name}`);
  }
  return normalized;
}

/**
 * Parses a gzip-compressed tar archive into regular files and directories.
 * Links, devices and other entry types are rejected.
 *
 * @param {Uint8Array} gzipped
 * @returns {Array<{ path: string, type: 'file' | 'dir', mode: number, data?: Buffer }>}
 */
export function readTarGz(gzipped) {
  let tar;
  try {
    tar = gunzipSync(gzipped, { maxOutputLength: MAX_TOTAL_BYTES + BLOCK * MAX_ENTRIES * 4 });
  } catch (error) {
    throw invalid(`Archive is not valid gzip: ${error.message}`);
  }

  const entries = [];
  let offset = 0;
  let total = 0;
  let pendingPath = null;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;

    const size = readOctal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 48);
    const prefix = readString(header, 345, 155);
    const baseName = readString(header, 0, 100);
    const name = pendingPath ?? (prefix ? `${prefix}/${baseName}` : baseName);
    const mode = readOctal(header, 100, 8);
    const dataStart = offset + BLOCK;
    if (dataStart + size > tar.length) throw invalid('Archive is truncated');
    const data = tar.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;

    if (type === 'x') {
      pendingPath = parsePax(data).path ?? null;
      continue;
    }
    if (type === 'L') {
      pendingPath = readString(data, 0, data.length);
      continue;
    }
    pendingPath = null;
    if (type === 'g') continue;

    if (type === '0' || type === '\0' || type === '7') {
      total += size;
      if (total > MAX_TOTAL_BYTES) throw invalid('Archive is too large');
      entries.push({ path: safeRelativePath(name), type: 'file', mode, data: Buffer.from(data) });
    } else if (type === '5') {
      entries.push({ path: safeRelativePath(name), type: 'dir', mode });
    } else {
      throw invalid(`Unsupported archive entry type "${type}" for ${name}`);
    }
    if (entries.length > MAX_ENTRIES) throw invalid('Archive has too many entries');
  }
  return entries;
}

/**
 * Strips a single shared top-level directory (e.g. `my-skill/SKILL.md`) so
 * SKILL.md lands at the install root, then requires SKILL.md to exist.
 */
export function normalizeSkillEntries(entries) {
  const files = entries.filter((entry) => entry.type === 'file');
  if (!files.some((entry) => entry.path === 'SKILL.md')) {
    const roots = new Set(entries.map((entry) => entry.path.split('/')[0]));
    if (roots.size === 1) {
      const [root] = roots;
      entries = entries
        .filter((entry) => entry.path !== root)
        .map((entry) => ({ ...entry, path: entry.path.slice(root.length + 1) }));
    }
  }
  if (!entries.some((entry) => entry.type === 'file' && entry.path === 'SKILL.md')) {
    throw invalid('Archive does not contain SKILL.md');
  }
  return entries;
}

export async function writeEntries(entries, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of entries) {
    const target = join(destination, ...entry.path.split('/'));
    if (entry.type === 'dir') {
      await mkdir(target, { recursive: true });
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, entry.data, { mode: entry.mode & 0o111 ? 0o755 : 0o644 });
  }
}
