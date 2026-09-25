import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assessContractContinuity,
  checkArtifactContracts,
  checkSourceContracts,
  validateReleaseContracts
} from './lib/release-integrity.mjs';

function registry(overrides = {}) {
  return {
    schemaVersion: 1,
    contracts: [
      {
        id: 'feature.visible',
        sourceChecks: [
          { path: 'src/feature.ts', includes: ['VISIBLE_MARKER'] }
        ],
        artifactChecks: [{ prefix: 'feature.', includes: ['VISIBLE_MARKER'] }]
      }
    ],
    retiredContracts: [],
    ...overrides
  };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'release-integrity-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'server/public/assets'), { recursive: true });
  writeFileSync(
    join(root, 'src/feature.ts'),
    'export const value = "VISIBLE_MARKER";'
  );
  writeFileSync(
    join(root, 'server/public/index.html'),
    '<script type="module" src="/assets/index.123.js"></script>'
  );
  writeFileSync(
    join(root, 'server/public/assets/index.123.js'),
    'ENTRY_MARKER'
  );
  writeFileSync(
    join(root, 'server/public/assets/feature.123.js'),
    'VISIBLE_MARKER'
  );
  return root;
}

test('valid release registry passes', () => {
  assert.doesNotThrow(() => validateReleaseContracts(registry()));
});

test('duplicate active contract is rejected', () => {
  const contract = registry().contracts[0];
  assert.throws(
    () =>
      validateReleaseContracts(registry({ contracts: [contract, contract] })),
    /duplicate contract id/
  );
});

test('retirement requires an auditable reason, approver, and approval date', () => {
  assert.throws(
    () =>
      validateReleaseContracts(
        registry({ retiredContracts: [{ id: 'old.feature' }] })
      ),
    /reason, approvedBy, and approvedAt/
  );
});

test('source and artifact markers pass together', () => {
  const root = fixture();
  assert.deepEqual(checkSourceContracts(root, registry()), []);
  assert.deepEqual(checkArtifactContracts(root, registry()).errors, []);
});

test('missing source marker is detected', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'src/feature.ts'),
    'export const value = "regressed";'
  );
  assert.match(checkSourceContracts(root, registry())[0], /missing marker/);
});

test('missing built marker is detected even when source still passes', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'server/public/assets/feature.123.js'),
    'stale bundle'
  );
  assert.match(
    checkArtifactContracts(root, registry()).errors[0],
    /missing marker/
  );
});

test('entry asset checks resolve the exact script referenced by built HTML', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'server/public/assets/index.vendor.js'),
    'wrong bundle'
  );
  const entryRegistry = registry({
    contracts: [
      {
        id: 'platform.entry-recovery',
        sourceChecks: [
          { path: 'src/feature.ts', includes: ['VISIBLE_MARKER'] }
        ],
        artifactChecks: [{ entry: true, includes: ['ENTRY_MARKER'] }]
      }
    ]
  });

  assert.deepEqual(checkArtifactContracts(root, entryRegistry), {
    errors: [],
    contractAssets: {
      'entry:platform.entry-recovery': '/assets/index.123.js'
    }
  });
});

test('live contract cannot disappear silently', () => {
  const result = assessContractContinuity({
    candidate: { activeContracts: ['feature.visible'] },
    live: { activeContracts: ['feature.visible', 'feature.paste'] },
    registry: registry()
  });
  assert.deepEqual(result, { ok: false, missing: ['feature.paste'] });
});

test('explicit approved retirement permits a live contract removal', () => {
  const result = assessContractContinuity({
    candidate: { activeContracts: ['feature.visible'] },
    live: { activeContracts: ['feature.visible', 'feature.paste'] },
    registry: registry({
      retiredContracts: [
        {
          id: 'feature.paste',
          reason: 'Product owner approved replacement flow.',
          approvedBy: 'product-owner',
          approvedAt: '2026-08-05'
        }
      ]
    })
  });
  assert.deepEqual(result, { ok: true, missing: [] });
});

test('standard release commands always target production routes', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const releaseScript = readFileSync('scripts/release-cloudflare.mjs', 'utf8');
  assert.equal(packageJson.scripts['cf:deploy'], 'pnpm cf:deploy:routes');
  assert.match(releaseScript, /\['cf:deploy:routes:raw'\]/);
  assert.doesNotMatch(releaseScript, /\['cf:deploy:raw'\]/);
  assert.match(releaseScript, /image-generation-health-gate\.mjs/);
  assert.match(releaseScript, /\['build:web:prod-parity'\]/);
});
