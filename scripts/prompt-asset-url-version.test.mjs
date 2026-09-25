import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPromptAssetContentVersion,
  versionPromptAssetPublicUrl
} from './prompt-asset-url-version.mjs';

test('uses the image bytes as the public thumbnail cache version', () => {
  const first = Buffer.from('first image');
  const second = Buffer.from('second image');

  assert.equal(getPromptAssetContentVersion(first).length, 16);
  assert.notEqual(
    getPromptAssetContentVersion(first),
    getPromptAssetContentVersion(second)
  );
  assert.equal(
    versionPromptAssetPublicUrl(
      'https://cdn.example.com/prompt.webp?download=1',
      first
    ),
    `https://cdn.example.com/prompt.webp?download=1&v=${getPromptAssetContentVersion(first)}`
  );
});

test('replaces an existing version instead of accumulating cache keys', () => {
  const bytes = Buffer.from('replacement image');
  const url = versionPromptAssetPublicUrl(
    'https://cdn.example.com/prompt.webp?v=old',
    bytes
  );

  assert.equal(new URL(url).searchParams.getAll('v').length, 1);
  assert.equal(
    new URL(url).searchParams.get('v'),
    getPromptAssetContentVersion(bytes)
  );
});
