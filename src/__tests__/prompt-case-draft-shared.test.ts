import { describe, expect, it } from 'vitest';

import { createPromptCaseSlug } from '../../api/admin/prompt-case-drafts/_shared';

describe('prompt case draft shared helpers', () => {
  it('keeps generated prompt case slugs inside the database format constraint after truncation', () => {
    const slug = createPromptCaseSlug(
      'Create a premium Korean streetwear fashion campaign in a cle',
      '7cf3c0e8-91f9-4231-9a95-6f6f64bcbfcb'
    );

    expect(slug).toBe(
      'create-a-premium-korean-streetwear-fashion-campaign-7cf3c0e8'
    );
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});
