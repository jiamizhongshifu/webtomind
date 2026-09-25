#!/usr/bin/env node

/**
 * WebToMind 数据面健康检查
 *
 * 每天在 GA4 / GSC / Supabase 转化报告生成后运行：
 * - 报告是否新鲜（默认 2 天内）
 * - GA4 数据质量门槛（(not set) landing 占比、page_view/session_start）：
 *   默认仅警告（手动 unwanted-referrals 配置完成前避免每天失败）；
 *   --strict-ga4 恢复为硬门槛（发布/专项检查用）
 * - GSC 报告是否有可读数据
 * - 生成成功率与购买归因状态
 *
 * 退出码：0 = 通过（可带警告），1 = 门禁失败（cron/CI 应可见）。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');

function parseArgs(argv) {
  const args = { days: 2, strictGa4: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--days') {
      args.days = Number(argv[i + 1]) || 2;
      i += 1;
    }
    if (argv[i] === '--strict-ga4') {
      args.strictGa4 = true;
    }
  }
  return args;
}

async function latestOutputFile(reportName, filename) {
  const dir = path.join(ROOT, 'outputs', reportName);
  let entries = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return null;
  }
  const datedDirs = entries
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry))
    .sort()
    .reverse();
  for (const datedDir of datedDirs) {
    const filePath = path.join(dir, datedDir, filename);
    try {
      await fs.access(filePath);
      return { path: filePath, date: datedDir };
    } catch {
      // Try the next dated directory.
    }
  }
  return null;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function pct(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '-';
  }
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function freshWithinDays(generatedAt, days) {
  if (!generatedAt) return false;
  const ageMs = Date.now() - new Date(generatedAt).getTime();
  return ageMs >= 0 && ageMs <= days * 24 * 60 * 60 * 1000;
}

async function main() {
  const { days, strictGa4 } = parseArgs(process.argv.slice(2));
  const failures = [];
  const warnings = [];
  const lines = [];

  const ga4 = await latestOutputFile('ga4', 'ga4-report.json');
  const ga4Report = ga4 ? await readJson(ga4.path) : null;
  if (!ga4Report) {
    failures.push(`GA4 报告缺失（outputs/ga4/<date>/ga4-report.json）`);
  } else if (!freshWithinDays(ga4Report.generatedAt, days)) {
    failures.push(
      `GA4 报告过期（${ga4.date}，生成于 ${ga4Report.generatedAt}）`
    );
  } else {
    const dq = ga4Report.dataQuality || {};
    const qualityFails = dq.status !== 'usable';
    if (strictGa4 && qualityFails) {
      failures.push(
        `GA4 数据质量不可用：${(dq.blockingReasons || []).join('；') || '未知原因'}`
      );
    } else if (qualityFails) {
      warnings.push(
        `GA4 数据质量未达标（${(dq.blockingReasons || []).join('；') || '未知'}）；` +
          '手动 unwanted-referrals 配置完成前按警告处理，见 docs/seo/ga4-unwanted-referrals-runbook.md'
      );
    }
    const notSetRows = (ga4Report.data?.notSetLandingBySource?.rows || [])
      .slice(0, 5)
      .map((row) => {
        const source = row.sessionSourceMedium || '-';
        const sessions = Number(row.sessions || 0);
        const views = Number(row.screenPageViews || 0);
        return `${source}(${sessions}s/${views}pv)`;
      })
      .join('，');
    lines.push(
      `GA4: ${qualityFails ? (strictGa4 ? 'FAIL' : 'WARN') : 'PASS'} | (not set) ${pct(dq.notSetLandingSessionShare)} (目标 ≤ ${pct(
        dq.thresholds?.notSetLandingSessionShare
      )}) | page_view/session_start ${dq.pageViewPerSessionStart?.toFixed?.(2) ?? '-'}`
    );
    if (notSetRows) lines.push(`GA4 (not set) 来源: ${notSetRows}`);
  }

  const gsc = await latestOutputFile('gsc', 'gsc-report.json');
  const gscReport = gsc ? await readJson(gsc.path) : null;
  if (!gscReport) {
    warnings.push('GSC 报告缺失，等待下次同步');
  } else if (!freshWithinDays(gscReport.generatedAt, days)) {
    warnings.push(`GSC 报告过期（${gsc.date}，生成于 ${gscReport.generatedAt}）`);
  } else {
    const currentTotals = gscReport.totals?.current || {};
    const impressions = Number(currentTotals.impressions ?? 0);
    const clicks = Number(currentTotals.clicks ?? 0);
    if (impressions <= 0 && clicks <= 0) {
      warnings.push('GSC 当前窗口无曝光/点击数据，可能为采集初期');
    }
    lines.push(`GSC: PASS | impressions ${impressions} | clicks ${clicks}`);
  }

  const conversion = await latestOutputFile(
    'conversion',
    'supabase-conversion-report.json'
  );
  const conversionReport = conversion ? await readJson(conversion.path) : null;
  if (!conversionReport) {
    failures.push('Supabase 转化报告缺失（outputs/conversion/<date>/...json）');
  } else if (!freshWithinDays(conversionReport.generatedAt, days)) {
    failures.push(
      `Supabase 转化报告过期（${conversion.date}，生成于 ${conversionReport.generatedAt}）`
    );
  } else {
    const health = conversionReport.conversionHealth || {};
    const generation = health.generation || {};
    const successRate = Number(generation.successRate ?? Number.NaN);
    const categoryText = Object.entries(generation.failureCategories || {})
      .map(([key, value]) => `${key}:${value}`)
      .join('，');
    if (Number.isFinite(successRate) && successRate < 0.4) {
      failures.push(`生成成功率 ${pct(successRate)} 低于 40% 应急门槛`);
    } else if (Number.isFinite(successRate) && successRate < 0.9) {
      warnings.push(
        `生成成功率 ${pct(successRate)} 未达 90% 目标（${
          generation.succeeded ?? 0
        } 成功 / ${generation.failed ?? 0} 失败）`
      );
    }
    lines.push(
      `Supabase: 生成成功率 ${pct(successRate)} | 失败分类: ${
        categoryText || '无'
      } | 订单 ${health.checkout?.succeededOrders ?? 0} 成功 / ${
        health.checkout?.expiredOrders ?? 0
      } 过期`
    );
  }

  console.log(
    [
      `# WebToMind 数据面健康检查 ${new Date().toISOString()}`,
      ...lines,
      ...(warnings.length
        ? ['', '## 警告', ...warnings.map((item) => `- ${item}`)]
        : []),
      ...(failures.length
        ? ['', '## 门禁失败', ...failures.map((item) => `- ${item}`)]
        : ['', '## 结论', '通过（可能带警告）'])
    ].join('\n')
  );

  process.exitCode = failures.length ? 1 : 0;
}

main().catch((error) => {
  console.error('[data-health-check] failed:', error);
  process.exitCode = 1;
});
