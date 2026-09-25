import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const tempDirs: string[] = [];
const generatorPath = path.resolve(
  process.cwd(),
  'scripts/generate-prompt-assets.mjs'
);

function createFixture(status?: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'prompt-asset-guard-'));
  tempDirs.push(root);
  const outputRoot = path.join(root, 'library');
  const configPath = path.join(root, 'batches.json');
  mkdirSync(outputRoot, { recursive: true });
  const batch = {
    id: 'guard-test-batch',
    slot: 'expression',
    ...(status === undefined ? {} : { status }),
    size: '600x600',
    grid: { columns: 3, rows: 3 },
    outputSize: 180,
    cropInsetPx: 5,
    prompt: 'strict test grid',
    assets: Array.from({ length: 9 }, (_, index) => ({
      id: `expression-guard-${index + 1}`,
      title: `Guard ${index + 1}`,
      subtitle: 'single variable',
      prompt: `expression cue ${index + 1}`,
      tags: ['guard']
    }))
  };
  writeFileSync(
    configPath,
    JSON.stringify({ outputRoot, batches: [batch] }, null, 2)
  );
  return { root, outputRoot, configPath };
}

function runGenerator(configPath: string, extraArgs: string[]) {
  return spawnSync(
    process.execPath,
    [
      generatorPath,
      '--config',
      configPath,
      '--batch',
      'guard-test-batch',
      ...extraArgs
    ],
    { cwd: process.cwd(), encoding: 'utf8' }
  );
}

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true }));
});

describe('prompt asset generation publication guards', () => {
  it('fails closed for a misspelled batch status', () => {
    const fixture = createFixture('pendng');
    const result = runGenerator(fixture.configPath, ['--dry-run']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('invalid status pendng');
  });

  it('fails closed when a new batch omits status', () => {
    const fixture = createFixture();
    const result = runGenerator(fixture.configPath, ['--dry-run']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('has no explicit status');
  });

  it('rejects a stable-id thumbnail replacement with conflicting metadata', () => {
    const fixture = createFixture('ready');
    writeFileSync(
      path.join(fixture.outputRoot, 'manifest.generated.json'),
      JSON.stringify({
        assets: [
          {
            id: 'expression-guard-1',
            slot: 'expression',
            title: 'Historical meaning',
            subtitle: 'Historical subtitle',
            prompt: 'historical prompt',
            tags: ['historical'],
            sourceBatchId: 'historical-batch'
          }
        ]
      })
    );
    const result = runGenerator(fixture.configPath, ['--dry-run']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('conflicting metadata fields');
  });

  it('rejects publication when the source cell would be enlarged', async () => {
    const fixture = createFixture('ready');
    const gridPath = path.join(fixture.root, 'small-grid.png');
    await sharp({
      create: {
        width: 300,
        height: 300,
        channels: 3,
        background: '#777777'
      }
    })
      .png()
      .toFile(gridPath);
    const result = runGenerator(fixture.configPath, [
      '--crop-only',
      gridPath,
      '--source-provider',
      'test'
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Regenerate a larger native grid');
  });

  it('keeps pending crops in staging and leaves the public manifest untouched', async () => {
    const fixture = createFixture('pending');
    const manifestPath = path.join(
      fixture.outputRoot,
      'manifest.generated.json'
    );
    const gridPath = path.join(fixture.root, 'grid.png');
    writeFileSync(manifestPath, JSON.stringify({ assets: [] }));
    await sharp({
      create: {
        width: 600,
        height: 600,
        channels: 3,
        background: '#777777'
      }
    })
      .png()
      .toFile(gridPath);
    const result = runGenerator(fixture.configPath, [
      '--crop-only',
      gridPath,
      '--source-provider',
      'test'
    ]);

    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(manifestPath, 'utf8'))).toEqual({
      assets: []
    });
    expect(
      readFileSync(
        path.join(
          fixture.outputRoot,
          '_generated/guard-test-batch/manifest.draft.json'
        ),
        'utf8'
      )
    ).toContain('staged/expression/expression-guard-1.webp');
  });
});
