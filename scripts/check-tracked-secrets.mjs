#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const strictIndexMode = process.argv.includes('--strict-index');
const MAX_SCANNED_FILE_BYTES = 2 * 1024 * 1024;
// git cat-file --batch 批量读取的最大缓冲（只读 <= 2MB 的文件内容，实际远小于此）
const MAX_BATCH_BUFFER_BYTES = 128 * 1024 * 1024;
const MAX_CHECK_BUFFER_BYTES = 64 * 1024 * 1024;

const forbiddenBasenames = new Set([
  'cookie_input.json',
  'cookie_base64.txt',
  'google_cookies.json',
  'credentials.json'
]);
const forbiddenExtensions = new Set(['.pem', '.key', '.p12', '.pfx']);
const binaryExtensions = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.apng', '.ico', '.bmp',
  '.tif', '.tiff', '.pdf', '.mp4', '.webm', '.mov', '.mkv', '.mp3', '.wav',
  '.ogg', '.flac', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.zip', '.gz',
  '.tgz', '.tar', '.7z', '.rar', '.jar', '.wasm', '.xlsx', '.docx', '.pptx',
  '.xls', '.doc', '.ppt', '.pyc', '.dll', '.dylib', '.so', '.a', '.o', '.class'
]);

function isBinaryExtension(file) {
  return binaryExtensions.has(path.posix.extname(file.replaceAll('\\', '/')).toLowerCase());
}

const secretPatterns = [
  {
    name: 'private key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g
  },
  {
    name: 'OpenAI/Anthropic API key',
    pattern: /\bsk-(?:proj|ant-api03)-[A-Za-z0-9_-]{40,}\b/g
  },
  {
    name: 'Google API key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g
  },
  {
    name: 'GitHub token',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g
  },
  {
    name: 'Slack token',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g
  },
  {
    name: 'AWS access key',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g
  },
  {
    name: 'JWT credential',
    pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
  }
];

function listFiles() {
  const args = strictIndexMode
    ? ['ls-files', '-z']
    : ['ls-files', '-z', '--cached', '--others', '--exclude-standard'];
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8'
  })
    .split('\0')
    .filter(Boolean);
}

function isForbiddenPath(file) {
  const normalized = file.replaceAll('\\', '/');
  const basename = path.posix.basename(normalized);
  const extension = path.posix.extname(normalized).toLowerCase();

  if (forbiddenBasenames.has(basename)) return true;
  if (forbiddenExtensions.has(extension)) return true;
  if (normalized.startsWith('secrets/')) return true;
  if (normalized.includes('/data/cookies/')) return true;
  if (/\/(?:\.env|\.dev\.vars)(?:\.|$)/.test(`/${normalized}`)) {
    return !normalized.endsWith('.example');
  }
  return false;
}

function readCandidate(file) {
  if (strictIndexMode) {
    try {
      return execFileSync('git', ['show', `:${file}`], {
        cwd: process.cwd(),
        encoding: 'utf8',
        maxBuffer: MAX_SCANNED_FILE_BYTES + 1024
      });
    } catch {
      return null;
    }
  }

  const absolutePath = path.resolve(process.cwd(), file);
  if (!existsSync(absolutePath)) return null;
  const stat = statSync(absolutePath);
  if (!stat.isFile() || stat.size > MAX_SCANNED_FILE_BYTES) return null;
  return readFileSync(absolutePath, 'utf8');
}

/**
 * strict 模式下用 git cat-file --batch 一次批量读取所有 index blob，
 * 避免对每个文件单独启动 git 子进程（5817 个文件 = 5817 次进程，耗时约 2 分钟）。
 * 只保留 size <= MAX_SCANNED_FILE_BYTES 的文件，语义与旧的逐文件 git show 一致。
 */
function readIndexCandidates(files) {
  const checkInput = files.map((file) => `:${file}`).join('\n') + '\n';
  const sizesOutput = execFileSync('git', ['cat-file', '--batch-check'], {
    cwd: process.cwd(),
    input: checkInput,
    encoding: 'utf8',
    maxBuffer: MAX_CHECK_BUFFER_BYTES
  });
  const sizes = sizesOutput
    .trimEnd()
    .split('\n')
    .map((line) => {
      const parts = line.split(' ');
      return parts[1] === 'blob' ? Number(parts[2]) : -1;
    });
  const smallFiles = files.filter(
    (_, index) =>
      sizes[index] > 0 &&
      sizes[index] <= MAX_SCANNED_FILE_BYTES &&
      !isBinaryExtension(files[index])
  );
  if (smallFiles.length === 0) return new Map();

  const batchInput = smallFiles.map((file) => `:${file}`).join('\n') + '\n';
  const batch = execFileSync('git', ['cat-file', '--batch'], {
    cwd: process.cwd(),
    input: batchInput,
    maxBuffer: MAX_BATCH_BUFFER_BYTES
  });
  const results = new Map();
  let pos = 0;
  for (const file of smallFiles) {
    const nl = batch.indexOf(0x0a, pos);
    if (nl === -1) break;
    const header = batch.subarray(pos, nl).toString('utf8');
    pos = nl + 1;
    const size = Number(header.split(' ')[2] || 0);
    results.set(file, batch.subarray(pos, pos + size));
    pos += size + 1; // 每个 blob 后跟一个分隔换行
  }
  return results;
}

function getLineNumber(content, offset) {
  return content.slice(0, offset).split('\n').length;
}

const files = listFiles();
const pathViolations = files.filter(
  (file) =>
    isForbiddenPath(file) &&
    (strictIndexMode || existsSync(path.resolve(process.cwd(), file)))
);
const contentViolations = [];

const indexCandidates = strictIndexMode
  ? readIndexCandidates(files)
  : null;
const scanFiles = strictIndexMode ? [...indexCandidates.keys()] : files;
for (const file of scanFiles) {
  const raw = strictIndexMode ? indexCandidates.get(file) : readCandidate(file);
  if (!raw) continue;
  const content = strictIndexMode ? raw.toString('utf8') : raw;
  if (strictIndexMode ? raw.includes(0) : content.includes('\0')) continue;
  for (const { name, pattern } of secretPatterns) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      contentViolations.push({
        file,
        line: getLineNumber(content, match.index || 0),
        name
      });
    }
  }
}

if (pathViolations.length > 0 || contentViolations.length > 0) {
  console.error(
    `Refusing to continue: sensitive ${strictIndexMode ? 'Git index' : 'working-tree'} content detected.`
  );
  for (const file of pathViolations) console.error(`- ${file}: forbidden path`);
  for (const violation of contentViolations) {
    console.error(`- ${violation.file}:${violation.line}: ${violation.name}`);
  }
  process.exit(1);
}

console.log(
  `Secret path/content check passed (${files.length} files scanned, mode=${strictIndexMode ? 'git-index' : 'working-tree'}).`
);
