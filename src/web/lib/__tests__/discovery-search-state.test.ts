import { describe, expect, it } from 'vitest';
import {
  composeDiscoverySearchQuery,
  createDiscoverySearchFailure
} from '../discovery-search-state';

describe('composeDiscoverySearchQuery', () => {
  it('keeps image-derived terms hidden while combining them with user input', () => {
    expect(
      composeDiscoverySearchQuery(
        'cinematic portrait warm light',
        '  editorial cover  '
      )
    ).toBe('cinematic portrait warm light editorial cover');
  });

  it('supports text-only and image-only searches', () => {
    expect(composeDiscoverySearchQuery('', 'minimal product')).toBe(
      'minimal product'
    );
    expect(composeDiscoverySearchQuery('soft daylight', '')).toBe(
      'soft daylight'
    );
  });
});

describe('createDiscoverySearchFailure', () => {
  it('keeps an initial empty-query failure visible', () => {
    const failure = createDiscoverySearchFailure(
      '',
      new Error('API unavailable'),
      false
    );

    expect(failure.result).toEqual({ query: '', images: [], moodboards: [] });
    expect(failure.message).toBe('API unavailable');
  });

  it('uses a localized fallback for non-Error failures', () => {
    expect(createDiscoverySearchFailure('', null, true).message).toBe(
      'Discovery is temporarily unavailable.'
    );
    expect(createDiscoverySearchFailure('', null, false).message).toBe(
      '灵感内容暂时不可用'
    );
  });
});
