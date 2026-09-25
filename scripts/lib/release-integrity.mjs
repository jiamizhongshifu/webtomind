import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export const RELEASE_CONTRACTS_PATH = 'config/release-contracts.json';
export const RELEASE_MANIFEST_PATH = 'server/public/release-manifest.json';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)])
    );
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function loadReleaseContracts(root = process.cwd()) {
  const path = resolve(root, RELEASE_CONTRACTS_PATH);
  const registry = JSON.parse(readFileSync(path, 'utf8'));
  validateReleaseContracts(registry);
  return registry;
}

export function validateReleaseContracts(registry) {
  const errors = [];
  if (registry.schemaVersion !== 1) errors.push('schemaVersion must equal 1');
  if (!Array.isArray(registry.contracts) || registry.contracts.length === 0) {
    errors.push('contracts must be a non-empty array');
  }
  if (!Array.isArray(registry.retiredContracts)) {
    errors.push('retiredContracts must be an array');
  }

  const activeIds = new Set();
  for (const contract of registry.contracts || []) {
    if (!contract.id || typeof contract.id !== 'string') {
      errors.push('every contract must have a string id');
      continue;
    }
    if (activeIds.has(contract.id))
      errors.push(`duplicate contract id ${contract.id}`);
    activeIds.add(contract.id);
    if (
      !Array.isArray(contract.sourceChecks) ||
      contract.sourceChecks.length === 0
    ) {
      errors.push(`${contract.id} must have at least one source check`);
    } else {
      for (const check of contract.sourceChecks) {
        if (
          !check.path ||
          !Array.isArray(check.includes) ||
          check.includes.length === 0
        ) {
          errors.push(
            `${contract.id} source checks require path and non-empty includes`
          );
        }
      }
    }
    if (!Array.isArray(contract.artifactChecks)) {
      errors.push(`${contract.id} artifactChecks must be an array`);
    } else {
      for (const check of contract.artifactChecks) {
        const targetsEntry = check.entry === true;
        const targetsPrefix =
          typeof check.prefix === 'string' && check.prefix.length > 0;
        if (
          targetsEntry === targetsPrefix ||
          !Array.isArray(check.includes) ||
          check.includes.length === 0
        ) {
          errors.push(
            `${contract.id} artifact checks require exactly one of entry=true or prefix, plus non-empty includes`
          );
        }
      }
    }
  }

  const retiredIds = new Set();
  for (const retirement of registry.retiredContracts || []) {
    if (
      !retirement.id ||
      typeof retirement.reason !== 'string' ||
      !retirement.reason.trim() ||
      typeof retirement.approvedBy !== 'string' ||
      !retirement.approvedBy.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(retirement.approvedAt || '')
    ) {
      errors.push(
        'retired contracts require id, reason, approvedBy, and approvedAt'
      );
      continue;
    }
    if (activeIds.has(retirement.id)) {
      errors.push(`${retirement.id} cannot be active and retired`);
    }
    if (retiredIds.has(retirement.id)) {
      errors.push(`duplicate retired contract id ${retirement.id}`);
    }
    retiredIds.add(retirement.id);
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid release contract registry:\n- ${errors.join('\n- ')}`
    );
  }
}

export function getActiveContractIds(registry) {
  return registry.contracts.map((contract) => contract.id).sort();
}

export function getContractHash(registry) {
  return sha256(stableStringify(registry));
}

export function checkSourceContracts(root, registry) {
  const errors = [];
  for (const contract of registry.contracts) {
    for (const check of contract.sourceChecks) {
      const path = resolve(root, check.path);
      if (!existsSync(path)) {
        errors.push(`${contract.id}: missing source ${check.path}`);
        continue;
      }
      const source = readFileSync(path, 'utf8');
      for (const marker of check.includes || []) {
        if (!source.includes(marker)) {
          errors.push(
            `${contract.id}: ${check.path} is missing marker ${JSON.stringify(marker)}`
          );
        }
      }
    }
  }
  return errors;
}

export function checkArtifactContracts(root, registry) {
  const assetsDir = resolve(root, 'server/public/assets');
  const errors = [];
  const contractAssets = {};
  if (!existsSync(assetsDir)) {
    return {
      errors: ['server/public/assets does not exist; build the web app first'],
      contractAssets
    };
  }
  const assets = readdirSync(assetsDir).filter((name) => name.endsWith('.js'));

  for (const contract of registry.contracts) {
    for (const check of contract.artifactChecks) {
      if (check.entry === true) {
        const entryPath = findEntryAsset(root);
        const entryAssetName = assetName(entryPath);
        const source = readFileSync(join(assetsDir, entryAssetName), 'utf8');
        for (const marker of check.includes || []) {
          if (!source.includes(marker)) {
            errors.push(
              `${contract.id}: ${entryAssetName} is missing marker ${JSON.stringify(marker)}`
            );
          }
        }
        contractAssets[`entry:${contract.id}`] = entryPath;
        continue;
      }

      const matches = assets.filter((name) => name.startsWith(check.prefix));
      if (matches.length !== 1) {
        errors.push(
          `${contract.id}: expected exactly one ${check.prefix}*.js asset, found ${matches.length}`
        );
        continue;
      }
      const prefixedAssetName = matches[0];
      const source = readFileSync(join(assetsDir, prefixedAssetName), 'utf8');
      for (const marker of check.includes || []) {
        if (!source.includes(marker)) {
          errors.push(
            `${contract.id}: ${prefixedAssetName} is missing marker ${JSON.stringify(marker)}`
          );
        }
      }
      contractAssets[check.prefix] = `/assets/${prefixedAssetName}`;
    }
  }

  return { errors, contractAssets };
}

export function findEntryAsset(root) {
  const htmlPath = resolve(root, 'server/public/index.html');
  const html = readFileSync(htmlPath, 'utf8');
  return findEntryAssetInHtml(html, htmlPath);
}

export function findEntryAssetInHtml(html, label = 'HTML') {
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((src) => /\/assets\/index\.[^/]+\.js$/.test(src));
  if (scripts.length !== 1) {
    throw new Error(
      `Expected one entry asset in ${label}, found ${scripts.length}`
    );
  }
  return scripts[0];
}

export function hashBuiltAsset(root, publicPath) {
  const relative = publicPath.replace(/^\//, '');
  return sha256(readFileSync(resolve(root, 'server/public', relative)));
}

export function readLocalReleaseManifest(root = process.cwd()) {
  return JSON.parse(readFileSync(resolve(root, RELEASE_MANIFEST_PATH), 'utf8'));
}

export function assessContractContinuity({ candidate, live, registry }) {
  const active = new Set(candidate.activeContracts || []);
  const retired = new Set(
    (registry.retiredContracts || []).map((contract) => contract.id)
  );
  const missing = (live.activeContracts || []).filter(
    (id) => !active.has(id) && !retired.has(id)
  );
  return {
    ok: missing.length === 0,
    missing
  };
}

export function getManifestAssetPaths(manifest) {
  return [
    ...new Set([
      manifest.entryAsset,
      ...Object.values(manifest.contractAssets || {})
    ])
  ]
    .filter(Boolean)
    .sort();
}

export function assetName(publicPath) {
  return basename(publicPath);
}
