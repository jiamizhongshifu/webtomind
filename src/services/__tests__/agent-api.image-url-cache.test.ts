import { beforeEach, describe, expect, it } from 'vitest';
import { getCachedVisualImageUrlsByIds } from '../agent-api';

const CACHE_KEY = 'webtomind_visual_image_url_cache_v1';

describe('visual image URL cache', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns stable signed thumbnail URLs while they remain valid', () => {
    const now = Date.now();
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        'generation-1': {
          imageUrl: 'https://cdn.example.com/original.jpg?token=stable',
          thumbnailUrl: 'https://cdn.example.com/thumb.jpg?token=stable',
          previewUrl: 'https://cdn.example.com/preview.jpg?token=stable',
          expiresAt: now + 60 * 60 * 1000,
          cachedAt: now
        }
      })
    );

    expect(
      getCachedVisualImageUrlsByIds(['generation-1', 'generation-1'])
    ).toEqual({
      'generation-1': {
        imageUrl: 'https://cdn.example.com/original.jpg?token=stable',
        thumbnailUrl: 'https://cdn.example.com/thumb.jpg?token=stable',
        previewUrl: 'https://cdn.example.com/preview.jpg?token=stable'
      }
    });
  });

  it('drops URLs that are inside the signed URL expiry safety margin', () => {
    const now = Date.now();
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        'generation-expiring': {
          imageUrl: 'https://cdn.example.com/original.jpg?token=expiring',
          expiresAt: now + 4 * 60 * 1000,
          cachedAt: now
        }
      })
    );

    expect(getCachedVisualImageUrlsByIds(['generation-expiring'])).toEqual({});
    expect(JSON.parse(window.localStorage.getItem(CACHE_KEY) || '{}')).toEqual(
      {}
    );
  });
});
