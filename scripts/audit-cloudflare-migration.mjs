import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const apiDir = path.join(repoRoot, 'api');
const outputDir = path.join(repoRoot, 'outputs');
const outputPath = path.join(
  repoRoot,
  'outputs',
  'cloudflare-migration-audit.md'
);

const HARD_BLOCKERS = [
  ['sharp', /from ['"]sharp['"]|import sharp from ['"]sharp['"]/],
  ['node-fs', /from ['"]node:fs['"]|from ['"]fs['"]|\bfs\./],
  [
    'child-process',
    /from ['"]child_process['"]|from ['"]node:child_process['"]/
  ],
  ['vercel-types', /@vercel\/node|VercelRequest|VercelResponse/],
  ['explicit-node-runtime', /runtime:\s*['"]nodejs['"]/]
];

const REVIEW_FLAGS = [
  ['stripe', /from ['"]stripe['"]|new Stripe\(/],
  ['buffer', /\bBuffer\b/],
  ['long-duration', /maxDuration:\s*(?:[6-9]\d|[1-9]\d{2,})/],
  [
    'large-body-or-stream',
    /arrayBuffer\(|ReadableStream|request\.body|FormData/
  ],
  ['cron-candidate', /CRON_SECRET|vercel-cron|scheduler|drain|grant-monthly/],
  ['supabase', /@supabase\/supabase-js|createClient\(/]
];

const VERIFIED_WORKER_ROUTES = new Set([
  'api/agent/batch-image-execute.ts',
  'api/agent/smart-chat.ts',
  'api/ai/gemini/thinking.ts',
  'api/analytics/conversion-report.ts',
  'api/image/prompt-optimize.ts',
  'api/membership/checkout.ts',
  'api/membership/portal.ts',
  'api/membership/webhook.ts',
  'api/marketing/email-drain.ts',
  'api/marketing/email-scheduler.ts',
  'api/prompt-og.ts',
  'api/prompt-assets/user/import-prompt.ts',
  'api/prompt-assets/user/thumbnail.ts',
  'api/prompt-assets/user/upload.ts',
  'api/video/drain.ts',
  'api/workspace/cards/weave.ts',
  'api/workspace/source-extract.ts',
  'api/workspace/studio-ai.ts',
  'api/workspace/studio-chart-image.ts',
  'api/workspace/studio-readiness.ts'
]);

const LEGACY_SUPPORT_ONLY = new Map([
  [
    'api/create-app-page.ts',
    'Production create-app SEO routes are rendered in the Worker from ASSETS/index.html; this Vercel wrapper remains for fallback compatibility.'
  ],
  [
    'api/prompt-page.ts',
    'Production prompt SEO routes are rendered in the Worker from ASSETS/index.html; this Vercel wrapper remains for fallback compatibility.'
  ],
  [
    'api/seo-page.ts',
    'Production SEO routes are rendered in the Worker from ASSETS/index.html; this Vercel wrapper remains for fallback compatibility.'
  ],
  [
    'api/sitemap.xml.ts',
    'Production /sitemap.xml and /api/sitemap are rendered in the Worker via api/sitemap-render.ts; this Vercel wrapper remains for fallback compatibility.'
  ],
  [
    'api/utils/edge-adapter.ts',
    'Vercel compatibility helper for remaining Node fallback routes; not an active production route.'
  ],
  [
    'api/nlm/proxy.ts',
    'Legacy support only: production /api/nlm/* traffic is proxied directly from the Cloudflare Worker to NLM_WORKER_URL.'
  ],
  [
    'api/seo-html.ts',
    'Node fs is isolated to legacy SEO fallback helpers; Worker imports api/seo-render-utils.ts instead.'
  ]
]);

const PARTIAL_WORKER_ROUTES = new Map([
  [
    'api/image/task.ts',
    'GET/OPTIONS task polling is served by Cloudflare Worker via api/image/task-status.ts; POST cancel/delete_failed is handled by api/image/cloudflare-task-actions.ts; POST retry remains on legacy for queued task cloning and credit-waiver compatibility.'
  ]
]);

const MIGRATION_NOTES = new Map([
  [
    'api/agent/batch-image-execute.ts',
    'Worker route verified after making Z-Image image download use Web APIs instead of Buffer.'
  ],
  [
    'api/agent/smart-chat.ts',
    'Worker route verified: Fetch/SSE implementation uses provider fetch calls and Supabase auth; skill-chat remains legacy for SDK/runtime-store SSE.'
  ],
  [
    'api/agent/skill-chat.ts',
    'Keep legacy-first: dynamic skill runtime, Anthropic SDK, runtime store, and Node/Vercel req/res SSE still need a Fetch-native skill bus split.'
  ],
  [
    'api/admin/prompt-case-drafts/generate-images.ts',
    'Worker-bundle compatible after the shared image generation path was converted to Web APIs for storage and metadata.'
  ],
  [
    'api/admin/prompt-case-drafts/import.ts',
    'Worker route verified: prompt case draft import uses Fetch APIs and admin auth only.'
  ],
  [
    'api/analytics/conversion-report.ts',
    'Worker route verified after converting the report to a Fetch handler with Supabase service-role reads.'
  ],
  [
    'api/image/generate.ts',
    'Worker route verified: generation enqueue and queued execution can run on Cloudflare; derivative thumbnails are skipped in the Worker-safe storage path.'
  ],
  [
    'api/image/drain.ts',
    'Worker route verified: Cloudflare Queue and scheduled cron call the local drain handler instead of the legacy Vercel origin.'
  ],
  [
    'api/image/task.ts',
    'Worker route verified: status polling, cancel/delete_failed, and retry task creation run on Cloudflare and enqueue follow-up work through Cloudflare Queues.'
  ],
  [
    'api/marketing/email-drain.ts',
    'Worker route verified after extracting Worker-safe marketing email helpers and Resend fetch sending.'
  ],
  [
    'api/marketing/email-scheduler.ts',
    'Worker route verified after adding a Fetch-native scheduler adapter; Cloudflare email campaign queue no longer calls the legacy Vercel origin.'
  ],
  [
    'api/prompt-assets/user/import-prompt.ts',
    'Worker route verified for auth/validation; provider reverse-prompt execution still needs authenticated long-duration smoke.'
  ],
  [
    'api/prompt-assets/user/thumbnail.ts',
    'Worker route verified for auth/Storage copy shape; authenticated smoke should cover real private image size and timeout behavior.'
  ],
  [
    'api/prompt-assets/user/upload.ts',
    'Worker route verified for auth/base64/Supabase upload shape; authenticated smoke should cover 8MB body and VLM timeout behavior.'
  ],
  [
    'api/prompt-og.ts',
    'Worker route verified: Cloudflare serves cached PNGs when present and returns a Worker-generated SVG social image on cache miss, so prompt OG no longer needs the legacy Vercel renderer.'
  ],
  [
    'api/ppt/generate.ts',
    'Keep legacy-first: PPTX rendering depends on pptxgenjs, require(), and nodebuffer/Buffer; request validation was split into a Worker-compatible helper.'
  ],
  [
    'api/sitemap.xml.ts',
    'Legacy support only: sitemap XML is now generated by the Cloudflare Worker from api/sitemap-render.ts.'
  ],
  [
    'api/video/drain.ts',
    'Worker route verified: Cloudflare video queue, inline drain, and cron drain use an env preflight and execute the Fetch handler directly when required secrets are present.'
  ],
  [
    'api/video/generate.ts',
    'Worker route verified: Cloudflare executes the Fetch handler directly and enqueues accepted tasks to VIDEO_JOBS without a Vercel round trip.'
  ],
  [
    'api/video/references/upload.ts',
    'Worker route verified: authenticated clients obtain scoped Supabase upload and read signatures for Seedance reference video and audio assets.'
  ],
  [
    'api/workspace/tasks/index.ts',
    'Keep legacy-first: long AI task execution and slide-deck image generation return large payloads and need a queue/runtime split.'
  ]
]);

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const fullPath = path.join(dir, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      entries.push(...walk(fullPath));
    } else if (fullPath.endsWith('.ts')) {
      entries.push(fullPath);
    }
  }
  return entries;
}

function firstMatch(regex, source) {
  const match = source.match(regex);
  return match ? match[0] : null;
}

function detectRuntime(source) {
  if (/runtime:\s*['"]nodejs['"]/.test(source)) return 'nodejs';
  if (/runtime:\s*['"]edge['"]/.test(source)) return 'edge';
  return 'unspecified';
}

function classify(record) {
  if (LEGACY_SUPPORT_ONLY.has(record.path)) return 'legacy-support';
  if (PARTIAL_WORKER_ROUTES.has(record.path)) return 'partial-worker';
  if (VERIFIED_WORKER_ROUTES.has(record.path)) return 'worker-candidate';
  if (record.blockers.length > 0) return 'legacy-first';
  if (
    record.flags.includes('stripe') ||
    record.flags.includes('long-duration')
  ) {
    return 'verify-before-worker';
  }
  if (record.runtime === 'edge' || record.runtime === 'unspecified') {
    return 'worker-candidate';
  }
  return 'verify-before-worker';
}

function toRelative(filePath) {
  return path.relative(repoRoot, filePath);
}

const records = walk(apiDir).map((filePath) => {
  const source = readFileSync(filePath, 'utf8');
  const blockers = HARD_BLOCKERS.filter(([, regex]) => regex.test(source)).map(
    ([label]) => label
  );
  const flags = REVIEW_FLAGS.filter(([, regex]) => regex.test(source)).map(
    ([label]) => label
  );
  const runtime = detectRuntime(source);
  const maxDuration =
    firstMatch(/maxDuration:\s*\d+/, source)
      ?.split(':')[1]
      ?.trim() || '';
  const record = {
    path: toRelative(filePath),
    runtime,
    maxDuration,
    blockers,
    flags
  };
  return {
    ...record,
    classification: classify(record)
  };
});

records.sort((a, b) => {
  const order = {
    'worker-candidate': 0,
    'partial-worker': 1,
    'verify-before-worker': 2,
    'legacy-first': 3,
    'legacy-support': 4
  };
  return (
    order[a.classification] - order[b.classification] ||
    a.path.localeCompare(b.path)
  );
});

const groups = records.reduce((acc, record) => {
  acc[record.classification] ||= [];
  acc[record.classification].push(record);
  return acc;
}, {});

const lines = [
  '# Cloudflare Migration API Audit',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  'This is a mechanical migration inventory. Treat it as a routing checklist, then verify behavior with real requests.',
  '',
  '| Classification | Count | Meaning |',
  '|---|---:|---|',
  `| worker-candidate | ${groups['worker-candidate']?.length || 0} | Likely safe for Cloudflare Worker after env access is normalized. |`,
  `| partial-worker | ${groups['partial-worker']?.length || 0} | Production route is split: safe methods run on Worker, legacy keeps mutation or heavy execution fallback. |`,
  `| verify-before-worker | ${groups['verify-before-worker']?.length || 0} | Possible Worker target, but needs focused compatibility tests. |`,
  `| legacy-first | ${groups['legacy-first']?.length || 0} | Keep behind legacy Vercel/Node origin first. |`,
  `| legacy-support | ${groups['legacy-support']?.length || 0} | Kept for fallback compatibility, but not counted as active migration backlog. |`,
  '',
  ...[
    'worker-candidate',
    'partial-worker',
    'verify-before-worker',
    'legacy-first',
    'legacy-support'
  ].flatMap((group) => {
    const items = groups[group] || [];
    return [
      `## ${group}`,
      '',
      '| API file | Runtime | maxDuration | Blockers | Review flags | Migration note |',
      '|---|---|---:|---|---|---|',
      ...items.map((item) => {
        return `| \`${item.path}\` | ${item.runtime} | ${item.maxDuration || ''} | ${item.blockers.join(', ') || ''} | ${item.flags.join(', ') || ''} | ${MIGRATION_NOTES.get(item.path) || PARTIAL_WORKER_ROUTES.get(item.path) || LEGACY_SUPPORT_ONLY.get(item.path) || ''} |`;
      }),
      ''
    ];
  })
];

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, `${lines.join('\n')}\n`);
console.log(`Wrote ${toRelative(outputPath)}`);
console.log(
  JSON.stringify(
    {
      total: records.length,
      workerCandidate: groups['worker-candidate']?.length || 0,
      partialWorker: groups['partial-worker']?.length || 0,
      verifyBeforeWorker: groups['verify-before-worker']?.length || 0,
      legacyFirst: groups['legacy-first']?.length || 0,
      legacySupport: groups['legacy-support']?.length || 0
    },
    null,
    2
  )
);
