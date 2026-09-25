#!/usr/bin/env node

import process from 'node:process';
import { assertWatermarksRuntimeEnv } from './lib/watermarks-runtime.mjs';

const production = process.argv.includes('--production');

try {
  const { url } = assertWatermarksRuntimeEnv(process.env, { production });
  console.log(
    `PASS AI marks runtime configuration is valid${production ? ' for production' : ''}: ${url}`
  );
} catch (error) {
  console.error(`FAIL AI marks runtime configuration: ${error.message}`);
  process.exitCode = 1;
}
