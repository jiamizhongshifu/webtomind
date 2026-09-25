import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const NON_APPLICABLE_ADVISORIES = new Map([
  [
    'GHSA-qwww-vcr4-c8h2',
    {
      moduleName: 'react-router',
      reason:
        'The advisory only affects unstable React Router RSC APIs; this application uses browser library mode.'
    }
  ],
  [
    'GHSA-w3rx-r6r6-pgpr',
    {
      moduleName: 'image-size',
      reason:
        'image-size 1.2.1 is pulled in by pptxgenjs 4.0.1, whose only call site (getSizeFromImage) is commented out as unused in the shipped dist bundle; no patched version exists (affected <= 2.0.2). Exemption fails closed if image-size usage appears.'
    }
  ],
  [
    'GHSA-5p2g-fcmc-qvqq',
    {
      moduleName: 'image-size',
      reason:
        'image-size 1.2.1 is pulled in by pptxgenjs 4.0.1, whose only call site (getSizeFromImage) is commented out as unused in the shipped dist bundle; no patched version exists (affected <= 2.0.2). Exemption fails closed if image-size usage appears.'
    }
  ]
]);

const RSC_SIGNAL_PATTERNS = [
  /@vitejs\/plugin-rsc/u,
  /@react-router\/dev\/config\/default-rsc-entries/u,
  /unstable_reactRouterRSC/u,
  /unstable_[A-Za-z0-9_]*RSC[A-Za-z0-9_]*/u,
  /\bentry\.rsc\.[cm]?[jt]sx?\b/u
];

const IMAGE_SIZE_USAGE_PATTERNS = [
  /from\s+['"]image-size['"]/u,
  /import\s*\(\s*['"]image-size['"]\s*\)/u,
  /require\(\s*['"]image-size['"]\s*\)/u
];

const AUDIT_SOURCE_PREFIXES = [
  'api/',
  'config/',
  'scripts/',
  'server/',
  'src/',
  'workers/'
];

const AUDIT_ROOT_FILES = new Set([
  'package.json',
  'vite.config.web.ts',
  'vitest.config.ts'
]);

const AUDIT_GUARD_IMPLEMENTATION_FILES = new Set([
  'scripts/audit-production-dependencies.mjs',
  'scripts/audit-production-dependencies.test.mjs'
]);

const AUDIT_SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?|json)$/u;

const AUDIT_SEVERITY_RANK = new Map([
  ['low', 1],
  ['moderate', 2],
  ['high', 3],
  ['critical', 4]
]);

function meetsAuditLevel(severity, auditLevel = 'moderate') {
  return (
    (AUDIT_SEVERITY_RANK.get(severity) || 0) >=
    (AUDIT_SEVERITY_RANK.get(auditLevel) || 0)
  );
}

export function shouldInspectAuditSource(filePath) {
  if (AUDIT_GUARD_IMPLEMENTATION_FILES.has(filePath)) return false;
  if (AUDIT_ROOT_FILES.has(filePath)) return true;
  return (
    AUDIT_SOURCE_PREFIXES.some((prefix) => filePath.startsWith(prefix)) &&
    AUDIT_SOURCE_EXTENSION.test(filePath) &&
    !filePath.endsWith('.test.ts') &&
    !filePath.endsWith('.test.tsx') &&
    !filePath.endsWith('.test.mjs')
  );
}

function findSignalsInFiles(files, patterns) {
  const signals = [];
  for (const [filePath, source] of Object.entries(files)) {
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (!match) continue;
      signals.push(`${filePath}: ${match[0]}`);
      break;
    }
  }
  return signals;
}

export function findRscSignalsInFiles(files) {
  return findSignalsInFiles(files, RSC_SIGNAL_PATTERNS);
}

export function findImageSizeSignalsInFiles(files) {
  return findSignalsInFiles(files, IMAGE_SIZE_USAGE_PATTERNS);
}

export function evaluateAuditReport(
  report,
  { rscSignals = [], imageSizeSignals = [], auditLevel = 'moderate' } = {}
) {
  const advisories = Object.values(report?.advisories || {}).filter((advisory) =>
    meetsAuditLevel(advisory?.severity, auditLevel)
  );
  const ignored = [];
  const actionable = [];

  for (const advisory of advisories) {
    const ghsa = advisory?.github_advisory_id;
    const exemption = NON_APPLICABLE_ADVISORIES.get(ghsa);
    const matchesExemption =
      exemption && advisory?.module_name === exemption.moduleName;
    const exemptionBlocked =
      (exemption?.moduleName === 'react-router' && rscSignals.length > 0) ||
      (exemption?.moduleName === 'image-size' && imageSizeSignals.length > 0);

    if (matchesExemption && !exemptionBlocked) {
      ignored.push({ advisory, reason: exemption.reason });
      continue;
    }

    actionable.push({
      advisory,
      reason:
        matchesExemption && exemptionBlocked
          ? exemption.moduleName === 'image-size'
            ? `image-size usage guard found: ${imageSizeSignals.join(', ')}`
            : `RSC usage guard found: ${rscSignals.join(', ')}`
          : ''
    });
  }

  return { ignored, actionable };
}

function listTrackedAuditSources(cwd) {
  const result = spawnSync('git', ['ls-files', '-z'], {
    cwd,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(
      `Unable to list tracked files for the RSC usage guard: ${result.stderr.trim()}`
    );
  }

  return result.stdout
    .split('\0')
    .filter(Boolean)
    .filter(shouldInspectAuditSource);
}

function readTrackedAuditSources(cwd) {
  return Object.fromEntries(
    listTrackedAuditSources(cwd).map((filePath) => [
      filePath,
      readFileSync(fileURLToPath(new URL(filePath, `file://${cwd}/`)), 'utf8')
    ])
  );
}

function renderAdvisory(advisory) {
  const ghsa = advisory?.github_advisory_id || 'unknown advisory';
  const moduleName = advisory?.module_name || 'unknown package';
  const severity = advisory?.severity || 'unknown severity';
  const title = advisory?.title || 'No advisory title';
  return `${severity.toUpperCase()} ${ghsa} ${moduleName}: ${title}`;
}

export function runAudit({ cwd = process.cwd() } = {}) {
  const audit = spawnSync(
    'pnpm',
    ['audit', '--prod', '--audit-level=moderate', '--json'],
    {
      cwd,
      encoding: 'utf8',
      env: process.env
    }
  );

  if (audit.error) throw audit.error;

  let report;
  try {
    report = JSON.parse(audit.stdout || '{}');
  } catch {
    throw new Error(
      `pnpm audit returned invalid JSON.\n${audit.stdout}\n${audit.stderr}`
    );
  }

  const auditSources = readTrackedAuditSources(cwd);
  const rscSignals = findRscSignalsInFiles(auditSources);
  const imageSizeSignals = findImageSizeSignalsInFiles(auditSources);
  const result = evaluateAuditReport(report, { rscSignals, imageSizeSignals });

  for (const item of result.ignored) {
    console.warn(`IGNORED ${renderAdvisory(item.advisory)}`);
    console.warn(`Reason: ${item.reason}`);
  }

  if (result.actionable.length > 0) {
    for (const item of result.actionable) {
      console.error(`FAIL ${renderAdvisory(item.advisory)}`);
      if (item.reason) console.error(item.reason);
    }
    return 1;
  }

  if (audit.status !== 0 && result.ignored.length === 0) {
    console.error(audit.stderr || 'pnpm audit failed without an advisory.');
    return audit.status || 1;
  }

  console.log(
    `PASS production dependency audit (${result.ignored.length} verified non-applicable advisory exemption${result.ignored.length === 1 ? '' : 's'}).`
  );
  return 0;
}

const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url) ===
    fileURLToPath(new URL(process.argv[1], 'file://'));

if (isDirectRun) {
  try {
    process.exitCode = runAudit();
  } catch (error) {
    console.error(
      error instanceof Error ? error.stack || error.message : String(error)
    );
    process.exitCode = 1;
  }
}
