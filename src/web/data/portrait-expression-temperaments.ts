export interface PortraitExpressionTemperamentAssetLike {
  id: string;
  slot: string;
  searchAliases?: string[];
}

export type PortraitExpressionTemperamentCoverageStatus =
  | 'runtime-covered'
  | 'thumbnail-required';

export interface PortraitExpressionTemperamentCoverage {
  id: string;
  label: string;
  assetId: string | null;
  status: PortraitExpressionTemperamentCoverageStatus;
}

const temperamentSearchAliasesByAssetId: Record<string, string[]> = {
  'expression-grotesque-humor': [
    '怪诞幽默',
    '故意不好好漂亮',
    'grotesque humor'
  ],
  'expression-uncanny-playfulness': [
    '妖异俏皮',
    '狡黠危险',
    'uncanny playfulness'
  ],
  'expression-absurd-mockery': ['荒诞戏谑', '主动拆掉庄重感', 'absurd mockery'],
  'expression-static-mania': ['静态疯感', '克制失控', 'static mania'],
  'expression-fragile-sickly-sweetness': [
    '病态甜美',
    '甜美疲惫',
    'fragile sickly sweetness'
  ],
  'expression-cool-detachment': ['清冷疏离', '不回应镜头', 'cool detachment'],
  'expression-sacred-solemnity': [
    '神圣肃穆',
    '仪式稳定凝视',
    'sacred solemnity'
  ],
  'expression-fatalistic-melancholy': [
    '哀艳宿命',
    '接受无法改变的结局',
    'fatalistic melancholy'
  ],
  'expression-uncanny-cute-counterpoint': [
    '反常萌感',
    '反常萌感动作底座',
    '异常角色生活化小情绪',
    'uncanny-cute counterpoint'
  ]
};

export const portraitExpressionTemperamentCoverage: PortraitExpressionTemperamentCoverage[] =
  [
    ['grotesque-humor', '怪诞幽默', 'expression-grotesque-humor'],
    ['uncanny-playfulness', '妖异俏皮', 'expression-uncanny-playfulness'],
    ['absurd-mockery', '荒诞戏谑', 'expression-absurd-mockery'],
    ['static-mania', '静态疯感', 'expression-static-mania'],
    [
      'fragile-sickly-sweetness',
      '病态甜美',
      'expression-fragile-sickly-sweetness'
    ],
    ['cool-detachment', '清冷疏离', 'expression-cool-detachment'],
    ['sacred-solemnity', '神圣肃穆', 'expression-sacred-solemnity'],
    ['fatalistic-melancholy', '哀艳宿命', 'expression-fatalistic-melancholy'],
    [
      'uncanny-cute-counterpoint',
      '反常萌感',
      'expression-uncanny-cute-counterpoint'
    ]
  ].map(([id, label, assetId]) => ({
    id,
    label,
    assetId,
    status: 'runtime-covered'
  }));

export function applyPortraitExpressionTemperamentSearchAliases<
  T extends PortraitExpressionTemperamentAssetLike
>(asset: T): T & PortraitExpressionTemperamentAssetLike {
  if (asset.slot !== 'expression') return asset;
  const aliases = temperamentSearchAliasesByAssetId[asset.id];
  if (!aliases) return asset;

  return {
    ...asset,
    searchAliases: [...new Set([...(asset.searchAliases || []), ...aliases])]
  };
}
