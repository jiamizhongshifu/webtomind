import { beforeEach, describe, expect, it } from 'vitest';
import {
  readMoodboardLibraryPreferences,
  togglePreferenceId,
  writeMoodboardLibraryPreferences
} from '../moodboard-library-preferences';

describe('moodboard library preferences', () => {
  beforeEach(() => window.localStorage.clear());

  it('persists favorite, visited, hidden and copied preset state', () => {
    writeMoodboardLibraryPreferences(
      {
        favoritePresetIds: ['preset-a'],
        visitedPresetIds: ['preset-b'],
        hiddenPersonalIds: ['board-c'],
        copiedPresetIds: { 'preset-b': 'board-b' }
      },
      'user-a'
    );

    expect(readMoodboardLibraryPreferences('user-a')).toEqual({
      favoritePresetIds: ['preset-a'],
      visitedPresetIds: ['preset-b'],
      hiddenPersonalIds: ['board-c'],
      copiedPresetIds: { 'preset-b': 'board-b' }
    });
    expect(readMoodboardLibraryPreferences('user-b')).toEqual({
      favoritePresetIds: [],
      visitedPresetIds: [],
      hiddenPersonalIds: [],
      copiedPresetIds: {}
    });
  });

  it('pins new ids first and removes existing ids', () => {
    expect(togglePreferenceId(['a'], 'b')).toEqual(['b', 'a']);
    expect(togglePreferenceId(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('drops malformed copied-board mappings from browser storage', () => {
    window.localStorage.setItem(
      'webtomind:moodboard-library-preferences:v2:user-a',
      JSON.stringify({
        copiedPresetIds: {
          valid: 'personal-board',
          object: { id: 'wrong-shape' },
          number: 4
        }
      })
    );

    expect(readMoodboardLibraryPreferences('user-a').copiedPresetIds).toEqual({
      valid: 'personal-board'
    });
  });
});
