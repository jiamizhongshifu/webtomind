export const GENERATION_SOUND_PREFERENCE_KEY =
  'webtomind.generation-sound-enabled';

export function isGenerationSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(GENERATION_SOUND_PREFERENCE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setGenerationSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      GENERATION_SOUND_PREFERENCE_KEY,
      String(enabled)
    );
  } catch {
    // A blocked storage backend should not prevent the preference from working
    // for the current rendered state.
  }
}
