#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient, type User } from '@supabase/supabase-js';
import {
  buildUnsubscribeUrl,
  renderEmailLayout,
  type EmailContent,
  type MarketingEmailPreference
} from '../api/marketing/email-utils.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CAMPAIGN_KEY = 'case_digest:product-update:zh-CN:2026-07-29';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEST_EMAIL_PATTERN =
  /(^|[+._-])(test|smoke|codex|example)([+._-]|@)|@(example\.com|webtomind\.test)$/i;

type Args = {
  execute: boolean;
  inactiveDays: number;
  campaignKey: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    execute: false,
    inactiveDays: 30,
    campaignKey: DEFAULT_CAMPAIGN_KEY
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--') {
      continue;
    } else if (arg === '--execute') {
      args.execute = true;
    } else if (arg === '--inactive-days') {
      args.inactiveDays = Number(next);
      index += 1;
    } else if (arg === '--campaign-key') {
      args.campaignKey = String(next || '').trim();
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (
    !Number.isInteger(args.inactiveDays) ||
    args.inactiveDays < 7 ||
    args.inactiveDays > 365
  ) {
    throw new Error('--inactive-days must be an integer between 7 and 365');
  }
  if (!args.campaignKey.startsWith('case_digest:product-update:')) {
    throw new Error(
      '--campaign-key must start with case_digest:product-update:'
    );
  }
  return args;
}

async function loadEnvFile(filePath: string): Promise<void> {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2]
        .replace(/^['"]|['"]$/g, '')
        .replace(/\\n/g, '\n');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function loadLocalEnv(): Promise<void> {
  await loadEnvFile(path.join(ROOT, '.env'));
  await loadEnvFile(path.join(ROOT, '.env.local'));
}

async function listAllUsers(
  supabase: ReturnType<typeof createClient>
): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000
    });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function listAllPreferences(
  supabase: ReturnType<typeof createClient>
): Promise<MarketingEmailPreference[]> {
  const rows: MarketingEmailPreference[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('marketing_email_preferences')
      .select(
        'user_id,email,locale,unsubscribe_token,welcome_enabled,case_digest_enabled,offer_enabled,unsubscribed_at'
      )
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data || []) as MarketingEmailPreference[]));
    if ((data || []).length < pageSize) return rows;
  }
}

function getContent(siteUrl: string): EmailContent {
  const campaign = 'product_update_202607';
  const ctaUrl = `${siteUrl}/zh-CN/create?utm_source=email&utm_medium=reactivation&utm_campaign=${campaign}&utm_content=primary_cta`;
  const promptLibraryUrl = `${siteUrl}/zh-CN/prompts?utm_source=email&utm_medium=reactivation&utm_campaign=${campaign}&utm_content=prompt_library`;
  return {
    subject: 'WebToMind 近期更新：新版创作工作台、视觉配方与 Prompt 案例库',
    previewText: '把参考图、提示词、视觉配方与生成记录重新接回一条工作流。',
    title: '回来看看，创作工作流已经更完整',
    intro:
      '你之前登录过 WebToMind。最近我们把“找灵感—拆配方—生成—复用”这条路径重新收拢，下面是最值得回来看看的三项更新。',
    bodyHtml: `
      <div style="margin:0 0 18px;padding:18px;border:1px solid #dbe5ff;border-radius:16px;background:#f8faff;">
        <strong style="display:block;margin-bottom:6px;color:#0f172a;">01 · 新版图片创作工作台</strong>
        <span>提示词、参考图、模型参数与生成记录集中在同一条创作流里，减少来回切换。</span>
      </div>
      <div style="margin:0 0 18px;padding:18px;border:1px solid #dbe5ff;border-radius:16px;background:#f8faff;">
        <strong style="display:block;margin-bottom:6px;color:#0f172a;">02 · 可复现的视觉配方</strong>
        <span>从服装、姿态、光线、背景到镜头语言，用清晰 slot 组合出可继续编辑的图片方向。</span>
      </div>
      <div style="margin:0 0 18px;padding:18px;border:1px solid #dbe5ff;border-radius:16px;background:#f8faff;">
        <strong style="display:block;margin-bottom:6px;color:#0f172a;">03 · 更完整的 Prompt 案例库</strong>
        <span>可以按模型与主题浏览案例，并把喜欢的方向直接带回创作台。<a href="${promptLibraryUrl}" style="color:#0048ff;font-weight:700;">浏览近期案例 →</a></span>
      </div>
      <p style="margin:22px 0 0;color:#475569;">如果你正准备做一组商品图、人物写真或内容配图，现在回来会比第一次使用顺手很多。</p>
    `,
    textBody: `WebToMind 近期更新

1. 新版图片创作工作台：提示词、参考图、模型参数与生成记录集中在同一条创作流里。
2. 可复现的视觉配方：从服装、姿态、光线、背景到镜头语言，组合可继续编辑的图片方向。
3. 更完整的 Prompt 案例库：按模型与主题浏览案例，再把喜欢的方向带回创作台。

开始创作：${ctaUrl}
浏览案例：${promptLibraryUrl}`,
    ctaLabel: '回到 WebToMind 开始创作',
    ctaUrl
  };
}

function chunks<T>(rows: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    result.push(rows.slice(index, index + size));
  }
  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  await loadLocalEnv();
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const siteUrl = (
    process.env.PUBLIC_SITE_URL ||
    process.env.VITE_PUBLIC_SITE_URL ||
    'https://webtomind.com'
  ).replace(/\/+$/, '');
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });
  const [users, preferences] = await Promise.all([
    listAllUsers(supabase),
    listAllPreferences(supabase)
  ]);
  const userById = new Map(users.map((user) => [user.id, user]));
  const cutoff = new Date(Date.now() - args.inactiveDays * 24 * 60 * 60 * 1000);
  const eligible = preferences.filter((preference) => {
    if (
      !preference.user_id ||
      !preference.case_digest_enabled ||
      preference.unsubscribed_at
    ) {
      return false;
    }
    const user = userById.get(preference.user_id);
    const email = preference.email.trim().toLowerCase();
    if (
      !user?.last_sign_in_at ||
      new Date(user.last_sign_in_at) > cutoff ||
      !EMAIL_PATTERN.test(email) ||
      TEST_EMAIL_PATTERN.test(email)
    ) {
      return false;
    }
    return user.email?.trim().toLowerCase() === email;
  });

  const summary = {
    mode: args.execute ? 'execute' : 'dry-run',
    campaignKey: args.campaignKey,
    inactiveDays: args.inactiveDays,
    cutoff: cutoff.toISOString(),
    authUsers: users.length,
    preferences: preferences.length,
    eligibleRecipients: eligible.length
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!args.execute) return;

  const content = getContent(siteUrl);
  const nowIso = new Date().toISOString();
  const { error: campaignError } = await supabase
    .from('marketing_email_campaigns')
    .upsert(
      {
        campaign_key: args.campaignKey,
        email_type: 'case_digest',
        status: 'queued',
        title: content.title,
        subject: content.subject,
        preview_text: content.previewText,
        cta_label: content.ctaLabel,
        cta_url: content.ctaUrl,
        scheduled_for: nowIso.slice(0, 10),
        metadata: {
          locale: 'zh-CN',
          campaignKind: 'product_update_reactivation',
          inactiveDays: args.inactiveDays,
          eligibleRecipients: eligible.length
        }
      },
      { onConflict: 'campaign_key' }
    );
  if (campaignError) throw campaignError;

  const queueRows = eligible.map((preference) => ({
    user_id: preference.user_id,
    recipient_email: preference.email.trim().toLowerCase(),
    email_type: 'case_digest',
    subject: content.subject,
    preview_text: content.previewText,
    html: renderEmailLayout(
      content,
      buildUnsubscribeUrl(preference.unsubscribe_token)
    ),
    text_body: content.textBody,
    cta_label: content.ctaLabel,
    cta_url: content.ctaUrl,
    campaign_key: args.campaignKey,
    scheduled_at: nowIso,
    metadata: {
      locale: 'zh-CN',
      unsubscribeToken: preference.unsubscribe_token,
      campaignKind: 'product_update_reactivation',
      inactiveDays: args.inactiveDays
    }
  }));

  let queued = 0;
  for (const batch of chunks(queueRows, 25)) {
    const { error } = await supabase
      .from('marketing_email_queue')
      .upsert(batch, {
        onConflict: 'recipient_email,email_type,campaign_key',
        ignoreDuplicates: true
      });
    if (error) throw error;
    queued += batch.length;
  }
  console.log(JSON.stringify({ queued }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
