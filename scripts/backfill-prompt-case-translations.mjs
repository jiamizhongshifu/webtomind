import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const rootDir = process.cwd();

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
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY;
const openaiBaseUrl =
  process.env.PROMPT_CASE_TRANSLATION_BASE_URL ||
  process.env.OPENAI_BASE_URL ||
  process.env.DEEPSEEK_BASE_URL ||
  'https://api.openai.com/v1';
// Stable API id for the DeepSeek-V4-Flash-0731 release.
const openaiModel = 'deepseek-v4-flash';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}
if (!openaiKey) {
  throw new Error('Missing OPENAI_API_KEY or DEEPSEEK_API_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey);

function getPromptCaseTranslationSlug(sourceId) {
  return `en-case-${String(sourceId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toLowerCase()}`;
}

function normalizeTags(value) {
  return Array.isArray(value)
    ? value.map((tag) => (typeof tag === 'string' ? tag.trim() : '')).filter(Boolean)
    : [];
}

function extractJsonObject(value) {
  try {
    return JSON.parse(value);
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function translateCase(source) {
  const response = await fetch(`${openaiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`
    },
    body: JSON.stringify({
      model: openaiModel,
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Translate WebToMind curated AI image prompt cases from Chinese to English. Preserve model names, aspect ratios, camera terms, safety constraints, and prompt structure. Do not invent new scenes. If the source title is empty, create a concise English title from the prompt. Return only compact JSON with keys title, prompt, tags. Tags must be short English SEO labels.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            title: source.title || '',
            prompt: source.prompt || '',
            tags: source.tags || [],
            category: source.category || '',
            model: source.model || ''
          })
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Translation API failed ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  const parsed = extractJsonObject(payload?.choices?.[0]?.message?.content || '');
  const title = typeof parsed?.title === 'string' ? parsed.title.trim() : '';
  const prompt = typeof parsed?.prompt === 'string' ? parsed.prompt.trim() : '';
  const tags = normalizeTags(parsed?.tags).slice(0, 8);
  if (!title || !prompt) {
    throw new Error('Translation response missing title or prompt');
  }
  return { title, prompt, tags };
}

async function upsertEnglishCase(source, translation) {
  const slug = getPromptCaseTranslationSlug(source.id);
  const patch = {
    image_url: source.image_url,
    image_urls: Array.isArray(source.image_urls) ? source.image_urls : [],
    title: translation.title,
    slug,
    category: source.category || 'featured',
    tags: translation.tags,
    model: source.model || 'gemini-image',
    locale: 'en-US',
    source_case_id: source.id,
    featured: Boolean(source.featured),
    members_only: Boolean(source.members_only),
    prompt: translation.prompt,
    author_url: source.author_url || null,
    sort_order: source.sort_order,
    is_published: source.is_published !== false,
    deleted_at: null
  };

  const { data: existing, error: existingError } = await supabase
    .from('prompt_cases')
    .select('id')
    .eq('slug', slug)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing?.id) {
    const { error } = await supabase
      .from('prompt_cases')
      .update(patch)
      .eq('id', existing.id);
    if (error) throw error;
    return 'updated';
  }

  const { error } = await supabase.from('prompt_cases').insert({
    ...patch,
    created_by_email: 'auto-translation@webtomind.com'
  });
  if (error) throw error;
  return 'created';
}

const { data: cases, error } = await supabase
  .from('prompt_cases')
  .select('*')
  .eq('locale', 'zh-CN')
  .eq('is_published', true)
  .is('deleted_at', null)
  .order('created_at', { ascending: true })
  .limit(1000);

if (error) throw error;

let created = 0;
let updated = 0;
let failed = 0;

for (const source of cases || []) {
  try {
    const translation = await translateCase(source);
    const action = await upsertEnglishCase(source, translation);
    if (action === 'created') created += 1;
    if (action === 'updated') updated += 1;
    console.log(`${action}: ${source.id} -> ${getPromptCaseTranslationSlug(source.id)}`);
  } catch (caseError) {
    failed += 1;
    console.error(`failed: ${source.id}`, caseError);
  }
}

console.log(JSON.stringify({ sourceCases: cases?.length || 0, created, updated, failed }));
