#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Math.max(
  1,
  Math.min(5000, Number(limitArg?.split('=')[1] || 1000) || 1000)
);
const pageSize = 200;
const signedUrlExpiresIn = 60 * 60 * 24;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.'
  );
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function normalizeUrl(value) {
  return typeof value === 'string' ? value.replace(/&amp;/g, '&').trim() : '';
}

function extractStorageLookupFromImageUrl(rawImageUrl) {
  const normalized = normalizeUrl(rawImageUrl);
  if (!normalized) return null;

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  const markers = [
    '/storage/v1/object/sign/',
    '/storage/v1/object/public/'
  ];
  const marker = markers.find((item) => parsed.pathname.includes(item));
  if (!marker) return null;

  const encodedObjectPath = parsed.pathname.slice(
    parsed.pathname.indexOf(marker) + marker.length
  );
  const objectPath = decodeURIComponent(encodedObjectPath);
  const separatorIndex = objectPath.indexOf('/');
  if (separatorIndex <= 0) return null;

  return {
    bucket: objectPath.slice(0, separatorIndex),
    path: objectPath.slice(separatorIndex + 1)
  };
}

function extractFirstImageUrl(markdown) {
  const htmlMatch = String(markdown || '').match(
    /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i
  );
  if (htmlMatch?.[1]) return normalizeUrl(htmlMatch[1]);

  const markdownMatch = String(markdown || '').match(/!\[[^\]]*]\(([^)\s]+)[^)]*\)/);
  if (markdownMatch?.[1]) return normalizeUrl(markdownMatch[1]);

  return '';
}

function extractGenerationId(summary) {
  const metadata = normalizeObject(summary.metadata);
  if (typeof metadata.generationId === 'string' && metadata.generationId) {
    return metadata.generationId;
  }
  const match = String(summary.markdown || '').match(
    /data-generation-id=["']([0-9a-f-]{36})["']/i
  );
  return match?.[1] || '';
}

function summaryNeedsBackfill(summary) {
  const metadata = normalizeObject(summary.metadata);
  return !(
    typeof metadata.generationId === 'string' &&
    typeof metadata.storagePath === 'string' &&
    (typeof metadata.previewStoragePath === 'string' ||
      typeof metadata.thumbnailStoragePath === 'string')
  );
}

function isVisualSummaryCandidate(summary) {
  const imageUrl = extractFirstImageUrl(summary.markdown) || summary.url;
  const storageLookup = extractStorageLookupFromImageUrl(imageUrl);
  const tags = Array.isArray(summary.tags) ? summary.tags : [];
  if (extractGenerationId(summary)) return true;
  if (/webtomind-image-history/i.test(String(summary.markdown || ''))) {
    return true;
  }
  if (storageLookup?.bucket === 'user-generated-images') return true;
  return tags.includes('ai-image') && tags.includes('prompt');
}

async function signUrl(bucket, path, fallback) {
  if (!bucket || !path) return fallback || undefined;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, signedUrlExpiresIn);
  if (error || !data?.signedUrl) return fallback || undefined;
  return data.signedUrl;
}

async function findGeneration({ summary, storageLookup }) {
  const generationId = extractGenerationId(summary);
  const select =
    'id,user_id,image_url,prompt,negative_prompt,model_label,provider,provider_model,aspect_ratio,quality,metadata,created_at';

  if (generationId) {
    const { data, error } = await supabase
      .from('image_generations')
      .select(select)
      .eq('id', generationId)
      .eq('user_id', summary.user_id)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  if (!storageLookup?.path) return null;

  const { data, error } = await supabase
    .from('image_generations')
    .select(select)
    .eq('user_id', summary.user_id)
    .contains('metadata', { storagePath: storageLookup.path })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function buildVisualMetadata(summary, generation, storageLookup) {
  const summaryMetadata = normalizeObject(summary.metadata);
  const generationMetadata = normalizeObject(generation.metadata);
  const generationStorageLookup =
    extractStorageLookupFromImageUrl(generation.image_url) || storageLookup;
  const storageBucket =
    generationMetadata.storageBucket ||
    generationStorageLookup?.bucket ||
    storageLookup?.bucket ||
    'user-generated-images';
  const storagePath =
    generationMetadata.storagePath ||
    generationStorageLookup?.path ||
    storageLookup?.path;
  const thumbnailStoragePath = generationMetadata.thumbnailStoragePath;
  const previewStoragePath = generationMetadata.previewStoragePath;

  const imageUrl = await signUrl(storageBucket, storagePath, generation.image_url);
  const thumbnailUrl = await signUrl(storageBucket, thumbnailStoragePath);
  const previewUrl = await signUrl(storageBucket, previewStoragePath);

  return {
    ...summaryMetadata,
    generationId: generation.id,
    thumbnailUrl: thumbnailUrl || previewUrl || imageUrl,
    previewUrl: previewUrl || imageUrl,
    imageUrl,
    storageBucket,
    storagePath,
    thumbnailStoragePath,
    previewStoragePath,
    model: generation.provider_model,
    modelLabel: generation.model_label,
    provider: generation.provider,
    imageSize:
      generationMetadata.resultImageSize ||
      generationMetadata.controlImageSize ||
      summaryMetadata.imageSize,
    aspectRatio: generation.aspect_ratio,
    quality: generation.quality,
    outputFormat: generationMetadata.outputFormat,
    width: generationMetadata.width,
    height: generationMetadata.height,
    prompt: generation.prompt,
    negativePrompt: generation.negative_prompt
  };
}

async function backfillSummary(summary) {
  if (!summaryNeedsBackfill(summary)) {
    return { status: 'skipped', reason: 'already has visual metadata' };
  }

  const imageUrl = extractFirstImageUrl(summary.markdown) || summary.url;
  const storageLookup = extractStorageLookupFromImageUrl(imageUrl);
  const generation = await findGeneration({ summary, storageLookup });
  if (!generation) {
    return { status: 'skipped', reason: 'matching generation not found' };
  }

  const metadata = await buildVisualMetadata(summary, generation, storageLookup);
  if (!dryRun) {
    const { error } = await supabase
      .from('summaries')
      .update({ metadata })
      .eq('id', summary.id);
    if (error) throw error;
  }

  return { status: dryRun ? 'dry-run' : 'updated' };
}

async function loadCandidateSummaries() {
  const summaries = [];
  for (let offset = 0; offset < limit; offset += pageSize) {
    const from = offset;
    const to = Math.min(offset + pageSize - 1, limit - 1);
    const { data, error } = await supabase
      .from('summaries')
      .select('id,user_id,url,markdown,tags,metadata,content_type,created_at')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    summaries.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return summaries;
}

const summaries = await loadCandidateSummaries();
const candidates = summaries.filter(
  (summary) => isVisualSummaryCandidate(summary) && summaryNeedsBackfill(summary)
);
let updated = 0;
let skipped = 0;
let failed = 0;

for (const summary of candidates) {
  try {
    const result = await backfillSummary(summary);
    if (result.status === 'updated' || result.status === 'dry-run') {
      updated += 1;
    } else {
      skipped += 1;
    }
    console.log(
      `${result.status}: ${summary.id}${result.reason ? ` (${result.reason})` : ''}`
    );
  } catch (error) {
    failed += 1;
    console.error(`failed: ${summary.id}`, error);
  }
}

console.log(
  JSON.stringify(
    {
      scanned: summaries.length,
      candidates: candidates.length,
      updated,
      skipped,
      failed,
      dryRun
    },
    null,
    2
  )
);
