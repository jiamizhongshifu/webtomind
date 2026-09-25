import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hasSeenActivationTeachingHint,
  markActivationTeachingHintSeen,
  recordActivationTeachingHintShown
} from '../activation-teaching-hints';

const HINTS_STORAGE_KEY = 'webtomind:activation-teaching-hints:v1';

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('activation teaching hints state', () => {
  it('marks a hint as permanently seen when dismissed by the user', () => {
    expect(hasSeenActivationTeachingHint('reference')).toBe(false);
    markActivationTeachingHintSeen('reference');
    expect(hasSeenActivationTeachingHint('reference')).toBe(true);
  });

  it('stops showing a hint after the display cap instead of nagging forever', () => {
    expect(recordActivationTeachingHintShown('history')).toBe(true);
    expect(hasSeenActivationTeachingHint('history')).toBe(false);
    expect(recordActivationTeachingHintShown('history')).toBe(true);
    expect(hasSeenActivationTeachingHint('history')).toBe(false);
    expect(recordActivationTeachingHintShown('history')).toBe(false);
    expect(hasSeenActivationTeachingHint('history')).toBe(true);
  });

  it('tracks each hint independently', () => {
    recordActivationTeachingHintShown('reference');
    recordActivationTeachingHintShown('reference');
    expect(hasSeenActivationTeachingHint('reference')).toBe(false);
    expect(recordActivationTeachingHintShown('reference')).toBe(false);
    expect(hasSeenActivationTeachingHint('reference')).toBe(true);
    expect(hasSeenActivationTeachingHint('moodboard')).toBe(false);
  });

  it('resets dismissed state when the hint version is bumped', () => {
    markActivationTeachingHintSeen('moodboard');
    window.localStorage.setItem(
      HINTS_STORAGE_KEY,
      JSON.stringify({ version: 1, seen: ['moodboard'], shows: { moodboard: 2 } })
    );
    expect(hasSeenActivationTeachingHint('moodboard')).toBe(false);
    expect(recordActivationTeachingHintShown('moodboard')).toBe(true);
  });
});
