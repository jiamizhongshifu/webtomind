#!/usr/bin/env node
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const testRoot = path.join(root, 'src');
const batchSize = Number.parseInt(process.env.VITEST_BATCH_SIZE || '8', 10);
const batchStart = Number.parseInt(process.env.VITEST_BATCH_START || '1', 10);
const testFilePattern = /\.(test|spec)\.(js|mjs|cjs|ts|mts|cts|jsx|tsx)$/;

function collectTestFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      files.push(...collectTestFiles(fullPath));
      continue;
    }

    if (!entry.isFile() || !testFilePattern.test(entry.name)) {
      continue;
    }

    files.push(path.relative(root, fullPath));
  }

  return files;
}

if (!statSync(testRoot, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('Cannot find src/ test root.');
  process.exit(1);
}

const testFiles = collectTestFiles(testRoot).sort();
if (testFiles.length === 0) {
  console.error('No Vitest test files found.');
  process.exit(1);
}

const commonArgs = [
  'exec',
  'vitest',
  'run',
  '--maxWorkers=1',
  '--no-file-parallelism',
  '--silent',
  '--reporter=dot'
];

const batches = [];
for (let index = 0; index < testFiles.length; index += batchSize) {
  batches.push(testFiles.slice(index, index + batchSize));
}

if (
  !Number.isInteger(batchStart) ||
  batchStart < 1 ||
  batchStart > batches.length
) {
  console.error(
    `VITEST_BATCH_START must be between 1 and ${batches.length}; received ${process.env.VITEST_BATCH_START || '1'}.`
  );
  process.exit(1);
}

for (const [index, batch] of batches.entries()) {
  if (index + 1 < batchStart) continue;
  console.log(
    `\n[vitest-batch] ${index + 1}/${batches.length}: ${batch.length} files`
  );
  for (const file of batch) {
    console.log(`  - ${file}`);
  }

  const result = spawnSync('pnpm', [...commonArgs, ...batch], {
    cwd: root,
    env: {
      ...process.env,
      NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=4096'
    },
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    console.error(
      `[vitest-batch] Failed at batch ${index + 1}/${batches.length}.`
    );
    process.exit(result.status ?? 1);
  }
}

console.log(
  `\n[vitest-batch] Completed ${testFiles.length} test files in ${batches.length} batches.`
);
