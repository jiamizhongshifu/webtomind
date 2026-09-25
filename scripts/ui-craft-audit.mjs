#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_TARGET = 'src/web';
const DETECTOR_PACKAGE = 'ui-craft-detect@0.5.0';
const HIGH_SIGNAL_RULES = new Set([
  'a11y/icon-only-button-no-label',
  'a11y/modal-without-dialog',
  'a11y/outline-none-no-replacement',
  'left-top-animation',
  'no-focus-visible',
  'perf/image-no-dimensions',
  'state/missing-empty-or-error',
  'tables/no-overflow-handling',
  'transition-all'
]);

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith('-')));
const targetArg = args.find((arg) => !arg.startsWith('-'));
const target = targetArg || DEFAULT_TARGET;
const includeAll = flags.has('--all');
const includeTests = flags.has('--include-tests');
const jsonOutput = flags.has('--json');
const strict = flags.has('--strict');

function usage() {
  console.log(`Usage: node scripts/ui-craft-audit.mjs [target] [--all] [--json] [--strict]

Runs ${DETECTOR_PACKAGE} and reports high-signal UI findings for this project.

Defaults:
  target   ${DEFAULT_TARGET}
  rules    ${Array.from(HIGH_SIGNAL_RULES).join(', ')}

Flags:
  --all            include every ui-craft-detect rule, including noisy token/unit checks
  --include-tests  include test and fixture files in filtered output
  --json           print machine-readable output
  --strict         exit 1 when high-signal findings exist`);
}

if (flags.has('--help') || flags.has('-h')) {
  usage();
  process.exit(0);
}

// ui-craft-detect can emit more than a pipe buffer of JSON. Redirecting the
// synchronous child output to files avoids an intermittent macOS truncation at
// roughly 64 KiB that otherwise turns valid detector output into invalid JSON.
const detectorTempDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'webtomind-ui-craft-')
);
const detectorStdoutPath = path.join(detectorTempDir, 'stdout.json');
const detectorStderrPath = path.join(detectorTempDir, 'stderr.log');
const detectorStdoutFd = fs.openSync(detectorStdoutPath, 'w');
const detectorStderrFd = fs.openSync(detectorStderrPath, 'w');
let detector;
try {
  detector = spawnSync(
    'npx',
    ['--yes', DETECTOR_PACKAGE, target, '--json'],
    {
      cwd: process.cwd(),
      stdio: ['ignore', detectorStdoutFd, detectorStderrFd]
    }
  );
} finally {
  fs.closeSync(detectorStdoutFd);
  fs.closeSync(detectorStderrFd);
}

const stdout = fs.readFileSync(detectorStdoutPath, 'utf8').trim();
const stderr = fs.readFileSync(detectorStderrPath, 'utf8').trim();
fs.rmSync(detectorTempDir, { recursive: true, force: true });

if (detector.error) {
  console.error(`Failed to run ${DETECTOR_PACKAGE}: ${detector.error.message}`);
  process.exit(2);
}

let payload;
try {
  payload = JSON.parse(stdout);
} catch (error) {
  console.error(
    `Failed to parse ${DETECTOR_PACKAGE} JSON output: ${error.message}`
  );
  if (stdout) console.error(stdout.slice(0, 2000));
  if (stderr) console.error(stderr);
  process.exit(2);
}

const findings = Array.isArray(payload.findings) ? payload.findings : [];
const sourceCache = new Map();

function compactFile(file) {
  if (!file) return 'unknown';
  const normalized = file.split(path.sep).join('/');
  const marker = 'projects/zongjie/';
  const index = normalized.indexOf(marker);
  return index >= 0 ? normalized.slice(index + marker.length) : normalized;
}

function readFindingSource(file) {
  if (!file) return '';
  const compact = compactFile(file);
  const absolute = path.isAbsolute(file)
    ? file
    : path.join(process.cwd(), compact);
  if (sourceCache.has(absolute)) return sourceCache.get(absolute);
  let source = '';
  try {
    source = fs.readFileSync(absolute, 'utf8');
  } catch {
    source = '';
  }
  sourceCache.set(absolute, source);
  return source;
}

function readFindingLine(file, line) {
  const source = readFindingSource(file);
  if (!source || !line) return '';
  return source.split(/\r?\n/)[line - 1] || '';
}

function isTestOrFixture(file) {
  const compact = compactFile(file);
  return (
    compact.includes('/__tests__/') ||
    compact.includes('.test.') ||
    compact.includes('.spec.') ||
    compact.includes('/test-fixtures/') ||
    compact.includes('/fixtures/')
  );
}

function hasProjectOverlayContract(file) {
  const source = readFindingSource(file);
  return (
    /<Dialog\b/.test(source) ||
    /<Dialog(?:Root|Content)\b/.test(source) ||
    /<ActionSheet\b/.test(source) ||
    /useOverlayBehavior<[^>]+>/.test(source) ||
    (/\brole=["']dialog["']/.test(source) &&
      /\baria-label(?:ledby)?=/.test(source)) ||
    (/\brole=["']dialog["']/.test(source) &&
      /\baria-modal=["']true["']/.test(source)) ||
    (/\brole=["']status["']/.test(source) &&
      /\baria-live=["']polite["']/.test(source))
  );
}

function isHandledStateFetch(file) {
  const source = readFindingSource(file);
  return (
    source.includes('catch') ||
    source.includes('response.ok') ||
    source.includes('window.location.reload()') ||
    source.includes('Keep the workspace usable')
  );
}

function isPointerCapabilityQuery(finding) {
  const line = readFindingLine(finding.file, finding.line);
  return (
    /\(\s*hover\s*:\s*(none|hover)\s*\)/.test(line) ||
    /hover:\\s\*(none|hover)/.test(line)
  );
}

function shouldReportFinding(finding) {
  if (!includeAll && !HIGH_SIGNAL_RULES.has(finding.rule)) return false;
  if (!includeAll && !includeTests && isTestOrFixture(finding.file))
    return false;
  if (!includeAll && finding.rule === 'a11y/modal-without-dialog') {
    return !hasProjectOverlayContract(finding.file);
  }
  if (!includeAll && finding.rule === 'no-focus-visible') {
    return !isPointerCapabilityQuery(finding);
  }
  if (!includeAll && finding.rule === 'state/missing-empty-or-error') {
    return !isHandledStateFetch(finding.file);
  }
  return true;
}

const filtered = includeAll ? findings : findings.filter(shouldReportFinding);

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = item[key] || 'unknown';
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

const summary = {
  detector: DETECTOR_PACKAGE,
  target,
  includeAll,
  includeTests,
  totalFindings: findings.length,
  reportedFindings: filtered.length,
  bySeverity: Object.fromEntries(countBy(filtered, 'severity')),
  topRules: countBy(filtered, 'rule').slice(0, 12),
  topFiles: countBy(
    filtered.map((finding) => ({
      ...finding,
      file: compactFile(finding.file)
    })),
    'file'
  ).slice(0, 12),
  findings: filtered.map((finding) => ({
    file: compactFile(finding.file),
    line: finding.line,
    severity: finding.severity,
    rule: finding.rule,
    description: finding.description,
    fix: finding.fix
  }))
};

if (jsonOutput) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(
    `UI Craft audit: ${summary.reportedFindings}/${summary.totalFindings} findings reported`
  );
  console.log(`Target: ${target}`);
  console.log('');
  console.log('By severity:');
  for (const [severity, count] of Object.entries(summary.bySeverity)) {
    console.log(`  ${severity}: ${count}`);
  }
  console.log('');
  console.log('Top rules:');
  for (const [rule, count] of summary.topRules) {
    console.log(`  ${rule}: ${count}`);
  }
  console.log('');
  console.log('Top files:');
  for (const [file, count] of summary.topFiles) {
    console.log(`  ${file}: ${count}`);
  }
  console.log('');
  console.log('Sample findings:');
  for (const finding of summary.findings.slice(0, 20)) {
    const location = finding.line
      ? `${finding.file}:${finding.line}`
      : finding.file;
    console.log(`  [${finding.severity}] ${finding.rule} ${location}`);
    console.log(`    ${finding.description}`);
  }
  console.log('');
  console.log(
    'Use --all for raw detector output, --json for automation, --strict for CI gating.'
  );
}

if (strict && filtered.length > 0) {
  process.exit(1);
}
