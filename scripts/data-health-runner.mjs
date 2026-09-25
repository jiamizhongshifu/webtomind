#!/usr/bin/env node

/**
 * 每日数据面日报 runner。
 *
 * 逐个运行 GA4 / GSC / Supabase 转化报告，任一失败不中断其余报告，
 * 最后运行 data-health-check；任一环节失败时写 alert 文件，保证
 * 「数据面退化」可见，而不是被 `&&` 断链吞掉。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const NODE = process.execPath;
const OUT_DIR = path.join(ROOT, 'outputs', 'data-health');

const STEPS = [
  { name: 'ga4', script: 'scripts/ga4-report.mjs' },
  { name: 'gsc', script: 'scripts/gsc-report.mjs' },
  { name: 'supabase', script: 'scripts/supabase-conversion-report.mjs' }
];

function runStep({ name, script }) {
  const result = spawnSync(NODE, [script], {
    cwd: ROOT,
    env: process.env,
    encoding: 'utf8',
    timeout: 15 * 60 * 1000
  });
  const status = result.status ?? (result.error ? 1 : 0);
  const tail = (result.stderr || result.stdout || '')
    .trim()
    .split('\n')
    .slice(-3)
    .join('\n');
  return { name, script, status, tail };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const startedAt = new Date().toISOString();
  const results = STEPS.map(runStep);

  const health = spawnSync(
    NODE,
    ['scripts/data-health-check.mjs', '--days', '2'],
    { cwd: ROOT, env: process.env, encoding: 'utf8' }
  );
  const healthStatus = health.status ?? (health.error ? 1 : 0);
  const failedSteps = results.filter((step) => step.status !== 0);
  const healthFailed = healthStatus !== 0;

  const alert = {
    generatedAt: startedAt,
    failed: failedSteps.length > 0 || healthFailed,
    steps: results.map(({ name, status }) => ({ name, status })),
    healthStatus,
    healthTail: health.stdout?.trim().split('\n').slice(-8).join('\n') || '',
    failedStepTails: failedSteps.map((step) => ({
      name: step.name,
      status: step.status,
      tail: step.tail
    }))
  };

  await fs.writeFile(
    path.join(OUT_DIR, 'alert.json'),
    JSON.stringify(alert, null, 2)
  );

  const lines = [
    `# 数据面日报 ${startedAt}`,
    ...results.map(
      (step) => `${step.name}: ${step.status === 0 ? 'PASS' : `FAIL(${step.status})`}`
    ),
    `health: ${healthFailed ? 'FAIL' : 'PASS'}`,
    ...(failedSteps.length
      ? failedSteps.flatMap((step) => [
          `--- ${step.name} tail ---`,
          step.tail
        ])
      : []),
    ...(healthFailed ? ['--- health check tail ---', alert.healthTail] : [])
  ];
  const output = lines.join('\n');
  console.log(output);
  await fs.appendFile(
    path.join(OUT_DIR, 'health.log'),
    `${output}\n\n`
  );

  process.exitCode = failedSteps.length > 0 || healthFailed ? 1 : 0;
}

main().catch((error) => {
  console.error('[data-health-runner] failed:', error);
  process.exitCode = 1;
});
