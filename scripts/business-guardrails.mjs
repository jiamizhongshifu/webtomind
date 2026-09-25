#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadObservedImageGenerationMetrics } from './lib/image-generation-observed-metrics.mjs';
import {
  evaluateImageGenerationHealth,
  getImageGenerationHealthPolicy
} from './lib/image-generation-health-policy.mjs';

const root = process.cwd();
const observedGeneration = await loadObservedImageGenerationMetrics({
  days: 30
});
const minGrossMargin = readNumberEnv('BUSINESS_MIN_GROSS_MARGIN', 0.4);
const marginWarningBuffer = readNumberEnv(
  'BUSINESS_MARGIN_WARNING_BUFFER',
  0.1
);
const assumptions = {
  baseCogs: readNumberEnv('IMAGE_COGS_BASE_USD', 0.018),
  twoKCogs: readNumberEnv('IMAGE_COGS_2K_USD', 0.028),
  fourKCogs: readNumberEnv('IMAGE_COGS_4K_USD', 0.084),
  mediumCogs: readNumberEnv('IMAGE_COGS_MEDIUM_USD', 0.053),
  highCogs: readNumberEnv('IMAGE_COGS_HIGH_USD', 0.211),
  upscaleCogs: readNumberEnv('IMAGE_UPSCALE_COGS_USD', 0),
  videoTokensPerSecond: readPositiveNumberEnv(
    'VIDEO_COGS_TOKENS_PER_SECOND',
    10_500
  ),
  videoCnyPerUsd: readPositiveNumberEnv('VIDEO_COGS_CNY_PER_USD', 7),
  videoOperationalOverheadRate: readNumberEnv(
    'VIDEO_COGS_OPERATIONAL_OVERHEAD_RATE',
    0.1
  ),
  seedanceTokenRatesCnyPerMillion: {
    'seedance-2-5': readPositiveNumberEnv(
      'VIDEO_COGS_SEEDANCE_2_5_CNY_PER_MILLION_TOKENS',
      70
    ),
    'seedance-2-0': readPositiveNumberEnv(
      'VIDEO_COGS_SEEDANCE_2_0_CNY_PER_MILLION_TOKENS',
      46
    ),
    'seedance-2-0-fast': readPositiveNumberEnv(
      'VIDEO_COGS_SEEDANCE_2_0_FAST_CNY_PER_MILLION_TOKENS',
      37
    ),
    'seedance-2-0-mini': readPositiveNumberEnv(
      'VIDEO_COGS_SEEDANCE_2_0_MINI_CNY_PER_MILLION_TOKENS',
      23
    )
  },
  seedanceVideoCogsSource:
    'Volcengine 2.5 public token rates (70 CNY/M without video input, 42 with video input; published 2026-07-30), observed 480p usage',
  failureRate: readObservedOrOverride(
    'IMAGE_FAILURE_RATE',
    observedGeneration.failureRate,
    0.12
  ),
  retryRate: readObservedOrOverride(
    'IMAGE_RETRY_RATE',
    observedGeneration.retryRate,
    0.15
  ),
  refundRate: readObservedOrOverride(
    'IMAGE_REFUND_RATE',
    observedGeneration.refundRate,
    0.08
  )
};

const creditPolicy = readFile('src/shared/credit-policy.ts');
const pricingCatalog = readFile('src/shared/pricing-catalog.ts');
const clientPricing = readFile('src/workspace/components/PricingPage.tsx');
const rechargePage = readFile('src/web/pages/RechargeRoutePage.tsx');
const creditPackages = readFile('api/credits/packages.ts');
const imagePricing = readFile('src/shared/image-generation-pricing.ts');
const videoPricing = readFile('src/shared/video-generation-pricing.ts');
const videoModels = readFile('src/shared/seedance-video-models.ts');
const referralRewards = readFile('src/shared/referral-rewards.ts');
const referralRewardMigration = readFile(
  'supabase/migrations/20260721190000_rebalance_referral_rewards.sql'
);
const supabasePricingMigration = readFile(
  'supabase/migrations/20260804213000_rebalance_image_quality_and_credit_packages.sql'
);
const serverPricingMigration = readFile(
  'server/migrations/098_rebalance_image_quality_and_credit_packages.sql'
);
const supabaseYearlyPricingMigration = readFile(
  'supabase/migrations/20260812100000_annual_discount_30_percent.sql'
);
const serverYearlyPricingMigration = readFile(
  'server/migrations/099_annual_discount_30_percent.sql'
);
const supabasePastDuePolicyMigration = readFile(
  'supabase/migrations/20260721090000_fail_closed_past_due_entitlements.sql'
);
const serverPastDuePolicyMigration = readFile(
  'server/migrations/096_fail_closed_past_due_entitlements.sql'
);
const supabaseImageTaskLeaseMigration = readFile(
  'supabase/migrations/20260721091500_image_task_atomic_lease.sql'
);
const serverImageTaskLeaseMigration = readFile(
  'server/migrations/097_image_task_atomic_lease.sql'
);

const freeDailyCredits = readConstNumber(creditPolicy, 'FREE_DAILY_CREDITS');
const freeDailyImageLimit = readConstNumber(
  creditPolicy,
  'FREE_DAILY_IMAGE_GENERATION_LIMIT'
);
const baseImageCost = readConstNumber(
  imagePricing,
  'IMAGE_GENERATION_BASE_CREDIT_COST'
);
const twoKImageCost = readConstNumber(
  imagePricing,
  'IMAGE_GENERATION_LARGE_2K_CREDIT_COST'
);
const fourKImageCost = readConstNumber(
  imagePricing,
  'IMAGE_GENERATION_4K_CREDIT_COST'
);
const mediumQualityFloor = readConstNumber(
  imagePricing,
  'IMAGE_GENERATION_MEDIUM_QUALITY_CREDIT_FLOOR'
);
const highQualityFloor = readConstNumber(
  imagePricing,
  'IMAGE_GENERATION_HIGH_QUALITY_CREDIT_FLOOR'
);
const videoBaseUnitCost = readConstNumber(
  videoPricing,
  'VIDEO_GENERATION_BASE_UNIT_CREDIT_COST'
);
const videoBaseUnitSeconds = readConstNumber(
  videoPricing,
  'VIDEO_GENERATION_BASE_UNIT_SECONDS'
);
const videoReferenceSurcharge = readConstNumber(
  videoPricing,
  'VIDEO_GENERATION_REFERENCE_IMAGE_SURCHARGE'
);
const videoMinCost = readConstNumber(
  videoPricing,
  'VIDEO_GENERATION_MIN_CREDIT_COST'
);
const seedanceModelMultipliers = readSeedanceModelMultipliers(videoModels);
const seedanceHdMultipliers = readSeedanceHdMultipliers(videoPricing);
const referralActivationCredits = readConstNumber(
  referralRewards,
  'REFERRAL_REWARD_CREDITS'
);
const referralSubscriptionCredits = readConstNumber(
  referralRewards,
  'REFERRAL_SUBSCRIPTION_REWARD_CREDITS'
);

const packageRows = readCreditPackages(creditPackages);
const planRows = [
  ...readPlanCredits(pricingCatalog, 'src/shared/pricing-catalog.ts'),
  ...readPlanCredits(clientPricing, 'src/workspace/components/PricingPage.tsx')
];

const imageScenarios = [
  {
    mediaType: 'image',
    name: 'image base auto',
    credits: baseImageCost,
    cogs: assumptions.baseCogs
  },
  {
    mediaType: 'image',
    name: 'image 2K auto',
    credits: twoKImageCost,
    cogs: assumptions.twoKCogs
  },
  {
    mediaType: 'image',
    name: 'image 4K auto',
    credits: fourKImageCost,
    cogs: assumptions.fourKCogs + assumptions.upscaleCogs
  },
  {
    mediaType: 'image',
    name: 'image medium quality',
    credits: mediumQualityFloor,
    cogs: assumptions.mediumCogs
  },
  {
    mediaType: 'image',
    name: 'image high quality',
    credits: highQualityFloor,
    cogs: assumptions.highCogs
  }
];
const videoScenarios = Object.keys(seedanceModelMultipliers).flatMap((model) =>
  [
    { duration: 5, resolution: '480p' },
    { duration: 15, resolution: '480p' },
    { duration: 5, resolution: '720p' },
    { duration: 15, resolution: '720p' }
  ].map(({ duration, resolution }) => ({
    mediaType: 'video',
    name: `video ${model} ${duration}s ${resolution}`,
    credits: estimateVideoCredits({ model, duration, resolution }),
    cogs: estimateSeedanceVideoCogs({ model, duration, resolution })
  }))
);
const scenarios = [...imageScenarios, ...videoScenarios];

const blockers = [];
const warnings = [];
const evaluatedMargins = [];
const imageHealthEvaluation = evaluateImageGenerationHealth(
  observedGeneration,
  getImageGenerationHealthPolicy()
);

blockers.push(...imageHealthEvaluation.blockers);
warnings.push(...imageHealthEvaluation.warnings);

if (!observedGeneration.ok) {
  blockers.push({
    class: 'generation_observed_metrics_unknown',
    detail: `Recent server task facts are ${observedGeneration.status}; gross-margin safety cannot be confirmed from fallback assumptions.`
  });
}

if (observedGeneration.providerBilledLossUsd === null) {
  warnings.push({
    class: 'provider_billed_loss_unknown',
    detail:
      'Provider invoice reconciliation is not integrated; provider-billed losses remain unknown.'
  });
}

if (/const\s+fallbackPackages\s*[:=]/.test(rechargePage)) {
  blockers.push({
    class: 'client_credit_package_price_fallback',
    detail:
      'RechargeRoutePage must fail closed when live package prices are unavailable; client-owned fallback prices can diverge from checkout.'
  });
}

if (freeDailyImageLimit > Math.floor(freeDailyCredits / baseImageCost)) {
  blockers.push({
    class: 'free_quota_mismatch',
    detail: `free daily image limit ${freeDailyImageLimit} exceeds the ${Math.floor(
      freeDailyCredits / baseImageCost
    )} base generations covered by ${freeDailyCredits} daily credits`
  });
}

for (const item of [...packageRows, ...planRows]) {
  const applicableScenarios = scenarios;
  const rows = applicableScenarios.map((scenario) =>
    evaluateMargin({
      source: item.name,
      cents: item.cents,
      credits: item.credits,
      scenario
    })
  );
  evaluatedMargins.push(...rows);
  const failed = rows.filter((row) => row.grossMargin < minGrossMargin);
  if (failed.length > 0) {
    const requiredUnitPrice = Math.max(
      ...applicableScenarios.map((scenario) =>
        requiredCreditUnitPrice(scenario)
      )
    );
    const requiredCents = Math.ceil(requiredUnitPrice * item.credits * 100);
    const maxCreditsAtCurrentPrice = Math.floor(
      item.cents / 100 / requiredUnitPrice
    );
    blockers.push({
      class: item.kind,
      source: item.name,
      detail: `below ${formatPercent(minGrossMargin)} margin for ${failed
        .map((row) => `${row.scenario} (${formatPercent(row.grossMargin)})`)
        .join(', ')}`,
      recommendation: {
        minPriceCentsForCurrentCredits: requiredCents,
        maxCreditsAtCurrentPrice
      }
    });
  }
}

const videoMargins = evaluatedMargins
  .filter((row) => row.mediaType === 'video')
  .sort((left, right) => left.grossMargin - right.grossMargin);
const weakestVideoMargin = videoMargins[0];
if (
  weakestVideoMargin &&
  weakestVideoMargin.grossMargin >= minGrossMargin &&
  weakestVideoMargin.grossMargin < minGrossMargin + marginWarningBuffer
) {
  warnings.push({
    class: 'video_margin_near_floor',
    source: weakestVideoMargin.source,
    detail: `${weakestVideoMargin.scenario} is only ${formatPercent(
      weakestVideoMargin.grossMargin
    )}, within ${formatPercent(marginWarningBuffer)} of the ${formatPercent(
      minGrossMargin
    )} floor`,
    recommendation:
      'Do not lower video credit prices until provider-billed Seedance token cost is captured and reconciled.'
  });
}

const miniTokenRate =
  assumptions.seedanceTokenRatesCnyPerMillion['seedance-2-0-mini'];
for (const [model, multiplier] of Object.entries(seedanceModelMultipliers)) {
  const expectedRatio =
    assumptions.seedanceTokenRatesCnyPerMillion[model] / miniTokenRate;
  if (Math.abs(multiplier - expectedRatio) > 0.03) {
    blockers.push({
      class: 'video_model_cost_ratio_drift',
      source: model,
      detail: `${multiplier}x credit multiplier differs from the configured ${expectedRatio.toFixed(
        2
      )}x token-cost ratio.`
    });
  }
}

const proMonthlyCredits =
  planRows.find((row) =>
    row.name.endsWith('src/shared/pricing-catalog.ts:pro:monthly')
  )?.credits || 0;
if (referralActivationCredits > twoKImageCost) {
  blockers.push({
    class: 'referral_activation_reward',
    detail: `${referralActivationCredits} activation credits exceed one 2K image cost (${twoKImageCost}).`
  });
}
if (
  proMonthlyCredits > 0 &&
  referralSubscriptionCredits / proMonthlyCredits > 0.15
) {
  blockers.push({
    class: 'referral_subscription_reward',
    detail: `${referralSubscriptionCredits} paid-referral credits exceed 15% of Pro's ${proMonthlyCredits}-credit monthly allowance.`
  });
}
if (
  !new RegExp(
    `ALTER COLUMN reward_amount SET DEFAULT ${referralActivationCredits}`
  ).test(referralRewardMigration) ||
  !new RegExp(`DEFAULT ${referralSubscriptionCredits}`).test(
    referralRewardMigration
  )
) {
  blockers.push({
    class: 'referral_reward_migration_drift',
    detail:
      'Referral reward constants are not mirrored in the July 2026 referral migration.'
  });
}

const migrationFailures = validatePricingMigrationMirrors({
  supabasePricingMigration,
  serverPricingMigration,
  expected: {
    proCredits: 10000,
    maxCredits: 60000,
    imageBaseCost: baseImageCost,
    imageMinCost: readConstNumber(
      imagePricing,
      'IMAGE_GENERATION_DRAFT_CREDIT_COST'
    ),
    imageMaxCost: highQualityFloor
  }
});

for (const failure of migrationFailures) {
  blockers.push({
    class: 'pricing_migration_drift',
    detail: failure
  });
}

const pricingMaxCosts = [
  [
    'supabase pricing migration',
    readMigrationMaxCost(supabasePricingMigration)
  ],
  ['server pricing migration', readMigrationMaxCost(serverPricingMigration)]
];

for (const [label, migrationMaxCost] of pricingMaxCosts) {
  if (migrationMaxCost < fourKImageCost) {
    blockers.push({
      class: 'image_dynamic_pricing_clamp_window',
      source: label,
      detail: `image_generation max_cost ${migrationMaxCost} is below the single-image bypass threshold ${fourKImageCost}; dynamicCredits in (${migrationMaxCost}, ${fourKImageCost}] would be silently clamped.`
    });
  }
}

const yearlyMigrationFailures = validateYearlyPricingMigrationMirrors({
  supabaseYearlyPricingMigration,
  serverYearlyPricingMigration,
  expected: {
    proYearlyPrice: 16800,
    maxYearlyPrice: 84000
  }
});

for (const failure of yearlyMigrationFailures) {
  blockers.push({
    class: 'yearly_pricing_migration_drift',
    detail: failure
  });
}

const safetyMigrationFailures = validateSafetyMigrationMirrors({
  supabasePastDuePolicyMigration,
  serverPastDuePolicyMigration,
  supabaseImageTaskLeaseMigration,
  serverImageTaskLeaseMigration
});

for (const failure of safetyMigrationFailures) {
  blockers.push({
    class: 'safety_migration_drift',
    detail: failure
  });
}

if (packageRows.length === 0) {
  warnings.push({
    class: 'package_parse',
    detail: 'No default credit packages parsed from api/credits/packages.ts'
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  assumptions,
  observedGeneration,
  minGrossMargin,
  marginWarningBuffer,
  imageMarginMethod: {
    revenueBasis: 'credits charged for one successful output',
    costBasis:
      'configured per-attempt COGS multiplied by observed billable attempts per successful task',
    billableAttemptFactor:
      (1 + assumptions.retryRate) / Math.max(0.01, 1 - assumptions.failureRate),
    providerInvoiceIntegrated: observedGeneration.providerBilledLossUsd !== null
  },
  freePolicy: {
    freeDailyCredits,
    freeDailyImageLimit,
    baseImageCost
  },
  mediaPolicy: {
    membershipCreditsCanFundVideo: true,
    videoBaseUnitCost,
    videoBaseUnitSeconds,
    videoReferenceSurcharge,
    seedanceModelMultipliers,
    seedanceHdMultipliers,
    targetVideoCostBasis: {
      tokensPerSecond: assumptions.videoTokensPerSecond,
      cnyPerUsd: assumptions.videoCnyPerUsd,
      tokenRatesCnyPerMillion: assumptions.seedanceTokenRatesCnyPerMillion,
      operationalOverheadRate: assumptions.videoOperationalOverheadRate
    }
  },
  referralPolicy: {
    activationCredits: referralActivationCredits,
    subscriptionCredits: referralSubscriptionCredits,
    totalInviterCredits:
      referralActivationCredits + referralSubscriptionCredits,
    proMonthlyShare:
      proMonthlyCredits > 0
        ? (referralActivationCredits + referralSubscriptionCredits) /
          proMonthlyCredits
        : null
  },
  deployment: {
    requiredMigrations: [
      'supabase/migrations/20260804213000_rebalance_image_quality_and_credit_packages.sql',
      'server/migrations/098_rebalance_image_quality_and_credit_packages.sql',
      'supabase/migrations/20260812100000_annual_discount_30_percent.sql',
      'server/migrations/099_annual_discount_30_percent.sql',
      'supabase/migrations/20260721090000_fail_closed_past_due_entitlements.sql',
      'server/migrations/096_fail_closed_past_due_entitlements.sql',
      'supabase/migrations/20260721091500_image_task_atomic_lease.sql',
      'server/migrations/097_image_task_atomic_lease.sql'
    ]
  },
  checked: {
    creditPackages: packageRows.length,
    fallbackPlans: planRows.length,
    rechargeFailsClosed: !/const\s+fallbackPackages\s*[:=]/.test(rechargePage)
  },
  weakestMargins: summarizeWeakestMargins(evaluatedMargins),
  blockers,
  warnings
};

console.log(JSON.stringify(report, null, 2));

if (blockers.length > 0) {
  process.exit(1);
}

function readNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readPositiveNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readObservedOrOverride(name, observedValue, fallback) {
  if (Object.prototype.hasOwnProperty.call(process.env, name)) {
    return readNumberEnv(name, fallback);
  }
  return Number.isFinite(observedValue) && observedValue >= 0
    ? observedValue
    : fallback;
}

function readFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readConstNumber(source, name) {
  const match = source.match(
    new RegExp(`export\\s+const\\s+${name}\\s*=\\s*([0-9]+)`)
  );
  if (!match) {
    throw new Error(`Missing numeric const ${name}`);
  }
  return Number(match[1]);
}

function readMigrationMaxCost(source) {
  const match = source.match(/max_cost\s*=\s*(\d+)/);
  if (!match) {
    throw new Error('Missing max_cost in pricing migration');
  }
  return Number(match[1]);
}

function readSeedanceModelMultipliers(source) {
  const configSource = source.split('export const SEEDANCE_VIDEO_MODELS')[0];
  const rows = {};
  const pattern =
    /'(seedance-2-(?:5|0(?:-fast|-mini)?))':\s*\{[\s\S]*?creditMultiplier:\s*([0-9.]+)/g;
  let match;
  while ((match = pattern.exec(configSource))) {
    rows[match[1]] = Number(match[2]);
  }
  if (!rows['seedance-2-0']) {
    throw new Error('Missing seedance-2-0 creditMultiplier');
  }
  return rows;
}

function readSeedanceHdMultipliers(source) {
  const rows = {};
  const block =
    source.match(
      /VIDEO_GENERATION_RESOLUTION_MULTIPLIERS[\s\S]*?=\s*\{([\s\S]*?)\};/
    )?.[1] || '';
  // The guardrail scenarios only price 480p and 720p; extract the 720p
  // resolution multiplier per model (480p is already factored out as 1).
  const modelPattern =
    /'(seedance-2-(?:5|0(?:-fast|-mini)?))':\s*\{([\s\S]*?)\}/g;
  let modelMatch;
  while ((modelMatch = modelPattern.exec(block))) {
    const resolution = modelMatch[2].match(/'720p':\s*([0-9.]+)/);
    if (resolution) {
      rows[modelMatch[1]] = Number(resolution[1]);
    }
  }
  if (!rows['seedance-2-0'] || !rows['seedance-2-0-mini']) {
    throw new Error('Missing Seedance HD credit multipliers');
  }
  return rows;
}

function estimateVideoCredits({
  model,
  duration,
  resolution,
  referenceImageCount = 0
}) {
  const durationUnits = duration / videoBaseUnitSeconds;
  const subtotal =
    videoBaseUnitCost * durationUnits +
    Math.max(0, referenceImageCount) * videoReferenceSurcharge;
  const resolutionMultiplier =
    resolution === '480p' ? 1 : seedanceHdMultipliers[model];
  return Math.max(
    videoMinCost,
    Math.ceil(subtotal * seedanceModelMultipliers[model] * resolutionMultiplier)
  );
}

function estimateSeedanceVideoCogs({ model, duration, resolution }) {
  const tokenRate = assumptions.seedanceTokenRatesCnyPerMillion[model];
  const resolutionMultiplier =
    resolution === '480p' ? 1 : seedanceHdMultipliers[model];
  const tokens =
    assumptions.videoTokensPerSecond * duration * resolutionMultiplier;
  return (tokens * tokenRate) / 1_000_000 / assumptions.videoCnyPerUsd;
}

function readCreditPackages(source) {
  const rows = [];
  const pattern =
    /\{\s*id:\s*'([^']+)'[^}]*price:\s*([0-9]+)[^}]*credits:\s*([0-9]+)/g;
  let match;
  while ((match = pattern.exec(source))) {
    rows.push({
      kind: 'credit_package_margin',
      name: match[1],
      cents: Number(match[2]),
      credits: Number(match[3])
    });
  }
  return rows;
}

function readPlanCredits(source, sourceName) {
  const rows = [];
  for (const id of ['pro', 'max']) {
    const pattern = new RegExp(
      `id:\\s*'${id}'[\\s\\S]*?priceMonthly:\\s*([0-9_]+)[\\s\\S]*?priceYearly:\\s*([0-9_]+)[\\s\\S]*?monthlyCredits:\\s*([0-9_]+)`,
      'm'
    );
    const match = source.match(pattern);
    if (!match) continue;
    const monthlyCents = Number(match[1].replaceAll('_', ''));
    const yearlyCents = Number(match[2].replaceAll('_', ''));
    const credits = Number(match[3].replaceAll('_', ''));
    if (monthlyCents <= 0 || yearlyCents <= 0 || credits <= 0) continue;
    rows.push(
      {
        kind: 'membership_margin',
        name: `${sourceName}:${id}:monthly`,
        cents: monthlyCents,
        credits
      },
      {
        kind: 'membership_margin',
        name: `${sourceName}:${id}:yearly`,
        cents: yearlyCents / 12,
        credits
      }
    );
  }
  return rows;
}

function evaluateMargin({ source, cents, credits, scenario }) {
  const isVideo = scenario.mediaType === 'video';
  const revenue = scenario.credits * (cents / 100 / credits);
  const cost =
    scenario.cogs *
    (isVideo
      ? 1 + assumptions.videoOperationalOverheadRate
      : (1 + assumptions.retryRate) /
        Math.max(0.01, 1 - assumptions.failureRate));
  const grossMargin = revenue > 0 ? (revenue - cost) / revenue : -Infinity;
  return {
    source,
    scenario: scenario.name,
    mediaType: scenario.mediaType,
    grossMargin
  };
}

function summarizeWeakestMargins(rows) {
  return Object.values(
    rows.reduce((summary, row) => {
      const current = summary[row.source];
      if (!current || row.grossMargin < current.grossMargin) {
        summary[row.source] = row;
      }
      return summary;
    }, {})
  ).sort((left, right) => left.grossMargin - right.grossMargin);
}

function requiredCreditUnitPrice(scenario) {
  const isVideo = scenario.mediaType === 'video';
  const cost =
    scenario.cogs *
    (isVideo
      ? 1 + assumptions.videoOperationalOverheadRate
      : (1 + assumptions.retryRate) /
        Math.max(0.01, 1 - assumptions.failureRate));
  return cost / (scenario.credits * (1 - minGrossMargin));
}

function validatePricingMigrationMirrors({ expected, ...sources }) {
  const failures = [];
  for (const [name, source] of Object.entries(sources)) {
    const checks = [
      [
        `${name} pro monthly credits`,
        new RegExp(`WHEN name = 'pro' THEN ${expected.proCredits}`)
      ],
      [
        `${name} max monthly credits`,
        new RegExp(`WHEN name = 'max' THEN ${expected.maxCredits}`)
      ],
      [
        `${name} image base cost`,
        new RegExp(`cost\\s*=\\s*${expected.imageBaseCost}`)
      ],
      [
        `${name} image min cost`,
        new RegExp(`min_cost\\s*=\\s*${expected.imageMinCost}`)
      ],
      [
        `${name} image max cost`,
        new RegExp(`max_cost\\s*=\\s*${expected.imageMaxCost}`)
      ]
    ];

    for (const [label, pattern] of checks) {
      if (!pattern.test(source)) {
        failures.push(`${label} is not mirrored in the pricing migration`);
      }
    }
  }
  return failures;
}

function validateYearlyPricingMigrationMirrors({ expected, ...sources }) {
  const failures = [];
  for (const [name, source] of Object.entries(sources)) {
    const checks = [
      [
        `${name} pro annual price`,
        new RegExp(`WHEN name = 'pro' THEN ${expected.proYearlyPrice}`)
      ],
      [
        `${name} max annual price`,
        new RegExp(`WHEN name = 'max' THEN ${expected.maxYearlyPrice}`)
      ],
      [
        `${name} stale annual Stripe price reset`,
        /stripe_price_yearly\s*=\s*NULL/
      ]
    ];

    for (const [label, pattern] of checks) {
      if (!pattern.test(source)) {
        failures.push(
          `${label} is not mirrored in the annual pricing migration`
        );
      }
    }
  }
  return failures;
}

function validateSafetyMigrationMirrors({
  supabasePastDuePolicyMigration,
  serverPastDuePolicyMigration,
  supabaseImageTaskLeaseMigration,
  serverImageTaskLeaseMigration
}) {
  const failures = [];
  if (supabasePastDuePolicyMigration !== serverPastDuePolicyMigration) {
    failures.push('past-due entitlement migrations are not exact mirrors');
  }
  if (supabaseImageTaskLeaseMigration !== serverImageTaskLeaseMigration) {
    failures.push('image-task lease migrations are not exact mirrors');
  }

  const checks = [
    [
      'past-due migration must remove paid wallet balances',
      supabasePastDuePolicyMigration,
      /(?=[\s\S]*subscription_credits = 0)(?=[\s\S]*subscriptions\.status = 'past_due')/
    ],
    [
      'image-task migration must enforce a bounded attempt count',
      supabaseImageTaskLeaseMigration,
      /max_attempts BETWEEN 1 AND 100/
    ],
    [
      'image-task claim RPC must mint a fresh lease token',
      supabaseImageTaskLeaseMigration,
      /lease_token = gen_random_uuid\(\)/
    ],
    [
      'image-task retry exhaustion must refund prepaid credits',
      supabaseImageTaskLeaseMigration,
      /(?=[\s\S]*max_attempts_refund)(?=[\s\S]*refund_generation_credit)/
    ],
    [
      'image-task claim RPC must be restricted to service role',
      supabaseImageTaskLeaseMigration,
      /GRANT EXECUTE[\s\S]*TO service_role;/
    ]
  ];

  for (const [label, source, pattern] of checks) {
    if (!pattern.test(source)) failures.push(label);
  }
  return failures;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}
