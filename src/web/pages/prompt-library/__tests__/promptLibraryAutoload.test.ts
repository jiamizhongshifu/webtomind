import { describe, expect, it } from 'vitest';
import { shouldAutoLoadPromptCases } from '../promptLibraryAutoload';

describe('prompt library autoload', () => {
  it('does not spend page-two bandwidth before the visitor scrolls', () => {
    expect(
      shouldAutoLoadPromptCases({
        hasUserScrolled: false,
        sentinelTop: 700,
        viewportHeight: 900,
        margin: 960
      })
    ).toBe(false);
  });

  it('loads when a scrolled visitor approaches the sentinel', () => {
    expect(
      shouldAutoLoadPromptCases({
        hasUserScrolled: true,
        sentinelTop: 1200,
        viewportHeight: 900,
        margin: 960
      })
    ).toBe(true);
  });

  it('loads after Chrome restores an existing scroll position', () => {
    expect(
      shouldAutoLoadPromptCases({
        hasUserScrolled: false,
        scrollOffset: 1083,
        sentinelTop: 747,
        viewportHeight: 951,
        margin: 960
      })
    ).toBe(true);
  });

  it('does not treat a page at the top as scroll intent', () => {
    expect(
      shouldAutoLoadPromptCases({
        hasUserScrolled: false,
        scrollOffset: 0,
        sentinelTop: 700,
        viewportHeight: 900,
        margin: 960
      })
    ).toBe(false);
  });
});
