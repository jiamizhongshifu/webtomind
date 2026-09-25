const STORAGE_KEY_PREFIX = 'webtomind:moodboard-library-preferences:v2';

export interface MoodboardLibraryPreferences {
  favoritePresetIds: string[];
  visitedPresetIds: string[];
  hiddenPersonalIds: string[];
  copiedPresetIds: Record<string, string>;
}

const EMPTY_PREFERENCES: MoodboardLibraryPreferences = {
  favoritePresetIds: [],
  visitedPresetIds: [],
  hiddenPersonalIds: [],
  copiedPresetIds: {}
};

function getStorageKey(ownerId: string): string {
  return `${STORAGE_KEY_PREFIX}:${ownerId || 'anonymous'}`;
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );
}

export function readMoodboardLibraryPreferences(
  ownerId = 'anonymous'
): MoodboardLibraryPreferences {
  if (typeof window === 'undefined') return EMPTY_PREFERENCES;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(getStorageKey(ownerId)) || '{}'
    ) as Partial<MoodboardLibraryPreferences>;
    return {
      favoritePresetIds: Array.isArray(parsed.favoritePresetIds)
        ? parsed.favoritePresetIds.filter(
            (id): id is string => typeof id === 'string'
          )
        : [],
      visitedPresetIds: Array.isArray(parsed.visitedPresetIds)
        ? parsed.visitedPresetIds.filter(
            (id): id is string => typeof id === 'string'
          )
        : [],
      hiddenPersonalIds: Array.isArray(parsed.hiddenPersonalIds)
        ? parsed.hiddenPersonalIds.filter(
            (id): id is string => typeof id === 'string'
          )
        : [],
      copiedPresetIds: readStringRecord(parsed.copiedPresetIds)
    };
  } catch {
    return EMPTY_PREFERENCES;
  }
}

export function writeMoodboardLibraryPreferences(
  preferences: MoodboardLibraryPreferences,
  ownerId = 'anonymous'
): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    getStorageKey(ownerId),
    JSON.stringify(preferences)
  );
}

export function togglePreferenceId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [id, ...ids];
}
