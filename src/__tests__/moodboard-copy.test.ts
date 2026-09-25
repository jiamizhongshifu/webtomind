import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildMoodboardCopyFields,
  buildClientPresetCopyFields,
  buildClientPresetCopyItems,
  buildMoodboardCopyItems
} from '../../api/moodboards/copy';
import { getMoodboardListVisibilityFilter } from '../../api/moodboards/index';

const copyHandler = readFileSync(
  join(process.cwd(), 'api/moodboards/index.ts'),
  'utf8'
);

describe('moodboard preset copy contract', () => {
  it('keeps official and public moodboards browseable without exposing private boards', () => {
    expect(getMoodboardListVisibilityFilter(null)).toBe(
      'is_official.eq.true,visibility.eq.public'
    );
    expect(getMoodboardListVisibilityFilter('user-a')).toBe(
      'user_id.eq.user-a,is_official.eq.true,visibility.eq.public'
    );
  });

  it('preserves ready analysis so the copy can condition generation', () => {
    expect(
      buildMoodboardCopyFields({
        analysis_status: 'ready',
        analysis_version: 3,
        taste_profile: 'Glossy Y2K editorial portraits',
        keywords: ['chrome', 'direct flash'],
        avoids: ['flat lighting'],
        guidelines: ['Keep specular highlights']
      })
    ).toEqual({
      analysis_status: 'ready',
      analysis_version: 3,
      taste_profile: 'Glossy Y2K editorial portraits',
      keywords: ['chrome', 'direct flash'],
      avoids: ['flat lighting'],
      guidelines: [],
      representative_asset_ids: []
    });
  });

  it('materializes a curated frontend preset with analysis but empty personal guidelines', () => {
    expect(
      buildClientPresetCopyFields({
        presetKey: 'demo-coquette',
        tasteProfile: 'Soft blush lace and diffused garden light',
        keywords: ['coquette', 'blush pink'],
        avoids: ['neon'],
        guidelines: ['This official text must not become user guidance'],
        items: [{ imageUrl: '/moodboards/coquette-1.webp', title: 'Lace' }]
      })
    ).toMatchObject({
      presetKey: 'demo-coquette',
      analysis: {
        analysis_status: 'ready',
        taste_profile: 'Soft blush lace and diffused garden light',
        keywords: ['coquette', 'blush pink'],
        guidelines: [],
        analysis_version: 1
      }
    });
  });

  it('keeps frontend preset provenance outside the UUID source column', () => {
    expect(
      buildClientPresetCopyItems('copy-a', 'demo-coquette', [
        {
          imageUrl: '/moodboards/coquette-1.webp',
          title: 'Lace',
          prompt: ''
        }
      ])[0]
    ).toMatchObject({
      moodboard_id: 'copy-a',
      metadata: { copiedFromPresetKey: 'demo-coquette' }
    });
  });

  it('does not mark an incomplete source analysis as ready', () => {
    expect(
      buildMoodboardCopyFields({
        analysis_status: 'ready',
        analysis_version: 0,
        taste_profile: 'Incomplete analysis'
      })
    ).toMatchObject({
      analysis_status: 'idle',
      analysis_version: 0,
      taste_profile: ''
    });
  });

  it('records source provenance on copied items', () => {
    const items = buildMoodboardCopyItems('preset-a', 'copy-a', [
      { id: 'item-a', image_url: 'https://example.com/a.jpg' }
    ]);

    expect(items[0]).toMatchObject({
      moodboard_id: 'copy-a',
      source: 'preset',
      metadata: {
        copiedFromMoodboardId: 'preset-a',
        copiedFromItemId: 'item-a'
      }
    });
  });

  it('restores inherited analysis only after item triggers have run', () => {
    const itemInsert = copyHandler.indexOf(
      ".from('visual_moodboard_items')\n        .insert"
    );
    const analysisRestore = copyHandler.indexOf('.update(copyAnalysisFields)');
    expect(itemInsert).toBeGreaterThan(-1);
    expect(analysisRestore).toBeGreaterThan(itemInsert);
  });
});
