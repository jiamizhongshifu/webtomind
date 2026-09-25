#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import process from 'node:process';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const localEnv = dotenv.parse(readFileSync('.env.local', 'utf8'));
const env = { ...localEnv, ...process.env };
const apiBase = String(
  env.MOODBOARD_SMOKE_API_BASE || 'http://127.0.0.1:8787'
).replace(/\/$/, '');
const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY'
];

for (const key of requiredEnv) {
  if (!env[key]) throw new Error(`Missing ${key} for Moodboard real API smoke`);
}

const service = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
const anonymous = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `moodboard-smoke-${stamp}@example.com`;
const password = `Smoke-${crypto.randomUUID()}-Aa1!`;
const state = { userId: '', token: '', boardId: '', references: [] };

async function apiJson(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token
        ? { Authorization: `Bearer ${state.token}` }
        : {}),
      ...(init.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `${init.method || 'GET'} ${path} -> ${response.status}: ${body.error || JSON.stringify(body)}`
    );
  }
  return body;
}

async function uploadDiscoveryReferences() {
  const discovery = await apiJson('/api/discovery/search');
  const sourceUrls = [
    ...new Set(
      discovery.images
        .map((image) => image.imageUrl)
        .filter((url) =>
          /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//.test(
            url
          )
        )
    )
  ].slice(0, 4);
  if (sourceUrls.length < 4) {
    throw new Error(`Need 4 stable public images, got ${sourceUrls.length}`);
  }

  for (const [index, sourceUrl] of sourceUrls.entries()) {
    const imageResponse = await fetch(sourceUrl);
    if (!imageResponse.ok) {
      throw new Error(`Source image ${index + 1} -> ${imageResponse.status}`);
    }
    const mimeType =
      imageResponse.headers.get('content-type')?.split(';')[0] || 'image/png';
    const bytes = new Uint8Array(await imageResponse.arrayBuffer());
    if (!mimeType.startsWith('image/') || bytes.length > 8 * 1024 * 1024) {
      throw new Error(`Source image ${index + 1} is not a valid reference`);
    }
    const uploaded = await apiJson('/api/image/references/upload', {
      method: 'POST',
      body: JSON.stringify({
        imageBase64: `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`,
        mimeType,
        role: 'style',
        label: `Moodboard smoke ${index + 1}`,
        sourceApp: 'moodboard_real_smoke'
      })
    });
    state.references.push(uploaded.reference);
    console.log(`asset:upload_${index + 1}=ok bytes=${bytes.length}`);
  }
}

async function runSmoke() {
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { purpose: 'moodboard-real-api-smoke' }
  });
  if (created.error || !created.data.user) {
    throw created.error || new Error('Test user creation failed');
  }
  state.userId = created.data.user.id;
  console.log('auth:create_user=ok');

  const signedIn = await anonymous.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) {
    throw signedIn.error || new Error('Test user sign-in failed');
  }
  state.token = signedIn.data.session.access_token;
  console.log('auth:sign_in=ok');

  await uploadDiscoveryReferences();
  const listed = await apiJson('/api/image/references');
  if (
    !state.references.every((reference) =>
      listed.references.some((item) => item.id === reference.id)
    )
  ) {
    throw new Error('Uploaded references are missing from personal assets');
  }
  console.log(`asset:list=ok matched=${state.references.length}`);

  const createdBoard = await apiJson('/api/moodboards', {
    method: 'POST',
    body: JSON.stringify({
      name: `Moodboard real smoke ${stamp}`,
      description: 'Temporary end-to-end smoke; safe to delete.'
    })
  });
  state.boardId = createdBoard.moodboard.id;
  console.log('moodboard:create=ok');

  const withItems = await apiJson(`/api/moodboards/${state.boardId}/items`, {
    method: 'POST',
    body: JSON.stringify({
      items: state.references.map((reference, index) => ({
        source: 'upload',
        imageUrl: reference.thumbnailUrl,
        title: `Smoke ${index + 1}`,
        imageReferenceId: reference.id
      }))
    })
  });
  if (withItems.moodboard.itemCount !== 4) {
    throw new Error(`Expected 4 Moodboard items, got ${withItems.moodboard.itemCount}`);
  }
  console.log('moodboard:add_items=ok count=4');

  const analyzed = await apiJson(
    `/api/moodboards/${state.boardId}/analyze`,
    { method: 'POST' }
  );
  const board = analyzed.moodboard;
  if (
    board.analysisStatus !== 'ready' ||
    !board.tasteProfile ||
    !Array.isArray(board.keywords) ||
    board.keywords.length < 3
  ) {
    throw new Error(
      `Analysis incomplete: ${JSON.stringify({
        status: board.analysisStatus,
        tasteProfile: Boolean(board.tasteProfile),
        keywords: board.keywords?.length
      })}`
    );
  }
  console.log(
    `moodboard:analyze=ok provider=${env.MOODBOARD_ANALYSIS_PROVIDER || 'auto'} keywords=${board.keywords.length} profile_chars=${board.tasteProfile.length}`
  );
}

async function cleanup() {
  const failures = [];
  if (state.boardId && state.token) {
    try {
      await apiJson(`/api/moodboards/${state.boardId}`, { method: 'DELETE' });
      console.log('cleanup:moodboard=ok');
    } catch (error) {
      failures.push(`moodboard: ${error.message}`);
    }
  }

  for (const reference of state.references) {
    if (state.token) {
      try {
        await apiJson(`/api/image/references?id=${encodeURIComponent(reference.id)}`, {
          method: 'DELETE'
        });
      } catch (error) {
        failures.push(`reference ${reference.id}: ${error.message}`);
      }
    }
    if (reference.storageBucket && reference.storagePath) {
      const removed = await service.storage
        .from(reference.storageBucket)
        .remove([reference.storagePath]);
      if (removed.error) {
        failures.push(`storage ${reference.id}: ${removed.error.message}`);
      }
    }
  }
  if (state.references.length) {
    console.log(`cleanup:references_and_storage=${state.references.length}`);
  }

  if (state.userId) {
    const deleted = await service.auth.admin.deleteUser(state.userId);
    if (deleted.error) failures.push(`user: ${deleted.error.message}`);
    else console.log('cleanup:user=ok');
  }
  if (failures.length) {
    throw new Error(`Smoke cleanup failed: ${failures.join(' | ')}`);
  }
}

let smokeError;
try {
  await runSmoke();
} catch (error) {
  smokeError = error;
} finally {
  try {
    await cleanup();
  } catch (cleanupError) {
    smokeError = smokeError
      ? new Error(`${smokeError.message}; ${cleanupError.message}`)
      : cleanupError;
  }
}

if (smokeError) throw smokeError;
console.log('REAL_MOODBOARD_SMOKE=PASS');
