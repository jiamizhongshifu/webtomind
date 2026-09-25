#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { assessLiveProductionCommit } from './lib/live-production-commit.mjs';

const MANIFEST_URL =
  process.env.WEBTOMIND_LIVE_MANIFEST_URL ||
  'https://webtomind.com/release-manifest.json';
const BREAK_GLASS = process.env.BREAK_GLASS_PRODUCTION_RELEASE === '1';

function git(args) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function isAncestor(ancestor, descendant) {
  try {
    execFileSync(
      'git',
      ['merge-base', '--is-ancestor', ancestor, descendant],
      { stdio: 'ignore' }
    );
    return true;
  } catch {
    return false;
  }
}

async function readLiveCommit(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) return '';
  const payload = await response.json().catch(() => ({}));
  return typeof payload.commit === 'string' ? payload.commit : '';
}

async function main() {
  const candidate = git(['rev-parse', 'HEAD']);
  let live = '';
  try {
    live = await readLiveCommit(MANIFEST_URL);
  } catch {
    live = '';
  }

  let relation = 'unknown';
  if (live && live === candidate) {
    relation = 'same';
  } else if (live) {
    const liveBeforeCandidate = isAncestor(live, candidate);
    const candidateBeforeLive = isAncestor(candidate, live);
    if (liveBeforeCandidate && candidateBeforeLive) {
      relation = 'same';
    } else if (liveBeforeCandidate) {
      relation = 'live-before-candidate';
    } else if (candidateBeforeLive) {
      relation = 'candidate-before-live';
    } else {
      relation = 'diverged';
    }
  }

  const result = assessLiveProductionCommit({ candidate, live, relation });
  if (result.warn) {
    console.log(`WARN ${result.warn}`);
  }
  if (result.errors.length > 0) {
    const message = `Live production commit guard failed: ${result.errors.join(
      ' '
    )}`;
    if (BREAK_GLASS) {
      console.warn(`BREAK_GLASS bypass: ${message}`);
      return;
    }
    throw new Error(message);
  }

  console.log(
    `PASS live production commit ${live ? live.slice(0, 12) : '(unreadable)'} is safe for candidate ${candidate.slice(0, 12)}.`
  );
}

main().catch((error) => {
  console.error(
    `FAIL ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
