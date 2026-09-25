import { describe, expect, it } from 'vitest';
import {
  filterAssetsForPortraitRecipeContext,
  filterAssetsForPortraitRecipeProfile,
  filterAssetsForPortraitRecipeRandomContext,
  filterSecondaryVisualSingularities,
  getPortraitVisualSingularityKind,
  getPortraitRecipeAffinity,
  getPortraitRecipeSoftConflicts,
  getPortraitRecipeWardrobeSlots,
  inferPortraitRecipeProfile,
  type PortraitRecipeAssetLike
} from '../portrait-recipe-compatibility';
import { portraitRecipeProfiles } from '../portrait-recipe-compatibility';
import {
  buildRandomImagePromptSelectionForProfile,
  getPrimarySelectedAssetId,
  getSelectedAssetIds,
  resolveAssetCompatibility
} from '../image-prompt-core';
import { imagePromptAssetCatalog as imagePromptAssets } from '../image-prompt-asset-catalog';

function asset(
  id: string,
  slot: string,
  title: string,
  tags: string[] = []
): PortraitRecipeAssetLike {
  return { id, slot, title, prompt: title, tags };
}

describe('portrait recipe compatibility profiles', () => {
  it('keeps guofeng historical hair inside a historical route', () => {
    const candidates = [
      asset('hairstyle-tang-cloud', 'hairstyle', '唐风高云髻', [
        '中国古风发型'
      ]),
      asset('hairstyle-wet-look', 'hairstyle', '湿发光泽后梳', ['现代时尚发型'])
    ];

    expect(
      filterAssetsForPortraitRecipeProfile(
        candidates,
        'guofeng-historical'
      ).map((item) => item.id)
    ).toEqual(['hairstyle-tang-cloud']);
  });

  it('allows New Chinese fashion to use a modern brand setting', () => {
    const selected = [
      asset('outfit-new-chinese', 'outfit', '新中式旗袍领马面裙'),
      asset('background-brand-event', 'background', '高级品牌发布会')
    ];

    expect(inferPortraitRecipeProfile(selected)).toBe('guofeng-new-chinese');
  });

  it('routes the new travel scenes and editorial hair without hard exclusion', () => {
    const sleeperTrain = asset(
      'background-sleeper-train-compartment',
      'background',
      '夜行卧铺包厢'
    );
    const jellyfishCut = asset(
      'hairstyle-jellyfish-layer-cut',
      'hairstyle',
      '现代时尚水母双层切发'
    );

    expect(
      getPortraitRecipeAffinity(sleeperTrain, 'sns-candid')
    ).toBeGreaterThan(0);
    expect(
      getPortraitRecipeAffinity(sleeperTrain, 'soft-lifestyle')
    ).toBeGreaterThan(0);
    expect(
      getPortraitRecipeAffinity(jellyfishCut, 'fashion-editorial')
    ).toBeGreaterThan(0);
  });

  it('routes imaginative worlds toward their intended creative profiles', () => {
    const japaneseCourtyard = imagePromptAssets.find(
      (item) => item.id === 'background-japanese-moonlit-karesansui'
    )!;
    const orbitalDeck = imagePromptAssets.find(
      (item) => item.id === 'background-orbital-earth-observation-deck'
    )!;
    const saltDesert = imagePromptAssets.find(
      (item) => item.id === 'background-white-salt-mirror-desert'
    )!;

    expect(
      getPortraitRecipeAffinity(japaneseCourtyard, 'soft-lifestyle')
    ).toBeGreaterThan(
      getPortraitRecipeAffinity(japaneseCourtyard, 'guofeng-historical')
    );
    expect(
      getPortraitRecipeAffinity(orbitalDeck, 'character-cosplay')
    ).toBeGreaterThan(getPortraitRecipeAffinity(orbitalDeck, 'soft-lifestyle'));
    expect(
      getPortraitRecipeAffinity(saltDesert, 'fashion-editorial')
    ).toBeGreaterThan(0);
  });

  it('routes expanded imaginative locations without leaking them into historical recipes', () => {
    const abyssalLab = imagePromptAssets.find(
      (item) => item.id === 'background-abyssal-bioluminescent-window-lab'
    )!;
    const turbineHall = imagePromptAssets.find(
      (item) => item.id === 'background-decommissioned-turbine-hall'
    )!;
    const frozenPavilion = imagePromptAssets.find(
      (item) => item.id === 'background-frozen-lake-glass-pavilion'
    )!;
    const glassLabyrinth = imagePromptAssets.find(
      (item) => item.id === 'background-prismatic-glass-labyrinth'
    )!;

    expect(
      getPortraitRecipeAffinity(abyssalLab, 'character-cosplay')
    ).toBeGreaterThan(0);
    expect(
      getPortraitRecipeAffinity(turbineHall, 'night-glamour')
    ).toBeGreaterThan(0);
    expect(
      getPortraitRecipeAffinity(frozenPavilion, 'soft-lifestyle')
    ).toBeGreaterThan(0);
    expect(
      getPortraitRecipeAffinity(glassLabyrinth, 'fashion-editorial')
    ).toBeGreaterThan(0);
    expect(
      getPortraitRecipeAffinity(abyssalLab, 'guofeng-historical')
    ).toBeLessThan(0);
    expect(
      getPortraitRecipeAffinity(turbineHall, 'guofeng-wuxia')
    ).toBeLessThan(0);
  });

  it('routes biofabricated, climate-adaptive and vertical locations intentionally', () => {
    const ids = [
      'background-algae-glass-bioreactor-arcade',
      'background-mycelium-acoustic-pavilion',
      'background-mangrove-tidal-library',
      'background-rainchain-cistern-courtyard',
      'background-desert-windcatcher-cooling-court',
      'background-tidal-retention-museum',
      'background-cloudforest-canopy-observatory',
      'background-cliffside-elevator-landing',
      'background-skytower-windcourt-bridge'
    ];
    const scenes = ids.map(
      (id) => imagePromptAssets.find((item) => item.id === id)!
    );
    const algaeArcade = scenes[0];
    const mangroveLibrary = scenes[2];

    expect(scenes).not.toContain(undefined);
    expect(
      scenes.every(
        (scene) => getPortraitRecipeAffinity(scene, 'fashion-editorial') > 0
      )
    ).toBe(true);
    expect(
      scenes
        .filter(
          (scene) => getPortraitRecipeAffinity(scene, 'guofeng-wuxia') > 0
        )
        .map((scene) => scene.id)
    ).toEqual([]);
    expect(
      getPortraitRecipeAffinity(algaeArcade, 'character-cosplay')
    ).toBeGreaterThan(0);
    expect(
      getPortraitRecipeAffinity(mangroveLibrary, 'soft-lifestyle')
    ).toBeGreaterThan(0);
  });

  it('routes world-landmark travel locations by scene semantics instead of country', () => {
    const ids = [
      'background-switzerland-lauterbrunnen-valley',
      'background-norway-geirangerfjord-overlook',
      'background-spain-alhambra-myrtles-court',
      'background-korea-jeju-seongsan-viewpoint',
      'background-vietnam-halong-karst-terrace',
      'background-japan-fuji-kawaguchi-promenade',
      'background-peru-machu-picchu-overlook',
      'background-canada-moraine-lake-deck',
      'background-newzealand-milford-sound-boardwalk'
    ];
    const scenes = ids.map(
      (id) => imagePromptAssets.find((item) => item.id === id)!
    );

    expect(scenes).not.toContain(undefined);
    expect(
      scenes.every(
        (scene) => getPortraitRecipeAffinity(scene, 'soft-lifestyle') > 0
      )
    ).toBe(true);
    expect(
      scenes
        .filter(
          (scene) => getPortraitRecipeAffinity(scene, 'guofeng-wuxia') > 0
        )
        .map((scene) => scene.id)
    ).toEqual([]);
  });

  it('reports a soft era mismatch without deleting the manual selection', () => {
    const selected = [
      asset('hairstyle-tang-cloud', 'hairstyle', '唐风高云髻', [
        '中国古风发型'
      ]),
      asset('outfit-badminton', 'outfit', '现代羽毛球运动套装', ['运动'])
    ];

    expect(getPortraitRecipeSoftConflicts(selected)).toEqual([
      expect.objectContaining({
        leftId: 'hairstyle-tang-cloud',
        rightId: 'outfit-badminton',
        reason: expect.stringContaining('运动服')
      })
    ]);
  });

  it('warns about swimwear combined with a private bedroom resting pose', () => {
    const selected = [
      asset('top-swim-two-piece', 'top', '成年女性泳装上装', ['泳装']),
      asset('background-private-bedroom', 'background', '私密卧室床边'),
      asset('pose-seated-pillow-hug', 'pose', '坐姿抱枕')
    ];

    expect(getPortraitRecipeSoftConflicts(selected)).toEqual([
      expect.objectContaining({
        leftId: 'top-swim-two-piece',
        rightId: 'background-private-bedroom',
        reason: expect.stringContaining('模型策略限制')
      })
    ]);
  });

  it('keeps bold night fashion eligible for night glamour recipes', () => {
    const candidates = [
      asset('onePiece-cutout', 'onePiece', '猩红侧腰镂空夜间短裙', [
        '夜间时尚'
      ]),
      asset('onePiece-office', 'onePiece', '米色办公室连体裤', ['通勤'])
    ];

    expect(
      filterAssetsForPortraitRecipeProfile(candidates, 'night-glamour').map(
        (item) => item.id
      )
    ).toContain('onePiece-cutout');
  });

  it('does not leak an explicit fantasy character into soft lifestyle random recipes', () => {
    const candidates = [
      asset('character-soft-elf-girl', 'character', '成年柔和精灵女性', [
        '精灵人设',
        '幻想'
      ]),
      asset('character-refined-model', 'character', '成年温柔时装模特', [
        '温柔',
        '时装模特'
      ])
    ];

    expect(
      filterAssetsForPortraitRecipeRandomContext(
        candidates,
        'soft-lifestyle',
        []
      ).map((item) => item.id)
    ).toEqual(['character-refined-model']);
  });

  it('does not mistake self-service, self-aware or selfie text for an elf character', () => {
    const ordinaryAssets = [
      asset(
        'background-urban-laundromat-night',
        'background',
        'urban self-service laundromat at night'
      ),
      asset('expression-melting-face', 'expression', 'weak self-aware smile'),
      asset('pose-mirror-selfie', 'pose', 'phone selfie pose')
    ];

    for (const item of ordinaryAssets) {
      expect(
        filterAssetsForPortraitRecipeRandomContext(
          [
            item,
            asset(`${item.slot}-neutral`, item.slot, 'neutral daily option')
          ],
          'sns-candid',
          []
        ).map((candidate) => candidate.id)
      ).toContain(item.id);
    }
  });

  it('routes the arcane adept character into the character profile', () => {
    expect(
      getPortraitRecipeAffinity(
        asset(
          'character-arcane-apprentice',
          'character',
          'adult arcane adept woman persona',
          ['秘术人设']
        ),
        'character-cosplay'
      )
    ).toBeGreaterThan(0);
  });

  it('excludes modern-device poses only from historical random recipes', () => {
    const candidates = [
      asset('pose-mirror-selfie', 'pose', '手持手机近脸自拍'),
      asset('pose-phone-pocket', 'pose', '胸前持手机单手插袋'),
      asset('pose-turning-step', 'pose', '转身迈步')
    ];

    expect(
      filterAssetsForPortraitRecipeContext(
        candidates,
        'guofeng-historical',
        []
      ).map((item) => item.id)
    ).toEqual(['pose-turning-step']);
    expect(
      filterAssetsForPortraitRecipeContext(
        candidates,
        'guofeng-new-chinese',
        []
      ).map((item) => item.id)
    ).toEqual(candidates.map((item) => item.id));
  });

  it('keeps only neutral later axes after a primary visual singularity is selected', () => {
    const selected = [asset('lens-fisheye-optical', 'lens', '鱼眼光学成像')];
    const viewpoints = [
      asset('viewpoint-near-top-down', 'viewpoint', '近顶视'),
      asset('viewpoint-eye-level-frontal', 'viewpoint', '平视正面')
    ];
    const makeup = [
      asset('makeup-silver-editorial', 'makeup', '银色图形编辑妆'),
      asset('makeup-natural-clean', 'makeup', '自然干净妆面')
    ];

    expect(
      filterAssetsForPortraitRecipeContext(
        viewpoints,
        'fashion-editorial',
        selected
      ).map((item) => item.id)
    ).toEqual(['viewpoint-eye-level-frontal']);
    expect(
      filterAssetsForPortraitRecipeContext(
        makeup,
        'fashion-editorial',
        selected
      ).map((item) => item.id)
    ).toEqual(['makeup-natural-clean']);
    expect(getPortraitVisualSingularityKind(selected[0])).toBe('strong-lens');
  });

  it('routes practical height-and-pitch viewpoints without collapsing lens or shot axes', () => {
    const ids = [
      'viewpoint-knee-height-frontal-level',
      'viewpoint-knee-height-frontal-gentle-up',
      'viewpoint-ankle-height-frontal-steep-up',
      'viewpoint-knee-height-front-left-up',
      'viewpoint-knee-height-front-right-up',
      'viewpoint-waist-height-rear-left-up',
      'viewpoint-above-head-frontal-gentle-down',
      'viewpoint-above-head-front-left-down',
      'viewpoint-above-head-rear-center-down'
    ];
    const viewpoints = ids.map(
      (id) => imagePromptAssets.find((item) => item.id === id)!
    );

    expect(viewpoints).not.toContain(undefined);
    expect(
      viewpoints.every(
        (item) => getPortraitRecipeAffinity(item, 'fashion-editorial') > 0
      )
    ).toBe(true);
    expect(
      viewpoints.every(
        (item) =>
          !/\b(?:24mm|35mm|wide.angle|close.up|full.body|shot size|crop)\b|广角|特写|景别|构图|光线/i.test(
            item.prompt
          )
      )
    ).toBe(true);
    expect(getPortraitVisualSingularityKind(viewpoints[2])).toBe(
      'extreme-viewpoint'
    );
  });

  it('routes surreal assets while enforcing one visual singularity', () => {
    const surrealBackgroundIds = [
      'background-inverted-hotel-lobby',
      'background-endless-stair-archive',
      'background-folded-metro-platform',
      'background-giant-tableware-salon',
      'background-monumental-curtain-canyon',
      'background-oversized-orchid-conservatory',
      'background-vertical-ocean-window-hall',
      'background-cloud-filled-apartment',
      'background-frozen-wave-gallery'
    ];
    const surrealEffectIds = [
      'visualEffect-mirror-fragment-echo',
      'visualEffect-liquid-glass-warp',
      'visualEffect-prismatic-refraction-veil',
      'visualEffect-pixel-sort-trail',
      'visualEffect-topographic-contour-overlay',
      'visualEffect-temporal-slice-echo',
      'visualEffect-suspended-droplet-lens-field',
      'visualEffect-negative-space-portal',
      'visualEffect-recursive-frame-tunnel'
    ];
    const backgrounds = surrealBackgroundIds.map(
      (id) => imagePromptAssets.find((item) => item.id === id)!
    );
    const effects = surrealEffectIds.map(
      (id) => imagePromptAssets.find((item) => item.id === id)!
    );

    expect([...backgrounds, ...effects]).not.toContain(undefined);
    expect(
      backgrounds.every(
        (item) =>
          getPortraitVisualSingularityKind(item) === 'surreal-background'
      )
    ).toBe(true);
    expect(
      effects.every(
        (item) => getPortraitVisualSingularityKind(item) === 'visual-effect'
      )
    ).toBe(true);
    expect(
      [...backgrounds, ...effects].every(
        (item) =>
          getPortraitRecipeAffinity(item, 'fashion-editorial') > 0 &&
          getPortraitRecipeAffinity(item, 'character-cosplay') > 0
      )
    ).toBe(true);
    expect(
      filterSecondaryVisualSingularities(effects, [backgrounds[0]])
    ).toEqual([]);
  });

  it('does not mistake ordinary English substrings for dynasty or sport signals', () => {
    expect(
      getPortraitRecipeAffinity(
        asset('style-charming-frame', 'style', 'Charming framing'),
        'guofeng-historical'
      )
    ).toBe(0);
    expect(
      getPortraitRecipeAffinity(
        asset('background-esports-bedroom', 'background', 'Esports bedroom'),
        'active-sport'
      )
    ).toBeLessThan(0);
  });

  it('keeps active recipes on modern sport hair and non-esports settings', () => {
    const hairstyles = [
      asset('hairstyle-wuxia-high-ponytail', 'hairstyle', '武侠高马尾'),
      asset(
        'hairstyle-sculpted-high-ponytail',
        'hairstyle',
        '现代时尚发型：雕塑高马尾'
      )
    ];
    const backgrounds = [
      asset('background-esports-bedroom', 'background', '电竞卧室'),
      asset('background-city-street', 'background', '城市街道')
    ];

    expect(
      filterAssetsForPortraitRecipeProfile(hairstyles, 'active-sport').map(
        (item) => item.id
      )
    ).toEqual(['hairstyle-sculpted-high-ponytail']);
    expect(
      filterAssetsForPortraitRecipeProfile(backgrounds, 'active-sport').map(
        (item) => item.id
      )
    ).toEqual(['background-city-street']);
  });

  it('does not mistake generic urban rain for a wuxia world setting', () => {
    const backgrounds = [
      asset('background-rainy-convenience-store', 'background', '雨夜便利店', [
        '雨景',
        '城市'
      ]),
      asset('background-fantasy-teahouse', 'background', '异世界茶屋', [
        '茶屋',
        '幻想'
      ]),
      asset('background-garden-path', 'background', '花园小径', ['花园'])
    ];

    expect(
      filterAssetsForPortraitRecipeProfile(backgrounds, 'guofeng-wuxia').map(
        (item) => item.id
      )
    ).toEqual(['background-fantasy-teahouse', 'background-garden-path']);
  });

  it('assigns route-level wardrobe modes before individual assets are picked', () => {
    expect(getPortraitRecipeWardrobeSlots('guofeng-historical')).toEqual([
      'outfit'
    ]);
    expect(getPortraitRecipeWardrobeSlots('guofeng-wuxia')).toEqual(['outfit']);
    expect(getPortraitRecipeWardrobeSlots('guofeng-new-chinese')).toEqual([
      'outfit'
    ]);
    expect(getPortraitRecipeWardrobeSlots('active-sport')).not.toContain(
      'onePiece'
    );
    expect(getPortraitRecipeWardrobeSlots('character-cosplay')).toContain(
      'onePiece'
    );
  });

  it('routes original ACG one-piece garments into character recipes', () => {
    expect(
      getPortraitRecipeAffinity(
        asset(
          'onepiece-original-astral-navigator',
          'onePiece',
          '原创 ACG 星轨领航连体服',
          ['原创ACG', '单件连体']
        ),
        'character-cosplay'
      )
    ).toBeGreaterThan(0);
  });

  it('reuses existing daily accessories, shoes and makeup in candid and soft routes', () => {
    const candidates = [
      asset('accessory-natural-canvas-tote', 'accessory', '原色帆布托特包'),
      asset('shoes-beige-ballet-flats', 'shoes', '米色芭蕾鞋'),
      asset('makeup-natural-clean', 'makeup', '自然淡妆')
    ];

    for (const item of candidates) {
      expect(getPortraitRecipeAffinity(item, 'sns-candid')).toBeGreaterThan(0);
      expect(getPortraitRecipeAffinity(item, 'soft-lifestyle')).toBeGreaterThan(
        0
      );
    }
  });

  it('routes coordinated night separates into night glamour', () => {
    expect(
      getPortraitRecipeAffinity(
        asset(
          'outfit-night-glamour-chainmail-tuxedo',
          'outfit',
          '银色链甲上衣与炭黑礼服长裤套装',
          ['夜间时尚', '完整套装']
        ),
        'night-glamour'
      )
    ).toBeGreaterThan(0);
  });

  it('routes original K-pop stage outfits into editorial and night profiles', () => {
    const kpop = asset(
      'outfit-kpop-silver-bomber-skort',
      'outfit',
      '原创韩流银色短夹克裙裤套装',
      ['K-pop', '韩流舞台', 'SFW']
    );

    expect(
      getPortraitRecipeAffinity(kpop, 'fashion-editorial')
    ).toBeGreaterThan(0);
    expect(getPortraitRecipeAffinity(kpop, 'night-glamour')).toBeGreaterThan(0);
  });

  it('routes two-piece swim sets into sport and resort profiles', () => {
    const swimSet = asset(
      'outfit-swim-two-piece-cobalt-asymmetric',
      'outfit',
      '钴蓝不对称两件式泳装套装',
      ['泳装套装', 'SFW']
    );

    expect(getPortraitRecipeAffinity(swimSet, 'active-sport')).toBeGreaterThan(
      0
    );
    expect(
      getPortraitRecipeAffinity(swimSet, 'soft-lifestyle')
    ).toBeGreaterThan(0);
  });

  it('keeps one-piece swimwear in the onePiece garment mode', () => {
    const swimsuit = asset(
      'onepiece-swim-black-square-neck',
      'onePiece',
      '黑色方领一体式泳装',
      ['一体式泳装', 'SFW']
    );

    expect(
      getPortraitRecipeAffinity(swimsuit, 'soft-lifestyle')
    ).toBeGreaterThan(0);
    expect(getPortraitRecipeWardrobeSlots('soft-lifestyle')).toContain(
      swimsuit.slot
    );
  });

  it('routes SFW daywear into candid and soft lifestyle profiles', () => {
    const daywear = asset(
      'outfit-sfw-daywear-butter-cardigan-satin-midi',
      'outfit',
      '奶油黄开衫缎面中裙套装',
      ['SFW日常时尚', '完整套装']
    );

    expect(getPortraitRecipeAffinity(daywear, 'sns-candid')).toBeGreaterThan(0);
    expect(
      getPortraitRecipeAffinity(daywear, 'soft-lifestyle')
    ).toBeGreaterThan(0);
  });

  it('does not promote historical loose chignons into modern lifestyle hair', () => {
    const candidates = [
      asset('hairstyle-weijin-loose-high-chignon', 'hairstyle', '魏晋松式高髻'),
      asset('hairstyle-mermaid-s-waves', 'hairstyle', '人鱼长波浪')
    ];

    expect(
      filterAssetsForPortraitRecipeProfile(candidates, 'soft-lifestyle').map(
        (item) => item.id
      )
    ).toEqual(['hairstyle-mermaid-s-waves']);
  });

  it('pairs a selected historical hairstyle with the same dynasty outfit', () => {
    const candidates = [
      asset('outfit-tang-qixiong-ruqun', 'outfit', '唐制齐胸襦裙套装'),
      asset('outfit-song-beizi-pleated-skirt', 'outfit', '宋制褙子百褶裙套装'),
      asset('outfit-ming-aoqun-mamian', 'outfit', '明制袄裙马面套装')
    ];

    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'guofeng-historical', [
        asset('hairstyle-song-tall-sidecoil', 'hairstyle', '宋风高髻侧卷')
      ]).map((item) => item.id)
    ).toEqual(['outfit-song-beizi-pleated-skirt']);
  });

  it('pairs newly added historical eras across hairstyle, outfit and background', () => {
    const outfits = [
      asset('outfit-sui-canal-travel-set', 'outfit', '隋风运河旅行套装'),
      asset('outfit-yuan-steppe-travel-set', 'outfit', '元风草原驿旅套装')
    ];
    const backgrounds = [
      asset('background-sui-canal-dock-dawn', 'background', '隋代运河清晨码头'),
      asset('background-yuan-steppe-post-station', 'background', '元代草原驿站')
    ];
    const selectedHair = asset(
      'hairstyle-sui-doubleloop-high-chignon',
      'hairstyle',
      '隋风双环高髻'
    );

    expect(
      filterAssetsForPortraitRecipeContext(outfits, 'guofeng-historical', [
        selectedHair
      ]).map((item) => item.id)
    ).toEqual(['outfit-sui-canal-travel-set']);
    expect(
      filterAssetsForPortraitRecipeContext(backgrounds, 'guofeng-historical', [
        selectedHair
      ]).map((item) => item.id)
    ).toEqual(['background-sui-canal-dock-dawn']);
  });

  it('pairs newly added historical eras across makeup, hair accessory and prop', () => {
    const selectedOutfit = asset(
      'outfit-sui-canal-travel-set',
      'outfit',
      '隋风运河旅行套装'
    );
    const candidateGroups = [
      [
        asset('makeup-sui-apricot-rose', 'makeup', '隋风杏粉柔玫妆'),
        asset('makeup-yuan-windflush-berry', 'makeup', '元风旅途风红莓妆')
      ],
      [
        asset(
          'accessory-sui-gilt-doubleleaf-hairpin',
          'accessory',
          '隋风鎏金双叶簪'
        ),
        asset(
          'accessory-yuan-silver-braid-rings',
          'accessory',
          '元风素银辫环组'
        )
      ],
      [
        asset('prop-sui-wood-travel-tally', 'prop', '隋风素木旅行符牌'),
        asset('prop-yuan-leather-water-flask', 'prop', '元风皮革水囊')
      ]
    ];

    expect(
      candidateGroups.map((candidates) =>
        filterAssetsForPortraitRecipeContext(candidates, 'guofeng-historical', [
          selectedOutfit
        ]).map((item) => item.id)
      )
    ).toEqual([
      ['makeup-sui-apricot-rose'],
      ['accessory-sui-gilt-doubleleaf-hairpin'],
      ['prop-sui-wood-travel-tally']
    ]);
  });

  it('keeps modern Chinese decade themes coherent without treating them as ancient dress', () => {
    const hairstyles = [
      asset('hairstyle-1980s-feathered-perm', 'hairstyle', '1980年代羽翎卷发'),
      asset(
        'hairstyle-1990s-centered-layers',
        'hairstyle',
        '1990年代中分层次发'
      )
    ];
    const backgrounds = [
      asset(
        'background-1980s-state-photo-studio',
        'background',
        '1980年代国营照相馆'
      ),
      asset(
        'background-1990s-video-arcade-entrance',
        'background',
        '1990年代录像街机厅门口'
      )
    ];
    const selectedOutfit = asset(
      'outfit-1990s-denim-straight-set',
      'outfit',
      '1990年代双牛仔街头套装',
      ['中国年代时装']
    );

    expect(
      filterAssetsForPortraitRecipeContext(hairstyles, 'fashion-editorial', [
        selectedOutfit
      ]).map((item) => item.id)
    ).toEqual(['hairstyle-1990s-centered-layers']);
    expect(
      filterAssetsForPortraitRecipeContext(backgrounds, 'fashion-editorial', [
        selectedOutfit
      ]).map((item) => item.id)
    ).toEqual(['background-1990s-video-arcade-entrance']);
    expect(
      getPortraitRecipeAffinity(selectedOutfit, 'guofeng-historical')
    ).toBe(0);
  });

  it('pairs modern decade outfits with same-era makeup, hair accessory and prop', () => {
    const selectedOutfit = asset(
      'outfit-1990s-denim-straight-set',
      'outfit',
      '1990年代双牛仔街头套装',
      ['中国年代时装']
    );
    const candidateGroups = [
      [
        asset('makeup-1980s-peach-bluegray', 'makeup', '1980年代桃色蓝灰妆'),
        asset('makeup-1990s-matte-brick-nude', 'makeup', '1990年代哑光砖裸妆')
      ],
      [
        asset(
          'accessory-1980s-brickred-headband',
          'accessory',
          '1980年代砖红布发箍'
        ),
        asset(
          'accessory-1990s-black-velvet-scrunchie',
          'accessory',
          '1990年代黑丝绒发圈'
        )
      ],
      [
        asset('prop-1980s-twinlens-camera', 'prop', '1980年代双镜头相机'),
        asset('prop-1990s-vhs-cassette', 'prop', '1990年代录像带')
      ]
    ];

    expect(
      candidateGroups.map((candidates) =>
        filterAssetsForPortraitRecipeContext(candidates, 'fashion-editorial', [
          selectedOutfit
        ]).map((item) => item.id)
      )
    ).toEqual([
      ['makeup-1990s-matte-brick-nude'],
      ['accessory-1990s-black-velvet-scrunchie'],
      ['prop-1990s-vhs-cassette']
    ]);
  });

  it('keeps a generic historical mamian outfit out of New Chinese affinity', () => {
    expect(
      getPortraitRecipeAffinity(
        asset('outfit-ming-aoqun-mamian', 'outfit', '明制袄裙马面套装'),
        'guofeng-new-chinese'
      )
    ).toBe(0);
  });

  it('keeps random swim separates inside the same wardrobe family', () => {
    const selectedTop = asset(
      'top-floral-swimwear-top',
      'top',
      '花朵泳装上装',
      ['泳装']
    );
    const candidates = [
      asset('bottom-floral-swimwear-briefs', 'bottom', '花朵泳装下装', [
        '泳装'
      ]),
      asset('bottom-plum-velvet-wide', 'bottom', '深梅紫天鹅绒阔腿裤', ['晚装'])
    ];

    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'night-glamour', [
        selectedTop
      ]).map((item) => item.id)
    ).toEqual(['bottom-floral-swimwear-briefs']);
  });

  it('prefers a shared wardrobe family without deleting manual cross-family choices', () => {
    const selectedTop = asset(
      'top-sculptural-silver-raincoat',
      'top',
      '雕塑感银色雨衣',
      ['银色', '时装']
    );
    const candidates = [
      asset('bottom-floral-swimwear-briefs', 'bottom', '花朵泳装下装', [
        '泳装'
      ]),
      asset('bottom-silver-metallic-midi', 'bottom', '银色金属感半裙', [
        '银色',
        '金属感'
      ])
    ];

    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'fashion-editorial', [
        selectedTop
      ]).map((item) => item.id)
    ).toEqual(['bottom-silver-metallic-midi']);
    expect(
      getPortraitRecipeSoftConflicts([selectedTop, candidates[0]])
    ).toEqual([
      expect.objectContaining({
        leftId: selectedTop.id,
        rightId: candidates[0].id,
        reason: expect.stringContaining('手动搭配已保留')
      })
    ]);
  });

  it('pairs a character-fashion top with a utility bottom before generic tailoring', () => {
    const selectedTop = asset(
      'top-premium-cosplay-jacket',
      'top',
      '高级角色感外套',
      ['角色服装', 'cosplay']
    );
    const candidates = [
      asset('bottom-beige-tailored', 'bottom', '米色西装长裤', ['西装']),
      asset('bottom-cargo', 'bottom', '工装伞裤', ['工装', '伞裤'])
    ];

    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'character-cosplay', [
        selectedTop
      ]).map((item) => item.id)
    ).toEqual(['bottom-cargo']);
  });

  it('avoids conspicuously modern footwear for a selected historical outfit', () => {
    const selectedOutfit = asset(
      'outfit-ming-aoqun-mamian',
      'outfit',
      '明制袄裙马面套装'
    );
    const candidates = [
      asset('shoes-silver-platform-boots', 'shoes', '银色厚底靴', ['未来舞台']),
      asset('shoes-black-mary-jane', 'shoes', '玛丽珍鞋', ['复古', '皮鞋'])
    ];

    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'character-cosplay', [
        selectedOutfit
      ]).map((item) => item.id)
    ).toEqual(['shoes-black-mary-jane']);
  });

  it('prefers same-dynasty footwear for a selected historical outfit', () => {
    const candidates = [
      asset('shoes-tang-vermilion-brocade', 'shoes', '唐制朱金锦履', [
        '中国古代鞋履',
        '唐制'
      ]),
      asset('shoes-ming-teal-embroidered', 'shoes', '明制黛青绣履', [
        '中国古代鞋履',
        '明制'
      ])
    ];

    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'guofeng-historical', [
        asset('outfit-ming-aoqun-mamian', 'outfit', '明制袄裙马面套装')
      ]).map((item) => item.id)
    ).toEqual(['shoes-ming-teal-embroidered']);
  });

  it('prefers wuxia footwear over another Chinese-inspired route', () => {
    const candidates = [
      asset('shoes-wuxia-black-soft-boots', 'shoes', '武侠玄色软底靴', [
        '武侠'
      ]),
      asset('shoes-newchinese-burgundy-laceup', 'shoes', '新中式酒红系带鞋', [
        '新中式'
      ])
    ];

    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'guofeng-wuxia', [
        asset('outfit-wuxia-crosscollar-trousers', 'outfit', '武侠交领劲装')
      ]).map((item) => item.id)
    ).toEqual(['shoes-wuxia-black-soft-boots']);
  });

  it('pairs a historical outfit with a same-dynasty hair accessory', () => {
    const candidates = [
      asset(
        'accessory-tang-gilded-peony-comb',
        'accessory',
        '唐风鎏金牡丹盛装花钗',
        ['中国古代发饰', '唐风']
      ),
      asset(
        'accessory-ming-gold-phoenix-hairpin',
        'accessory',
        '明风金累丝凤簪',
        ['中国古代发饰', '明风']
      ),
      asset('accessory-clear-glasses', 'accessory', '透明方框眼镜', ['现代'])
    ];

    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'guofeng-historical', [
        asset('outfit-ming-aoqun-mamian', 'outfit', '明制袄裙马面套装')
      ]).map((item) => item.id)
    ).toEqual(['accessory-ming-gold-phoenix-hairpin']);
  });

  it('keeps modern handheld devices out of a historical random recipe', () => {
    const candidates = [
      asset('prop-smartphone', 'prop', '智能手机', ['手机', '现代']),
      asset('prop-folded-paper-fan', 'prop', '象牙纸扇', ['纸扇', '传统'])
    ];

    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'guofeng-historical', [
        asset('outfit-song-beizi-pleated-skirt', 'outfit', '宋制褙子百褶裙套装')
      ]).map((item) => item.id)
    ).toEqual(['prop-folded-paper-fan']);
  });

  it('pairs a historical outfit with a same-dynasty handheld prop', () => {
    const candidates = [
      asset('prop-tang-gilded-hand-mirror', 'prop', '唐风鎏金手镜', [
        '中国古代道具',
        '唐风'
      ]),
      asset('prop-song-celadon-tea-bowl', 'prop', '宋风青瓷茶盏', [
        '中国古代道具',
        '宋风'
      ]),
      asset('prop-smartphone', 'prop', '智能手机', ['现代'])
    ];

    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'guofeng-historical', [
        asset('outfit-song-beizi-pleated-skirt', 'outfit', '宋制褙子百褶裙套装')
      ]).map((item) => item.id)
    ).toEqual(['prop-song-celadon-tea-bowl']);
  });

  it('keeps new story backgrounds and craft props inside the selected dynasty', () => {
    const backgrounds = [
      asset(
        'background-tang-west-market-spice',
        'background',
        '唐风西市香料铺',
        ['中国古代场景', '唐风']
      ),
      asset('background-song-rain-teahouse', 'background', '宋风临街听雨茶肆', [
        '中国古代场景',
        '宋风'
      ])
    ];
    const props = [
      asset('prop-tang-azurite-pigment-grinding', 'prop', '唐风石青矿彩研磨', [
        '中国古代道具',
        '唐风'
      ]),
      asset('prop-song-celadon-oilpaper-umbrella', 'prop', '宋风青灰素纸伞', [
        '中国古代道具',
        '宋风'
      ])
    ];
    const selected = [
      asset('outfit-tang-qixiong-ruqun', 'outfit', '唐制齐胸襦裙套装')
    ];

    expect(
      filterAssetsForPortraitRecipeContext(
        backgrounds,
        'guofeng-historical',
        selected
      ).map((item) => item.id)
    ).toEqual(['background-tang-west-market-spice']);
    expect(
      filterAssetsForPortraitRecipeContext(
        props,
        'guofeng-historical',
        selected
      ).map((item) => item.id)
    ).toEqual(['prop-tang-azurite-pigment-grinding']);
  });

  it('pairs a historical outfit with same-dynasty makeup', () => {
    const candidates = [
      asset('makeup-tang-apricot-gold', 'makeup', '唐风杏粉朱金妆', [
        '中国古代妆容',
        '唐风'
      ]),
      asset('makeup-ming-redbrown-precision', 'makeup', '明风端正红棕妆', [
        '中国古代妆容',
        '明风'
      ]),
      asset('makeup-y2k-shimmer-eye', 'makeup', 'Y2K 微闪眼妆', ['Y2K'])
    ];
    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'guofeng-historical', [
        asset('outfit-ming-aoqun-mamian', 'outfit', '明制袄裙马面套装')
      ]).map((item) => item.id)
    ).toEqual(['makeup-ming-redbrown-precision']);
  });

  it('pairs historical and fantasy-Chinese outfits with their own world setting', () => {
    const candidates = [
      asset(
        'background-tang-vermilion-palace-gallery',
        'background',
        '唐风朱柱宫廊',
        ['中国古代场景', '唐风']
      ),
      asset(
        'background-song-scholar-tea-garden',
        'background',
        '宋风文人茶园',
        ['中国古代场景', '宋风']
      ),
      asset(
        'background-wuxia-mountain-pass-inn',
        'background',
        '武侠山关客栈',
        ['中国古代场景', '武侠']
      ),
      asset(
        'background-newchinese-lacquer-hotel',
        'background',
        '新中式漆木酒店',
        ['新中式场景', '酒店']
      )
    ];

    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'guofeng-historical', [
        asset('outfit-song-beizi-pleated-skirt', 'outfit', '宋制褙子百褶裙套装')
      ]).map((item) => item.id)
    ).toEqual(['background-song-scholar-tea-garden']);
    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'guofeng-wuxia', [
        asset('outfit-wuxia-crosscollar-trousers', 'outfit', '武侠交领劲装')
      ]).map((item) => item.id)
    ).toEqual(['background-wuxia-mountain-pass-inn']);
    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'guofeng-new-chinese', [
        asset(
          'outfit-new-chinese-qipao-mamian',
          'outfit',
          '新中式旗袍上衣马面裙'
        )
      ]).map((item) => item.id)
    ).toEqual(['background-newchinese-lacquer-hotel']);
  });

  it('keeps historical lighting physically plausible and route-specific', () => {
    const candidates = [
      asset(
        'lighting-historical-oillamp-amber',
        'lighting',
        '古典油灯琥珀主光',
        ['中国古代光影', '油灯光']
      ),
      asset(
        'lighting-historical-paperlantern-wrap',
        'lighting',
        '古典纸灯柔暖包裹',
        ['中国古代光影', '纸灯柔光']
      ),
      asset('lighting-wuxia-storm-silver-rim', 'lighting', '武侠风暴银色侧光', [
        '中国古代光影',
        '武侠'
      ]),
      asset('lighting-xianxia-cloud-diffuse', 'lighting', '仙侠云雾漫射逆光', [
        '中国古代光影',
        '仙侠'
      ]),
      asset(
        'lighting-newchinese-lacquer-practical',
        'lighting',
        '新中式漆室暖边光',
        ['新中式光影']
      )
    ];

    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'guofeng-historical', [
        asset('outfit-song-beizi-pleated-skirt', 'outfit', '宋制褙子百褶裙套装')
      ]).map((item) => item.id)
    ).toEqual([
      'lighting-historical-oillamp-amber',
      'lighting-historical-paperlantern-wrap'
    ]);
    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'guofeng-wuxia', [
        asset('outfit-wuxia-crosscollar-trousers', 'outfit', '武侠交领劲装')
      ]).map((item) => item.id)
    ).toEqual(['lighting-wuxia-storm-silver-rim']);
    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'guofeng-new-chinese', [
        asset(
          'outfit-new-chinese-qipao-mamian',
          'outfit',
          '新中式旗袍上衣马面裙'
        )
      ]).map((item) => item.id)
    ).toEqual(['lighting-newchinese-lacquer-practical']);
  });

  it('pairs Chinese-route outfits with route-specific expressions', () => {
    const candidates = [
      asset('expression-cultivated-soft-gaze', 'expression', '清贵柔眼直视', [
        '中国古典表情'
      ]),
      asset(
        'expression-cultivated-private-smile',
        'expression',
        '闺阁私语浅笑',
        ['中国古典表情']
      ),
      asset('expression-wuxia-calm-resolve', 'expression', '武侠沉着决意', [
        '中国古代表情',
        '武侠'
      ]),
      asset(
        'expression-xianxia-compassionate-distance',
        'expression',
        '仙侠悲悯远望',
        ['中国古代表情', '仙侠']
      ),
      asset(
        'expression-newchinese-editorial-appraisal',
        'expression',
        '新中式冷静审视',
        ['新中式表情']
      ),
      asset('expression-playful-wink', 'expression', '俏皮眨眼', ['俏皮'])
    ];

    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'guofeng-historical', [
        asset('outfit-song-beizi-pleated-skirt', 'outfit', '宋制褙子百褶裙套装')
      ]).map((item) => item.id)
    ).toEqual([
      'expression-cultivated-soft-gaze',
      'expression-cultivated-private-smile'
    ]);
    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'guofeng-wuxia', [
        asset('outfit-wuxia-crosscollar-trousers', 'outfit', '武侠交领劲装')
      ]).map((item) => item.id)
    ).toEqual(['expression-wuxia-calm-resolve']);
    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'guofeng-wuxia', [
        asset('outfit-crimson-gold-xianxia', 'outfit', '绛红金边仙侠套装')
      ]).map((item) => item.id)
    ).toEqual(['expression-xianxia-compassionate-distance']);
    expect(
      filterAssetsForPortraitRecipeContext(candidates, 'guofeng-new-chinese', [
        asset(
          'outfit-new-chinese-qipao-mamian',
          'outfit',
          '新中式旗袍上衣马面裙'
        )
      ]).map((item) => item.id)
    ).toEqual(['expression-newchinese-editorial-appraisal']);
  });

  it('keeps 1,800 seeded real-library recipes inside hard compatibility rules', () => {
    for (const profile of portraitRecipeProfiles) {
      for (let iteration = 0; iteration < 200; iteration += 1) {
        let seed =
          20260713 + iteration * 97 + portraitRecipeProfiles.indexOf(profile);
        const random = () => {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        const selection = buildRandomImagePromptSelectionForProfile(
          imagePromptAssets,
          profile,
          random
        );
        const selected = imagePromptAssets.filter((item) =>
          getSelectedAssetIds(selection, item.slot).includes(item.id)
        );

        expect(selected.length).toBeGreaterThan(0);
        const wardrobeModes = [
          selection.outfit ? 'outfit' : null,
          selection.onePiece ? 'onePiece' : null,
          selection.top || selection.bottom ? 'separates' : null
        ].filter(Boolean);
        const closeCrop =
          selection.shot === 'shot-extreme-detail-eyes' ||
          selection.shot === 'shot-face-closeup' ||
          selection.shot === 'shot-lower-face-detail';
        expect(wardrobeModes).toHaveLength(closeCrop ? 0 : 1);
        const allowedWardrobeSlots = getPortraitRecipeWardrobeSlots(profile);
        if (selection.outfit) expect(allowedWardrobeSlots).toContain('outfit');
        if (selection.onePiece) {
          expect(allowedWardrobeSlots).toContain('onePiece');
        }
        if (selection.top) expect(allowedWardrobeSlots).toContain('top');
        if (selection.bottom) expect(allowedWardrobeSlots).toContain('bottom');
        if (allowedWardrobeSlots.length === 1 && !closeCrop) {
          expect(selection.outfit).toBeTruthy();
        }

        const top = selected.find((item) => item.slot === 'top');
        const bottom = selected.find((item) => item.slot === 'bottom');
        const wardrobe = selected.find((item) =>
          ['top', 'bottom', 'outfit', 'onePiece'].includes(item.slot)
        );
        const accessory = selected.find((item) => item.slot === 'accessory');
        const prop = selected.find((item) => item.slot === 'prop');
        const makeup = selected.find((item) => item.slot === 'makeup');
        const background = selected.find((item) => item.slot === 'background');
        const lighting = selected.find((item) => item.slot === 'lighting');
        const expression = selected.find((item) => item.slot === 'expression');
        const singularities = selected.filter((item) =>
          getPortraitVisualSingularityKind(item)
        );
        expect(singularities.length).toBeLessThanOrEqual(1);
        if (profile === 'guofeng-historical') {
          const pose = selected.find((item) => item.slot === 'pose');
          expect(
            pose &&
              /smartphone|phone|selfie|手机|自拍/i.test(
                [pose.id, pose.title, pose.prompt, ...pose.tags].join(' ')
              )
          ).not.toBe(true);
        }
        if (top && bottom) {
          const isSwim = (item: PortraitRecipeAssetLike) =>
            /swimwear|bikini|swimsuit|泳装|比基尼/i.test(
              [item.id, item.title, item.prompt, ...item.tags].join(' ')
            );
          expect(isSwim(top)).toBe(isSwim(bottom));
        }

        if (
          wardrobe &&
          /中国古装|唐制|宋制|明制|魏晋|汉风|武侠|仙侠|敦煌|新中式/i.test(
            [
              wardrobe.id,
              wardrobe.title,
              wardrobe.prompt,
              ...wardrobe.tags
            ].join(' ')
          )
        ) {
          if (accessory) {
            expect(
              /中国古代发饰|新中式发饰/i.test(
                [
                  accessory.id,
                  accessory.title,
                  accessory.prompt,
                  ...accessory.tags
                ].join(' ')
              )
            ).toBe(true);
          }
          if (prop) {
            expect(
              /中国古代道具|新中式道具|纸扇|折扇|书|花束|paper fan|book|bouquet/i.test(
                [prop.id, prop.title, prop.prompt, ...prop.tags].join(' ')
              )
            ).toBe(true);
          }
          if (makeup) {
            expect(
              /中国古代妆容|新中式妆容|东方古典妆/i.test(
                [makeup.id, makeup.title, makeup.prompt, ...makeup.tags].join(
                  ' '
                )
              )
            ).toBe(true);
          }
          if (background) {
            expect(
              /中国古代场景|新中式场景/i.test(
                [
                  background.id,
                  background.title,
                  background.prompt,
                  ...background.tags
                ].join(' ')
              ),
              `${profile} paired ${wardrobe.id} with ${background.id}`
            ).toBe(true);
          }
          if (lighting) {
            expect(
              /中国古代光影|新中式光影/i.test(
                [
                  lighting.id,
                  lighting.title,
                  lighting.prompt,
                  ...lighting.tags
                ].join(' ')
              ),
              `${profile} paired ${wardrobe.id} with ${lighting.id}`
            ).toBe(true);
          }
          if (expression) {
            expect(
              /中国古典表情|中国古代表情|新中式表情/i.test(
                [
                  expression.id,
                  expression.title,
                  expression.prompt,
                  ...expression.tags
                ].join(' ')
              ),
              `${profile} paired ${wardrobe.id} with ${expression.id}`
            ).toBe(true);
          }
        }

        const shot = imagePromptAssets.find(
          (item) => item.id === getPrimarySelectedAssetId(selection, 'shot')
        );
        const pose = imagePromptAssets.find(
          (item) => item.id === getPrimarySelectedAssetId(selection, 'pose')
        );
        if (shot && !resolveAssetCompatibility(shot).showsFootwear) {
          expect(selection.shoes).toBeNull();
        }
        if (pose && resolveAssetCompatibility(pose).occupiesHands) {
          expect(selection.prop).toEqual([]);
        }
        if (pose && shot) {
          const compatible =
            resolveAssetCompatibility(pose).compatibleShotFamilies;
          if (compatible.length > 0) {
            expect(compatible).toContain(
              resolveAssetCompatibility(shot).shotFamily
            );
          }
        }
      }
    }
  }, 60_000);

  it('keeps modern themed routes diverse across 200 consecutive recipes', () => {
    const checks = [
      {
        profile: 'guofeng-new-chinese',
        slots: ['lighting', 'expression', 'makeup']
      },
      { profile: 'night-glamour', slots: ['pose'] },
      { profile: 'active-sport', slots: ['expression'] }
    ] as const;

    for (const { profile, slots } of checks) {
      let seed = 0x28580675 + portraitRecipeProfiles.indexOf(profile);
      const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const counts = new Map<string, number>();
      for (let iteration = 0; iteration < 200; iteration += 1) {
        const selection = buildRandomImagePromptSelectionForProfile(
          imagePromptAssets,
          profile,
          random
        );
        for (const slot of slots) {
          for (const id of getSelectedAssetIds(selection, slot)) {
            counts.set(id, (counts.get(id) || 0) + 1);
          }
        }
      }
      const highestRepeat = Math.max(0, ...counts.values());
      expect(highestRepeat, `${profile} route monopoly`).toBeLessThanOrEqual(
        150
      );
    }
  }, 30_000);
});
