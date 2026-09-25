import { beforeEach, describe, expect, it } from 'vitest';
import {
  GENERATION_SOUND_PREFERENCE_KEY,
  isGenerationSoundEnabled,
  setGenerationSoundEnabled
} from '../generationSoundPreference';

describe('generation sound preference', () => {
  beforeEach(() => window.localStorage.clear());

  it('preserves the existing enabled default and persists an opt-out', () => {
    expect(isGenerationSoundEnabled()).toBe(true);

    setGenerationSoundEnabled(false);

    expect(window.localStorage.getItem(GENERATION_SOUND_PREFERENCE_KEY)).toBe(
      'false'
    );
    expect(isGenerationSoundEnabled()).toBe(false);
  });
});
