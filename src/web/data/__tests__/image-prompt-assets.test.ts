import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  applyImagePromptSelectionToPrompt,
  buildAuditedRandomImagePromptSelection,
  buildAuditedRandomizedImagePromptSelectionSlot,
  buildRandomImagePromptSelection,
  buildRandomImagePromptSelectionForProfile,
  compileImagePrompt,
  composerImagePromptSlots,
  defaultImagePromptSettings,
  defaultImagePromptSelection,
  getOutfitCoverage,
  getImagePromptRecipeCompilerVersion,
  getPrimarySelectedAssetId,
  getSelectedAssetIds,
  isCompiledImagePrompt,
  isPortraitRandomEligible,
  mergeImagePromptSelectionIntoPrompt,
  normalizeImagePromptSelection,
  randomizeImagePromptSelectionSlot,
  resolveAssetCompatibility,
  setImagePromptAssetSelection,
  type ImagePromptAsset
} from '../image-prompt-core';
import { imagePromptAssetCatalog as imagePromptAssets } from '../image-prompt-asset-catalog';
import { getPortraitVisualSingularityKind } from '../portrait-recipe-compatibility';
import { portraitCategoryExpansionSeeds } from '../portrait-category-expansion-assets';

const assets: ImagePromptAsset[] = [
  {
    id: 'shoes-silver-platform-boots',
    slot: 'shoes',
    title: '银色平台靴',
    subtitle: '金属质感',
    prompt: 'silver platform boots, metallic leather shine',
    promptZh: '鞋履：银色平台靴，金属皮革光泽，强化未来感造型收束',
    tags: ['boots'],
    visual: { tone: '#f6f6f6', accent: '#777777', shape: 'shoe' }
  },
  {
    id: 'top-black-cropped-jacket',
    slot: 'top',
    title: '黑色短外套',
    subtitle: '利落剪裁',
    prompt: 'black cropped jacket with crisp tailoring',
    promptZh: '上装：黑色短款外套，剪裁利落，肩线明确',
    tags: ['jacket'],
    visual: { tone: '#f1f1f1', accent: '#111111', shape: 'outfit' }
  },
  {
    id: 'product-subject-glass-orb',
    slot: 'productSubject',
    title: '玻璃生态球',
    subtitle: '商业产品主体',
    prompt: 'transparent glass ecosystem sphere',
    tags: ['product'],
    visual: { tone: '#f1f1f1', accent: '#4d7c8a', shape: 'style' }
  }
];

function recipeAsset(
  id: string,
  slot: ImagePromptAsset['slot'],
  title: string,
  prompt: string
): ImagePromptAsset {
  return {
    id,
    slot,
    title,
    subtitle: title,
    prompt,
    tags: [],
    visual: { tone: '#eee', accent: '#333', shape: 'style' }
  };
}

describe('mergeImagePromptSelectionIntoPrompt', () => {
  it('replaces matching slot lines without overwriting the rest of the prompt', () => {
    const selection = normalizeImagePromptSelection({
      shoes: 'shoes-silver-platform-boots'
    });

    const result = mergeImagePromptSelectionIntoPrompt(
      '主体保持冷静直视镜头。\n鞋履：黑色玛丽珍鞋，皮革光泽。\n背景是雨夜街角。',
      selection,
      assets,
      'zh-CN'
    );

    expect(result).toContain('主体保持冷静直视镜头。');
    expect(result).toContain(
      '鞋履：银色平台靴，金属皮革光泽，强化未来感造型收束'
    );
    expect(result).toContain('背景是雨夜街角。');
    expect(result).not.toContain('黑色玛丽珍鞋');
  });

  it('appends selected slot lines when the prompt has no matching structure', () => {
    const selection = normalizeImagePromptSelection({
      top: 'top-black-cropped-jacket'
    });

    const result = mergeImagePromptSelectionIntoPrompt(
      '生成一张海报。',
      selection,
      assets,
      'zh-CN'
    );

    expect(result).toBe(
      '生成一张海报。\n上装：黑色短款外套，剪裁利落，肩线明确'
    );
  });

  it('keeps no-people background metadata from excluding the portrait subject', () => {
    const result = mergeImagePromptSelectionIntoPrompt(
      '保留自然人物状态。',
      normalizeImagePromptSelection({
        background: 'background-waterfall-lagoon'
      }),
      imagePromptAssets,
      'zh-CN'
    );

    expect(result).toContain('无背景路人');
    expect(result).not.toContain('无人物');
  });

  it('applies a material prefix before the original garment prompt', () => {
    const selection = normalizeImagePromptSelection({
      top: 'top-black-cropped-jacket'
    });
    const result = mergeImagePromptSelectionIntoPrompt(
      '生成一张时装肖像。',
      selection,
      assets,
      'zh-CN',
      { top: 'silk-satin' }
    );

    expect(result).toContain('上装：材质替换：');
    expect(result).toContain('仅将该服装的原始主面料改为“丝光缎面”');
    expect(result).toContain('原服装：黑色短款外套，剪裁利落，肩线明确');
  });

  it('replaces a previous compiled recipe as one unit instead of appending a second recipe', () => {
    const previousSelection = normalizeImagePromptSelection({
      top: 'top-black-cropped-jacket'
    });
    const nextSelection = normalizeImagePromptSelection({
      shoes: 'shoes-silver-platform-boots'
    });
    const previousPrompt = compileImagePrompt(
      previousSelection,
      defaultImagePromptSettings,
      assets,
      'zh-CN'
    ).prompt;
    const nextPrompt = compileImagePrompt(
      nextSelection,
      defaultImagePromptSettings,
      assets,
      'zh-CN'
    ).prompt;
    const previousEnglishPrompt = compileImagePrompt(
      previousSelection,
      defaultImagePromptSettings,
      assets,
      'en-US'
    ).prompt;

    expect(isCompiledImagePrompt(previousPrompt)).toBe(true);
    expect(isCompiledImagePrompt(previousEnglishPrompt)).toBe(true);
    expect(isCompiledImagePrompt('生成一张海报。')).toBe(false);
    expect(
      applyImagePromptSelectionToPrompt(
        previousPrompt,
        nextPrompt,
        nextSelection,
        assets,
        'zh-CN'
      )
    ).toBe(nextPrompt);
  });
});

describe('compileImagePrompt wardrobe materials', () => {
  it('compiles a slot-scoped material override without affecting other slots', () => {
    const selection = normalizeImagePromptSelection({
      top: 'top-black-cropped-jacket',
      shoes: 'shoes-silver-platform-boots'
    });
    const result = compileImagePrompt(
      selection,
      defaultImagePromptSettings,
      assets,
      'en-US',
      { top: 'metallic-laminate' }
    );

    expect(result.prompt).toContain('Material replacement:');
    expect(result.prompt).toContain('Original garment: black cropped jacket');
    expect(result.prompt).toContain('silver platform boots');
    expect(result.prompt.match(/Material replacement:/g)).toHaveLength(1);
  });

  it('ignores a material override when its clothing slot is empty', () => {
    const result = compileImagePrompt(
      normalizeImagePromptSelection({
        shoes: 'shoes-silver-platform-boots'
      }),
      defaultImagePromptSettings,
      assets,
      'en-US',
      { top: 'velvet' }
    );

    expect(result.prompt).not.toContain('Material replacement:');
  });
});

describe('buildRandomImagePromptSelection', () => {
  it('derives the compiler version from recipe behavior and library content', () => {
    const current = getImagePromptRecipeCompilerVersion(imagePromptAssets);
    const changedAssets = imagePromptAssets.map((asset, index) =>
      index === 0
        ? { ...asset, prompt: `${asset.prompt}, contract change` }
        : asset
    );

    expect(current).toMatch(/^portrait-recipe-[0-9a-f]{8}$/);
    expect(getImagePromptRecipeCompilerVersion(changedAssets)).not.toBe(
      current
    );
  });

  it('replays an audited full recipe exactly from its seed', () => {
    const first = buildAuditedRandomImagePromptSelection(
      imagePromptAssets,
      28580675
    );
    const replay = buildAuditedRandomImagePromptSelection(
      imagePromptAssets,
      28580675
    );

    expect(replay.selection).toEqual(first.selection);
    expect(replay.audit).toEqual(first.audit);
    expect(first.audit).toMatchObject({
      schemaVersion: 1,
      selectionSource: 'random_recipe',
      seed: 28580675
    });
    expect(first.audit.selectedAssetIds.length).toBeGreaterThan(0);
  });

  it('records the slot and deterministic seed for a single-slot randomization', () => {
    const initial = buildRandomImagePromptSelection(
      imagePromptAssets,
      () => 0.4
    );
    const first = buildAuditedRandomizedImagePromptSelectionSlot(
      initial,
      'hairstyle',
      imagePromptAssets,
      42
    );
    const replay = buildAuditedRandomizedImagePromptSelectionSlot(
      initial,
      'hairstyle',
      imagePromptAssets,
      42
    );

    expect(replay.selection).toEqual(first.selection);
    expect(first.audit).toMatchObject({
      selectionSource: 'random_slot',
      randomizedSlot: 'hairstyle',
      seed: 42
    });
    expect(first.audit.inputAssetIds).toBeDefined();
  });

  it('rerolls a historical setting when exact-era affinity only leaves the current asset', () => {
    const tangOutfit = recipeAsset(
      'outfit-tang-current',
      'outfit',
      '唐制齐胸襦裙',
      'Tang dynasty historical hanfu'
    );
    const tangSetting = recipeAsset(
      'background-tang-current',
      'background',
      '唐风朱柱宫廊',
      'Tang dynasty historical palace corridor'
    );
    const songSetting = recipeAsset(
      'background-song-alternative',
      'background',
      '宋风文人茶园',
      'Song dynasty historical scholar garden'
    );
    const initial = [tangOutfit, tangSetting].reduce(
      (current, selected) => setImagePromptAssetSelection(current, selected),
      defaultImagePromptSelection
    );

    const randomized = buildAuditedRandomizedImagePromptSelectionSlot(
      initial,
      'background',
      [tangOutfit, tangSetting, songSetting],
      20260717
    );

    expect(randomized.selection.background).toBe(songSetting.id);
  });

  it('rerolls historical clothing without changing unrelated recipe slots', () => {
    const tangHair = recipeAsset(
      'hairstyle-tang-current',
      'hairstyle',
      '唐风高云髻',
      'Tang dynasty historical high cloud updo'
    );
    const tangOutfit = recipeAsset(
      'outfit-tang-current',
      'outfit',
      '唐制齐胸襦裙',
      'Tang dynasty historical hanfu'
    );
    const songOutfit = recipeAsset(
      'outfit-song-alternative',
      'outfit',
      '宋制褙子套装',
      'Song dynasty historical beizi ensemble'
    );
    const initial = [tangHair, tangOutfit].reduce(
      (current, selected) => setImagePromptAssetSelection(current, selected),
      defaultImagePromptSelection
    );

    const randomized = buildAuditedRandomizedImagePromptSelectionSlot(
      initial,
      'outfit',
      [tangHair, tangOutfit, songOutfit],
      20260718
    );

    expect(randomized.selection.outfit).toBe(songOutfit.id);
    expect(randomized.selection.hairstyle).toBe(tangHair.id);
  });

  it('does not leave populated clothing or setting slots stuck after a full random recipe', () => {
    const slots = [
      'top',
      'bottom',
      'outfit',
      'onePiece',
      'background'
    ] as const;
    const stuck: string[] = [];

    for (let seed = 1; seed <= 120; seed += 1) {
      const initialResult = buildAuditedRandomImagePromptSelection(
        imagePromptAssets,
        seed
      );
      const initial = initialResult.selection;
      slots.forEach((slot, slotIndex) => {
        const before = getSelectedAssetIds(initial, slot);
        if (before.length === 0) return;
        const randomized = buildAuditedRandomizedImagePromptSelectionSlot(
          initial,
          slot,
          imagePromptAssets,
          0x70000000 + seed * 31 + slotIndex
        );
        if (
          getSelectedAssetIds(randomized.selection, slot).join('|') ===
          before.join('|')
        ) {
          stuck.push(
            `${seed}:${initialResult.audit.profile}:${slot}:${before.join('|')}`
          );
        }
      });
    }

    expect(stuck).toEqual([]);
  });

  it('picks one available asset for every represented slot', () => {
    const selection = buildRandomImagePromptSelection(assets, () => 0);

    expect(selection.shoes).toBe('shoes-silver-platform-boots');
    expect(selection.top).toBe('top-black-cropped-jacket');
    expect(selection.character).toBeNull();
  });

  it('always includes core categories but can omit optional categories', () => {
    const selection = buildRandomImagePromptSelection(assets, () => 0.99);

    expect(selection.top).toBe('top-black-cropped-jacket');
    expect(selection.shoes).toBeNull();
    expect(selection.productSubject).toBeNull();
  });

  it('keeps contextual product categories out of an unguided random combo', () => {
    const selection = buildRandomImagePromptSelection(assets, () => 0);

    expect(selection.productSubject).toBeNull();
  });
});

describe('composerImagePromptSlots', () => {
  it('keeps legacy commercial slots out of the portrait-first public composer', () => {
    const visibleSlotIds = composerImagePromptSlots.map((slot) => slot.id);

    expect(visibleSlotIds).not.toContain('titleArea');
    expect(visibleSlotIds).not.toContain('productSurface');
    expect(visibleSlotIds).not.toContain('productSubject');
    expect(visibleSlotIds).not.toContain('layoutDesign');
    expect(visibleSlotIds).toContain('viewpoint');
    expect(visibleSlotIds).toContain('outfit');
    expect(visibleSlotIds).toContain('onePiece');
    expect(visibleSlotIds).toContain('hairstyle');
    expect(visibleSlotIds).toHaveLength(20);
  });
});

describe('compileImagePrompt content mode', () => {
  it('includes selected hairstyle, complete wardrobe, and viewpoint in portrait prompts', () => {
    const compilationAssets: ImagePromptAsset[] = [
      {
        id: 'hairstyle-test-low-ponytail',
        slot: 'hairstyle',
        title: '测试低马尾',
        subtitle: '发型契约',
        prompt: 'sleek low ponytail with a clean center part',
        promptZh: '光洁中分低马尾',
        tags: ['发型'],
        visual: { tone: '#eee', accent: '#333', shape: 'portrait' }
      },
      {
        id: 'outfit-test-tailored-set',
        slot: 'outfit',
        title: '测试剪裁套装',
        subtitle: '套装契约',
        prompt: 'coordinated ivory tailored jacket and matching trousers',
        promptZh: '象牙白剪裁外套与配套长裤组成的完整套装',
        tags: ['套装'],
        visual: { tone: '#eee', accent: '#333', shape: 'outfit' }
      },
      {
        id: 'viewpoint-test-high-angle',
        slot: 'viewpoint',
        title: '测试俯拍',
        subtitle: '机位契约',
        prompt:
          'camera positioned at a restrained forty-five-degree high angle',
        promptZh: '相机位于克制的四十五度俯拍机位',
        tags: ['俯拍'],
        visual: { tone: '#eee', accent: '#333', shape: 'portrait' }
      }
    ];
    const selection = normalizeImagePromptSelection({
      hairstyle: 'hairstyle-test-low-ponytail',
      outfit: 'outfit-test-tailored-set',
      viewpoint: 'viewpoint-test-high-angle'
    });

    const english = compileImagePrompt(
      selection,
      defaultImagePromptSettings,
      compilationAssets,
      'en-US'
    ).prompt;
    const chinese = compileImagePrompt(
      selection,
      defaultImagePromptSettings,
      compilationAssets,
      'zh-CN'
    ).prompt;

    expect(english).toContain('sleek low ponytail with a clean center part');
    expect(english).toContain(
      'coordinated ivory tailored jacket and matching trousers'
    );
    expect(english).toContain(
      'camera positioned at a restrained forty-five-degree high angle'
    );
    expect(chinese).toContain('光洁中分低马尾');
    expect(chinese).toContain('象牙白剪裁外套与配套长裤组成的完整套装');
    expect(chinese).toContain('相机位于克制的四十五度俯拍机位');
    expect(
      english.match(
        /camera positioned at a restrained forty-five-degree high angle/g
      )
    ).toHaveLength(2);
    expect(chinese.match(/相机位于克制的四十五度俯拍机位/g)).toHaveLength(2);
  });

  it('includes a selected one-piece garment as the complete wardrobe', () => {
    const onePiece: ImagePromptAsset = {
      id: 'onePiece-test-column-dress',
      slot: 'onePiece',
      title: '测试连衣裙',
      subtitle: '一体式服装契约',
      prompt: 'single continuous cobalt column dress',
      promptZh: '钴蓝色一体式修身柱形连衣裙',
      tags: ['连衣裙'],
      visual: { tone: '#eee', accent: '#333', shape: 'outfit' }
    };
    const selection = normalizeImagePromptSelection({
      onePiece: onePiece.id
    });

    const result = compileImagePrompt(
      selection,
      defaultImagePromptSettings,
      [onePiece],
      'zh-CN'
    );

    expect(result.prompt).toContain('钴蓝色一体式修身柱形连衣裙');
  });

  it('keeps a portrait composition in portrait mode', () => {
    const composition = imagePromptAssets.find(
      (asset) => asset.id === 'composition-triangular-fashion'
    );
    expect(composition).toBeDefined();

    const selection = setImagePromptAssetSelection(
      defaultImagePromptSelection,
      composition!
    );
    const result = compileImagePrompt(
      selection,
      defaultImagePromptSettings,
      imagePromptAssets,
      'zh-CN'
    );

    expect(result.prompt).toContain('的女性人像。');
    expect(result.prompt).toContain('由头肩与手臂形成三角形时装构图');
    expect(result.prompt).not.toContain('的商业视觉图。');
    expect(result.prompt).not.toContain('避免人物抢占主体');
  });

  it('scopes a background no-people constraint to background bystanders', () => {
    const selectedAssets = [
      'character-public-expansion-01',
      'background-newchinese-lacquer-hotel',
      'composition-triangular-fashion'
    ].map((id) => imagePromptAssets.find((asset) => asset.id === id)!);
    expect(selectedAssets.every(Boolean)).toBe(true);

    const selection = selectedAssets.reduce(
      (current, asset) => setImagePromptAssetSelection(current, asset),
      defaultImagePromptSelection
    );
    const result = compileImagePrompt(
      selection,
      defaultImagePromptSettings,
      imagePromptAssets,
      'zh-CN'
    );

    expect(result.prompt).toContain('的女性人像。');
    expect(result.prompt).toContain('no background bystanders');
    expect(result.prompt).not.toMatch(/\bno people\b/i);

    const chineseBackground = compileImagePrompt(
      normalizeImagePromptSelection({
        background: 'background-waterfall-lagoon'
      }),
      defaultImagePromptSettings,
      imagePromptAssets,
      'zh-CN'
    ).prompt;
    expect(chineseBackground).toContain('无背景路人');
    expect(chineseBackground).not.toContain('无人物');
  });

  it('still uses commercial mode for an explicit product subject', () => {
    const selection = normalizeImagePromptSelection({
      productSubject: 'product-subject-glass-orb'
    });
    const result = compileImagePrompt(
      selection,
      defaultImagePromptSettings,
      assets,
      'zh-CN'
    );

    expect(result.prompt).toContain('的商业视觉图。');
    expect(result.prompt).toContain('避免人物抢占主体');
    expect(result.prompt).not.toContain('的女性人像。');
  });

  it('compiles a shooting thesis, a controlled multi-image variation contract, and a bounded prop pool', () => {
    const propAssets: ImagePromptAsset[] = [
      '花束',
      '旧书',
      '杯子',
      '相机',
      '丝带'
    ].map((title, index) => ({
      id: `prop-test-${index}`,
      slot: 'prop',
      title,
      subtitle: '测试道具',
      prompt: `test prop ${index}`,
      promptZh: title,
      tags: ['道具'],
      visual: { tone: '#eee', accent: '#333', shape: 'style' }
    }));
    const background: ImagePromptAsset = {
      id: 'background-test-orchard',
      slot: 'background',
      title: '夏日果园',
      subtitle: '三层场景',
      prompt: 'summer orchard with foreground leaves and distant trees',
      promptZh: '前景枝叶、中景人物区域与远处果树形成夏日果园纵深',
      tags: ['果园'],
      visual: { tone: '#eee', accent: '#333', shape: 'landscape' }
    };
    const selection = normalizeImagePromptSelection({
      background: background.id,
      prop: propAssets.map((item) => item.id)
    });

    const result = compileImagePrompt(
      selection,
      { ...defaultImagePromptSettings, imageCount: 4 },
      [background, ...propAssets],
      'zh-CN'
    );

    expect(result.prompt).toContain('成片成立点');
    expect(result.prompt).toContain('以“夏日果园”作为照片成立的主导因素');
    expect(result.prompt).toContain('道具候选池');
    expect(result.prompt).toContain('按构图只选二至四件');
    expect(result.prompt).toContain('同组变化合同：4 张共享');
    expect(result.prompt).toContain('不随机化主题方向');
    expect(result.warnings).toEqual([expect.stringContaining('超过四件道具')]);
  });

  it('avoids solemn-expression camera disorder in random selection and warns on a manual override', () => {
    const expression: ImagePromptAsset = {
      id: 'expression-test-solemn',
      slot: 'expression',
      title: '神圣肃穆',
      subtitle: '稳定凝视',
      prompt: 'sacred solemn ceremonial gaze',
      promptZh: '神圣肃穆的仪式凝视',
      tags: ['肃穆'],
      visual: { tone: '#eee', accent: '#333', shape: 'portrait' }
    };
    const stable: ImagePromptAsset = {
      id: 'viewpoint-test-level',
      slot: 'viewpoint',
      title: '水平正视',
      subtitle: '稳定机位',
      prompt: 'stable level eye-height viewpoint',
      promptZh: '稳定水平的平视机位',
      tags: ['平视'],
      visual: { tone: '#eee', accent: '#333', shape: 'portrait' }
    };
    const dutch: ImagePromptAsset = {
      id: 'viewpoint-test-dutch',
      slot: 'viewpoint',
      title: '荷兰角',
      subtitle: '失序机位',
      prompt: 'strong dutch tilted composition',
      promptZh: '强烈荷兰角倾斜构图',
      tags: ['荷兰角'],
      visual: { tone: '#eee', accent: '#333', shape: 'portrait' }
    };
    const expressionSelection = setImagePromptAssetSelection(
      defaultImagePromptSelection,
      expression
    );

    const randomized = randomizeImagePromptSelectionSlot(
      expressionSelection,
      'viewpoint',
      [expression, stable, dutch],
      () => 0.99
    );
    expect(randomized.viewpoint).toBe(stable.id);

    const manual = compileImagePrompt(
      setImagePromptAssetSelection(expressionSelection, dutch),
      defaultImagePromptSettings,
      [expression, dutch],
      'zh-CN'
    );
    expect(manual.warnings).toEqual([
      expect.stringContaining('神圣肃穆依赖稳定、水平')
    ]);
  });

  it('compiles every new expression temperament inside one original complete portrait recipe', () => {
    const expressionIds = [
      'expression-grotesque-humor',
      'expression-uncanny-playfulness',
      'expression-absurd-mockery',
      'expression-static-mania',
      'expression-fragile-sickly-sweetness',
      'expression-cool-detachment',
      'expression-sacred-solemnity',
      'expression-fatalistic-melancholy',
      'expression-uncanny-cute-counterpoint'
    ];
    const originalRecipe = {
      character: 'character-adult-gallery-curator',
      outfit: 'outfit-champagne-satin-cami-trousers',
      pose: 'pose-relaxed-standing',
      background: 'background-afterhours-photobooth-corridor',
      lighting: ['lighting-ccd-soft-flash-night'],
      composition: 'composition-negative-space-v2',
      lens: 'lens-35mm-color-negative',
      shot: 'shot-waist-up'
    };

    expressionIds.forEach((expressionId) => {
      const expression = imagePromptAssets.find(
        (asset) => asset.id === expressionId
      );
      expect(expression, expressionId).toBeDefined();

      const result = compileImagePrompt(
        normalizeImagePromptSelection({
          ...originalRecipe,
          expression: expressionId
        }),
        { ...defaultImagePromptSettings, imageCount: 3 },
        imagePromptAssets,
        'zh-CN'
      );

      expect(result.selectedAssets.map((asset) => asset.id)).toContain(
        expressionId
      );
      expect(result.prompt).toContain(
        expression?.promptZh || expression?.prompt
      );
      expect(result.prompt).toContain('成片成立点');
      expect(result.prompt).toContain('同组变化合同：3 张共享');
      expect(result.prompt).toContain('表情观察量');
      expect(result.prompt).toContain('头部朝向与下巴高度服从已选姿势和机位');
      expect(result.prompt).toContain('光线因果');
      expect(result.prompt).toContain('材质物理');
      expect(result.warnings).toEqual([]);
    });
  });
});

describe('camera taxonomy v2', () => {
  it('adds the six-field photographic execution contract to portrait prompts only', () => {
    const portrait = compileImagePrompt(
      normalizeImagePromptSelection({
        pose: 'pose-seated-relaxed',
        lighting: ['lighting-large-softbox'],
        shot: 'shot-waist-up'
      }),
      defaultImagePromptSettings,
      imagePromptAssets,
      'zh-CN'
    ).prompt;
    const commercial = compileImagePrompt(
      normalizeImagePromptSelection({
        productSubject: 'product-subject-glass-orb'
      }),
      defaultImagePromptSettings,
      assets,
      'zh-CN'
    ).prompt;

    expect(portrait).toMatch(
      /摄影执行：画面坐标：.+表情观察量：.+姿态力学：.+场景接触：.+光线因果：.+材质物理：/
    );
    expect(commercial).not.toContain('摄影执行：');
  });

  it('repeats hard long-shot framing at the final execution checkpoint', () => {
    const prompt = compileImagePrompt(
      normalizeImagePromptSelection({ shot: 'shot-long' }),
      defaultImagePromptSettings,
      imagePromptAssets,
      'zh-CN'
    ).prompt;

    expect(prompt.match(/景别为硬约束/g)).toHaveLength(2);
    expect(prompt).toContain('终稿景别验收');
  });

  it('migrates saved legacy camera selections to the closest orthogonal asset', () => {
    const selection = normalizeImagePromptSelection({
      lens: 'lens-phone-selfie',
      shot: 'shot-low-angle-hero'
    });

    expect(selection.lens).toBe('lens-smartphone-computational');
    expect(selection.shot).toBe('shot-full-body');
  });

  it('keeps lens rendering and expanded shot sizes as orthogonal controlled sets', () => {
    const lensAssets = imagePromptAssets.filter(
      (asset) => asset.slot === 'lens'
    );
    const shotAssets = imagePromptAssets.filter(
      (asset) => asset.slot === 'shot'
    );

    expect(lensAssets).toHaveLength(9);
    expect(shotAssets).toHaveLength(18);
    expect(lensAssets.every((asset) => asset.id.startsWith('lens-'))).toBe(
      true
    );
    expect(shotAssets.map((asset) => asset.id)).toEqual([
      'shot-extreme-detail-eyes',
      'shot-face-closeup',
      'shot-head-shoulders',
      'shot-chest-up',
      'shot-waist-up',
      'shot-knee-up',
      'shot-full-body',
      'shot-long',
      'shot-extreme-long',
      'shot-lower-face-detail',
      'shot-clavicle-closeup',
      'shot-ribcage-up',
      'shot-elbow-up',
      'shot-hip-up',
      'shot-mid-thigh',
      'shot-mid-calf',
      'shot-loose-full-body',
      'shot-environmental-quarter'
    ]);
    expect(
      shotAssets.some((asset) =>
        /angle|selfie|over-shoulder|eye-level|frontal/i.test(asset.prompt)
      )
    ).toBe(false);
    expect(
      shotAssets.some((asset) =>
        /平视|正面|俯拍|仰拍|越肩/.test(asset.promptZh || '')
      )
    ).toBe(false);
  });

  it('ships a square thumbnail for every camera taxonomy sample', () => {
    for (const asset of imagePromptAssets.filter(
      (item) => item.slot === 'lens' || item.slot === 'shot'
    )) {
      const thumbnailPath = path.resolve(
        process.cwd(),
        'src/web/assets/prompt-library',
        asset.slot,
        `${asset.id}.webp`
      );
      expect(existsSync(thumbnailPath), thumbnailPath).toBe(true);
    }
  });
});

describe('portrait core v2 expansion', () => {
  it('keeps the complete photoreal 3x3 cores while allowing additional samples', () => {
    for (const slot of ['expression', 'makeup', 'lighting'] as const) {
      expect(
        imagePromptAssets.filter((asset) => asset.slot === slot).length
      ).toBeGreaterThanOrEqual(9);
    }

    expect(
      imagePromptAssets.some(
        (asset) => asset.id === 'expression-caught-mid-task'
      )
    ).toBe(true);
    expect(
      imagePromptAssets.some(
        (asset) => asset.id === 'makeup-silver-editorial-eye'
      )
    ).toBe(true);
    expect(
      imagePromptAssets.some(
        (asset) => asset.id === 'lighting-subject-separation-trilight'
      )
    ).toBe(true);
    expect(
      imagePromptAssets.some((asset) => asset.id === 'makeup-natural-clean')
    ).toBe(true);
    expect(
      imagePromptAssets.some((asset) => asset.id === 'lighting-large-softbox')
    ).toBe(true);
  });
});

describe('portrait style taxonomy', () => {
  it('keeps the photographic core while allowing other SFW visual media', () => {
    const styleAssets = imagePromptAssets.filter(
      (asset) => asset.slot === 'style'
    );

    expect(styleAssets.length).toBeGreaterThanOrEqual(15);
    expect(styleAssets.map((asset) => asset.id)).toEqual(
      expect.arrayContaining([
        'style-high-end-fashion-photo',
        'style-cinematic-rainy-film',
        'style-dreamy-backlit-outdoor',
        'style-glossy-idol-magazine',
        'style-high-contrast-noir',
        'style-japanese-street-snap',
        'style-live-action-anime-cosplay-editorial',
        'style-pastel-lookbook-photo',
        'style-phone-raw-snapshot',
        'style-delicate-anime-watercolor',
        'style-soft-3d-clay'
      ])
    );
    expect(
      styleAssets.filter(isPortraitRandomEligible).length
    ).toBeGreaterThanOrEqual(9);
  });
});

describe('portrait wardrobe taxonomy v2', () => {
  it('keeps the top and bottom 3x3 cores without treating them as capacity limits', () => {
    const topAssets = imagePromptAssets.filter((asset) => asset.slot === 'top');
    const bottomAssets = imagePromptAssets.filter(
      (asset) => asset.slot === 'bottom'
    );

    expect(topAssets.length).toBeGreaterThan(9);
    expect(bottomAssets.length).toBeGreaterThan(9);
    expect(
      topAssets.some((asset) => asset.id === 'top-floral-swimwear-top')
    ).toBe(true);
    expect(
      bottomAssets.some((asset) => asset.id === 'bottom-floral-swimwear-briefs')
    ).toBe(true);
  });

  it('keeps an expandable coordinated-outfit library and enforces two-way wardrobe exclusion', () => {
    const outfitAssets = imagePromptAssets.filter(
      (asset) => asset.slot === 'outfit'
    );
    expect(outfitAssets.length).toBeGreaterThanOrEqual(9);

    const outfit = outfitAssets[0];
    const top = imagePromptAssets.find((asset) => asset.slot === 'top')!;
    const bottom = imagePromptAssets.find((asset) => asset.slot === 'bottom')!;
    const withSeparates = setImagePromptAssetSelection(
      setImagePromptAssetSelection(defaultImagePromptSelection, top),
      bottom
    );
    const withOutfit = setImagePromptAssetSelection(withSeparates, outfit);
    expect(withOutfit.outfit).toBe(outfit.id);
    expect(withOutfit.top).toBeNull();
    expect(withOutfit.bottom).toBeNull();

    const backToTop = setImagePromptAssetSelection(withOutfit, top);
    expect(backToTop.top).toBe(top.id);
    expect(backToTop.outfit).toBeNull();
  });

  it('keeps nine one-piece garments and makes every wardrobe mode exclusive', () => {
    const onePieceAssets = imagePromptAssets.filter(
      (asset) => asset.slot === 'onePiece'
    );
    const outfit = imagePromptAssets.find((asset) => asset.slot === 'outfit')!;
    const top = imagePromptAssets.find((asset) => asset.slot === 'top')!;
    const bottom = imagePromptAssets.find((asset) => asset.slot === 'bottom')!;
    expect(onePieceAssets.length).toBeGreaterThanOrEqual(9);

    const withSeparates = setImagePromptAssetSelection(
      setImagePromptAssetSelection(defaultImagePromptSelection, top),
      bottom
    );
    const withOnePiece = setImagePromptAssetSelection(
      withSeparates,
      onePieceAssets[0]
    );
    expect(withOnePiece.onePiece).toBe(onePieceAssets[0].id);
    expect(withOnePiece.top).toBeNull();
    expect(withOnePiece.bottom).toBeNull();
    expect(withOnePiece.outfit).toBeNull();

    const withOutfit = setImagePromptAssetSelection(withOnePiece, outfit);
    expect(withOutfit.outfit).toBe(outfit.id);
    expect(withOutfit.onePiece).toBeNull();
  });
});

describe('portrait footwear taxonomy v2', () => {
  it('keeps the nine-item product core and restores additional footwear choices', () => {
    const shoes = imagePromptAssets.filter((asset) => asset.slot === 'shoes');
    expect(shoes.length).toBeGreaterThan(9);
    expect(
      shoes.some((asset) => asset.id === 'shoes-silver-platform-boots')
    ).toBe(true);
  });
});

describe('portrait handheld prop taxonomy v2', () => {
  it('keeps the nine-item core and restores additional SFW interaction props', () => {
    const props = imagePromptAssets.filter((asset) => asset.slot === 'prop');
    expect(props.length).toBeGreaterThan(9);
    expect(
      props.some((asset) => asset.id === 'prop-transparent-umbrella')
    ).toBe(true);
  });
});

describe('composition taxonomy v2', () => {
  it('ships nine composition-only samples without camera or typography leakage', () => {
    const assets = imagePromptAssets.filter(
      (asset) => asset.slot === 'composition' && asset.id.endsWith('-v2')
    );

    expect(assets).toHaveLength(9);
    expect(
      imagePromptAssets.filter((asset) => asset.slot === 'composition').length
    ).toBeGreaterThan(9);
    expect(
      assets.some((asset) =>
        /low-angle|high-angle|dutch|85mm|35mm|headline|typography/i.test(
          asset.prompt
        )
      )
    ).toBe(false);
  });

  it('keeps legacy portrait compositions atomic and ecommerce KV out of random recipes', () => {
    const legacyIds = new Set([
      'composition-diagonal-stair-motion',
      'composition-doorway-frame',
      'composition-urban-leading-lines',
      'composition-graphic-shadow-balance',
      'composition-overhead-negative-space',
      'composition-low-angle-architecture',
      'composition-negative-space-copy'
    ]);
    const assets = imagePromptAssets.filter((asset) => legacyIds.has(asset.id));
    const ecommerce = imagePromptAssets.find(
      (asset) => asset.id === 'composition-ecommerce-kv-hero'
    );

    expect(assets).toHaveLength(legacyIds.size);
    expect(
      assets.some((asset) =>
        /full-body|high overhead|low-angle|sunlight|shadow fields|copy-safe|headline|typography/i.test(
          asset.prompt
        )
      )
    ).toBe(false);
    expect(ecommerce && isPortraitRandomEligible(ecommerce)).toBe(false);
  });
});

describe('portrait style axis purity', () => {
  it('keeps photographic treatment independent from a second lighting setup', () => {
    const styles = imagePromptAssets.filter((asset) => asset.slot === 'style');

    expect(
      styles.some((asset) =>
        /softbox|on-camera flash|frontal flash|backlight|rim glow|key light|practical lights?|tungsten key|high-key diffused lighting/i.test(
          asset.prompt
        )
      )
    ).toBe(false);
  });
});

describe('continuous facial lighting protection', () => {
  it('keeps projector and geometric hard-light patterns off the face', () => {
    const ids = new Set([
      'lighting-projector-pattern',
      'lighting-hard-sun-geometry'
    ]);
    const assets = imagePromptAssets.filter((asset) => ids.has(asset.id));

    expect(assets).toHaveLength(ids.size);
    expect(
      assets.every((asset) =>
        /clean|continuous|uninterrupted/i.test(asset.prompt)
      )
    ).toBe(true);
    expect(
      assets.some((asset) => /across face|across subject/i.test(asset.prompt))
    ).toBe(false);
  });
});

describe('makeup expansion a', () => {
  it('normalizes seven restored makeup samples and promotes two public candidates', () => {
    const ids = new Set([
      'makeup-cool-nude',
      'makeup-dewy-gloss',
      'makeup-natural-clean',
      'makeup-oriental-classic',
      'makeup-peach-blush',
      'makeup-red-lip-glam',
      'makeup-smoky-eyeliner',
      'makeup-berry-stain',
      'makeup-floating-liner'
    ]);
    const makeup = imagePromptAssets.filter((asset) => ids.has(asset.id));

    expect(makeup).toHaveLength(ids.size);
    expect(makeup.every((asset) => asset.slot === 'makeup')).toBe(true);
    expect(
      makeup.some((asset) =>
        /beauty mood|approachable complexion|outdoor warmth|lighting|expression/i.test(
          asset.prompt
        )
      )
    ).toBe(false);
  });
});

describe('lighting expansion a', () => {
  it('normalizes eight restored lighting samples and adds one practical-light structure', () => {
    const ids = new Set([
      'lighting-large-softbox',
      'lighting-soft-backlit',
      'lighting-overcast-diffuse',
      'lighting-golden-hour',
      'lighting-neon-rim',
      'lighting-candle-warm',
      'lighting-window-stripes',
      'lighting-colored-gel',
      'lighting-mirror-bulb-wrap'
    ]);
    const lighting = imagePromptAssets.filter((asset) => ids.has(asset.id));

    expect(lighting).toHaveLength(ids.size);
    expect(lighting.every((asset) => asset.slot === 'lighting')).toBe(true);
    expect(
      lighting.some((asset) =>
        /atmosphere|mood|cinematic|cozy|cyber|outdoor|scene/i.test(asset.prompt)
      )
    ).toBe(false);
  });
});

describe('head and neck accessory expansion a', () => {
  it('normalizes nine restored accessories without style or scene leakage', () => {
    const ids = new Set([
      'accessory-black-beret',
      'accessory-clear-glasses',
      'accessory-lace-choker',
      'accessory-pearl-earrings',
      'accessory-red-hair-clips',
      'accessory-red-hair-ribbon',
      'accessory-silk-scarf',
      'accessory-silver-pendant',
      'accessory-star-hairpin'
    ]);
    const accessories = imagePromptAssets.filter((asset) => ids.has(asset.id));

    expect(accessories).toHaveLength(ids.size);
    expect(accessories.every((asset) => asset.slot === 'accessory')).toBe(true);
    expect(
      accessories.some((asset) =>
        /French|editorial|commuter|character|styling|mood|scene/i.test(
          asset.prompt
        )
      )
    ).toBe(false);
  });
});

describe('body accessory expansion a', () => {
  it('normalizes three restored body accessories and adds six orthogonal structures', () => {
    const ids = new Set([
      'accessory-mini-shoulder-bag',
      'accessory-slim-leather-belt',
      'accessory-structured-satchel',
      'accessory-wide-sculpted-waist-belt',
      'accessory-delicate-waist-chain',
      'accessory-natural-canvas-tote',
      'accessory-polished-chain-belt',
      'accessory-crossbody-phone-pouch',
      'accessory-deep-red-waist-sash'
    ]);
    const accessories = imagePromptAssets.filter((asset) => ids.has(asset.id));

    expect(accessories).toHaveLength(ids.size);
    expect(accessories.every((asset) => asset.slot === 'accessory')).toBe(true);
    expect(
      accessories.some((asset) =>
        /commuter|editorial|outfit|lifestyle|scene|handheld|prop/i.test(
          asset.prompt
        )
      )
    ).toBe(false);
  });
});

describe('handheld prop expansion a', () => {
  it('normalizes five restored props and adds four objects without scene leakage', () => {
    const ids = new Set([
      'prop-robot-workbench-tools',
      'prop-sketchbook-pencil',
      'prop-small-football-foreground',
      'prop-transparent-umbrella',
      'prop-white-headphones',
      'prop-folded-city-map',
      'prop-compact-silver-flashlight',
      'prop-black-vinyl-record',
      'prop-white-insulated-thermos'
    ]);
    const props = imagePromptAssets.filter((asset) => ids.has(asset.id));

    expect(props).toHaveLength(ids.size);
    expect(props.every((asset) => asset.slot === 'prop')).toBe(true);
    expect(
      props.some((asset) =>
        /workbench|backpack|rain|story|atmosphere|foreground focus|lifestyle|worn or held/i.test(
          asset.prompt
        )
      )
    ).toBe(false);
  });
});

describe('photo style expansion a', () => {
  it('translates restored themes into live-action photography and adds three styles', () => {
    const ids = new Set([
      'style-clean-product-editorial',
      'style-delicate-anime-watercolor',
      'style-game-character-concept',
      'style-neon-open-world-poster',
      'style-retro-pop-album-cover',
      'style-soft-3d-clay',
      'style-tungsten-documentary',
      'style-direct-flash-paparazzi',
      'style-medium-format-fine-art'
    ]);
    const styles = imagePromptAssets.filter((asset) => ids.has(asset.id));

    expect(styles).toHaveLength(ids.size);
    expect(styles.every((asset) => asset.slot === 'style')).toBe(true);
    expect(styles.every(isPortraitRandomEligible)).toBe(true);
    expect(styles.every((asset) => /photograph/i.test(asset.prompt))).toBe(
      true
    );
    expect(
      styles.some((asset) =>
        /watercolor illustration|concept art|3D clay render|poster style|album cover portrait style/i.test(
          asset.prompt
        )
      )
    ).toBe(false);
  });
});

describe('summer dress expansion a', () => {
  it('adds nine single-continuous summer dresses without outfit leakage', () => {
    const ids = new Set([
      'onePiece-coral-linen-halter-midi',
      'onePiece-white-square-neck-puff-mini',
      'onePiece-cobalt-one-shoulder-knee',
      'onePiece-sage-smocked-bandeau-maxi',
      'onePiece-yellow-button-tea-dress',
      'onePiece-terracotta-racerback-column',
      'onePiece-black-crochet-lined-midi',
      'onePiece-dusty-pink-handkerchief-midi',
      'onePiece-aqua-side-cutout-midi'
    ]);
    const dresses = imagePromptAssets.filter((asset) => ids.has(asset.id));

    expect(dresses).toHaveLength(ids.size);
    expect(dresses.every((asset) => asset.slot === 'onePiece')).toBe(true);
    expect(
      dresses.every((asset) => getOutfitCoverage(asset) === 'one-piece')
    ).toBe(true);
    expect(
      dresses.some((asset) =>
        /coordinated outfit|matching set|separate top|separate bottom|jumpsuit/i.test(
          asset.prompt
        )
      )
    ).toBe(false);
  });
});

describe('office casual outfit expansion a', () => {
  it('adds nine coordinated separates as mutually exclusive outfits', () => {
    const ids = new Set([
      'outfit-charcoal-longline-vest-tapered',
      'outfit-camel-cardigan-navy-trousers',
      'outfit-olive-utility-brown-pencil',
      'outfit-powder-blue-blazer-culottes',
      'outfit-burgundy-knit-plaid-midi',
      'outfit-black-knit-polo-beige-wide',
      'outfit-ivory-bow-chocolate-a-line',
      'outfit-gray-knit-pinstripe-trousers',
      'outfit-rust-shirt-jacket-black-column'
    ]);
    const outfits = imagePromptAssets.filter((asset) => ids.has(asset.id));

    expect(outfits).toHaveLength(ids.size);
    expect(outfits.every((asset) => asset.slot === 'outfit')).toBe(true);
    expect(
      outfits.every((asset) => getOutfitCoverage(asset) === 'complete-set')
    ).toBe(true);
    expect(
      outfits.some((asset) => /dress|jumpsuit|one-piece/i.test(asset.prompt))
    ).toBe(false);
  });
});

describe('restored coordinated-set classification', () => {
  it('routes every complete academy and lounge set through the mutually exclusive outfit slot', () => {
    const ids = new Set([
      'top-academy-summer-stripe',
      'top-academy-burgundy-bow',
      'top-academy-beige-cardigan',
      'top-academy-cream-knit-vest',
      'top-cami-heather-lounge-set',
      'top-cami-white-square-neck-set',
      'top-cami-pink-pinstripe-set',
      'top-cami-blue-floral-set'
    ]);
    const outfits = imagePromptAssets.filter((asset) => ids.has(asset.id));

    expect(outfits).toHaveLength(ids.size);
    expect(outfits.every((asset) => asset.slot === 'outfit')).toBe(true);
    expect(
      outfits.every((asset) => getOutfitCoverage(asset) === 'complete-set')
    ).toBe(true);

    const bottom = imagePromptAssets.find(
      (asset) => asset.id === 'bottom-black-tailored-shorts'
    )!;
    const selectionWithBottom = setImagePromptAssetSelection(
      defaultImagePromptSelection,
      bottom
    );
    const selectionWithOutfit = setImagePromptAssetSelection(
      selectionWithBottom,
      outfits[0]
    );
    expect(selectionWithOutfit.bottom).toBeNull();
    expect(selectionWithOutfit.outfit).toBe(outfits[0].id);
  });
});

describe('restored expression and pose prompt hygiene', () => {
  it('keeps emoji glyphs and symbolic accessory effects out of runtime prompts', () => {
    const restored = imagePromptAssets.filter(
      (asset) =>
        (asset.slot === 'expression' || asset.slot === 'pose') &&
        (asset.id.startsWith('expression-') || asset.id.startsWith('pose-'))
    );

    expect(restored.length).toBeGreaterThan(0);
    expect(
      restored.some((asset) =>
        /[\p{Extended_Pictographic}\uFE0F\u200D]/u.test(
          `${asset.prompt} ${asset.promptZh || ''}`
        )
      )
    ).toBe(false);
    expect(
      ['expression-heart-eyes', 'expression-sunglasses'].map(
        (id) => imagePromptAssets.find((asset) => asset.id === id)?.prompt
      )
    ).toEqual([
      expect.stringContaining('no heart-shaped pupils or symbols'),
      expect.stringContaining('no glasses or accessories')
    ]);
  });

  it('upgrades every runtime expression, pose, and makeup sample with observable execution fields', () => {
    const expressions = imagePromptAssets.filter(
      (asset) => asset.slot === 'expression'
    );
    const poses = imagePromptAssets.filter((asset) => asset.slot === 'pose');
    const makeup = imagePromptAssets.filter((asset) => asset.slot === 'makeup');

    expect(expressions.length).toBeGreaterThan(0);
    expect(poses.length).toBeGreaterThan(0);
    expect(makeup.length).toBeGreaterThan(0);
    expect(
      expressions.every((asset) =>
        /gaze target, eyelids, brows, mouth corners/i.test(asset.prompt)
      )
    ).toBe(true);
    expect(
      poses.every((asset) =>
        /support points, center of gravity, pelvis/i.test(asset.prompt)
      )
    ).toBe(true);
    expect(
      makeup.every((asset) =>
        /one recognizable makeup anchor/i.test(asset.prompt)
      )
    ).toBe(true);
  });

  it('keeps manual high-intensity assets but compiles one explicit focal hierarchy', () => {
    const selection = normalizeImagePromptSelection({
      visualEffect: 'visualEffect-bloom-highlights',
      lens: 'lens-fisheye-optical',
      makeup: 'makeup-editorial-metallic'
    });
    const result = compileImagePrompt(
      selection,
      defaultImagePromptSettings,
      imagePromptAssets,
      'zh-CN'
    );

    expect(result.selectedAssets.map((asset) => asset.id)).toEqual(
      expect.arrayContaining([
        'visualEffect-bloom-highlights',
        'lens-fisheye-optical',
        'makeup-editorial-metallic'
      ])
    );
    expect(result.prompt).toContain('是唯一高强度视觉中心');
    expect(result.prompt).toContain('只保留辅助强度');
    expect(result.warnings).toEqual([
      expect.stringContaining('多个高强度素材同时启用')
    ]);
  });
});

describe('hoodie top expansion a', () => {
  it('adds nine standalone hoodie upper garments without outfit leakage', () => {
    const ids = new Set([
      'top-heather-gray-classic-hoodie',
      'top-navy-fitted-zip-hoodie',
      'top-cream-cropped-boxy-hoodie',
      'top-forest-oversized-hoodie',
      'top-black-sleeveless-hoodie',
      'top-burgundy-knit-hoodie',
      'top-pale-blue-anorak-hoodie',
      'top-dusty-pink-short-sleeve-hoodie',
      'top-charcoal-asymmetric-zip-hoodie'
    ]);
    const hoodies = imagePromptAssets.filter((asset) => ids.has(asset.id));

    expect(hoodies).toHaveLength(ids.size);
    expect(hoodies.every((asset) => asset.slot === 'top')).toBe(true);
    expect(
      hoodies.every((asset) => getOutfitCoverage(asset) === 'separates')
    ).toBe(true);
    expect(
      hoodies.some((asset) =>
        /matching sweatpants|coordinated set|dress|jumpsuit/i.test(asset.prompt)
      )
    ).toBe(false);
  });
});

describe('wide-leg trouser bottom expansion a', () => {
  it('adds nine standalone bottoms without outfit or one-piece leakage', () => {
    const ids = new Set([
      'bottom-black-double-pleat-wide',
      'bottom-ivory-linen-drawstring-wide',
      'bottom-navy-pinstripe-wide',
      'bottom-rust-satin-palazzo',
      'bottom-gray-paperbag-wide',
      'bottom-cobalt-ankle-slit-wide',
      'bottom-chocolate-corduroy-wide',
      'bottom-cream-wrap-front-wide',
      'bottom-plum-velvet-wide'
    ]);
    const trousers = imagePromptAssets.filter((asset) => ids.has(asset.id));

    expect(trousers).toHaveLength(ids.size);
    expect(trousers.every((asset) => asset.slot === 'bottom')).toBe(true);
    expect(
      trousers.every((asset) => getOutfitCoverage(asset) === 'separates')
    ).toBe(true);
    expect(
      trousers.some((asset) =>
        /matching jacket|coordinated outfit|dress|jumpsuit|skirt|shorts/i.test(
          asset.prompt
        )
      )
    ).toBe(false);
  });
});

describe('night-out one-piece fashion expansion a', () => {
  it('keeps nine bold SFW dresses published as one-piece garments', () => {
    const ids = new Set([
      'onePiece-black-corset-seamed-mini',
      'onePiece-scarlet-diagonal-cutout-midi',
      'onePiece-silver-chainmail-cowl-mini',
      'onePiece-chocolate-velvet-offshoulder-midi',
      'onePiece-ivory-tailored-blazer-mini',
      'onePiece-cobalt-highneck-openback-midi',
      'onePiece-leopard-velvet-slip-mini',
      'onePiece-emerald-draped-shoulder-mini',
      'onePiece-black-mesh-panel-mini'
    ]);
    const dresses = imagePromptAssets.filter((asset) => ids.has(asset.id));

    expect(dresses).toHaveLength(ids.size);
    expect(dresses.every((asset) => asset.slot === 'onePiece')).toBe(true);
    expect(
      dresses.every((asset) => getOutfitCoverage(asset) === 'one-piece')
    ).toBe(true);
    expect(
      dresses.some((asset) =>
        /coordinated set|jumpsuit|romper|bikini|underwear|jacket plus skirt/i.test(
          asset.prompt
        )
      )
    ).toBe(false);
  });
});

describe('Chinese historical outfit expansion a', () => {
  it('adds nine coordinated Chinese clothing structures without one-piece leakage', () => {
    const ids = new Set([
      'outfit-tang-qixiong-ruqun',
      'outfit-song-beizi-pleated-skirt',
      'outfit-ming-aoqun-mamian',
      'outfit-weijin-jiaoling-wrap-skirt',
      'outfit-tang-yuanlingpao-trousers',
      'outfit-new-chinese-qipao-mamian',
      'outfit-wuxia-crosscollar-trousers',
      'outfit-crimson-gold-xianxia',
      'outfit-dunhuang-turquoise-saffron'
    ]);
    const outfits = imagePromptAssets.filter((asset) => ids.has(asset.id));
    expect(outfits).toHaveLength(ids.size);
    expect(outfits.every((asset) => asset.slot === 'outfit')).toBe(true);
    expect(
      outfits.every((asset) => getOutfitCoverage(asset) === 'complete-set')
    ).toBe(true);
    expect(
      outfits.some((asset) =>
        /single continuous dress|jumpsuit|kimono|hanbok/i.test(asset.prompt)
      )
    ).toBe(false);
  });
});

describe('Chinese historical hairstyle expansion a', () => {
  it('adds nine hairstyle-only samples without accessory leakage', () => {
    const ids = new Set([
      'hairstyle-tang-high-cloud-chignon',
      'hairstyle-tang-double-ring-chignon',
      'hairstyle-song-tall-sidecoil-chignon',
      'hairstyle-ming-rounded-low-chignon',
      'hairstyle-han-falling-horse-chignon',
      'hairstyle-weijin-loose-high-chignon',
      'hairstyle-wuxia-high-ponytail',
      'hairstyle-xianxia-halfup-topknot',
      'hairstyle-newchinese-wave-lowbun'
    ]);
    const hairstyles = imagePromptAssets.filter((asset) => ids.has(asset.id));
    expect(hairstyles).toHaveLength(ids.size);
    expect(hairstyles.every((asset) => asset.slot === 'hairstyle')).toBe(true);
    expect(
      hairstyles.some((asset) =>
        /hairpin|tiara|flower ornament|ribbon|jewelry/i.test(asset.prompt)
      )
    ).toBe(false);
  });
});

describe('modern fashion hairstyle expansion a', () => {
  it('adds nine distinct hairstyle structures without accessory leakage', () => {
    const ids = new Set([
      'hairstyle-wet-look-slickback',
      'hairstyle-supermodel-blowout',
      'hairstyle-glass-bob',
      'hairstyle-butterfly-layers',
      'hairstyle-tousled-wolf-cut',
      'hairstyle-sculpted-high-ponytail',
      'hairstyle-sleek-low-ponytail',
      'hairstyle-mermaid-s-waves',
      'hairstyle-textured-pixie'
    ]);
    const hairstyles = imagePromptAssets.filter((asset) => ids.has(asset.id));
    expect(hairstyles).toHaveLength(ids.size);
    expect(hairstyles.every((asset) => asset.slot === 'hairstyle')).toBe(true);
    expect(
      hairstyles.some((asset) =>
        /hairpin|tiara|flower ornament|ribbon|jewelry|headband/i.test(
          asset.prompt
        )
      )
    ).toBe(false);
  });
});

describe('upper-garment expansion b', () => {
  it('normalizes seven restored tops and adds two distinct structures', () => {
    const ids = new Set([
      'top-public-expansion-08',
      'top-public-expansion-10',
      'top-public-expansion-11',
      'top-public-expansion-12',
      'top-public-expansion-14',
      'top-public-expansion-15',
      'top-public-expansion-16',
      'top-olive-utility-vest',
      'top-cobalt-asymmetric-drape'
    ]);
    const tops = imagePromptAssets.filter((asset) => ids.has(asset.id));

    expect(tops).toHaveLength(ids.size);
    expect(tops.every((asset) => asset.slot === 'top')).toBe(true);
    expect(
      tops.some((asset) =>
        /collegiate|quiet luxury|portrait styling|street fashion|rainy/i.test(
          asset.prompt
        )
      )
    ).toBe(false);
  });
});

describe('lower-garment expansion b', () => {
  it('normalizes seven restored bottoms and adds two distinct silhouettes', () => {
    const ids = new Set([
      'bottom-public-expansion-10',
      'bottom-public-expansion-11',
      'bottom-public-expansion-12',
      'bottom-public-expansion-13',
      'bottom-public-expansion-14',
      'bottom-public-expansion-15',
      'bottom-public-expansion-16',
      'bottom-charcoal-tailored-culottes',
      'bottom-forest-velvet-maxi-skirt'
    ]);
    const bottoms = imagePromptAssets.filter((asset) => ids.has(asset.id));

    expect(bottoms).toHaveLength(ids.size);
    expect(bottoms.every((asset) => asset.slot === 'bottom')).toBe(true);
    expect(
      bottoms.some((asset) =>
        /street portrait|stage|editorial lower-body|workwear prompt|summer wardrobe/i.test(
          asset.prompt
        )
      )
    ).toBe(false);
  });
});

describe('coordinated outfit expansion', () => {
  it('migrates the mixed tank-and-shorts asset out of top and expands outfit choices', () => {
    const tops = imagePromptAssets.filter((asset) => asset.slot === 'top');
    const outfits = imagePromptAssets.filter(
      (asset) => asset.slot === 'outfit'
    );

    expect(
      tops.some((asset) => asset.id === 'top-cropped-tank-denim-shorts')
    ).toBe(false);
    expect(
      outfits.some((asset) => asset.id === 'top-cropped-tank-denim-shorts')
    ).toBe(true);
    expect(
      outfits.some((asset) => asset.id === 'outfit-double-denim-blue')
    ).toBe(true);
    expect(outfits.length).toBeGreaterThan(9);
  });
});

describe('portrait expression expansion', () => {
  it('normalizes two restored expressions and adds seven facial-only states', () => {
    const ids = new Set([
      'expression-coy-downward-gaze',
      'expression-natural-soft-smile',
      'expression-surprised-recognition',
      'expression-quiet-concern',
      'expression-restrained-displeasure',
      'expression-held-back-tears',
      'expression-playful-wink',
      'expression-open-genuine-laugh',
      'expression-skeptical-raised-brow'
    ]);
    const expressions = imagePromptAssets.filter((asset) => ids.has(asset.id));

    expect(expressions).toHaveLength(ids.size);
    expect(
      imagePromptAssets.filter((asset) => asset.slot === 'expression').length
    ).toBeGreaterThanOrEqual(18);
    expect(
      expressions.some((asset) =>
        /camera angle|wardrobe|makeup|lighting|hand gesture|body pose/i.test(
          asset.prompt
        )
      )
    ).toBe(false);
  });
});

describe('atomic portrait character normalization', () => {
  const normalizedCharacterIds = new Set([
    'character-public-expansion-01',
    'character-public-expansion-02',
    'character-public-expansion-03',
    'character-public-expansion-04',
    'character-public-expansion-05',
    'character-public-expansion-06',
    'character-public-expansion-07',
    'character-public-expansion-08',
    'character-public-expansion-09',
    'character-public-expansion-10',
    'character-public-expansion-11',
    'character-public-expansion-12',
    'character-public-expansion-13',
    'character-public-expansion-14',
    'character-public-expansion-15',
    'character-public-expansion-16',
    'character-refined-model',
    'character-cyber-courier',
    'character-arcane-apprentice',
    'character-blue-fantasy-adept',
    'character-desert-scout',
    'character-gothic-librarian',
    'character-idol-trainee',
    'character-lunar-engineer',
    'character-marine-healer',
    'character-music-producer',
    'character-raincoat-commuter',
    'character-retro-cafe-server',
    'character-silver-fantasy-mage',
    'character-snow-archer',
    'character-street-skater',
    'character-vintage-detective',
    'character-soft-elf-girl',
    'character-violet-anime-girl',
    'character-twintail-magical-heroine',
    'character-black-hair-boy'
  ]);

  it('keeps all 36 normalized samples in Character with real thumbnails', () => {
    const characters = imagePromptAssets.filter((asset) =>
      normalizedCharacterIds.has(asset.id)
    );

    expect(characters).toHaveLength(normalizedCharacterIds.size);
    expect(characters.every((asset) => asset.slot === 'character')).toBe(true);
    characters.forEach((asset) => {
      expect(
        existsSync(
          path.resolve(
            process.cwd(),
            `src/web/assets/prompt-library/character/${asset.id}.webp`
          )
        )
      ).toBe(true);
    });
  });

  it('keeps prompt, subtitle and tags free of concrete cross-axis controls', () => {
    const concreteCrossAxisControl =
      /\b(?:hair|ponytail|pigtail|bob|braid|bun|chignon|jacket|sweater|hoodie|blouse|dress|uniform|cloak|scarf|headphones?|camera|racket|skateboard|moonbase|workshop|library room|canyon light|forest|bokeh|makeup|lipstick|smile|frown)\b|短发|长发|马尾|双马尾|卷发|湿发|毛衣|外套|夹克|制服|旗袍|披风|围巾|耳机|相机|球拍|滑板(?!手)|雨景|咖啡馆|工作台|月球基地|森林|妆面|红唇|微笑|皱眉/i;
    const characters = imagePromptAssets.filter((asset) =>
      normalizedCharacterIds.has(asset.id)
    );

    characters.forEach((asset) => {
      expect(
        [asset.prompt, asset.subtitle, ...asset.tags].join(' '),
        `${asset.id} must describe stable identity only`
      ).not.toMatch(concreteCrossAxisControl);
    });
  });

  it('uses explicit adult wording for every normalized female persona', () => {
    const characters = imagePromptAssets.filter((asset) =>
      normalizedCharacterIds.has(asset.id)
    );

    characters.forEach((asset) => {
      expect(asset.prompt, asset.id).toMatch(/\badult\b|\bmiddle-aged\b/i);
      expect(
        [asset.title, asset.subtitle, ...asset.tags].join(' ')
      ).not.toMatch(/少女|女孩|girl|boy/i);
    });
  });
});

describe('portrait taxonomy hygiene', () => {
  it('keeps restored pose and visual-effect variants publicly available', () => {
    const ids = new Set(imagePromptAssets.map((asset) => asset.id));
    expect(ids.has('pose-low-angle-forward-lean')).toBe(true);
    expect(ids.has('pose-mirror-selfie')).toBe(true);
    expect(ids.has('pose-public-expansion-06')).toBe(true);
    expect(ids.has('visualEffect-chromatic-aberration')).toBe(true);
    expect(ids.has('visualEffect-dramatic-depth')).toBe(true);
    expect(ids.has('visualEffect-fine-film-grain')).toBe(true);
  });

  it('keeps the nine-item pose core alongside broader pose variants', () => {
    const poses = imagePromptAssets.filter((asset) => asset.slot === 'pose');
    expect(poses.length).toBeGreaterThan(9);
    expect(poses.some((asset) => asset.id === 'pose-relaxed-standing')).toBe(
      true
    );
    expect(poses.some((asset) => asset.id === 'pose-seated-relaxed')).toBe(
      true
    );
  });

  it('keeps floor and reclining pose geometry in full-body shots', () => {
    const ids = [
      'pose-floor-w-sit',
      'pose-prone-elbows-up',
      'pose-side-recline-head-support',
      'pose-supine-knees-bent',
      'pose-chair-reverse-straddle'
    ];
    const poses = imagePromptAssets.filter((asset) => ids.includes(asset.id));

    expect(poses).toHaveLength(ids.length);
    poses.forEach((pose) => {
      expect(resolveAssetCompatibility(pose).compatibleShotFamilies).toEqual([
        'full-body'
      ]);
    });
  });

  it('marks support-heavy daily poses as unavailable for a second prop action', () => {
    const ids = [
      'pose-floor-w-sit',
      'pose-prone-elbows-up',
      'pose-chair-reverse-straddle',
      'pose-seated-pillow-hug',
      'pose-chair-edge-forward-rest'
    ];
    const poses = imagePromptAssets.filter((asset) => ids.includes(asset.id));

    expect(poses).toHaveLength(ids.length);
    poses.forEach((pose) => {
      expect(resolveAssetCompatibility(pose).occupiesHands).toBe(true);
    });
  });

  it('keeps normalized expansion poses free of wardrobe and scene leakage', () => {
    const normalizedIds = new Set([
      'pose-public-expansion-03',
      'pose-public-expansion-04',
      'pose-public-expansion-05',
      'pose-public-expansion-08',
      'pose-public-expansion-09',
      'pose-public-expansion-12',
      'pose-public-expansion-13',
      'pose-public-expansion-14',
      'pose-public-expansion-15'
    ]);
    const poses = imagePromptAssets.filter((asset) =>
      normalizedIds.has(asset.id)
    );

    expect(poses).toHaveLength(normalizedIds.size);
    expect(
      poses.some((asset) =>
        /cafe|denim|streetwear|outdoor light|trench|magazine|urban/i.test(
          asset.prompt
        )
      )
    ).toBe(false);
  });

  it('normalizes the second pose expansion and keeps its four new samples public', () => {
    const normalizedIds = new Set([
      'pose-low-angle-forward-lean',
      'pose-mirror-selfie',
      'pose-public-expansion-06',
      'pose-seated-relaxed',
      'pose-public-expansion-16',
      'pose-upright-kneeling',
      'pose-floor-seat-one-knee',
      'pose-overhead-stretch',
      'pose-hands-behind-lean'
    ]);
    const poses = imagePromptAssets.filter((asset) =>
      normalizedIds.has(asset.id)
    );

    expect(poses).toHaveLength(normalizedIds.size);
    expect(
      poses.some((asset) =>
        /low-angle|mirror selfie|full-body|blazer|suit|leather jacket|bed|bedroom|lifestyle/i.test(
          asset.prompt
        )
      )
    ).toBe(false);
  });
});

describe('viewpoint taxonomy', () => {
  it('exposes the core, extreme and practical camera-relation samples without framing or lens leakage', () => {
    const assets = imagePromptAssets.filter(
      (asset) => asset.slot === 'viewpoint'
    );

    expect(assets).toHaveLength(36);
    expect(
      assets.some((asset) =>
        /close-up|full-body|35mm|85mm|film grain|anamorphic/i.test(asset.prompt)
      )
    ).toBe(false);
  });

  it('classifies the new high-risk camera relations as extreme visual singularities', () => {
    const extremeIds = new Set([
      'viewpoint-ankle-side-upward',
      'viewpoint-ceiling-corner-oblique',
      'viewpoint-direct-overhead-nadir',
      'viewpoint-floor-rear-upward',
      'viewpoint-below-glass-upward',
      'viewpoint-full-roll-90'
    ]);
    const assets = imagePromptAssets.filter((asset) =>
      extremeIds.has(asset.id)
    );

    expect(assets).toHaveLength(extremeIds.size);
    expect(
      assets.every(
        (asset) =>
          getPortraitVisualSingularityKind(asset) === 'extreme-viewpoint'
      )
    ).toBe(true);
  });

  it('publishes the fine-grained shot batch and manga-perspective viewpoint batch', () => {
    const manifestAssets = JSON.parse(
      readFileSync(
        path.join(
          process.cwd(),
          'src/web/assets/prompt-library/manifest.generated.json'
        ),
        'utf8'
      )
    ).assets as Array<{
      id: string;
      slot: ImagePromptAsset['slot'];
      sourceBatchId: string;
    }>;
    const replacementShots = manifestAssets.filter(
      (asset) =>
        asset.sourceBatchId ===
        'portrait-shot-quality-unification-a-v1-20260715'
    );
    const fineGrainedShots = manifestAssets.filter(
      (asset) =>
        asset.sourceBatchId === 'portrait-shot-fine-grain-b-v1-20260715'
    );
    const mangaViewpoints = manifestAssets.filter(
      (asset) =>
        asset.sourceBatchId ===
        'portrait-viewpoint-manga-perspective-c-v1-20260715'
    );

    expect(replacementShots).toHaveLength(9);
    expect(fineGrainedShots).toHaveLength(9);
    expect(mangaViewpoints).toHaveLength(9);
    expect(replacementShots.every((asset) => asset.slot === 'shot')).toBe(true);
    expect(fineGrainedShots.every((asset) => asset.slot === 'shot')).toBe(true);
    expect(mangaViewpoints.every((asset) => asset.slot === 'viewpoint')).toBe(
      true
    );
    expect(
      mangaViewpoints.every((asset) => {
        const runtimeAsset = imagePromptAssets.find(
          (candidate) => candidate.id === asset.id
        );
        return (
          runtimeAsset &&
          getPortraitVisualSingularityKind(runtimeAsset) === 'extreme-viewpoint'
        );
      })
    ).toBe(true);
  });
});

describe('2026-07-14 fashion and global subject expansion', () => {
  const manifestAssets = JSON.parse(
    readFileSync(
      path.join(
        process.cwd(),
        'src/web/assets/prompt-library/manifest.generated.json'
      ),
      'utf8'
    )
  ).assets as Array<
    Pick<ImagePromptAsset, 'id' | 'slot' | 'title' | 'prompt' | 'tags'> & {
      sourceBatchId: string;
    }
  >;
  const byBatch = (sourceBatchId: string) =>
    manifestAssets.filter((asset) => asset.sourceBatchId === sourceBatchId);

  it('adds nine clean samples for every requested single-variable batch', () => {
    const expectations = [
      ['portrait-hairstyle-modern-fashion-b-v1-20260714', 'hairstyle'],
      ['portrait-pose-fashion-body-b-v1-20260714', 'pose'],
      ['portrait-outfit-runway-classic-b-v1-20260714', 'outfit'],
      ['portrait-outfit-original-acg-fashion-a-v1-20260714', 'outfit'],
      ['portrait-background-global-culture-a-v1-20260714', 'background'],
      ['portrait-background-global-night-b-v1-20260714', 'background'],
      ['portrait-prop-original-acg-a-v1-20260714', 'prop'],
      ['portrait-viewpoint-extreme-b-v1-20260714', 'viewpoint']
    ] as const;

    for (const [batchId, slot] of expectations) {
      const assets = byBatch(batchId);
      expect(assets, batchId).toHaveLength(9);
      expect(
        assets.every((asset) => asset.slot === slot),
        batchId
      ).toBe(true);
      expect(
        assets.every((asset) =>
          imagePromptAssets.some((runtimeAsset) => runtimeAsset.id === asset.id)
        ),
        batchId
      ).toBe(true);
    }
  });

  it('keeps original ACG samples reusable instead of naming protected works', () => {
    const assets = [
      ...byBatch('portrait-outfit-original-acg-fashion-a-v1-20260714'),
      ...byBatch('portrait-prop-original-acg-a-v1-20260714')
    ];
    const text = assets
      .flatMap((asset) => [asset.id, asset.title, asset.prompt, ...asset.tags])
      .join(' ');

    expect(assets).toHaveLength(18);
    expect(text).toMatch(/original|原创/i);
    expect(text).not.toMatch(
      /pokemon|pokémon|sailor moon|final fantasy|evangelion|genshin|honkai|naruto|one piece|marvel|dc comics/i
    );
  });
});

describe('2026-07-16 imaginative background expansion', () => {
  it('publishes three distinct locations for space, desert, and Japanese courtyards', () => {
    const manifestAssets = JSON.parse(
      readFileSync(
        path.join(
          process.cwd(),
          'src/web/assets/prompt-library/manifest.generated.json'
        ),
        'utf8'
      )
    ).assets as Array<{
      id: string;
      slot: ImagePromptAsset['slot'];
      sourceBatchId: string;
      thumbnailUrl: string;
    }>;
    const batchAssets = manifestAssets.filter(
      (asset) =>
        asset.sourceBatchId ===
        'portrait-background-imaginative-worlds-e-v1-20260716'
    );

    expect(batchAssets).toHaveLength(9);
    expect(batchAssets.every((asset) => asset.slot === 'background')).toBe(
      true
    );
    expect(
      batchAssets.every((asset) =>
        existsSync(
          path.join(
            process.cwd(),
            'src/web',
            asset.thumbnailUrl.replace(/^\//, '')
          )
        )
      )
    ).toBe(true);
    expect(
      batchAssets.filter((asset) => /orbital|lunar|saturn/.test(asset.id))
    ).toHaveLength(3);
    expect(batchAssets.filter((asset) => /desert/.test(asset.id))).toHaveLength(
      3
    );
    expect(
      batchAssets.filter((asset) => /japanese/.test(asset.id))
    ).toHaveLength(3);
  });

  it('publishes six more scene families as two audited 3x3 batches', () => {
    const manifestAssets = JSON.parse(
      readFileSync(
        path.join(
          process.cwd(),
          'src/web/assets/prompt-library/manifest.generated.json'
        ),
        'utf8'
      )
    ).assets as Array<{
      id: string;
      slot: ImagePromptAsset['slot'];
      sourceBatchId: string;
      thumbnailUrl: string;
    }>;
    const batchIds = [
      'portrait-background-ocean-ice-geology-f-v1-20260716',
      'portrait-background-industrial-retrofuture-installation-g-v1-20260716'
    ];
    const [naturalWorlds, builtWorlds] = batchIds.map((batchId) =>
      manifestAssets.filter((asset) => asset.sourceBatchId === batchId)
    );

    for (const [index, assets] of [naturalWorlds, builtWorlds].entries()) {
      expect(assets, batchIds[index]).toHaveLength(9);
      expect(assets.every((asset) => asset.slot === 'background')).toBe(true);
      expect(
        assets.every((asset) =>
          existsSync(
            path.join(
              process.cwd(),
              'src/web',
              asset.thumbnailUrl.replace(/^\//, '')
            )
          )
        )
      ).toBe(true);
      expect(
        assets.every((asset) =>
          imagePromptAssets.some((runtimeAsset) => runtimeAsset.id === asset.id)
        )
      ).toBe(true);
    }

    expect(
      naturalWorlds.filter((asset) => /seafloor|kelp|abyssal/.test(asset.id))
    ).toHaveLength(3);
    expect(
      naturalWorlds.filter((asset) =>
        /blue-ice|aurora|frozen-lake/.test(asset.id)
      )
    ).toHaveLength(3);
    expect(
      naturalWorlds.filter((asset) =>
        /selenite|lava-tube|travertine/.test(asset.id)
      )
    ).toHaveLength(3);
    expect(
      builtWorlds.filter((asset) =>
        /turbine|stormwater|dry-dock/.test(asset.id)
      )
    ).toHaveLength(3);
    expect(
      builtWorlds.filter((asset) => /retrofuture|planetary/.test(asset.id))
    ).toHaveLength(3);
    expect(
      builtWorlds.filter((asset) =>
        /prismatic|suspended|mirrored/.test(asset.id)
      )
    ).toHaveLength(3);
  });

  it('publishes biofabricated, climate-adaptive and vertical scenes as one audited 3x3 batch', () => {
    const manifestAssets = JSON.parse(
      readFileSync(
        path.join(
          process.cwd(),
          'src/web/assets/prompt-library/manifest.generated.json'
        ),
        'utf8'
      )
    ).assets as Array<{
      id: string;
      slot: ImagePromptAsset['slot'];
      sourceBatchId: string;
      thumbnailUrl: string;
    }>;
    const assets = manifestAssets.filter(
      (asset) =>
        asset.sourceBatchId ===
        'portrait-background-biophilic-climate-vertical-h-v1-20260716'
    );

    expect(assets).toHaveLength(9);
    expect(assets.every((asset) => asset.slot === 'background')).toBe(true);
    expect(
      assets.every((asset) =>
        existsSync(
          path.join(
            process.cwd(),
            'src/web',
            asset.thumbnailUrl.replace(/^\//, '')
          )
        )
      )
    ).toBe(true);
    expect(
      assets.filter((asset) => /algae|mycelium|mangrove/.test(asset.id))
    ).toHaveLength(3);
    expect(
      assets.filter((asset) =>
        /rainchain|windcatcher|tidal-retention/.test(asset.id)
      )
    ).toHaveLength(3);
    expect(
      assets.filter((asset) => /cloudforest|cliffside|skytower/.test(asset.id))
    ).toHaveLength(3);
  });

  it('publishes nine countries of world landmarks as one audited 3x3 batch', () => {
    const manifestAssets = JSON.parse(
      readFileSync(
        path.join(
          process.cwd(),
          'src/web/assets/prompt-library/manifest.generated.json'
        ),
        'utf8'
      )
    ).assets as Array<{
      id: string;
      slot: ImagePromptAsset['slot'];
      sourceBatchId: string;
      thumbnailUrl: string;
    }>;
    const assets = manifestAssets.filter(
      (asset) =>
        asset.sourceBatchId ===
        'portrait-background-world-landmarks-i-v1-20260716'
    );

    expect(assets).toHaveLength(9);
    expect(assets.every((asset) => asset.slot === 'background')).toBe(true);
    expect(
      assets.every((asset) =>
        existsSync(
          path.join(
            process.cwd(),
            'src/web',
            asset.thumbnailUrl.replace(/^\//, '')
          )
        )
      )
    ).toBe(true);
    expect(
      assets.filter((asset) => /switzerland|norway|spain/.test(asset.id))
    ).toHaveLength(3);
    expect(
      assets.filter((asset) => /korea|vietnam|japan/.test(asset.id))
    ).toHaveLength(3);
    expect(
      assets.filter((asset) => /peru|canada|newzealand/.test(asset.id))
    ).toHaveLength(3);
  });
});

describe('portrait-first random compatibility', () => {
  const asset = (
    id: string,
    slot: ImagePromptAsset['slot'],
    title: string,
    prompt: string,
    tags: string[] = []
  ): ImagePromptAsset => ({
    id,
    slot,
    title,
    subtitle: title,
    prompt,
    tags,
    visual: { tone: '#eee', accent: '#333', shape: 'style' }
  });

  it('does not add a separate bottom to a one-piece dress', () => {
    const selection = buildRandomImagePromptSelection(
      [
        asset('top-dress-ivory', 'top', '象牙白连衣裙', 'ivory midi dress'),
        asset('bottom-black-skirt', 'bottom', '黑色半裙', 'black skirt')
      ],
      () => 0
    );

    expect(selection.top).toBe('top-dress-ivory');
    expect(selection.bottom).toBeNull();
  });

  it('filters non-female characters and non-photographic styles from random', () => {
    const selection = buildRandomImagePromptSelection(
      [
        asset('character-black-hair-boy', 'character', '黑发男生', 'young man'),
        asset(
          'character-seoul-woman',
          'character',
          '首尔女性模特',
          'adult female model'
        ),
        asset(
          'style-illustration-only',
          'style',
          '纯插画风格',
          'watercolor illustration'
        ),
        asset(
          'style-fashion-photo',
          'style',
          '时装摄影',
          'fashion portrait photography'
        )
      ],
      () => 0
    );

    expect(selection.character).toBe('character-seoul-woman');
    expect(selection.style).toBe('style-fashion-photo');
  });

  it('requires explicit adulthood for youth-coded character archetypes and excludes school backgrounds', () => {
    expect(
      isPortraitRandomEligible(
        asset('character-elf-girl', 'character', '精灵少女', 'soft elf girl')
      )
    ).toBe(false);
    expect(
      isPortraitRandomEligible(
        asset(
          'character-adult-heroine',
          'character',
          '成年女主角',
          'adult fantasy heroine'
        )
      )
    ).toBe(true);
    expect(
      isPortraitRandomEligible(
        asset(
          'background-classroom',
          'background',
          '旧教室',
          'old classroom at sunset'
        )
      )
    ).toBe(false);
  });

  it('uses a full-body-compatible shot for dynamic poses and clears conflicting props', () => {
    const selection = buildRandomImagePromptSelection(
      [
        asset('pose-walking', 'pose', '自然行走', 'walking pose'),
        asset('prop-camera', 'prop', '相机', 'camera prop'),
        asset('shot-face-closeup', 'shot', '面部特写', 'face close-up'),
        asset('shot-full-body', 'shot', '全身构图', 'full-body framing')
      ],
      () => 0
    );

    expect(selection.shot).toBe('shot-full-body');
    expect(selection.prop).toEqual(['prop-camera']);
  });

  it('treats an overhead stretch as a full-body action instead of a chest-up pose', () => {
    const pose = imagePromptAssets.find(
      (item) => item.id === 'pose-overhead-stretch'
    );

    expect(pose).toBeDefined();
    expect(resolveAssetCompatibility(pose!).compatibleShotFamilies).toEqual([
      'full-body',
      'dynamic'
    ]);
  });

  it('keeps meditation and upright kneeling poses in a full-body-readable frame', () => {
    const meditation = imagePromptAssets.find(
      (item) => item.id === 'pose-yoga'
    );
    const uprightKneeling = imagePromptAssets.find(
      (item) => item.id === 'pose-upright-kneeling'
    );

    expect(
      resolveAssetCompatibility(meditation!).compatibleShotFamilies
    ).toEqual(['full-body']);
    expect(
      resolveAssetCompatibility(uprightKneeling!).compatibleShotFamilies
    ).toEqual(['full-body']);

    const selection = buildRandomImagePromptSelection(
      [
        meditation!,
        asset('shot-waist-up', 'shot', '腰上中景', 'waist-up shot'),
        asset('shot-knee-up', 'shot', '膝上中全景', 'knee-up shot'),
        asset('shot-full-body', 'shot', '全身景', 'full-body shot')
      ],
      () => 0
    );

    expect(selection.shot).toBe('shot-full-body');
  });

  it('prevents contradictory monochrome and explicit-color directions in random slots', () => {
    const noir = asset(
      'style-high-contrast-noir',
      'style',
      '黑白 Noir',
      'high-contrast black-and-white noir photography'
    );
    const coloredGel = asset(
      'lighting-colored-gel',
      'lighting',
      '双色凝胶光',
      'controlled split colored gel, warm amber side key and cool blue side key'
    );
    const neutralLight = asset(
      'lighting-neutral-softbox',
      'lighting',
      '中性柔箱',
      'neutral softbox portrait light'
    );
    const withNoir = setImagePromptAssetSelection(
      defaultImagePromptSelection,
      noir
    );
    const randomizedLight = randomizeImagePromptSelectionSlot(
      withNoir,
      'lighting',
      [noir, coloredGel, neutralLight],
      () => 0
    );

    expect(randomizedLight.lighting).toEqual(['lighting-neutral-softbox']);

    const glossy = asset(
      'style-glossy-idol-magazine',
      'style',
      '彩色偶像杂志',
      'glossy idol magazine with pastel studio color'
    );
    const monochromeLens = asset(
      'lens-monochrome-silver-gelatin',
      'lens',
      '黑白银盐',
      'black-and-white silver-gelatin film rendering'
    );
    const colorLens = asset(
      'lens-clean-digital',
      'lens',
      '现代数码',
      'clean digital photographic rendering'
    );
    const withGlossy = setImagePromptAssetSelection(
      defaultImagePromptSelection,
      glossy
    );
    const randomizedLens = randomizeImagePromptSelectionSlot(
      withGlossy,
      'lens',
      [glossy, monochromeLens, colorLens],
      () => 0
    );

    expect(randomizedLens.lens).toBe('lens-clean-digital');
  });

  it('removes unreadable face micro-detail from random extreme-long shots', () => {
    const expression = asset(
      'expression-open-laugh',
      'expression',
      '开怀大笑',
      'open genuine laugh with visible teeth'
    );
    const makeup = asset(
      'makeup-pearl-detail',
      'makeup',
      '珠光眼头',
      'tiny pearl highlight at the inner eye corner'
    );
    const extremeLong = asset(
      'shot-extreme-long',
      'shot',
      '大远景',
      'extreme long shot, full figure one sixth of frame height'
    );
    const initial = [expression, makeup].reduce(
      (current, selected) => setImagePromptAssetSelection(current, selected),
      defaultImagePromptSelection
    );
    const randomized = buildAuditedRandomizedImagePromptSelectionSlot(
      initial,
      'shot',
      [expression, makeup, extremeLong],
      20260714
    );

    expect(randomized.selection.shot).toBe('shot-extreme-long');
    expect(randomized.selection.expression).toBeNull();
    expect(randomized.selection.makeup).toBeNull();
    expect(randomized.constraintAdjustments).toContain(
      'cleared_face_detail_outside_frame'
    );

    const manualSelection = setImagePromptAssetSelection(initial, extremeLong);
    const manual = compileImagePrompt(
      manualSelection,
      defaultImagePromptSettings,
      [expression, makeup, extremeLong],
      'en-US'
    );
    expect(manual.selectedAssets.map((item) => item.id)).toEqual([
      'expression-open-laugh',
      'shot-extreme-long',
      'makeup-pearl-detail'
    ]);
  });

  it('preserves a manually selected noir and colored-gel experiment', () => {
    const noir = asset(
      'style-high-contrast-noir',
      'style',
      '黑白 Noir',
      'high-contrast black-and-white noir photography'
    );
    const coloredGel = asset(
      'lighting-colored-gel',
      'lighting',
      '双色凝胶光',
      'controlled split colored gel lighting'
    );
    const selection = [noir, coloredGel].reduce(
      (current, selected) => setImagePromptAssetSelection(current, selected),
      defaultImagePromptSelection
    );
    const result = compileImagePrompt(
      selection,
      defaultImagePromptSettings,
      [noir, coloredGel],
      'en-US'
    );

    expect(result.selectedAssets.map((item) => item.id)).toEqual([
      'style-high-contrast-noir',
      'lighting-colored-gel'
    ]);
  });

  it('keeps near-face hand gestures out of eye-only and face-only crops', () => {
    const selection = buildRandomImagePromptSelection(
      [
        asset('pose-facepalm', 'pose', '扶额', 'facepalm pose'),
        asset(
          'shot-extreme-detail-eyes',
          'shot',
          '眼部极特写',
          'extreme eye detail crop'
        ),
        asset(
          'shot-head-shoulders',
          'shot',
          '头肩近景',
          'head and shoulders framing'
        )
      ],
      () => 0
    );

    expect(selection.shot).toBe('shot-head-shoulders');
  });

  it('keeps an intentional close-up and removes the body pose outside frame', () => {
    const selection = buildRandomImagePromptSelection(
      [
        asset('pose-walking', 'pose', '自然行走', 'walking pose'),
        asset('shot-face-closeup', 'shot', '面部特写', 'face close-up')
      ],
      () => 0
    );

    expect(selection.shot).toBe('shot-face-closeup');
    expect(selection.pose).toBeNull();
  });

  it('warns when manual assets cannot be visible inside a face-detail crop', () => {
    const selection = normalizeImagePromptSelection({
      shot: 'shot-lower-face-detail',
      shoes: 'shoes-silver-platform-boots',
      prop: ['prop-transparent-umbrella']
    });
    const compiled = compileImagePrompt(
      selection,
      defaultImagePromptSettings,
      imagePromptAssets,
      'zh-CN'
    );

    expect(compiled.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/景别可见性建议.*鞋履.*手持道具/)
      ])
    );
    expect(compiled.selectedAssets.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'shot-lower-face-detail',
        'shoes-silver-platform-boots',
        'prop-transparent-umbrella'
      ])
    );
  });

  it('recognizes complete outfits and explicit portrait eligibility', () => {
    expect(
      getOutfitCoverage(
        asset('top-lounge-set', 'top', '成套居家装', 'matching lounge set')
      )
    ).toBe('complete-set');
    expect(
      isPortraitRandomEligible(
        asset(
          'character-violet-anime-girl',
          'character',
          '二次元少女',
          'anime girl'
        )
      )
    ).toBe(false);
  });

  it('drops handheld props when the selected pose already occupies both hands', () => {
    const selection = buildRandomImagePromptSelection(
      [
        asset('pose-crossed-arms', 'pose', '双臂交叉', 'crossed arms pose'),
        asset('prop-camera', 'prop', '相机', 'camera prop')
      ],
      () => 0
    );

    expect(selection.prop).toEqual([]);
  });

  it('treats raised-arm jumps and explicit hand gestures as prop conflicts', () => {
    for (const pose of [
      asset(
        'pose-energetic-jump',
        'pose',
        '垂直跃起',
        'energetic vertical jump, both feet off the ground, arms raised'
      ),
      asset(
        'pose-call-me',
        'pose',
        'Call Me',
        'call-me hand gesture near the face'
      )
    ]) {
      const selection = buildRandomImagePromptSelection(
        [pose, asset('prop-camera', 'prop', '相机', 'camera prop')],
        () => 0
      );

      expect(resolveAssetCompatibility(pose).occupiesHands).toBe(true);
      expect(selection.prop).toEqual([]);
    }
  });

  it('normalizes mirror-selfie poses to an eye-level frontal viewpoint', () => {
    const pose = asset(
      'pose-mirror-selfie',
      'pose',
      '镜面自拍',
      'mirror selfie pose holding a blank smartphone'
    );
    const topDown = asset(
      'viewpoint-near-top-down',
      'viewpoint',
      '近顶视',
      'near top-down observer viewpoint'
    );
    const eyeLevel = asset(
      'viewpoint-eye-level-frontal',
      'viewpoint',
      '平视正面',
      'eye-level frontal viewpoint'
    );
    const initial = [pose, topDown].reduce(
      (selection, selected) =>
        setImagePromptAssetSelection(selection, selected),
      defaultImagePromptSelection
    );
    const randomized = buildAuditedRandomizedImagePromptSelectionSlot(
      initial,
      'pose',
      [pose, topDown, eyeLevel],
      20260714
    );

    expect(randomized.selection.viewpoint).toBe('viewpoint-eye-level-frontal');
    expect(randomized.constraintAdjustments).toContain(
      'normalized_mirror_selfie_viewpoint'
    );
  });

  it('keeps chromatic wardrobe and makeup out of random monochrome treatments', () => {
    const crimsonOutfit = asset(
      'outfit-crimson-gold-xianxia',
      'outfit',
      '绛红金边仙侠套装',
      'deep-crimson xianxia ensemble with gold piping'
    );
    const noir = asset(
      'style-high-contrast-noir',
      'style',
      '黑白 Noir',
      'high-contrast black-and-white noir photography'
    );
    const colorStyle = asset(
      'style-clean-editorial',
      'style',
      '干净编辑摄影',
      'clean color editorial photography'
    );
    const selection = setImagePromptAssetSelection(
      defaultImagePromptSelection,
      crimsonOutfit
    );
    const randomized = randomizeImagePromptSelectionSlot(
      selection,
      'style',
      [crimsonOutfit, noir, colorStyle],
      () => 0
    );

    expect(randomized.style).toBe('style-clean-editorial');
  });

  it('treats task poses tagged as both-hands-occupied as a hard prop conflict', () => {
    const pose = asset(
      'pose-task-write-note',
      'pose',
      '桌边书写停顿',
      'write a note with both hands engaged',
      ['任务型姿态', '双手占用']
    );
    const selection = buildRandomImagePromptSelection(
      [pose, asset('prop-camera', 'prop', '相机', 'camera prop')],
      () => 0
    );

    expect(resolveAssetCompatibility(pose).occupiesHands).toBe(true);
    expect(selection.prop).toEqual([]);
  });

  it('keeps repeated real-library random combinations inside the portrait rules', () => {
    let seed = 20260711;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let index = 0; index < 100; index += 1) {
      const selection = buildRandomImagePromptSelection(
        imagePromptAssets,
        random
      );
      const character = imagePromptAssets.find(
        (item) => item.id === getPrimarySelectedAssetId(selection, 'character')
      );
      const style = imagePromptAssets.find(
        (item) => item.id === getPrimarySelectedAssetId(selection, 'style')
      );
      const top = imagePromptAssets.find(
        (item) => item.id === getPrimarySelectedAssetId(selection, 'top')
      );
      const compiled = compileImagePrompt(
        selection,
        defaultImagePromptSettings,
        imagePromptAssets,
        'zh-CN'
      );

      expect(character && isPortraitRandomEligible(character)).toBe(true);
      expect(style && isPortraitRandomEligible(style)).toBe(true);
      expect(compiled.prompt).toContain('的女性人像。');
      expect(compiled.prompt).not.toContain('的商业视觉图。');
      expect(compiled.prompt).not.toContain('避免人物抢占主体');
      for (const slot of [
        'hairstyle',
        'outfit',
        'onePiece',
        'viewpoint'
      ] as const) {
        const selected = imagePromptAssets.find(
          (item) => item.id === getPrimarySelectedAssetId(selection, slot)
        );
        if (selected) {
          expect(compiled.prompt).toContain(
            selected.promptZh || selected.prompt
          );
        }
      }
      expect(selection.productSubject).toBeNull();
      expect(selection.productSurface).toBeNull();
      expect(selection.titleArea).toBeNull();
      expect(selection.layoutDesign).toBeNull();
      if (top && getOutfitCoverage(top) !== 'separates') {
        expect(selection.bottom).toBeNull();
      }
    }
  });

  it('builds a guofeng historical recipe without modern fashion hair', () => {
    const selection = buildRandomImagePromptSelectionForProfile(
      [
        asset('hairstyle-tang-cloud', 'hairstyle', '唐风高云髻', '唐风高云髻', [
          '中国古风发型'
        ]),
        asset(
          'hairstyle-wet-look',
          'hairstyle',
          '湿发后梳',
          'wet look slickback',
          ['现代时尚发型']
        ),
        asset(
          'outfit-tang',
          'outfit',
          '唐制襦裙套装',
          'Tang historical outfit',
          ['中国古装']
        ),
        asset('outfit-sport', 'outfit', '运动套装', 'sport outfit', ['运动'])
      ],
      'guofeng-historical',
      () => 0
    );

    expect(selection.hairstyle).toBe('hairstyle-tang-cloud');
    expect(selection.outfit).toBe('outfit-tang');
  });

  it('preserves manually selected visual singularities without random gating', () => {
    const selectedAssets = [
      imagePromptAssets.find((item) => item.id === 'lens-fisheye-optical')!,
      imagePromptAssets.find((item) => item.id === 'viewpoint-near-top-down')!,
      imagePromptAssets.find(
        (item) => item.id === 'makeup-silver-editorial-eye'
      )!
    ];
    expect(selectedAssets.every(Boolean)).toBe(true);

    const selection = selectedAssets.reduce(
      (current, selected) => setImagePromptAssetSelection(current, selected),
      defaultImagePromptSelection
    );
    const result = compileImagePrompt(
      selection,
      defaultImagePromptSettings,
      imagePromptAssets,
      'zh-CN'
    );

    selectedAssets.forEach((selected) => {
      expect(result.selectedAssets.map((item) => item.id)).toContain(
        selected.id
      );
      expect(result.prompt).toContain(selected.promptZh || selected.prompt);
    });
  });

  it('applies historical and singularity gates to single-slot randomization', () => {
    const fisheye = imagePromptAssets.find(
      (item) => item.id === 'lens-fisheye-optical'
    )!;
    const withFisheye = setImagePromptAssetSelection(
      defaultImagePromptSelection,
      fisheye
    );
    for (let index = 0; index < 50; index += 1) {
      const randomizedViewpoint = randomizeImagePromptSelectionSlot(
        withFisheye,
        'viewpoint',
        imagePromptAssets,
        () => index / 50
      );
      const viewpoint = imagePromptAssets.find(
        (item) =>
          item.id ===
          getPrimarySelectedAssetId(randomizedViewpoint, 'viewpoint')
      );
      expect(viewpoint).toBeDefined();
      expect(getPortraitVisualSingularityKind(viewpoint!)).toBeNull();
    }

    const tangOutfit = imagePromptAssets.find(
      (item) => item.id === 'outfit-tang-qixiong-ruqun'
    )!;
    const withHistoricalOutfit = setImagePromptAssetSelection(
      defaultImagePromptSelection,
      tangOutfit
    );
    const randomizedPose = randomizeImagePromptSelectionSlot(
      withHistoricalOutfit,
      'pose',
      imagePromptAssets,
      () => 0
    );
    const pose = imagePromptAssets.find(
      (item) => item.id === getPrimarySelectedAssetId(randomizedPose, 'pose')
    );
    expect(pose).toBeDefined();
    expect(
      /smartphone|phone|selfie|手机|自拍/i.test(
        [pose!.id, pose!.title, pose!.prompt, ...pose!.tags].join(' ')
      )
    ).toBe(false);
  });

  it('does not pair an eyes-only crop with a mouth-dependent expression', () => {
    const laugh = imagePromptAssets.find(
      (item) => item.id === 'expression-open-genuine-laugh'
    )!;
    const eyesOnly = imagePromptAssets.find(
      (item) => item.id === 'shot-extreme-detail-eyes'
    )!;

    const withLaugh = setImagePromptAssetSelection(
      defaultImagePromptSelection,
      laugh
    );
    for (let index = 0; index < 100; index += 1) {
      const randomizedShot = randomizeImagePromptSelectionSlot(
        withLaugh,
        'shot',
        imagePromptAssets,
        () => index / 100
      );
      expect(randomizedShot.shot).not.toBe(eyesOnly.id);
    }

    const withEyesOnly = setImagePromptAssetSelection(
      defaultImagePromptSelection,
      eyesOnly
    );
    for (let index = 0; index < 100; index += 1) {
      const randomizedExpression = randomizeImagePromptSelectionSlot(
        withEyesOnly,
        'expression',
        imagePromptAssets,
        () => index / 100
      );
      expect(randomizedExpression.expression).not.toBe(laugh.id);
      expect(randomizedExpression.expression).not.toBe('expression-tongue');
    }
  });

  it('defines over-shoulder framing as one subject looking back', () => {
    const item = imagePromptAssets.find(
      (asset) => asset.id === 'viewpoint-over-shoulder'
    )!;
    expect(item).toBeDefined();
    expect(item.prompt).toMatch(/single-subject|same woman/i);
    expect(item.prompt).toMatch(/no second person/i);
  });

  it('only randomizes an over-shoulder viewpoint with a turn or lookback pose', () => {
    const stretch = imagePromptAssets.find(
      (asset) => asset.id === 'pose-overhead-stretch'
    )!;
    const overShoulder = imagePromptAssets.find(
      (asset) => asset.id === 'viewpoint-over-shoulder'
    )!;

    const withStretch = setImagePromptAssetSelection(
      defaultImagePromptSelection,
      stretch
    );
    for (let index = 0; index < 100; index += 1) {
      const randomizedViewpoint = randomizeImagePromptSelectionSlot(
        withStretch,
        'viewpoint',
        imagePromptAssets,
        () => index / 100
      );
      expect(randomizedViewpoint.viewpoint).not.toBe(overShoulder.id);
    }

    const withOverShoulder = setImagePromptAssetSelection(
      defaultImagePromptSelection,
      overShoulder
    );
    for (let index = 0; index < 100; index += 1) {
      const randomizedPose = randomizeImagePromptSelectionSlot(
        withOverShoulder,
        'pose',
        imagePromptAssets,
        () => index / 100
      );
      const pose = imagePromptAssets.find(
        (asset) => asset.id === randomizedPose.pose
      )!;
      expect(
        [pose.id, pose.title, pose.prompt, pose.promptZh, ...pose.tags].join(
          ' '
        )
      ).toMatch(
        /lookback|look.back|turning|turned|torso rotation|twist|回望|回眸|转身|回身|躯干旋转|扭转/i
      );
    }
  });

  it('materializes explicit compatibility metadata for every public asset', () => {
    expect(imagePromptAssets.length).toBeGreaterThan(0);
    imagePromptAssets.forEach((item) => {
      expect(item.compatibility).toEqual(
        expect.objectContaining({
          portraitRandomEligible: expect.any(Boolean),
          outfitCoverage: expect.stringMatching(
            /^(separates|one-piece|complete-set)$/
          ),
          shotFamily: expect.stringMatching(
            /^(close-up|half-body|full-body|selfie|dynamic|other)$/
          ),
          compatibleShotFamilies: expect.any(Array),
          occupiesHands: expect.any(Boolean),
          showsFootwear: expect.any(Boolean),
          showsHands: expect.any(Boolean)
        })
      );
    });
  });
});

describe('portrait category expansion assets', () => {
  it('keeps historical expansion thumbnails available for record compatibility', () => {
    const counts = portraitCategoryExpansionSeeds.reduce<
      Record<string, number>
    >(
      (result, [, slot]) => ({ ...result, [slot]: (result[slot] || 0) + 1 }),
      {}
    );

    expect(counts).toEqual({ composition: 9, lighting: 9, makeup: 9 });
    portraitCategoryExpansionSeeds.forEach(([id, slot]) => {
      expect(
        existsSync(
          path.resolve(
            process.cwd(),
            `src/web/assets/prompt-library/${slot}/${id}.webp`
          )
        )
      ).toBe(true);
    });
  });
});

describe('2026-07-17 practical viewpoint expansion', () => {
  it('publishes nine camera-only height and pitch samples from one audited batch', () => {
    const manifestAssets = JSON.parse(
      readFileSync(
        path.join(
          process.cwd(),
          'src/web/assets/prompt-library/manifest.generated.json'
        ),
        'utf8'
      )
    ).assets as Array<{
      id: string;
      slot: ImagePromptAsset['slot'];
      sourceBatchId: string;
      prompt: string;
      thumbnailUrl: string;
    }>;
    const assets = manifestAssets.filter(
      (asset) =>
        asset.sourceBatchId ===
        'portrait-viewpoint-practical-height-angle-d-v1-20260717'
    );

    expect(assets).toHaveLength(9);
    expect(assets.every((asset) => asset.slot === 'viewpoint')).toBe(true);
    expect(
      assets.every((asset) =>
        existsSync(
          path.join(
            process.cwd(),
            'src/web',
            asset.thumbnailUrl.replace(/^\//, '')
          )
        )
      )
    ).toBe(true);
    expect(
      assets.every(
        (asset) =>
          /camera viewpoint only/i.test(asset.prompt) &&
          !/\b(?:24mm|35mm|wide.angle|close.up|full.body|shot size|crop)\b|广角|特写|景别|构图|光线/i.test(
            asset.prompt
          )
      )
    ).toBe(true);
    expect(assets.filter((asset) => /knee-height/.test(asset.id))).toHaveLength(
      4
    );
    expect(assets.filter((asset) => /above-head/.test(asset.id))).toHaveLength(
      3
    );
  });
});

describe('2026-07-17 surreal material expansion', () => {
  it('publishes two orthogonal nine-item batches with local thumbnails', () => {
    const manifestAssets = JSON.parse(
      readFileSync(
        path.join(
          process.cwd(),
          'src/web/assets/prompt-library/manifest.generated.json'
        ),
        'utf8'
      )
    ).assets as Array<{
      id: string;
      slot: ImagePromptAsset['slot'];
      sourceBatchId: string;
      prompt: string;
      thumbnailUrl: string;
    }>;
    const backgroundBatchId =
      'portrait-background-surreal-paradox-j-v1-20260717';
    const effectBatchId = 'portrait-visualeffect-surreal-overlay-c-v1-20260717';
    const backgrounds = manifestAssets.filter(
      (asset) => asset.sourceBatchId === backgroundBatchId
    );
    const effects = manifestAssets.filter(
      (asset) => asset.sourceBatchId === effectBatchId
    );

    expect(backgrounds).toHaveLength(9);
    expect(effects).toHaveLength(9);
    expect(backgrounds.every((asset) => asset.slot === 'background')).toBe(
      true
    );
    expect(effects.every((asset) => asset.slot === 'visualEffect')).toBe(true);
    expect(
      [...backgrounds, ...effects].every((asset) =>
        existsSync(
          path.join(
            process.cwd(),
            'src/web',
            asset.thumbnailUrl.replace(/^\//, '')
          )
        )
      )
    ).toBe(true);
    expect(
      new Set([...backgrounds, ...effects].map((asset) => asset.id)).size
    ).toBe(18);
    expect(
      backgrounds.every(
        (asset) =>
          !/post.production|overlay|lens flare|double exposure|motion trail/i.test(
            asset.prompt
          )
      )
    ).toBe(true);
    expect(
      effects.every(
        (asset) =>
          !/hotel lobby|archive|metro platform|salon|conservatory|apartment|museum gallery/i.test(
            asset.prompt
          )
      )
    ).toBe(true);
  });
});
