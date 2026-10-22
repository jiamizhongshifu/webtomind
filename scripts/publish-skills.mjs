#!/usr/bin/env node
// Publishes first-party Skills from the content repository into the catalog.
//
//   node scripts/publish-skills.mjs --content <dir> [--only a,b] [--apply]
//
// Without --apply it prints the plan and writes nothing. With --apply it
// uploads each new version's archive to the private Skill bucket, uploads
// real-run example media to the public media bucket and writes skill_catalog,
// skill_catalog_versions and skill_catalog_examples. Published versions are
// immutable: an unchanged archive is skipped, a changed one needs a new
// version in skill.json.
//
// Required env for --apply: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_S3_ENDPOINT (or
// CLOUDFLARE_ACCOUNT_ID), SKILL_PACKAGES_R2_BUCKET (private, not the media
// bucket), MEDIA_R2_BUCKET and MEDIA_PUBLIC_BASE_URL.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import {
  archiveObjectKey,
  buildDeterministicArchive,
  exampleObjectKey,
  mapManifest,
  mediaContentType,
  sha256Hex
} from './lib/skill-publish.mjs';

function parseArgs(argv) {
  const args = { content: null, only: null, apply: false, requireExamples: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--content') args.content = argv[++index];
    else if (arg === '--only') args.only = new Set(argv[++index].split(',').filter(Boolean));
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--allow-missing-examples') args.requireExamples = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.content) throw new Error('--content <content repository> is required');
  return args;
}

function env(name) {
  return (process.env[name] || '').trim();
}

function requireEnv(names) {
  const missing = names.filter((name) => !env(name));
  if (missing.length) throw new Error(`Missing env: ${missing.join(', ')}`);
}

function r2Endpoint() {
  const endpoint =
    env('R2_S3_ENDPOINT') ||
    (env('CLOUDFLARE_ACCOUNT_ID')
      ? `https://${env('CLOUDFLARE_ACCOUNT_ID')}.r2.cloudflarestorage.com`
      : '');
  if (!endpoint) throw new Error('Missing env: R2_S3_ENDPOINT or CLOUDFLARE_ACCOUNT_ID');
  return endpoint.replace(/\/+$/, '');
}

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest();
}

async function putObject({ bucket, key, body, contentType, cacheControl }) {
  const url = new URL(
    `${r2Endpoint()}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`
  );
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = createHash('sha256').update(body).digest('hex');
  const headers = {
    'cache-control': cacheControl,
    'content-type': contentType,
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalRequest = [
    'PUT',
    url.pathname,
    '',
    ...Object.keys(headers)
      .sort()
      .map((name) => `${name}:${headers[name]}`),
    '',
    signedHeaders,
    payloadHash
  ].join('\n');
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    createHash('sha256').update(canonicalRequest).digest('hex')
  ].join('\n');
  let signingKey = hmac(`AWS4${env('R2_SECRET_ACCESS_KEY')}`, dateStamp);
  for (const part of ['auto', 's3', 'aws4_request']) signingKey = hmac(signingKey, part);
  const signature = hmac(signingKey, stringToSign).toString('hex');
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${env('R2_ACCESS_KEY_ID')}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
    },
    body
  });
  if (!response.ok) {
    throw new Error(`R2 PUT ${bucket}/${key} failed: ${response.status}`);
  }
}

function loadSkills(contentRoot, only) {
  const skillsDir = path.join(contentRoot, 'skills');
  if (!existsSync(skillsDir)) throw new Error(`No skills/ directory in ${contentRoot}`);
  return readdirSync(skillsDir)
    .filter((name) => !name.startsWith('.'))
    .filter((name) => !only || only.has(name))
    .sort()
    .map((dirName) => {
      const root = path.join(skillsDir, dirName);
      const manifest = JSON.parse(readFileSync(path.join(root, 'skill.json'), 'utf8'));
      return { root, dirName, manifest, mapped: mapManifest(manifest, { dirName }) };
    });
}

async function check(result, context) {
  const { data, error } = await result;
  if (error) throw new Error(`${context}: ${error.message}`);
  return data;
}

async function publishSkill(supabase, skill, buckets) {
  const { mapped, root } = skill;
  const archive = buildDeterministicArchive(root, mapped.slug);
  const sha256 = sha256Hex(archive);

  const existing = await check(
    supabase.from('skill_catalog').select('id, status, published_at').eq('slug', mapped.slug).maybeSingle(),
    `${mapped.slug}: read catalog`
  );
  const catalogRow = await check(
    supabase
      .from('skill_catalog')
      .upsert({ ...mapped.catalog, updated_at: new Date().toISOString() }, { onConflict: 'slug' })
      .select('id')
      .single(),
    `${mapped.slug}: upsert catalog`
  );

  const version = await check(
    supabase
      .from('skill_catalog_versions')
      .select('id, sha256, status')
      .eq('skill_id', catalogRow.id)
      .eq('version', mapped.version)
      .maybeSingle(),
    `${mapped.slug}: read version`
  );
  if (version && version.sha256 !== sha256) {
    throw new Error(
      `${mapped.slug}@${mapped.version} is already published with different content; bump version in skill.json`
    );
  }

  let versionId = version?.id;
  if (!versionId) {
    const objectKey = archiveObjectKey(mapped.slug, mapped.version, randomBytes(16).toString('hex'));
    await putObject({
      bucket: buckets.packages,
      key: objectKey,
      body: archive,
      contentType: 'application/gzip',
      cacheControl: 'private, max-age=0, no-store'
    });
    const publishedAt = new Date().toISOString();
    const inserted = await check(
      supabase
        .from('skill_catalog_versions')
        .insert({
          skill_id: catalogRow.id,
          ...mapped.version_row,
          status: 'published',
          r2_object_key: objectKey,
          archive_format: 'tar.gz',
          sha256,
          size_bytes: archive.length,
          published_at: publishedAt
        })
        .select('id')
        .single(),
      `${mapped.slug}: insert version`
    );
    versionId = inserted.id;

    const exampleRows = [];
    for (const example of mapped.examples) {
      const upload = async (file) => {
        const key = exampleObjectKey(mapped.slug, mapped.version, file);
        await putObject({
          bucket: buckets.media,
          key,
          body: readFileSync(path.join(root, file)),
          contentType: mediaContentType(file),
          cacheControl: 'public, max-age=31536000, immutable'
        });
        return `${buckets.mediaBaseUrl}/${key}`;
      };
      exampleRows.push({
        version_id: versionId,
        media_type: example.media_type,
        media_url: await upload(example.file),
        poster_url: example.posterFile ? await upload(example.posterFile) : null,
        title: example.title,
        sort_order: example.sort_order
      });
    }
    if (exampleRows.length) {
      await check(
        supabase.from('skill_catalog_examples').insert(exampleRows),
        `${mapped.slug}: insert examples`
      );
    }
  }

  await check(
    supabase
      .from('skill_catalog')
      .update({
        status: 'published',
        latest_version_id: versionId,
        published_at: existing?.published_at || new Date().toISOString()
      })
      .eq('id', catalogRow.id),
    `${mapped.slug}: publish catalog`
  );
  return { sha256, size: archive.length, created: !version };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const skills = loadSkills(path.resolve(args.content), args.only);
  if (skills.length === 0) throw new Error('No Skills selected');

  const blocked = skills.filter((skill) => args.requireExamples && skill.mapped.examples.length === 0);
  for (const skill of skills) {
    const archive = buildDeterministicArchive(skill.root, skill.mapped.slug);
    const flag = blocked.includes(skill) ? 'BLOCKED (no real-run example)' : 'ready';
    console.log(
      `${skill.mapped.slug}@${skill.mapped.version} ${skill.mapped.catalog.tier} ` +
        `${(archive.length / 1024).toFixed(0)} KiB sha256=${sha256Hex(archive).slice(0, 12)} ` +
        `examples=${skill.mapped.examples.length} ${flag}`
    );
  }
  if (blocked.length) {
    console.log(`\n${blocked.length} Skill(s) blocked; add real-run examples or pass --allow-missing-examples.`);
  }
  if (!args.apply) {
    console.log('\nDry run: nothing uploaded or written. Re-run with --apply to publish.');
    return;
  }

  requireEnv([
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'SKILL_PACKAGES_R2_BUCKET',
    'MEDIA_R2_BUCKET',
    'MEDIA_PUBLIC_BASE_URL'
  ]);
  if (env('SKILL_PACKAGES_R2_BUCKET') === env('MEDIA_R2_BUCKET')) {
    throw new Error('SKILL_PACKAGES_R2_BUCKET must be a private bucket separate from the public media bucket');
  }
  const buckets = {
    packages: env('SKILL_PACKAGES_R2_BUCKET'),
    media: env('MEDIA_R2_BUCKET'),
    mediaBaseUrl: env('MEDIA_PUBLIC_BASE_URL').replace(/\/+$/, '')
  };
  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false }
  });
  for (const skill of skills) {
    if (blocked.includes(skill)) continue;
    const result = await publishSkill(supabase, skill, buckets);
    console.log(`${result.created ? 'published' : 'unchanged'} ${skill.mapped.slug}@${skill.mapped.version}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
