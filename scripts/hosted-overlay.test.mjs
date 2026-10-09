import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateOverlayPath, encryptOverlay, decryptOverlay, sha256, applyHostedOverlay, verifyHostedOverlay } from './lib/hosted-overlay.mjs';

const key = 'ab'.repeat(32);
const fixture = { schemaVersion: 1, files: [{ path: 'public/example.txt', baseSha256: sha256('public'), sha256: sha256('hosted'), contentBase64: Buffer.from('hosted').toString('base64') }] };

test('encrypted hosted data authenticates and rejects corruption or another key', () => {
  const encrypted = encryptOverlay(fixture, key);
  assert.deepEqual(decryptOverlay(encrypted, key, sha256(encrypted)), fixture);
  assert.throws(() => decryptOverlay(encrypted, key, '00'.repeat(32)), /digest mismatch/);
  assert.throws(() => decryptOverlay(encrypted, 'cd'.repeat(32), sha256(encrypted)));
});

test('overlay cannot write outside content/config paths or change CI and release scripts', () => {
  for (const file of ['../outside', '/tmp/outside', 'src/../../outside', 'src/.git/config', 'src/.env.local', '.github/workflows/ci.yml', 'scripts/deploy-cloudflare-worker.mjs', 'api/membership/checkout.ts']) assert.throws(() => validateOverlayPath(file));
  assert.equal(validateOverlayPath('public/image.webp'), 'public/image.webp');
});

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'hosted-overlay-test-'));
  mkdirSync(path.join(root, 'public'));
  writeFileSync(path.join(root, 'public/example.txt'), 'public');
  for (const args of [['init', '-q'], ['add', '.'], ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture']]) execFileSync('git', args, { cwd: root });
  return root;
}

test('verified overlay permits only expected changes and detects later edits', () => {
  const root = repo();
  const digest = 'ab'.repeat(32);
  applyHostedOverlay(root, fixture, digest);
  assert.equal(verifyHostedOverlay(root, digest).files.length, 1);
  writeFileSync(path.join(root, 'unexpected.txt'), 'unexpected');
  assert.throws(() => verifyHostedOverlay(root, digest), /Unexpected release source change/);
  writeFileSync(path.join(root, 'public/example.txt'), 'tampered');
  assert.throws(() => verifyHostedOverlay(root, digest), /changed after verification/);
});

test('changed public source is not overwritten and validation precedes all writes', () => {
  const root = repo();
  const files = [...fixture.files, { ...fixture.files[0], path: 'public/another.txt', baseSha256: 'wrong' }];
  assert.throws(() => applyHostedOverlay(root, { files }, 'ab'.repeat(32)), /needs refresh/);
  assert.equal(readFileSync(path.join(root, 'public/example.txt'), 'utf8'), 'public');
});

test('overlay receipt is written and verified in a linked worktree', () => {
  const root = repo();
  const worktree = path.join(mkdtempSync(path.join(tmpdir(), 'hosted-overlay-worktree-')), 'checkout');
  execFileSync('git', ['worktree', 'add', '--detach', worktree, 'HEAD'], { cwd: root, stdio: 'pipe' });
  const digest = 'ab'.repeat(32);
  applyHostedOverlay(worktree, fixture, digest);
  assert.equal(verifyHostedOverlay(worktree, digest).files.length, 1);
  assert.equal(readFileSync(path.join(root, 'public/example.txt'), 'utf8'), 'public');
});

test('receipt cannot be reused for another overlay digest or commit', () => {
  const root = repo();
  applyHostedOverlay(root, fixture, 'ab'.repeat(32));
  assert.throws(() => verifyHostedOverlay(root, 'cd'.repeat(32)), /does not match/);
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'next'], { cwd: root });
  assert.throws(() => verifyHostedOverlay(root, 'ab'.repeat(32)), /does not match/);
});


test('dangling symlinks are rejected before overlay writes', () => {
  const root = repo();
  symlinkSync(path.join(root, 'absent.txt'), path.join(root, 'public/link.txt'));
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'link'], { cwd: root });
  const files = [{ ...fixture.files[0], path: 'public/link.txt', baseSha256: null }];
  assert.throws(() => applyHostedOverlay(root, { files }, 'ab'.repeat(32)), /symlink/);
});
