#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const dryRun = process.argv.includes('--dry-run');
const limit = Math.max(
  1,
  Math.min(1000, Number(limitArg?.split('=')[1] || 200) || 200)
);

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.'
  );
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

function getDerivativePath(originalPath, prefix) {
  const slashIndex = originalPath.lastIndexOf('/');
  const directory = slashIndex >= 0 ? originalPath.slice(0, slashIndex) : '';
  const fileName =
    slashIndex >= 0 ? originalPath.slice(slashIndex + 1) : originalPath;
  const baseName = fileName.replace(/\.[^.]+$/, '');
  return `${directory ? `${directory}/` : ''}${prefix}-${baseName}.webp`;
}

async function uploadDerivative({ bucket, originalPath, buffer, prefix, maxSize }) {
  const derivativePath = getDerivativePath(originalPath, prefix);
  const derivativeBuffer = await sharp(buffer)
    .rotate()
    .resize({
      width: maxSize,
      height: maxSize,
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({ quality: prefix === 'thumb' ? 76 : 82 })
    .toBuffer();
  const metadata = await sharp(derivativeBuffer).metadata();

  if (!dryRun) {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(derivativePath, derivativeBuffer, {
        contentType: 'image/webp',
        cacheControl: '31536000',
        upsert: true
      });
    if (error) throw error;
  }

  return {
    path: derivativePath,
    width: metadata.width,
    height: metadata.height,
    byteSize: derivativeBuffer.byteLength
  };
}

async function backfillRow(row) {
  const metadata = row.metadata && typeof row.metadata === 'object'
    ? row.metadata
    : {};
  const bucket = metadata.storageBucket || 'user-generated-images';
  const storagePath = metadata.storagePath;

  if (!storagePath) {
    return { status: 'skipped', reason: 'missing storagePath' };
  }
  if (metadata.thumbnailStoragePath && metadata.previewStoragePath) {
    return { status: 'skipped', reason: 'already has derivatives' };
  }

  const { data, error } = await supabase.storage.from(bucket).download(storagePath);
  if (error || !data) {
    throw new Error(error?.message || `Failed to download ${storagePath}`);
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const originalMetadata = await sharp(buffer).metadata();
  const thumbnail = metadata.thumbnailStoragePath
    ? null
    : await uploadDerivative({
        bucket,
        originalPath: storagePath,
        buffer,
        prefix: 'thumb',
        maxSize: 512
      });
  const preview = metadata.previewStoragePath
    ? null
    : await uploadDerivative({
        bucket,
        originalPath: storagePath,
        buffer,
        prefix: 'preview',
        maxSize: 1280
      });

  const nextMetadata = {
    ...metadata,
    storageBucket: bucket,
    storagePath,
    thumbnailStoragePath:
      metadata.thumbnailStoragePath || thumbnail?.path || undefined,
    previewStoragePath: metadata.previewStoragePath || preview?.path || undefined,
    width: metadata.width || originalMetadata.width,
    height: metadata.height || originalMetadata.height,
    byteSize: metadata.byteSize || buffer.byteLength,
    thumbnailWidth: metadata.thumbnailWidth || thumbnail?.width,
    thumbnailHeight: metadata.thumbnailHeight || thumbnail?.height,
    thumbnailByteSize: metadata.thumbnailByteSize || thumbnail?.byteSize,
    previewWidth: metadata.previewWidth || preview?.width,
    previewHeight: metadata.previewHeight || preview?.height,
    previewByteSize: metadata.previewByteSize || preview?.byteSize
  };

  if (!dryRun) {
    const { error: updateError } = await supabase
      .from('image_generations')
      .update({ metadata: nextMetadata })
      .eq('id', row.id);
    if (updateError) throw updateError;
  }

  return { status: dryRun ? 'dry-run' : 'updated' };
}

const { data, error } = await supabase
  .from('image_generations')
  .select('id,user_id,image_url,metadata,created_at')
  .order('created_at', { ascending: false })
  .limit(limit);

if (error) throw error;

const rows = (data || []).filter((row) => {
  const metadata = row.metadata && typeof row.metadata === 'object'
    ? row.metadata
    : {};
  return metadata.storagePath && (!metadata.thumbnailStoragePath || !metadata.previewStoragePath);
});

let updated = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
  try {
    const result = await backfillRow(row);
    if (result.status === 'updated' || result.status === 'dry-run') {
      updated += 1;
    } else {
      skipped += 1;
    }
    console.log(`${result.status}: ${row.id}${result.reason ? ` (${result.reason})` : ''}`);
  } catch (error) {
    failed += 1;
    console.error(`failed: ${row.id}`, error);
  }
}

console.log(
  JSON.stringify(
    {
      scanned: data?.length || 0,
      candidates: rows.length,
      updated,
      skipped,
      failed,
      dryRun
    },
    null,
    2
  )
);
