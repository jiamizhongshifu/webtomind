#!/usr/bin/env node

// --ci-deployed 模式的线上确认（不依赖本地 build 产物）：
// 1. 线上 release-manifest.json 的 commit 必须等于当前 HEAD（CI 已部署）；
// 2. 抽查最多 3 个线上静态资源的 SHA-256 与线上 manifest 自洽。
// 语义：CI 已完整构建/部署/校验，本地只需确认线上指向当前提交。

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import process from 'node:process';

function git(args) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function fail(message) {
  throw new Error(`Live CI-deployed smoke failed: ${message}`);
}

const commit = git(['rev-parse', 'HEAD']);
const base = new URL(process.argv[2] || 'https://webtomind.com').origin;

const manifestResponse = await fetch(
  `${base}/release-manifest.json?releaseIntegrity=${commit}`,
  { headers: { accept: 'application/json' } }
);
if (!manifestResponse.ok) {
  fail(`release-manifest.json HTTP ${manifestResponse.status} at ${base}.`);
}
const manifest = await manifestResponse.json();
if (manifest.commit !== commit) {
  fail(
    `live manifest commit ${String(manifest.commit).slice(0, 12)} != HEAD ${commit.slice(0, 12)}.`
  );
}

const assets = Object.keys(manifest.assetSha256 || {});
const samples = assets.slice(0, 3);
for (const assetPath of samples) {
  const response = await fetch(
    `${base}${assetPath}?releaseIntegrity=${commit}`,
    { headers: { accept: '*/*' } }
  );
  if (!response.ok) {
    fail(`asset ${assetPath} HTTP ${response.status}.`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== manifest.assetSha256[assetPath]) {
    fail(`asset ${assetPath} SHA-256 mismatch.`);
  }
}

console.log(
  `PASS live release-manifest matches HEAD ${commit.slice(0, 12)}; verified ${samples.length} of ${assets.length} asset hashes.`
);
