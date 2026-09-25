import { describe, expect, it } from 'vitest';

import { isCompleteMoodboardItemOrder } from '../../api/moodboards/item-order';

describe('Moodboard item reordering', () => {
  const current = ['item-a', 'item-b', 'item-c'];

  it('accepts an exact permutation', () => {
    expect(
      isCompleteMoodboardItemOrder(['item-c', 'item-a', 'item-b'], current)
    ).toBe(true);
  });

  it.each([
    { submitted: ['item-a', 'item-a', 'item-c'] },
    { submitted: ['item-a', 'item-b'] },
    { submitted: ['item-a', 'item-b', 'foreign-item'] }
  ])(
    'rejects incomplete, duplicate, or foreign IDs: $submitted',
    ({ submitted }) => {
      expect(isCompleteMoodboardItemOrder(submitted, current)).toBe(false);
    }
  );
});
