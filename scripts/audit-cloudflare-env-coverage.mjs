/* global process */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { applyCloudflareCredential } from './lib/cloudflare-credentials.mjs';
import { getRuntimeProductionEnvPath } from './lib/runtime-production-env.mjs';

const repoRoot = process.cwd();
applyCloudflareCredential('workers');
const wranglerConfig = path.join(repoRoot, 'workers/webtomind.wrangler.toml');
const outputPath = path.join(repoRoot, 'outputs/cloudflare-env-coverage.md');

const runtimeFiles = [
  'workers/webtomind.ts',
  'api/image/generate.ts',
  'api/image/drain.ts',
  'api/image/task-runner.ts',
  'api/image/providers/openai-compatible-image.ts',
  'api/image/generate/tuzi-routing.ts',
  'api/moodboards/visual-analysis.ts',
  'api/video/drain.ts',
  'api/video/task-runner.ts',
  'api/video/generate.ts',
  'api/video/task.ts',
  'src/shared/ark-video-api.ts',
  'api/marketing/email-scheduler.ts',
  'api/marketing/email-drain.ts',
  'api/marketing/email-utils.ts',
  'api/marketing/email-worker-utils.ts'
];

const homeConfigEnv = getRuntimeProductionEnvPath();

const localEnvFiles = [
  homeConfigEnv,
  'server/.env',
  '.env',
  '.env.production'
];

const optionalRuntimeBindings = new Set([
  'ASSETS',
  'IMAGES',
  'MEDIA_BUCKET',
  'WEBTOMIND_PUBLIC_CACHE',
  'HYPERDRIVE',
  'IMAGE_JOBS',
  'IMAGE_JOBS_DLQ',
  'VIDEO_JOBS',
  'VIDEO_JOBS_DLQ',
  'EMAIL_CAMPAIGN_JOBS',
  'EMAIL_CAMPAIGN_JOBS_DLQ'
]);

const runtimeInjectedVars = new Set([
  'WEBTOMIND_RUNTIME',
  'WEBTOMIND_IMAGE_RUNTIME'
]);

const optionalPlatformVars = new Set([
  'NODE_ENV',
  'VERCEL',
  'VERCEL_URL',
  'HYPERDRIVE_DIAGNOSTIC_ENABLED',
  'HYPERDRIVE_PUBLIC_STATS_ENABLED',
  'PORT'
]);

const optionalDefaultedVars = new Set([
  'CHAOJITUDOU_REAL_TASK_SMOKE_ENABLED',
  'CHAOJITUDOU_IMAGE_TASK_REQUEST_TIMEOUT_MS',
  'CHAOJITUDOU_IMAGE_TASK_RESUME_EXTRA_SECS',
  'CHAOJITUDOU_IMAGE_TASK_RESUME_LIMIT',
  'IMAGE_TASK_AUTO_RETRY_MISSING_IMAGES',
  'IMAGE_REFERENCE_BUCKET',
  'GENERATED_IMAGE_BUCKET',
  'GENERATED_VIDEO_BUCKET',
  'IMAGE_DRAIN_SECRET',
  'NLM_PROXY_SECRET',
  'PUBLIC_SITE_URL',
  'NEXT_PUBLIC_SITE_URL',
  'VITE_PUBLIC_SITE_URL',
  'ARK_VIDEO_API_BASE_URL',
  'ARK_VIDEO_CREATE_PATH',
  'ARK_VIDEO_GENERATION_ENABLED',
  'ARK_VIDEO_LAUNCH_ENABLED',
  'ARK_VIDEO_STATUS_PATH_TEMPLATE',
  'TUZI_OFFICIAL_API_BASE_URL',
  'TUZI_OFFICIAL_DISCOUNT_API_BASE_URL',
  'MARKETING_CASE_DIGEST_WEEKDAYS',
  'MARKETING_OFFER_WEEKDAYS',
  'MARKETING_OFFER_LABEL_EN',
  'MARKETING_OFFER_LABEL_ZH',
  'MARKETING_OFFER_DETAIL_EN',
  'MARKETING_OFFER_DETAIL_ZH',
  'MARKETING_EMAIL_GENERATE_IMAGES',
  'MARKETING_EMAIL_IMAGE_MODEL',
  'MARKETING_EMAIL_IMAGE_SIZE',
  'MARKETING_EMAIL_IMAGE_QUALITY',
  'MARKETING_EMAIL_FROM',
  'DASHSCOPE_API_KEY',
  'GEMINI_IMAGE_MODEL',
  'GOOGLE_GEMINI_API_KEY',
  'IMAGE_DRAIN_BATCH_SIZE',
  'IMAGE_DRAIN_CONCURRENCY',
  'KRILL_API_BASE_URL',
  'KRILL_API_KEY',
  'KRILL_DISABLE_TUZI_FALLBACK',
  'KRILL_IMAGE_API_BASE_URL',
  'KRILL_IMAGE_API_KEY',
  'KRILL_IMAGE_1K_ENABLED',
  'KRILL_IMAGE_2K_ENABLED',
  'KRILL_IMAGE_4K_ENABLED',
  'KRILL_IMAGE_MODEL',
  'KRILL_IMAGE_MODEL_2K',
  'KRILL_IMAGE_MODEL_4K',
  'OPENAI_COMPAT_IMAGE_DISABLE_TUZI_FALLBACK',
  'OPENAI_COMPAT_IMAGE_FALLBACK_MODEL',
  'OPENAI_COMPAT_IMAGE_TIMEOUT_MS',
  'OPENAI_DISABLE_TUZI_FALLBACK',
  'CLOUDFLARE_AI_GATEWAY_RUN_TOKEN',
  'WEBTOMIND_ENABLE_LEGACY_IMAGE_EXECUTION',
  'TUZI_CHANNEL_CONNECTION',
  'TUZI_DISABLE_IMAGE_GROUP',
  'TUZI_IMAGE_GROUP',
  'TUZI_GROUP',
  'TUZI_TEXT_CHANNEL_CONNECTION',
  'TUZI_TEXT_API_KEY',
  'TUZI_TEXT_BASE_URL',
  'TUZI_VLM_MODEL',
  'OPENAI_VLM_MODEL',
  'MOODBOARD_ANALYSIS_PROVIDER',
  'MOODBOARD_ANALYSIS_MODEL',
  'MOODBOARD_ANALYSIS_TUZI_MODEL',
  'TUZI_DISABLED_CHANNELS',
  'TUZI_DISABLED_IMAGE_CHANNELS',
  'TUZI_ENABLE_OFFICIAL_DISCOUNT_FALLBACK',
  'TUZI_FALLBACK_IMAGE_MODEL',
  'TUZI_IMAGE_CHANNEL_CONNECTION',
  'TUZI_IMAGE_CHANNEL_ORDER',
  'TUZI_IMAGE_FALLBACK_MODELS',
  'TUZI_IMAGE_MODEL',
  'TUZI_NEWAPI_CHANNEL_CONNECTION',
  'TUZI_OFFICIAL_DISCOUNT_IMAGE_MODEL',
  'TUZI_OFFICIAL_IMAGE_MODEL',
  'TUZI_OPENAI_API_BASE_URL',
  'TUZI_OPENAI_API_KEY',
  'TUZI_OPENAI_IMAGE_MODEL',
  'TUZI_OPENAI_ORIGINAL_API_BASE_URL',
  'TUZI_OPENAI_ORIGINAL_API_KEY',
  'TUZI_OPENAI_ORIGINAL_IMAGE_MODEL'
]);

const videoProviderAlternatives = ['ARK_API_KEY'];

function readText(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function collectRuntimeEnvNames() {
  const names = new Set();
  for (const file of runtimeFiles) {
    const text = readText(file);
    for (const match of text.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      names.add(match[1]);
    }
    for (const match of text.matchAll(/env\.([A-Z0-9_]+)/g)) {
      names.add(match[1]);
    }
  }
  return names;
}

function collectWranglerVars() {
  const text = readFileSync(wranglerConfig, 'utf8');
  const vars = new Set();
  const varsBlock = text.match(/\[vars\]([\s\S]*?)(?:\n\[|\n\[\[|$)/);
  if (!varsBlock) return vars;
  for (const match of varsBlock[1].matchAll(/^\s*([A-Z0-9_]+)\s*=/gm)) {
    vars.add(match[1]);
  }
  return vars;
}

function collectCloudflareSecrets() {
  try {
    const args = ['secret', 'list', '--config', wranglerConfig];
    let stdout;
    try {
      stdout = execFileSync(process.env.WRANGLER_BIN || 'wrangler', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      if (!(error && typeof error === 'object' && error.code === 'ENOENT')) {
        throw error;
      }
      stdout = execFileSync('npx', ['wrangler', ...args], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
    }
    const jsonStart = stdout.indexOf('[');
    if (jsonStart < 0) {
      throw new Error('Wrangler secret list did not return a JSON array');
    }
    const rows = JSON.parse(stdout.slice(jsonStart));
    return new Set(rows.map((row) => row.name).filter(Boolean));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}

function collectLocalEnvNames() {
  const byFile = new Map();
  for (const envFile of localEnvFiles) {
    if (!envFile) continue;
    const absolute = path.isAbsolute(envFile)
      ? envFile
      : path.join(repoRoot, envFile);
    if (!existsSync(absolute)) continue;
    const names = new Set();
    const text = readFileSync(absolute, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (match) names.add(match[1]);
    }
    byFile.set(envFile, names);
  }
  return byFile;
}

function formatList(values) {
  const rows = [...values].sort();
  return rows.length
    ? rows.map((name) => `- \`${name}\``).join('\n')
    : '- None';
}

function unionSets(...sets) {
  const result = new Set();
  for (const set of sets) {
    for (const value of set) result.add(value);
  }
  return result;
}

const runtimeNames = collectRuntimeEnvNames();
const wranglerVars = collectWranglerVars();
const cloudflareSecretResult = collectCloudflareSecrets();
const cloudflareSecrets =
  cloudflareSecretResult instanceof Set ? cloudflareSecretResult : new Set();
const localEnvNamesByFile = collectLocalEnvNames();
const localEnvNames = unionSets(...localEnvNamesByFile.values());
const cloudflareConfigured = unionSets(wranglerVars, cloudflareSecrets);

const requiredRuntimeNames = [...runtimeNames].filter(
  (name) =>
    !optionalRuntimeBindings.has(name) &&
    !runtimeInjectedVars.has(name) &&
    !optionalPlatformVars.has(name) &&
    !optionalDefaultedVars.has(name) &&
    !videoProviderAlternatives.includes(name)
);
const missingRequiredInCloudflare = requiredRuntimeNames.filter(
  (name) => !cloudflareConfigured.has(name)
);
const missingRequiredInLocalRuntimeEnv = requiredRuntimeNames.filter(
  (name) => !wranglerVars.has(name) && !localEnvNames.has(name)
);
const missingOptionalInCloudflare = [...runtimeNames]
  .filter((name) => optionalDefaultedVars.has(name))
  .filter((name) => !cloudflareConfigured.has(name));
const missingVideoAlternatives = videoProviderAlternatives.filter(
  (name) => !cloudflareConfigured.has(name)
);
const missingRequiredGroups =
  missingVideoAlternatives.length === videoProviderAlternatives.length
    ? [videoProviderAlternatives.join('|')]
    : [];

const lines = [
  '# Cloudflare Env Coverage Audit',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  'This report lists environment variable names only. It intentionally does not read or print secret values.',
  '',
  '## Cloudflare Coverage',
  '',
  `- Runtime env names scanned: ${runtimeNames.size}`,
  `- Wrangler [vars] names: ${wranglerVars.size}`,
  `- Cloudflare secret names: ${cloudflareSecrets.size}`,
  `- Missing required runtime names in Cloudflare config/secrets: ${
    missingRequiredInCloudflare.length + missingRequiredGroups.length
  }`,
  '',
  '### Missing Required In Cloudflare',
  '',
  formatList([...missingRequiredInCloudflare, ...missingRequiredGroups]),
  '',
  '### Missing Optional Or Defaulted In Cloudflare',
  '',
  formatList(missingOptionalInCloudflare),
  '',
  '### Video Provider Key Alternatives',
  '',
  missingVideoAlternatives.length === videoProviderAlternatives.length
    ? '- No supported video provider key name is present in Cloudflare secrets.'
    : `- Present: ${videoProviderAlternatives
        .filter((name) => cloudflareConfigured.has(name))
        .map((name) => `\`${name}\``)
        .join(', ')}`,
  '',
  'Supported alternatives:',
  formatList(videoProviderAlternatives),
  '',
  '## Local Runtime Credential Coverage',
  '',
  localEnvNamesByFile.size
    ? [...localEnvNamesByFile.entries()]
        .map(([file, names]) => `- \`${file}\`: ${names.size} variable name(s)`)
        .join('\n')
    : '- No local runtime credential files found.',
  '',
  '### Missing From Local Dumps',
  '',
  formatList(missingRequiredInLocalRuntimeEnv),
  '',
  '## Required Follow-Up',
  '',
  '- Maintain platform-neutral production credentials in `~/.config/webtomind/runtime-production.env` without committing it.',
  '- Sync only missing Cloudflare secret values with `pnpm cf:credentials:exec -- workers -- npx wrangler secret put NAME --config workers/webtomind.wrangler.toml`.',
  '- Never paste secret values into chat or commit env files.',
  '- Rerun `pnpm cf:audit:env` before changing Worker provider routing.'
];

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${lines.join('\n')}\n`);
console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
console.log(
  JSON.stringify(
    {
      runtimeNames: runtimeNames.size,
      wranglerVars: wranglerVars.size,
      cloudflareSecrets: cloudflareSecrets.size,
      missingRequiredInCloudflare: [
        ...missingRequiredInCloudflare,
        ...missingRequiredGroups
      ],
      missingOptionalInCloudflare,
      missingRequiredInLocalRuntimeEnv,
      cloudflareSecretListError:
        cloudflareSecretResult instanceof Set
          ? undefined
          : cloudflareSecretResult.error
    },
    null,
    2
  )
);
