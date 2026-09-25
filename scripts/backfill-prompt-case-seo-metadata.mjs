import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const rootDir = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const applyChanges = process.argv.includes('--apply');
const reportPath =
  process.argv
    .find((arg) => arg.startsWith('--report='))
    ?.slice('--report='.length) ||
  path.join(
    rootDir,
    'docs',
    'reports',
    `prompt-case-backfill-preview-${today}.md`
  );

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

loadEnvFile(path.join(rootDir, '.vercel/.env.production.local'));
loadEnvFile(path.join(rootDir, '.env.local'));

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const readKey =
  serviceRoleKey ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !readKey) {
  throw new Error(
    'Missing Supabase URL or key. Set SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY.'
  );
}

if (applyChanges && !serviceRoleKey) {
  throw new Error('Refusing --apply without SUPABASE_SERVICE_ROLE_KEY.');
}

const supabase = createClient(supabaseUrl, applyChanges ? serviceRoleKey : readKey);

const CATEGORY_RULES = [
  {
    category: 'character',
    tags: ['character design', 'character consistency', 'concept art'],
    terms: [
      '角色',
      '机甲',
      '高达',
      '冒险岛',
      '枫之谷',
      'gundam',
      'mecha',
      'character',
      'sprite',
      'game ui',
      'login reward'
    ]
  },
  {
    category: 'fashion',
    tags: ['fashion portrait', 'editorial photo', 'style reference'],
    terms: [
      '时尚',
      '服装',
      '内衣',
      '穿搭',
      'cos',
      'cosplay',
      'lingerie',
      'fitting',
      'bikini',
      'fashion'
    ]
  },
  {
    category: 'portrait',
    tags: ['portrait prompt', 'realistic photo', 'phone photography'],
    terms: [
      '人像',
      '写真',
      '自拍',
      '真人',
      '浴室',
      '约会',
      'portrait',
      'selfie',
      'photo',
      'photography',
      'phone snapshot'
    ]
  },
  {
    category: 'poster',
    tags: ['poster design', 'campaign visual', 'cinematic poster'],
    terms: ['海报', 'poster', 'graffiti', '世界杯', 'world cup']
  },
  {
    category: 'cover',
    tags: ['cover design', 'social cover', 'layout design'],
    terms: ['封面', 'cover', '杂志', 'magazine']
  },
  {
    category: 'ecommerce',
    tags: ['product photography', 'ecommerce', 'hero image'],
    terms: ['商品', '产品', '电商', '主图', '包装', '护肤', 'product photography']
  },
  {
    category: 'background',
    tags: ['environment design', 'background prompt', 'scene design'],
    terms: ['背景', '场景', '茶屋', 'rooftop', 'cockpit', 'tea house']
  }
];

const MODEL_RULES = [
  {
    model: 'gpt-image-2',
    terms: ['gpt-image-2', 'gpt image2', 'gpt image 2', 'chatgpt image2']
  },
  {
    model: 'gemini-image',
    terms: ['gemini-image', 'gemini image', 'nano banana', 'nanobanana']
  },
  { model: 'nano-banana', terms: ['nano-banana'] },
  { model: 'flux', terms: ['flux'] },
  { model: 'seedream', terms: ['seedream', 'sea dream'] }
];

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeTags(value) {
  return Array.isArray(value)
    ? value
        .map((tag) => normalizeWhitespace(tag))
        .filter(Boolean)
        .slice(0, 8)
    : [];
}

function includesAny(text, terms) {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term.toLowerCase()));
}

function normalizeModel(value) {
  const text = normalizeWhitespace(value).toLowerCase();
  const rule = MODEL_RULES.find((item) => includesAny(text, item.terms));
  return rule?.model || (text ? text : 'gemini-image');
}

function inferTitle(row) {
  const existingTitle = normalizeWhitespace(row.title);
  if (existingTitle) return existingTitle;

  const prompt = normalizeWhitespace(row.prompt)
    .replace(/^\s*\d{1,2}\s*[:：]\s*\d{1,2}\s*[，,、。.\s-]*/u, '')
    .replace(/^提示词\s*[:：]\s*/u, '')
    .replace(/^生成一?张(?:单张)?\s*/u, '')
    .replace(/^请(?:你)?(?:生成|创建|绘制)\s*/u, '');

  const firstClause =
    prompt.split(/[，,。.;；\n]/u).find((part) => normalizeWhitespace(part)) ||
    '精选 AI 图片 Prompt';

  return normalizeWhitespace(firstClause).slice(0, 36) || '精选 AI 图片 Prompt';
}

function inferCategory(row, title) {
  const currentCategory = normalizeWhitespace(row.category);
  if (currentCategory && currentCategory !== 'featured') {
    return currentCategory;
  }

  const searchText = [
    title,
    row.prompt,
    row.model,
    row.category,
    ...normalizeTags(row.tags)
  ]
    .join(' ')
    .toLowerCase();
  return (
    CATEGORY_RULES.find((rule) => includesAny(searchText, rule.terms))
      ?.category || currentCategory || 'featured'
  );
}

function inferTags(row, title, category, normalizedModel) {
  const currentTags = normalizeTags(row.tags);
  if (currentTags.length >= 4) {
    return currentTags;
  }

  const searchText = [
    title,
    row.prompt,
    row.model,
    row.category,
    ...currentTags
  ].join(' ');
  const tags = new Set(currentTags);

  if (normalizedModel === 'gpt-image-2') tags.add('GPT Image 2');
  if (normalizedModel === 'gemini-image') tags.add('Gemini image');
  if (normalizedModel === 'nano-banana') tags.add('Nano Banana');

  const categoryRule = CATEGORY_RULES.find((rule) => rule.category === category);
  categoryRule?.tags.forEach((tag) => tags.add(tag));

  if (includesAny(searchText, ['cos', 'cosplay', '甘雨', 'ganyu'])) {
    tags.add('cosplay prompt');
  }
  if (includesAny(searchText, ['手机', '自拍', 'phone', 'selfie'])) {
    tags.add('phone snapshot');
  }
  if (includesAny(searchText, ['游戏', 'ui', '登录', 'reward'])) {
    tags.add('game UI');
  }
  if (includesAny(searchText, ['9:16', '竖版', 'vertical'])) {
    tags.add('vertical image');
  }
  if (includesAny(searchText, ['真实', '真人', 'realistic', 'raw photo'])) {
    tags.add('realistic photo');
  }

  tags.add('AI image prompt');

  return Array.from(tags)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function slugify(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function shortId(id) {
  return String(id || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 10)
    .toLowerCase();
}

function inferSlug(row, title, category, normalizedModel) {
  const currentSlug = normalizeWhitespace(row.slug);
  if (currentSlug) return currentSlug;

  const currentTags = normalizeTags(row.tags).join(' ');
  const base =
    slugify([normalizedModel, category, currentTags, title].join(' ')) ||
    slugify([normalizedModel, category].join(' ')) ||
    'prompt-case';
  const suffix = shortId(row.id);
  const trimmedBase = base.split('-').slice(0, 8).join('-');
  return suffix ? `${trimmedBase}-${suffix}` : trimmedBase;
}

function buildPatch(row) {
  const title = inferTitle(row);
  const model = normalizeModel(row.model);
  const category = inferCategory(row, title);
  const tags = inferTags(row, title, category, model);
  const slug = inferSlug(row, title, category, model);

  const patch = {
    title,
    slug,
    category,
    tags,
    model
  };

  const changed = {};
  for (const [key, value] of Object.entries(patch)) {
    const current =
      key === 'tags' ? normalizeTags(row.tags) : normalizeWhitespace(row[key]);
    const next = key === 'tags' ? value : normalizeWhitespace(value);
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      changed[key] = value;
    }
  }

  return { patch, changed };
}

function markdownTable(rows) {
  const header =
    '| Locale | ID | Current title | Proposed title | Current slug | Proposed slug | Category | Model | Tags | Changes |\n' +
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
  const lines = rows.map(({ row, patch, changed }) => {
    const id = String(row.id || '').slice(0, 8);
    const changes = Object.keys(changed).join(', ') || 'none';
    return [
      row.locale || '',
      '`' + id + '`',
      normalizeWhitespace(row.title) || '(empty)',
      patch.title,
      normalizeWhitespace(row.slug) || '(empty)',
      patch.slug,
      patch.category,
      patch.model,
      patch.tags.join(', '),
      changes
    ]
      .map((cell) => String(cell).replace(/\|/g, '\\|'))
      .join(' | ');
  });
  return [header, ...lines.map((line) => `| ${line} |`)].join('\n');
}

const { data: rows, error } = await supabase
  .from('prompt_cases')
  .select('*')
  .eq('is_published', true)
  .is('deleted_at', null)
  .order('locale', { ascending: true })
  .order('created_at', { ascending: true })
  .limit(1000);

if (error) throw error;

const proposals = (rows || []).map((row) => ({
  row,
  ...buildPatch(row)
}));
const changedProposals = proposals.filter(
  (item) => Object.keys(item.changed).length > 0
);

if (applyChanges) {
  for (const item of changedProposals) {
    const { error: updateError } = await supabase
      .from('prompt_cases')
      .update(item.changed)
      .eq('id', item.row.id);
    if (updateError) throw updateError;
  }
}

const summary = {
  scanned: proposals.length,
  changed: changedProposals.length,
  applied: applyChanges,
  hasServiceRole: Boolean(serviceRoleKey),
  reportPath
};

const report = `# Prompt Case SEO Metadata Backfill Preview

Date: ${today}
Mode: ${applyChanges ? 'APPLY' : 'DRY RUN'}

## Summary

- Rows scanned: ${summary.scanned}
- Rows with proposed changes: ${summary.changed}
- Applied to Supabase: ${applyChanges ? 'yes' : 'no'}
- Service role available: ${serviceRoleKey ? 'yes' : 'no'}

## Proposed Changes

${markdownTable(changedProposals)}

## Next Step

${applyChanges ? 'Applied. Re-run without `--apply` after future prompt-case imports to preview any new metadata gaps.' : serviceRoleKey ? 'Run with `--apply` after reviewing this report.' : 'Set `SUPABASE_SERVICE_ROLE_KEY` before running with `--apply`.'}
`;

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, report);

console.log(JSON.stringify(summary, null, 2));
