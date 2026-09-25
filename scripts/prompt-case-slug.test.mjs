import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildStablePromptCaseSlug,
  slugifyPromptCase
} from './lib/prompt-case-slug.mjs';

test('creates a readable stable slug from English prompt-case metadata', () => {
  assert.equal(
    buildStablePromptCaseSlug({
      id: '3ef20b2a-db59-430d-82a5-bbea3cf8e43d',
      model: 'gpt-image-2',
      title_en: 'Pillow Photoshoot Prompt',
      title: '抱枕写真提示词',
      category: 'portrait',
      tags: ['写真']
    }),
    'gpt-image-2-pillow-photoshoot-prompt-portrait-3ef20b2adb'
  );
});

test('falls back to model and category when all titles are CJK', () => {
  assert.equal(
    buildStablePromptCaseSlug({
      id: '18540db9-a283-4ce1-877c-f8e103610627',
      model: 'gpt-image-2',
      title: '写真案例',
      category: 'portrait'
    }),
    'gpt-image-2-portrait-18540db9a2'
  );
});

test('keeps an existing slug and normalizes punctuation consistently', () => {
  assert.equal(
    buildStablePromptCaseSlug({
      id: 'ignored',
      slug: 'existing-prompt-case'
    }),
    'existing-prompt-case'
  );
  assert.equal(
    slugifyPromptCase("GPT Image 2: Founder’s Portrait"),
    'gpt-image-2-founder-s-portrait'
  );
});

test('removes repeated metadata tokens from the permanent URL', () => {
  assert.equal(
    buildStablePromptCaseSlug({
      id: '9e2ac846-8308-4986-8a5e-27117f9faf98',
      model: 'gpt-image-2',
      title_en: 'GTA 6 Cover Girls',
      title: 'GTA 6 封面女郎',
      category: 'portrait',
      tags: ['GTA 6', 'portrait']
    }),
    'gpt-image-2-gta-6-cover-girls-portrait-9e2ac84683'
  );
});
