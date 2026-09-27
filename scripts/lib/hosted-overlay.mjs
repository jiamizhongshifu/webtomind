import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { gzipSync, gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function validateOverlayPath(file) {
  if (typeof file !== 'string' || !file || file.includes('\\') || file.includes('\0') || path.posix.normalize(file) !== file || file.startsWith('/') || file.split('/').some((part) => part === '..' || part === '.git' || part.startsWith('.env'))) {
    throw new Error('Invalid hosted overlay path');
  }
  if (!(file.startsWith('public/') || file.startsWith('src/') || file === 'web.html' || file === 'workers/webtomind.wrangler.toml' || file === 'api/admin/prompt-case-auth.ts')) {
    throw new Error('Hosted overlay cannot replace workflows, scripts or arbitrary server code');
  }
  return file;
}

export function encryptOverlay(bundle, keyHex) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const body = Buffer.concat([cipher.update(gzipSync(JSON.stringify(bundle))), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decryptOverlay(bytes, keyHex, expectedSha256) {
  if (sha256(bytes) !== expectedSha256) throw new Error('Hosted overlay digest mismatch');
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  const json = gunzipSync(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]), { maxOutputLength: 256 * 1024 * 1024 });
  const bundle = JSON.parse(json.toString('utf8'));
  if (bundle.schemaVersion !== 1 || !Array.isArray(bundle.files)) throw new Error('Invalid hosted overlay schema');
  return bundle;
}

export async function overlayObjectRequest(config, method = 'GET', body) {
  if (!/^[a-f0-9]{32}$/.test(config.accountId) || !/^[a-z0-9-]+$/.test(config.bucket) || !/^deployment-overlays\/[a-f0-9]{64}\.bin$/.test(config.objectKey)) throw new Error('Invalid hosted overlay object location');
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/r2/buckets/${config.bucket}/objects/${config.objectKey}`;
  const token = config.apiToken || process.env.WEBTOMIND_CLOUDFLARE_WORKERS_API_TOKEN;
  if (!token) throw new Error('Hosted overlay requires the deployment API token');
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body, signal: AbortSignal.timeout(180000), redirect: 'error' });
  if (!response.ok) throw new Error(`Hosted overlay object request failed: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function targetPath(root, file) {
  validateOverlayPath(file);
  const parts = file.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const candidate = path.join(root, ...parts.slice(0, i));
    if (existsSync(candidate) && lstatSync(candidate).isSymbolicLink()) throw new Error('Overlay path contains a symlink');
  }
  return path.join(root, file);
}

export function applyHostedOverlay(root, bundle, digest) {
  if (git(root, ['status', '--porcelain', '--untracked-files=all'])) throw new Error('Apply hosted overlay only to a clean checkout');
  const names = new Set();
  const prepared = bundle.files.map((entry) => {
    const target = targetPath(root, entry.path);
    if (names.has(entry.path)) throw new Error('Duplicate hosted overlay path');
    names.add(entry.path);
    const before = existsSync(target) ? sha256(readFileSync(target)) : null;
    if (before !== entry.baseSha256) throw new Error(`Hosted overlay needs refresh for changed public source: ${entry.path}`);
    const bytes = Buffer.from(entry.contentBase64, 'base64');
    if (sha256(bytes) !== entry.sha256) throw new Error('Hosted overlay file digest mismatch');
    return { ...entry, target, bytes };
  });
  // Validate every file before touching the checkout. Changed public source
  // must never be silently overwritten by an older hosted configuration.
  for (const entry of prepared) {
    mkdirSync(path.dirname(entry.target), { recursive: true });
    writeFileSync(entry.target, entry.bytes);
  }
  const receipt = { commit: git(root, ['rev-parse', 'HEAD']), digest, files: prepared.map(({ path: file, sha256: hash }) => ({ path: file, sha256: hash })) };
  writeFileSync(path.join(root, git(root, ['rev-parse', '--git-path', 'hosted-overlay.json'])), JSON.stringify(receipt), { mode: 0o600 });
  return receipt;
}

export function verifyHostedOverlay(root, expectedDigest) {
  const receiptPath = path.resolve(root, git(root, ['rev-parse', '--git-path', 'hosted-overlay.json']));
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  if (!/^[a-f0-9]{64}$/.test(expectedDigest || '') || receipt.digest !== expectedDigest || receipt.commit !== git(root, ['rev-parse', 'HEAD'])) throw new Error('Hosted overlay receipt does not match release');
  const allowed = new Set();
  for (const entry of receipt.files) {
    const target = targetPath(root, entry.path);
    if (sha256(readFileSync(target)) !== entry.sha256) throw new Error(`Hosted overlay file changed after verification: ${entry.path}`);
    allowed.add(entry.path);
  }
  const changed = execFileSync('git', ['diff', '--name-only', '-z', 'HEAD'], { cwd: root }).toString().split('\0').filter(Boolean);
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
  for (const file of [...changed, ...untracked]) if (!allowed.has(file)) throw new Error(`Unexpected release source change: ${file}`);
  return receipt;
}
