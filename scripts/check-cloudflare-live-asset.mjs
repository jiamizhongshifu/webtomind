#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { readLocalReleaseManifest } from './lib/release-integrity.mjs';

const manifest = readLocalReleaseManifest(process.cwd());
const targetUrl = new URL(process.argv[2] || 'https://webtomind.com/create');
targetUrl.searchParams.set('releaseIntegrity', manifest.commit);
const target = String(targetUrl);

const response = await fetch(target, {
  headers: {
    accept: 'text/html'
  }
});
const html = await response.text();
const server = response.headers.get('server') || '';
const cfRay = response.headers.get('cf-ray') || '';
const runtime = response.headers.get('x-webtomind-runtime') || '';
const assetMatches = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
  .map((match) => match[1])
  .filter((src) => src.includes('/assets/'));

const result = {
  url: target,
  status: response.status,
  server,
  cfRay: cfRay ? '<present>' : '',
  runtime,
  assetScripts: assetMatches
};

console.log(JSON.stringify(result, null, 2));

if (!response.ok) {
  throw new Error(`Live smoke failed with HTTP ${response.status}.`);
}
if (!server.toLowerCase().includes('cloudflare') && !cfRay) {
  throw new Error(`Expected Cloudflare response, got server=${server || 'none'}.`);
}
if (assetMatches.length === 0) {
  throw new Error('No /assets/ script was found in live HTML.');
}

execFileSync(
  process.execPath,
  ['scripts/check-release-contracts.mjs', '--live', targetUrl.origin],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
  }
);
