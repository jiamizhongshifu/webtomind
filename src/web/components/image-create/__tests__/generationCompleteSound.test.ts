import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playGenerationCompleteSound } from '../generationCompleteSound';
import { setGenerationSoundEnabled } from '../generationSoundPreference';

describe('generation completion sound', () => {
  const resume = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    window.localStorage.clear();
    resume.mockClear();
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: class {
        resume = resume;
      }
    });
  });

  it('does not create or resume audio after the user opts out', () => {
    setGenerationSoundEnabled(false);

    playGenerationCompleteSound();

    expect(resume).not.toHaveBeenCalled();
  });
});
