import { describe, expect, it } from 'vitest';
import { validateImageModelsPayload } from '../../scripts/validate-cloudflare-production.mjs';

describe('Cloudflare production image models validation', () => {
  it('accepts the curated user-facing image model list', () => {
    const result = validateImageModelsPayload({
      models: [
        { id: 'gpt-image-2.5', label: 'GPT Image 2.5' },
        { id: 'nano-banana', label: 'Nano Banana' }
      ]
    });

    expect(result.valid).toBe(true);
    expect(result.hasCuratedGptImage25).toBe(true);
    expect(result.retiredGptImageModels).toEqual([]);
    expect(result.forbiddenGpt5Models).toEqual([]);
  });

  it('rejects leaked upstream gpt-5 models', () => {
    const result = validateImageModelsPayload({
      models: [
        { id: 'gpt-image-2.5', label: 'GPT Image 2.5' },
        { id: 'gpt-5-chat-latest', label: 'GPT-5 Chat Latest' },
        { id: 'gpt-5-mini', label: 'GPT-5 Mini' }
      ]
    });

    expect(result.valid).toBe(false);
    expect(result.forbiddenGpt5Models).toEqual([
      'gpt-5-chat-latest',
      'gpt-5-mini'
    ]);
  });

  it('rejects payloads missing curated gpt-image-2.5', () => {
    const result = validateImageModelsPayload({
      models: [{ id: 'nano-banana', label: 'Nano Banana' }]
    });

    expect(result.valid).toBe(false);
    expect(result.hasCuratedGptImage25).toBe(false);
  });

  it('rejects retired GPT Image 2 and Codex variants', () => {
    const result = validateImageModelsPayload({
      models: [
        { id: 'gpt-image-2.5', label: 'GPT Image 2.5' },
        { id: 'gpt-image-2', label: 'GPT Image 2' },
        { id: 'pro-codex-gpt-image-2', label: 'GPT Image 2 Pro' }
      ]
    });

    expect(result.valid).toBe(false);
    expect(result.retiredGptImageModels).toEqual([
      'gpt-image-2',
      'pro-codex-gpt-image-2'
    ]);
  });
});
