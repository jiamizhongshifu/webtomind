#!/usr/bin/env node

import { loadObservedImageGenerationMetrics } from './lib/image-generation-observed-metrics.mjs';
import {
  evaluateImageGenerationHealth,
  getImageGenerationHealthPolicy
} from './lib/image-generation-health-policy.mjs';

const daysArgIndex = process.argv.indexOf('--days');
const days =
  daysArgIndex >= 0 ? Number(process.argv[daysArgIndex + 1] || 7) : 7;
const report = await loadObservedImageGenerationMetrics({ days });
const result = evaluateImageGenerationHealth(
  report,
  getImageGenerationHealthPolicy()
);

console.log(JSON.stringify({ report, evaluation: result }, null, 2));
if (!result.ok) process.exitCode = 1;
