#!/usr/bin/env node

import process from 'node:process';
import {
  assessContractContinuity,
  checkArtifactContracts,
  checkSourceContracts,
  findEntryAsset,
  findEntryAssetInHtml,
  getActiveContractIds,
  getContractHash,
  getManifestAssetPaths,
  hashBuiltAsset,
  loadReleaseContracts,
  readLocalReleaseManifest,
  sha256,
  stableStringify
} from './lib/release-integrity.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const mode = args[0] || '--source';
const baseUrl = args[1] || 'https://webtomind.com';

function fail(errors) {
  throw new Error(`Release integrity check failed:\n- ${errors.join('\n- ')}`);
}

function compare(label, actual, expected, errors) {
  if (stableStringify(actual) !== stableStringify(expected)) {
    errors.push(`${label} differs: live=${stableStringify(actual)} candidate=${stableStringify(expected)}`);
  }
}

function validateBuildManifest(registry, manifest) {
  const errors = [];
  compare('activeContracts', manifest.activeContracts, getActiveContractIds(registry), errors);
  compare('contractHash', manifest.contractHash, getContractHash(registry), errors);
  compare('entryAsset', manifest.entryAsset, findEntryAsset(root), errors);
  const artifactResult = checkArtifactContracts(root, registry);
  errors.push(...artifactResult.errors);
  compare('contractAssets', manifest.contractAssets, artifactResult.contractAssets, errors);
  for (const assetPath of getManifestAssetPaths(manifest)) {
    const expectedHash = hashBuiltAsset(root, assetPath);
    if (manifest.assetSha256?.[assetPath] !== expectedHash) {
      errors.push(`${assetPath} hash does not match the built asset`);
    }
  }
  return errors;
}

async function fetchChecked(url, accept) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      accept,
      'cache-control': 'no-cache, no-store, max-age=0',
      pragma: 'no-cache'
    }
  });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response;
}

function cacheBustedUrl(path, commit) {
  const url = new URL(path, baseUrl);
  url.searchParams.set('releaseIntegrity', commit);
  return url;
}

async function fetchLiveManifest(candidate, allowMissing) {
  const url = cacheBustedUrl('/release-manifest.json', candidate.commit);
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { accept: 'application/json', 'cache-control': 'no-cache, no-store, max-age=0' }
  });
  if (response.status === 404 && allowMissing) return null;
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch (error) {
    if (allowMissing) return null;
    throw new Error(
      `${url} did not return a release manifest: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

const registry = loadReleaseContracts(root);
const sourceErrors = checkSourceContracts(root, registry);
if (sourceErrors.length > 0) fail(sourceErrors);

if (mode === '--source') {
  console.log(`PASS ${registry.contracts.length} active release contracts match source.`);
} else if (mode === '--build') {
  const manifest = readLocalReleaseManifest(root);
  const errors = validateBuildManifest(registry, manifest);
  if (errors.length > 0) fail(errors);
  console.log(`PASS release manifest and ${getManifestAssetPaths(manifest).length} built assets match source contracts.`);
} else if (mode === '--continuity') {
  const candidate = readLocalReleaseManifest(root);
  const allowBootstrap = process.env.RELEASE_CONTRACT_BOOTSTRAP === '1';
  const live = await fetchLiveManifest(candidate, allowBootstrap);
  if (!live) {
    console.log('PASS one-time release contract bootstrap accepted because production has no manifest yet.');
  } else {
    const result = assessContractContinuity({ candidate, live, registry });
    if (!result.ok) {
      fail([
        `candidate silently removes live contracts: ${result.missing.join(', ')}. Add them back or add an explicit retiredContracts approval.`
      ]);
    }
    console.log(`PASS candidate preserves all ${live.activeContracts?.length || 0} live contracts.`);
  }
} else if (mode === '--live') {
  const candidate = readLocalReleaseManifest(root);
  const live = await fetchLiveManifest(candidate, false);
  const errors = [];
  for (const key of [
    'schemaVersion',
    'commit',
    'originMain',
    'contractHash',
    'activeContracts',
    'retiredContracts',
    'entryAsset',
    'contractAssets',
    'assetSha256'
  ]) {
    compare(key, live[key], candidate[key], errors);
  }

  const htmlResponse = await fetchChecked(
    cacheBustedUrl('/create', candidate.commit),
    'text/html'
  );
  const liveEntryAsset = findEntryAssetInHtml(await htmlResponse.text(), 'live /create HTML');
  compare('live HTML entryAsset', liveEntryAsset, candidate.entryAsset, errors);

  for (const assetPath of getManifestAssetPaths(candidate)) {
    const response = await fetchChecked(
      cacheBustedUrl(assetPath, candidate.commit),
      'application/javascript'
    );
    const hash = sha256(Buffer.from(await response.arrayBuffer()));
    if (hash !== candidate.assetSha256[assetPath]) {
      errors.push(`${assetPath} live SHA-256 ${hash} differs from candidate ${candidate.assetSha256[assetPath]}`);
    }
  }
  if (errors.length > 0) fail(errors);
  console.log(
    `PASS production exactly matches git ${candidate.commit.slice(0, 12)}, ${candidate.activeContracts.length} contracts, and ${getManifestAssetPaths(candidate).length} asset hashes.`
  );
} else {
  fail([`unknown mode ${mode}`]);
}
