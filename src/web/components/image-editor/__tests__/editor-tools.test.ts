import { describe, expect, it } from 'vitest';
import {
  buildAdjustmentFilter,
  buildAdjustmentInstruction,
  buildCameraInstruction,
  buildDrawInstructions,
  buildReferenceMapping,
  composeEditorInstruction,
  resolveReferenceMentionsInPrompt,
  translateReferenceMentions
} from '../editor-tools';

describe('editor-tools reference mentions', () => {
  it('translates zh mention tokens', () => {
    expect(translateReferenceMentions('把 @图片2 的主体放进来', false)).toContain(
      '参考图 2'
    );
    expect(translateReferenceMentions('参考 @参考图3 的风格', false)).toContain(
      '参考图 3'
    );
  });

  it('translates en mention tokens', () => {
    expect(translateReferenceMentions('Use @Image 2 as style', true)).toContain(
      'Image 2'
    );
    expect(translateReferenceMentions('Mix @Reference 3', true)).toContain(
      'Image 3'
    );
  });

  it('builds a reference mapping block', () => {
    const zh = buildReferenceMapping(['主图', '参考图'], false);
    expect(zh).toContain('参考图 1');
    expect(zh).toContain('参考图 2');
    const en = buildReferenceMapping(['main', 'ref'], true);
    expect(en).toContain('Image 1');
    expect(en).toContain('Image 2');
  });

  it('resolves prompt with mapping appended', () => {
    const resolved = resolveReferenceMentionsInPrompt('把 @图片2 融入', 2, false);
    expect(resolved).toContain('参考图 2');
    expect(resolved).toContain('参考图清单');
  });

  it('composeEditorInstruction rejects empty user input with a single source', () => {
    expect(composeEditorInstruction('', '', '', 1, false)).toBe('');
    expect(composeEditorInstruction('   ', '', '', 1, true)).toBe('');
  });

  it('composeEditorInstruction keeps region instructions when prompt is empty', () => {
    const composed = composeEditorInstruction(
      '',
      '请修改画面左侧区域',
      '',
      1,
      false
    );
    expect(composed).toContain('请修改画面左侧区域');
    // 只有源图且没有用户提示词时不追加参考图清单
    expect(composed).not.toContain('参考图清单');
  });

  it('composeEditorInstruction appends mapping only with a real instruction or extra references', () => {
    const withPrompt = composeEditorInstruction('把 @图片2 融入', '', '', 2, false);
    expect(withPrompt).toContain('参考图 2');
    expect(withPrompt).toContain('参考图清单');

    const regionOnlyWithExtras = composeEditorInstruction(
      '',
      '修改右上角',
      '',
      2,
      false
    );
    expect(regionOnlyWithExtras).toContain('参考图清单');
  });

  it('translates @图片N mentions inside region/annotate instructions', () => {
    const composed = composeEditorInstruction(
      '',
      '把 @图片2 的主体放进来，同时保持构图不变',
      '',
      2,
      false
    );
    expect(composed).toContain('参考图 2');
    expect(composed).not.toContain('@图片2');
    expect(composed).toContain('参考图清单');
  });

  it('adds the reference map when a mention appears even with a single reference', () => {
    const composed = composeEditorInstruction(
      '',
      '参考 @图片1 的风格重绘',
      '',
      1,
      false
    );
    expect(composed).toContain('参考图 1');
    expect(composed).not.toContain('@图片1');
    expect(composed).toContain('参考图清单');
  });

  it('builds a neutral filter and instruction at the default values', () => {
    expect(
      buildAdjustmentFilter({
        brightness: 50,
        contrast: 50,
        saturation: 50,
        colorTemp: 50
      })
    ).toBe('');
    expect(
      buildAdjustmentInstruction(
        { brightness: 50, contrast: 50, saturation: 50, colorTemp: 50 },
        false
      )
    ).toBe('');
  });

  it('maps adjustments to css filter and zh/en instructions', () => {
    const filter = buildAdjustmentFilter({
      brightness: 70,
      contrast: 40,
      saturation: 80,
      colorTemp: 65
    });
    expect(filter).toContain('brightness(1.40)');
    expect(filter).toContain('contrast(0.80)');
    expect(filter).toContain('saturate(1.60)');
    expect(filter).toContain('sepia');

    const zh = buildAdjustmentInstruction(
      { brightness: 70, contrast: 40, saturation: 80, colorTemp: 65 },
      false
    );
    expect(zh).toContain('提亮');
    expect(zh).toContain('降低对比');
    expect(zh).toContain('色温偏暖');

    const en = buildAdjustmentInstruction(
      { brightness: 70, contrast: 40, saturation: 80, colorTemp: 65 },
      true
    );
    expect(en).toContain('brighten');
    expect(en).toContain('reduce contrast');
    expect(en).toContain('warmer');
  });

  it('maps camera angles to zh/en instructions and stays neutral at default', () => {
    expect(
      buildCameraInstruction({ rotate: 0, vertical: 0, zoom: 1 }, false)
    ).toBe('');
    const zh = buildCameraInstruction(
      { rotate: 90, vertical: 30, zoom: 1.5 },
      false
    );
    expect(zh).toContain('右侧');
    expect(zh).toContain('俯拍');
    expect(zh).toContain('拉远');
    const en = buildCameraInstruction(
      { rotate: 180, vertical: -20, zoom: 0.8 },
      true
    );
    expect(en).toContain('back side');
    expect(en).toContain('looking up');
    expect(en).toContain('move the camera close to the subject');
  });

  it('builds draw instructions from brush strokes with prompt', () => {
    const zh = buildDrawInstructions(
      [
        {
          id: 's1',
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.2, y: 0.15 }
          ],
          size: 8,
          color: '#FF6B6B'
        },
        {
          id: 's2',
          points: [
            { x: 0.8, y: 0.7 },
            { x: 0.85, y: 0.8 }
          ],
          size: 60,
          color: '#5B9BF7'
        }
      ],
      '加一团火焰',
      false
    );
    expect(zh).toContain('加一团火焰');
    expect(zh).toContain('笔触 1');
    expect(zh).toContain('笔触 2');
    expect(zh).toContain('#FF6B6B');
    expect(zh).toContain('细');
    expect(zh).toContain('粗');
    expect(zh).toContain('上左');
    expect(zh).toContain('下右');
  });

  it('builds draw instructions in english with position and thickness', () => {
    const en = buildDrawInstructions(
      [
        {
          id: 's1',
          points: [
            { x: 0.5, y: 0.5 },
            { x: 0.6, y: 0.55 }
          ],
          size: 30,
          color: '#44D67F'
        }
      ],
      'Add sparkles',
      true
    );
    expect(en).toContain('Add sparkles');
    expect(en).toContain('Stroke 1');
    expect(en).toContain('medium');
    expect(en).toContain('middle');
    expect(en).toContain('#44D67F');
  });

  it('returns the trimmed prompt when there are no strokes', () => {
    expect(buildDrawInstructions([], '  仅文字描述  ', false)).toBe(
      '仅文字描述'
    );
  });
});
