import { describe, expect, it, vi } from 'vitest';
import { getAuthorizedMoodboardReferenceIds } from '../../api/image/generate/moodboard-reference-access';
import type { MoodboardConditioning } from '../shared/create-workspace-v2';

function conditioning(overrides: Partial<MoodboardConditioning> = {}) {
  return {
    moodboardId: 'board-1',
    shareToken: 'token-1',
    analysisVersion: 1,
    tasteProfile: 'Editorial film direction',
    keywords: [],
    avoids: [],
    guidelines: [],
    representativeAssetIds: ['foreign-ref-1'],
    ...overrides
  } satisfies MoodboardConditioning;
}

function databaseFor(options: {
  visibility?: 'private' | 'unlisted' | 'public';
  tokenValid?: boolean;
}) {
  return {
    from: vi.fn((table: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        is: vi.fn(() => query),
        maybeSingle: vi.fn(async () => {
          if (table === 'visual_moodboards') {
            return {
              data: {
                user_id: 'owner-1',
                visibility: options.visibility || 'unlisted',
                is_official: false,
                moderation_status: 'active',
                representative_asset_ids: ['foreign-ref-1'],
                visual_moodboard_items: [
                  { image_reference_id: 'foreign-ref-2' }
                ]
              },
              error: null
            };
          }
          return options.tokenValid
            ? { data: { expires_at: null }, error: null }
            : { data: null, error: null };
        })
      };
      return query;
    })
  };
}

describe('shared Moodboard reference authorization', () => {
  it('allows only references attached to a valid token-shared board', async () => {
    const database = databaseFor({ tokenValid: true });
    const result = await getAuthorizedMoodboardReferenceIds(
      database as never,
      'visitor-1',
      conditioning(),
      ['foreign-ref-1', 'unrelated-ref']
    );
    expect([...result]).toEqual(['foreign-ref-1']);
  });

  it('rejects an unlisted board after its share is revoked', async () => {
    const database = databaseFor({ tokenValid: false });
    const result = await getAuthorizedMoodboardReferenceIds(
      database as never,
      'visitor-1',
      conditioning(),
      ['foreign-ref-1']
    );
    expect(result.size).toBe(0);
  });

  it('allows attached references from a public active board without a token', async () => {
    const database = databaseFor({ visibility: 'public' });
    const result = await getAuthorizedMoodboardReferenceIds(
      database as never,
      'visitor-1',
      conditioning({ shareToken: undefined }),
      ['foreign-ref-2']
    );
    expect([...result]).toEqual(['foreign-ref-2']);
  });
});
