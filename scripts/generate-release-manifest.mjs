#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import {
  RELEASE_MANIFEST_PATH,
  checkArtifactContracts,
  checkSourceContracts,
  findEntryAsset,
  getActiveContractIds,
  getContractHash,
  getManifestAssetPaths,
  hashBuiltAsset,
  loadReleaseContracts
} from './lib/release-integrity.mjs';

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch {
    return fallback;
  }
}

const root = process.cwd();
const registry = loadReleaseContracts(root);
const sourceErrors = checkSourceContracts(root, registry);
const artifactResult = checkArtifactContracts(root, registry);
const errors = [...sourceErrors, ...artifactResult.errors];
if (errors.length > 0) {
  throw new Error(`Release contract build failed:\n- ${errors.join('\n- ')}`);
}

const commit = git(['rev-parse', 'HEAD'], process.env.GITHUB_SHA || 'unknown');
const originMain = git(
  ['rev-parse', 'refs/remotes/origin/main'],
  process.env.GITHUB_BASE_SHA || commit
);
const entryAsset = findEntryAsset(root);
const manifest = {
  schemaVersion: 1,
  environment: 'production-candidate',
  commit,
  originMain,
  contractHash: getContractHash(registry),
  activeContracts: getActiveContractIds(registry),
  retiredContracts: registry.retiredContracts,
  entryAsset,
  contractAssets: artifactResult.contractAssets,
  assetSha256: {},
  builtAt: new Date().toISOString()
};

for (const assetPath of getManifestAssetPaths(manifest)) {
  manifest.assetSha256[assetPath] = hashBuiltAsset(root, assetPath);
}

const outputPath = resolve(root, RELEASE_MANIFEST_PATH);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `PASS release manifest ${RELEASE_MANIFEST_PATH}: ${manifest.activeContracts.length} contracts, ${Object.keys(manifest.assetSha256).length} assets, git ${commit.slice(0, 12)}.`
);
