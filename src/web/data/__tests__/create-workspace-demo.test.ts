import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createCaseMoodboardPreviews } from '../create-workspace-demo';

const EXPECTED_OFFICIAL_PRESET_IDS = [
  'demo-personal-film',
  'demo-personal-editorial',
  'demo-preset-golden-hour',
  'demo-preset-neon-night',
  'demo-preset-quiet-window',
  'demo-preset-candle',
  'demo-preset-rain-room',
  'demo-preset-listening-bar',
  'demo-krea-impasto-expressionism',
  'demo-krea-expressive-marker',
  'demo-krea-thermal-airbrush',
  'demo-preset-architectural-poetry',
  'demo-preset-commercial-still-life',
  'demo-preset-wild-landscape',
  'demo-preset-surreal-object',
  'demo-preset-natural-macro',
  'demo-preset-urban-after-dark',
  'demo-preset-quiet-residence',
  'demo-preset-graphic-experiments'
] as const;

describe('curated moodboard preset contract', () => {
  it('ships complete visual analysis while leaving personal guidelines empty', () => {
    const presets = createCaseMoodboardPreviews().filter(
      (board) => board.isOfficial
    );

    // Open-source build ships only presets backed by bundled images.
    expect(presets.length).toBeGreaterThan(0);
    for (const preset of presets) {
      expect(EXPECTED_OFFICIAL_PRESET_IDS).toContain(preset.id);
    }
    for (const preset of presets) {
      const items = preset.items ?? [];
      expect(preset.analysisStatus).toBe('ready');
      expect(preset.analysisVersion).toBeGreaterThan(0);
      expect(preset.tasteProfile.trim().length).toBeGreaterThan(20);
      expect(preset.keywords.length).toBeGreaterThanOrEqual(3);
      expect(preset.guidelines).toEqual([]);
      expect(items.length).toBeGreaterThanOrEqual(4);
      expect(items.length).toBeLessThanOrEqual(8);
      expect(new Set(items.map((item) => item.imageUrl)).size).toBe(
        items.length
      );
      for (const item of items) {
        expect(existsSync(join(process.cwd(), 'public', item.imageUrl))).toBe(
          true
        );
      }
    }
  });
});
