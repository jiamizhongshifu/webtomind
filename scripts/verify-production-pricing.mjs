#!/usr/bin/env node

import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv, loadRuntimeEnv } from './lib/runtime-env.mjs';

loadRuntimeEnv({
  extraFiles: ['.vercel/.env.production.local']
});

const expected = {
  imageGeneration: {
    cost: 60,
    base_cost: 60,
    min_cost: 40,
    max_cost: 600,
    pricing_type: 'dynamic'
  },
  packages: {
    pack_1k: { price: 499, credits: 1000 },
    pack_5k: { price: 1999, credits: 5000 },
    pack_20k: { price: 6999, credits: 20000 },
    pack_100k: { price: 29999, credits: 100000 }
  },
  imageCosts: [
    { label: 'standard', cost: 60 },
    { label: 'draft', quality: 'low', cost: 40 },
    { label: 'reference', referenceImageCount: 1, cost: 80 },
    { label: '2k', imageSize: '2048x2048', cost: 100 },
    { label: 'medium', quality: 'medium', cost: 150 },
    { label: '4k', imageSize: '4096x4096', cost: 300 },
    { label: 'high', quality: 'high', cost: 600 }
  ],
  plans: {
    pro: {
      price_monthly: 2000,
      price_yearly: 16800,
      yearly_discount_percent: 30,
      monthly_credits: 10000,
      limits: {
        dailyCredits: -1,
        dailyImageGeneration: -1
      }
    },
    max: {
      price_monthly: 10000,
      price_yearly: 84000,
      yearly_discount_percent: 30,
      monthly_credits: 60000,
      limits: {
        dailyCredits: -1,
        dailyImageGeneration: -1
      }
    }
  },
  videoCosts: [
    {
      model: 'seedance-2-0',
      duration: 15,
      resolution: '480p',
      cost: 2400
    },
    {
      model: 'seedance-2-0-fast',
      duration: 15,
      resolution: '480p',
      referenceImageCount: 1,
      cost: 2013
    },
    {
      model: 'seedance-2-0-mini',
      duration: 15,
      resolution: '480p',
      cost: 1200
    },
    {
      model: 'seedance-2-0',
      duration: 5,
      resolution: '720p',
      cost: 1440
    },
    {
      model: 'seedance-2-0-fast',
      duration: 5,
      resolution: '720p',
      cost: 1095
    },
    {
      model: 'seedance-2-0-mini',
      duration: 5,
      resolution: '720p',
      cost: 640
    }
  ]
};

const report = {
  generatedAt: new Date().toISOString(),
  target: 'production-pricing',
  checked: {
    creditCosts: [],
    plans: [],
    packages: [],
    imageCosts: [],
    videoCosts: []
  },
  blockers: []
};

const { url, serviceRoleKey } = getSupabaseEnv({
  requireServiceRoleKey: true
});
const supabase = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

await verifyImageGenerationCost();
await verifyPlans();
await verifyPackages();
await verifyImageCosts();
await verifyVideoCosts();

console.log(JSON.stringify(report, null, 2));

if (report.blockers.length > 0) {
  process.exit(1);
}

async function verifyImageGenerationCost() {
  const { data, error } = await supabase
    .from('credit_costs')
    .select('action,cost,base_cost,min_cost,max_cost,pricing_type,is_active')
    .eq('action', 'image_generation')
    .maybeSingle();

  if (error || !data) {
    report.blockers.push({
      class: 'credit_costs_lookup',
      detail: error?.message || 'Missing credit_costs.image_generation row'
    });
    return;
  }

  report.checked.creditCosts.push(safeCreditCostRow(data));
  for (const [field, value] of Object.entries(expected.imageGeneration)) {
    if (data[field] !== value) {
      report.blockers.push({
        class: 'image_generation_cost_drift',
        detail: `credit_costs.image_generation.${field} expected ${value}, got ${data[field]}`
      });
    }
  }
  if (data.is_active !== true) {
    report.blockers.push({
      class: 'image_generation_cost_inactive',
      detail: 'credit_costs.image_generation is not active'
    });
  }
}

async function verifyPlans() {
  const planIds = Object.keys(expected.plans);
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('id,price_monthly,price_yearly,monthly_credits,limits,is_active')
    .in('id', planIds);

  if (error || !data) {
    report.blockers.push({
      class: 'subscription_plans_lookup',
      detail: error?.message || 'Missing subscription_plans rows'
    });
    return;
  }

  const byId = new Map(data.map((plan) => [plan.id, plan]));
  for (const planId of planIds) {
    const plan = byId.get(planId);
    const planExpected = expected.plans[planId];
    if (!plan) {
      report.blockers.push({
        class: 'subscription_plan_missing',
        detail: `Missing subscription_plans.${planId}`
      });
      continue;
    }

    report.checked.plans.push(safePlanRow(plan));
    for (const field of ['price_monthly', 'price_yearly']) {
      if (plan[field] !== planExpected[field]) {
        report.blockers.push({
          class: 'subscription_plan_price_drift',
          detail: `${planId}.${field} expected ${planExpected[field]}, got ${plan[field]}`
        });
      }
    }
    const yearlyDiscountPercent = calculateYearlyDiscountPercent(plan);
    if (yearlyDiscountPercent !== planExpected.yearly_discount_percent) {
      report.blockers.push({
        class: 'subscription_plan_yearly_discount_drift',
        detail: `${planId}.yearly discount expected ${planExpected.yearly_discount_percent}%, got ${yearlyDiscountPercent}%`
      });
    }
    if (plan.monthly_credits !== planExpected.monthly_credits) {
      report.blockers.push({
        class: 'subscription_plan_credit_drift',
        detail: `${planId}.monthly_credits expected ${planExpected.monthly_credits}, got ${plan.monthly_credits}`
      });
    }
    if (plan.is_active !== true) {
      report.blockers.push({
        class: 'subscription_plan_inactive',
        detail: `${planId} is not active`
      });
    }

    const limits = normalizeLimits(plan.limits);
    for (const [field, value] of Object.entries(planExpected.limits)) {
      if (limits[field] !== value) {
        report.blockers.push({
          class: 'subscription_plan_limit_drift',
          detail: `${planId}.limits.${field} expected ${value}, got ${limits[field]}`
        });
      }
    }
  }
}

async function verifyPackages() {
  const packageIds = Object.keys(expected.packages);
  const { data, error } = await supabase
    .from('credit_packages')
    .select('id,price,credits,stripe_price_id,is_active')
    .in('id', packageIds);

  if (error || !data) {
    report.blockers.push({
      class: 'credit_packages_lookup',
      detail: error?.message || 'Missing credit_packages rows'
    });
    return;
  }

  const byId = new Map(data.map((item) => [item.id, item]));
  for (const packageId of packageIds) {
    const item = byId.get(packageId);
    const packageExpected = expected.packages[packageId];
    if (!item) {
      report.blockers.push({
        class: 'credit_package_missing',
        detail: `Missing credit_packages.${packageId}`
      });
      continue;
    }

    report.checked.packages.push(item);
    for (const field of ['price', 'credits']) {
      if (item[field] !== packageExpected[field]) {
        report.blockers.push({
          class: 'credit_package_drift',
          detail: `${packageId}.${field} expected ${packageExpected[field]}, got ${item[field]}`
        });
      }
    }
    if (item.stripe_price_id !== null) {
      report.blockers.push({
        class: 'credit_package_stale_stripe_price',
        detail: `${packageId}.stripe_price_id must be null after a price change`
      });
    }
    if (item.is_active !== true) {
      report.blockers.push({
        class: 'credit_package_inactive',
        detail: `${packageId} is not active`
      });
    }
  }
}

async function verifyImageCosts() {
  const baseUrl =
    process.env.PRODUCTION_BASE_URL ||
    process.env.APP_URL ||
    'https://webtomind.com';
  for (const item of expected.imageCosts) {
    const url = new URL('/api/credits/image-cost', baseUrl);
    for (const field of [
      'imageSize',
      'quality',
      'referenceImageCount',
      'referenceMode',
      'model'
    ]) {
      if (item[field] !== undefined) {
        url.searchParams.set(field, String(item[field]));
      }
    }
    url.searchParams.set('pricingCheck', String(Date.now()));

    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json' }
      });
    } catch (error) {
      report.blockers.push({
        class: 'image_cost_lookup',
        detail: `${item.label}: ${
          error instanceof Error ? error.message : String(error)
        }`
      });
      continue;
    }

    const body = await response.json().catch(() => ({}));
    report.checked.imageCosts.push({
      label: item.label,
      status: response.status,
      cost: body.cost
    });
    if (!response.ok || body.cost !== item.cost) {
      report.blockers.push({
        class: 'image_cost_drift',
        detail: `${item.label} expected ${item.cost}, got ${body.cost ?? `HTTP ${response.status}`}`
      });
    }
  }
}

async function verifyVideoCosts() {
  const baseUrl =
    process.env.PRODUCTION_BASE_URL ||
    process.env.APP_URL ||
    'https://webtomind.com';
  for (const item of expected.videoCosts) {
    const url = new URL('/api/credits/video-cost', baseUrl);
    url.searchParams.set('model', item.model);
    url.searchParams.set('duration', String(item.duration));
    url.searchParams.set('resolution', item.resolution);
    url.searchParams.set(
      'referenceImageCount',
      String(item.referenceImageCount || 0)
    );
    url.searchParams.set('pricingCheck', String(Date.now()));

    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json' }
      });
    } catch (error) {
      report.blockers.push({
        class: 'video_cost_lookup',
        detail: `${item.model} ${item.duration}s ${item.resolution}: ${
          error instanceof Error ? error.message : String(error)
        }`
      });
      continue;
    }

    const body = await response.json().catch(() => ({}));
    report.checked.videoCosts.push({
      model: item.model,
      duration: item.duration,
      resolution: item.resolution,
      referenceImageCount: item.referenceImageCount || 0,
      status: response.status,
      cost: body.cost
    });
    if (!response.ok || body.cost !== item.cost) {
      report.blockers.push({
        class: 'video_cost_drift',
        detail: `${item.model} ${item.duration}s ${item.resolution} expected ${item.cost}, got ${body.cost ?? `HTTP ${response.status}`}`
      });
    }
  }
}

function normalizeLimits(value) {
  if (!value || typeof value !== 'object') return {};
  return {
    ...value,
    dailyImageGeneration:
      value.dailyImageGeneration ?? value.dailyImageGen ?? value.dailyImages
  };
}

function calculateYearlyDiscountPercent(plan) {
  if (plan.price_monthly <= 0 || plan.price_yearly <= 0) return 0;
  return Math.round((1 - plan.price_yearly / (plan.price_monthly * 12)) * 100);
}

function safeCreditCostRow(row) {
  return {
    action: row.action,
    cost: row.cost,
    base_cost: row.base_cost,
    min_cost: row.min_cost,
    max_cost: row.max_cost,
    pricing_type: row.pricing_type,
    is_active: row.is_active
  };
}

function safePlanRow(row) {
  const limits = normalizeLimits(row.limits);
  return {
    id: row.id,
    price_monthly: row.price_monthly,
    price_yearly: row.price_yearly,
    yearly_discount_percent: calculateYearlyDiscountPercent(row),
    monthly_credits: row.monthly_credits,
    limits: {
      dailyCredits: limits.dailyCredits,
      dailyImageGeneration: limits.dailyImageGeneration
    },
    is_active: row.is_active
  };
}
