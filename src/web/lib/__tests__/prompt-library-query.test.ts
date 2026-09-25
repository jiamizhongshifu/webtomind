import { describe, expect, it } from 'vitest';
import { normalizePromptLibrarySearch } from '../prompt-library-query';

describe('prompt library query normalization', () => {
  it('repairs repeated question-mark separators from legacy prompt links', () => {
    expect(
      normalizePromptLibrarySearch(
        '?caseId=case-1?caseId=case-1&caseSlug=portrait'
      )
    ).toBe('?caseId=case-1&caseSlug=portrait');
    expect(
      normalizePromptLibrarySearch(
        '?label=portrait-photography?label=portrait-photography'
      )
    ).toBe('?label=portrait-photography');
  });

  it('deduplicates query keys while preserving acquisition parameters', () => {
    expect(
      normalizePromptLibrarySearch(
        '?sort=hot&sort=hot&utm_source=google&utm_campaign=portrait'
      )
    ).toBe('?sort=hot&utm_source=google&utm_campaign=portrait');
  });
});
