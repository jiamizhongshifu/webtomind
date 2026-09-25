#!/usr/bin/env node

import { loadObservedImageGenerationMetrics } from './lib/image-generation-observed-metrics.mjs';

const observedGeneration = await loadObservedImageGenerationMetrics({
  days: 30
});

const creditSources = [
  { name: '1k pack', dollars: 4.99, credits: 1000 },
  { name: '5k pack', dollars: 19.99, credits: 5000 },
  { name: '20k pack', dollars: 69.99, credits: 20000 },
  { name: '100k pack', dollars: 299.99, credits: 100000 },
  { name: 'Pro monthly', dollars: 20, credits: 10000 },
  { name: 'Pro yearly monthly-equivalent', dollars: 12, credits: 10000 },
  { name: 'Max monthly', dollars: 100, credits: 60000 },
  { name: 'Max yearly monthly-equivalent', dollars: 60, credits: 60000 }
];

const assumptions = {
  baseCogs: readNumberEnv('IMAGE_COGS_BASE_USD', 0.018),
  twoKCogs: readNumberEnv('IMAGE_COGS_2K_USD', 0.028),
  fourKCogs: readNumberEnv('IMAGE_COGS_4K_USD', 0.084),
  mediumCogs: readNumberEnv('IMAGE_COGS_MEDIUM_USD', 0.053),
  highCogs: readNumberEnv('IMAGE_COGS_HIGH_USD', 0.211),
  upscaleCogs: readNumberEnv('IMAGE_UPSCALE_COGS_USD', 0),
  failureRate: readObservedOrOverride(
    'IMAGE_FAILURE_RATE',
    observedGeneration.failureRate,
    0.12
  ),
  retryRate: readObservedOrOverride(
    'IMAGE_RETRY_RATE',
    observedGeneration.retryRate,
    0.15
  )
};

const scenarios = [
  { name: 'base auto', credits: 60, cogs: assumptions.baseCogs },
  { name: '2K auto', credits: 100, cogs: assumptions.twoKCogs },
  { name: '2K reference', credits: 120, cogs: assumptions.twoKCogs },
  { name: '2K character + 2 refs', credits: 200, cogs: assumptions.twoKCogs },
  { name: 'medium quality floor', credits: 150, cogs: assumptions.mediumCogs },
  {
    name: '4K auto',
    credits: 300,
    cogs: assumptions.fourKCogs + assumptions.upscaleCogs
  },
  {
    name: 'high quality floor',
    credits: 600,
    cogs: assumptions.highCogs
  }
];

function readNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readObservedOrOverride(name, observedValue, fallback) {
  if (Object.prototype.hasOwnProperty.call(process.env, name)) {
    return readNumberEnv(name, fallback);
  }
  return Number.isFinite(observedValue) && observedValue >= 0
    ? observedValue
    : fallback;
}

function money(value) {
  return `$${value.toFixed(2)}`;
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function expectedCost(baseCogs) {
  const successRate = Math.max(0.01, 1 - assumptions.failureRate);
  return (baseCogs * (1 + assumptions.retryRate)) / successRate;
}

function expectedRevenue(credits, dollars, packageCredits) {
  return credits * (dollars / packageCredits);
}

console.log('Image generation unit economics');
console.log('');
console.log('Assumptions');
console.table({
  baseCogs: money(assumptions.baseCogs),
  twoKCogs: money(assumptions.twoKCogs),
  fourKCogs: money(assumptions.fourKCogs),
  mediumCogs: money(assumptions.mediumCogs),
  highCogs: money(assumptions.highCogs),
  upscaleCogs: money(assumptions.upscaleCogs),
  failureRate: percent(assumptions.failureRate),
  retryRate: percent(assumptions.retryRate),
  billableAttemptFactor: `${(
    (1 + assumptions.retryRate) /
    Math.max(0.01, 1 - assumptions.failureRate)
  ).toFixed(2)}x`
});

for (const creditSource of creditSources) {
  const rows = scenarios.map((scenario) => {
    const revenue = expectedRevenue(
      scenario.credits,
      creditSource.dollars,
      creditSource.credits
    );
    const cost = expectedCost(scenario.cogs);
    const grossProfit = revenue - cost;
    const grossMargin = revenue > 0 ? grossProfit / revenue : 0;
    return {
      scenario: scenario.name,
      credits: scenario.credits,
      revenue: money(revenue),
      cost: money(cost),
      grossProfit: money(grossProfit),
      grossMargin: percent(grossMargin),
      risk: grossMargin < 0 ? 'negative' : grossMargin < 0.4 ? 'low' : ''
    };
  });

  console.log('');
  console.log(
    `${creditSource.name}: ${money(creditSource.dollars)} / ${creditSource.credits.toLocaleString()} credits`
  );
  console.table(rows);
}

console.log('');
console.log(
  'Review any row marked negative or low before changing credit prices, free quotas, provider routing, or default output size.'
);
