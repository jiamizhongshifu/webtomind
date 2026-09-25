#!/usr/bin/env node

import { loadObservedImageGenerationMetrics } from './lib/image-generation-observed-metrics.mjs';

const daysArgIndex = process.argv.indexOf('--days');
const days =
  daysArgIndex >= 0 ? Number(process.argv[daysArgIndex + 1] || 30) : 30;
const report = await loadObservedImageGenerationMetrics({ days });

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
