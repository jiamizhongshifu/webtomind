#!/usr/bin/env node

import { loadObservedImageGenerationMetrics } from './lib/image-generation-observed-metrics.mjs';
import {
  evaluateImageGenerationHealth,
  getImageGenerationHealthPolicy,
  selectReleaseHealthReport
} from './lib/image-generation-health-policy.mjs';

const daysArgIndex = process.argv.indexOf('--days');
const days =
  daysArgIndex >= 0 ? Number(process.argv[daysArgIndex + 1] || 7) : 7;
const report = await loadObservedImageGenerationMetrics({ days });
const longWindow =
  report?.status === 'insufficient_sample' && (report.sampleSize ?? 0) === 0
    ? await loadObservedImageGenerationMetrics({ days: 30 })
    : null;
const selection = selectReleaseHealthReport({
  releaseHealth: report,
  longWindowHealth: longWindow,
  allowLongWindowFallback:
    process.env.IMAGE_HEALTH_LONG_WINDOW_FALLBACK !== '0'
});
const result = evaluateImageGenerationHealth(
  selection.report,
  getImageGenerationHealthPolicy()
);

console.log(
  JSON.stringify(
    { report, fallback: selection.fallback, evaluation: result },
    null,
    2
  )
);
if (!result.ok) process.exitCode = 1;
