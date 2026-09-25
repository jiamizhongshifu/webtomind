import { describe, expect, it } from 'vitest';
import {
  getPortraitExpressionConflicts,
  hasPortraitExpressionCameraConflict,
  type PortraitExpressionAssetLike
} from '../portrait-expression-compatibility';

const asset = (
  id: string,
  slot: string,
  title: string,
  prompt: string,
  promptZh = prompt
): PortraitExpressionAssetLike => ({
  id,
  slot,
  title,
  prompt,
  promptZh,
  tags: []
});

describe('portrait expression compatibility', () => {
  it('detects mutually exclusive mouth, gaze, and head instructions', () => {
    const conflicts = getPortraitExpressionConflicts([
      asset(
        'expression-conflicted',
        'expression',
        '冲突表情',
        'pressed lips, open-mouthed laugh, direct gaze, looking away, chin raised, chin tucked'
      )
    ]);

    expect(conflicts.map((conflict) => conflict.reasonEn).join(' ')).toMatch(
      /mouth.+closed and open/i
    );
    expect(conflicts.map((conflict) => conflict.reasonEn).join(' ')).toMatch(
      /gaze.+make and avoid/i
    );
    expect(conflicts.map((conflict) => conflict.reasonEn).join(' ')).toMatch(
      /head.+lift and tuck/i
    );
  });

  it('keeps cross-layer contrast valid when the same facial muscle is not contradicted', () => {
    const conflicts = getPortraitExpressionConflicts([
      asset(
        'expression-sacred-mischief',
        'expression',
        '神圣顽劣',
        'sacred ceremonial temperament with one playful tongue gesture and one raised brow'
      )
    ]);

    expect(conflicts).toEqual([]);
  });

  it('treats solemn expression and a rolled frame as a soft camera conflict', () => {
    const expression = asset(
      'expression-solemn',
      'expression',
      '神圣肃穆',
      'sacred solemn ceremonial gaze'
    );
    const viewpoint = asset(
      'viewpoint-dutch',
      'viewpoint',
      '荷兰角',
      'strong dutch tilted composition'
    );

    expect(hasPortraitExpressionCameraConflict(expression, viewpoint)).toBe(
      true
    );
    expect(getPortraitExpressionConflicts([expression, viewpoint])).toEqual([
      expect.objectContaining({
        leftId: expression.id,
        rightId: viewpoint.id,
        reasonZh: expect.stringContaining('稳定、水平')
      })
    ]);
  });
});
