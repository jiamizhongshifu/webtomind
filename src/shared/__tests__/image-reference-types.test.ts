import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_REFERENCE_IDS,
  mergeBillableImageReferenceIds
} from '../image-reference-types';

describe('billable image references', () => {
  it('matches the backend merge, dedupe, and cap contract', () => {
    expect(
      mergeBillableImageReferenceIds(
        ['manual-1', 'shared-1'],
        ['moodboard-1', 'shared-1'],
        ['character-1', 'character-2']
      )
    ).toEqual(['manual-1', 'shared-1', 'moodboard-1', 'character-1']);
    expect(
      mergeBillableImageReferenceIds(
        Array.from(
          { length: MAX_IMAGE_REFERENCE_IDS + 2 },
          (_, index) => `reference-${index}`
        )
      )
    ).toHaveLength(MAX_IMAGE_REFERENCE_IDS);
  });
});
