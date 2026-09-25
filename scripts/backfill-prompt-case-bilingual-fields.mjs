import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const DEFAULT_OUT = path.join(
  rootDir,
  'outputs',
  `prompt-case-bilingual-backfill-${new Date().toISOString().slice(0, 10)}.json`
);
const TRANSLATION_TIMEOUT_MS = 30000;

function parseArgs(argv) {
  const options = {
    apply: false,
    limit: 0,
    concurrency: 2,
    out: DEFAULT_OUT,
    model: 'gpt-image-2',
    onlyLanguageMismatch: false
  };
  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true;
    } else if (arg.startsWith('--limit=')) {
      options.limit = Number.parseInt(arg.slice('--limit='.length), 10);
    } else if (arg.startsWith('--concurrency=')) {
      options.concurrency = Number.parseInt(
        arg.slice('--concurrency='.length),
        10
      );
    } else if (arg.startsWith('--out=')) {
      options.out = path.resolve(arg.slice('--out='.length));
    } else if (arg.startsWith('--model=')) {
      options.model = arg.slice('--model='.length).trim();
    } else if (arg === '--only-language-mismatch') {
      options.onlyLanguageMismatch = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(options.limit) || options.limit < 0) {
    throw new Error('--limit must be 0 or a positive integer.');
  }
  if (!Number.isFinite(options.concurrency) || options.concurrency < 1) {
    throw new Error('--concurrency must be a positive integer.');
  }
  return options;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function loadRuntimeEnv() {
  loadEnvFile(path.join(rootDir, '.vercel/.env.production.local'));
  loadEnvFile(path.join(rootDir, '.env.local'));
}

function createSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function getTranslationConfig() {
  const apiKey =
    process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY or DEEPSEEK_API_KEY for --apply.');
  }
  return {
    apiKey,
    baseUrl:
      process.env.PROMPT_CASE_TRANSLATION_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      process.env.DEEPSEEK_BASE_URL ||
      'https://api.openai.com/v1',
    // Stable API id for the DeepSeek-V4-Flash-0731 release.
    model: 'deepseek-v4-flash'
  };
}

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value, length) {
  const text = normalizeWhitespace(value);
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function countMatches(value, regex) {
  return (String(value || '').match(regex) || []).length;
}

function cjkRatio(value) {
  const text = normalizeWhitespace(value);
  if (!text) return 0;
  return (
    countMatches(text, /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) /
    text.length
  );
}

function latinCount(value) {
  return countMatches(value, /[A-Za-z]/g);
}

function looksEnglish(value) {
  const text = normalizeWhitespace(value);
  return text.length >= 80 && cjkRatio(text) < 0.02 && latinCount(text) >= 60;
}

function looksLatinTitle(value) {
  const text = normalizeWhitespace(value);
  return text.length >= 6 && cjkRatio(text) < 0.02 && latinCount(text) >= 4;
}

function looksCjkDominant(value) {
  return cjkRatio(value) > 0.25;
}

function readField(row, field) {
  return normalizeWhitespace(row?.[field]);
}

function detectBilingualIssue(row) {
  const promptZh = readField(row, 'prompt_zh');
  const promptEn = readField(row, 'prompt_en');
  const prompt = readField(row, 'prompt');
  const titleZh = readField(row, 'title_zh');
  const titleEn = readField(row, 'title_en');
  const title = readField(row, 'title');
  const issues = [];

  if (promptZh && looksEnglish(promptZh))
    issues.push('prompt_zh_looks_english');
  if (promptEn && looksCjkDominant(promptEn))
    issues.push('prompt_en_looks_cjk');
  if (promptZh && promptEn && promptZh === promptEn) {
    if (looksEnglish(promptZh)) issues.push('prompts_identical_english');
    if (looksCjkDominant(promptZh)) issues.push('prompts_identical_cjk');
  }
  if (!promptZh && (prompt || promptEn)) issues.push('prompt_zh_missing');
  if (!promptEn && (prompt || promptZh)) issues.push('prompt_en_missing');
  if (titleZh && titleEn && titleZh === titleEn && latinCount(titleZh) > 4) {
    issues.push('titles_identical_latin');
  }
  if (!titleZh && (title || titleEn)) issues.push('title_zh_missing');
  if (!titleEn && (title || titleZh)) issues.push('title_en_missing');
  return issues;
}

async function fetchAllCases(supabase, options) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('prompt_cases')
      .select(
        'id,slug,locale,title,title_zh,title_en,prompt,prompt_preview,prompt_preview_zh,prompt_preview_en,prompt_zh,prompt_en,model,is_published,deleted_at,category,tags'
      )
      .eq('model', options.model)
      .eq('is_published', true)
      .is('deleted_at', null)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Prompt case query failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function selectTranslationSource(row, direction) {
  if (direction === 'en-to-zh') {
    return {
      title: readField(row, 'title_en') || readField(row, 'title'),
      prompt:
        readField(row, 'prompt_en') ||
        readField(row, 'prompt') ||
        readField(row, 'prompt_zh')
    };
  }
  return {
    title: readField(row, 'title_zh') || readField(row, 'title'),
    prompt:
      readField(row, 'prompt_zh') ||
      readField(row, 'prompt') ||
      readField(row, 'prompt_en')
  };
}

function baseSlugForPair(slug) {
  const value = normalizeWhitespace(slug);
  return value.startsWith('en-') ? value.slice(3) : value;
}

function buildSiblingLookup(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!normalizeWhitespace(row.slug)) continue;
    const key = baseSlugForPair(row.slug);
    const current = groups.get(key) || {};
    if (row.locale === 'zh-CN' && !current.zh) current.zh = row;
    if (row.locale === 'en-US' && !current.en) current.en = row;
    groups.set(key, current);
  }
  return groups;
}

function getSibling(row, siblingLookup) {
  if (!normalizeWhitespace(row.slug)) return null;
  const group = siblingLookup.get(baseSlugForPair(row.slug));
  if (!group) return null;
  return row.locale === 'zh-CN' ? group.en || null : group.zh || null;
}

function copyableZhFrom(row) {
  if (!row) return null;
  const prompt = readField(row, 'prompt_zh') || readField(row, 'prompt');
  const title = readField(row, 'title_zh') || readField(row, 'title');
  if (!prompt || looksEnglish(prompt)) return null;
  return { title, prompt };
}

function copyableEnFrom(row) {
  if (!row) return null;
  const prompt = readField(row, 'prompt_en') || readField(row, 'prompt');
  const title = readField(row, 'title_en') || readField(row, 'title');
  if (!prompt || looksCjkDominant(prompt)) return null;
  return { title, prompt };
}

function parseJsonObject(value) {
  try {
    return JSON.parse(value);
  } catch {
    const match = String(value || '').match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function translateCase({ row, direction, config }) {
  const source = selectTranslationSource(row, direction);
  if (!source.prompt) {
    throw new Error(`Missing source prompt for ${row.slug}`);
  }
  const targetLanguage =
    direction === 'en-to-zh' ? 'Simplified Chinese' : 'English';
  const system =
    'You translate AI image prompt library records. Preserve prompt structure, aspect ratios, camera and model terms, placeholders in braces, brand/model identifiers, numbers, and explicit constraints. Return only compact JSON with string fields "title" and "prompt".';
  const user = JSON.stringify({
    targetLanguage,
    title: source.title,
    prompt: source.prompt
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSLATION_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(
      `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: config.model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ]
        })
      }
    );
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Translation failed ${response.status} for ${row.slug}: ${body}`
    );
  }
  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content || '';
  const parsed = parseJsonObject(text);
  const title = normalizeWhitespace(parsed?.title);
  const prompt = normalizeWhitespace(parsed?.prompt);
  if (!title || !prompt) {
    throw new Error(`Translation returned invalid JSON for ${row.slug}`);
  }
  if (direction === 'en-to-zh' && looksEnglish(prompt)) {
    throw new Error(
      `Translated Chinese prompt still looks English for ${row.slug}`
    );
  }
  if (direction === 'cjk-to-en' && looksCjkDominant(prompt)) {
    throw new Error(
      `Translated English prompt still looks CJK for ${row.slug}`
    );
  }
  return { title, prompt };
}

function buildPatch(row, translations) {
  const patch = {};
  if (translations.zh) {
    patch.title_zh = translations.zh.title;
    patch.prompt_zh = translations.zh.prompt;
    patch.prompt_preview_zh = truncate(translations.zh.prompt, 180);
    if (row.locale === 'zh-CN') {
      patch.title = translations.zh.title;
      patch.prompt = translations.zh.prompt;
      patch.prompt_preview = truncate(translations.zh.prompt, 180);
    }
  }
  if (translations.en) {
    patch.title_en = translations.en.title;
    patch.prompt_en = translations.en.prompt;
    patch.prompt_preview_en = truncate(translations.en.prompt, 180);
    if (row.locale === 'en-US') {
      patch.title = translations.en.title;
      patch.prompt = translations.en.prompt;
      patch.prompt_preview = truncate(translations.en.prompt, 180);
    }
  }
  return patch;
}

async function processTarget({
  supabase,
  row,
  sibling,
  issues,
  options,
  config
}) {
  const rowPrompt = readField(row, 'prompt');
  const rowTitle = readField(row, 'title');
  const rowTitleEn = readField(row, 'title_en');
  const needsZh =
    issues.includes('prompt_zh_looks_english') ||
    issues.includes('prompts_identical_english') ||
    issues.includes('titles_identical_latin') ||
    (issues.includes('title_zh_missing') &&
      looksLatinTitle(rowTitleEn || rowTitle)) ||
    (issues.includes('prompt_zh_missing') && looksEnglish(rowPrompt));
  const needsEn =
    issues.includes('prompt_en_looks_cjk') ||
    issues.includes('prompts_identical_cjk') ||
    (issues.includes('prompt_en_missing') && looksCjkDominant(rowPrompt));
  const result = {
    id: row.id,
    slug: row.slug,
    locale: row.locale,
    issues,
    action: options.apply ? 'updated' : 'would-update',
    patchFields: []
  };
  if (!options.apply) {
    return result;
  }
  const translations = {};
  if (issues.includes('prompt_zh_missing')) {
    translations.zh =
      copyableZhFrom(row) || copyableZhFrom(sibling) || translations.zh;
  }
  if (issues.includes('prompt_en_missing')) {
    translations.en =
      copyableEnFrom(row) || copyableEnFrom(sibling) || translations.en;
  }
  if (needsZh && !translations.zh) {
    translations.zh = await translateCase({
      row,
      direction: 'en-to-zh',
      config
    });
  }
  if (needsEn && !translations.en) {
    translations.en = await translateCase({
      row,
      direction: 'cjk-to-en',
      config
    });
  }
  const patch = buildPatch(row, translations);
  result.patchFields = Object.keys(patch);
  if (!result.patchFields.length) {
    result.action = 'skipped-no-patch';
    return result;
  }
  const { error } = await supabase
    .from('prompt_cases')
    .update(patch)
    .eq('id', row.id);
  if (error) throw new Error(`Update failed for ${row.slug}: ${error.message}`);
  return result;
}

async function mapWithConcurrency(items, concurrency, iterator) {
  const results = [];
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        try {
          results[index] = await iterator(items[index], index);
        } catch (error) {
          results[index] = {
            action: 'failed',
            id: items[index]?.row?.id || null,
            slug: items[index]?.row?.slug || null,
            locale: items[index]?.row?.locale || null,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    }
  );
  await Promise.all(workers);
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  loadRuntimeEnv();
  const supabase = createSupabaseAdmin();
  const config = options.apply ? getTranslationConfig() : null;
  const rows = await fetchAllCases(supabase, options);
  const siblingLookup = buildSiblingLookup(rows);
  let targets = rows
    .map((row) => ({ row, issues: detectBilingualIssue(row) }))
    .filter((item) => item.issues.length > 0)
    .filter(
      (item) =>
        !options.onlyLanguageMismatch ||
        item.issues.some((issue) =>
          [
            'prompt_zh_looks_english',
            'prompt_en_looks_cjk',
            'prompts_identical_english',
            'prompts_identical_cjk'
          ].includes(issue)
        )
    );
  if (options.limit > 0) targets = targets.slice(0, options.limit);

  const results = await mapWithConcurrency(
    targets,
    options.concurrency,
    (target) =>
      processTarget({
        supabase,
        row: target.row,
        sibling: getSibling(target.row, siblingLookup),
        issues: target.issues,
        options,
        config
      })
  );

  const report = {
    generatedAt: new Date().toISOString(),
    apply: options.apply,
    model: options.model,
    onlyLanguageMismatch: options.onlyLanguageMismatch,
    scanned: rows.length,
    targetCount: targets.length,
    issueCounts: targets.reduce((acc, item) => {
      for (const issue of item.issues) acc[issue] = (acc[issue] || 0) + 1;
      return acc;
    }, {}),
    results
  };
  await mkdir(path.dirname(options.out), { recursive: true });
  await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
