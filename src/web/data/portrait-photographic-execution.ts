export type PortraitExecutionLocale = 'zh-CN' | 'en-US';

export interface PortraitExecutionAssetLike {
  id: string;
  slot: string;
  title: string;
  prompt: string;
  promptZh?: string;
  tags: string[];
}

export interface PortraitPhotographicExecution {
  pictureCoordinates: string;
  expressionMechanics: string;
  poseMechanics: string;
  sceneInteraction: string;
  lightingCausality: string;
  materialPhysics: string;
}

const assetText = (asset?: PortraitExecutionAssetLike) =>
  asset
    ? [asset.id, asset.title, asset.promptZh, asset.prompt, ...asset.tags]
        .filter(Boolean)
        .join(' ')
    : '';

function findAsset(
  assets: PortraitExecutionAssetLike[],
  slot: string
): PortraitExecutionAssetLike | undefined {
  return assets.find((asset) => asset.slot === slot);
}

function findAssets(
  assets: PortraitExecutionAssetLike[],
  slot: string
): PortraitExecutionAssetLike[] {
  return assets.filter((asset) => asset.slot === slot);
}

function buildPictureCoordinates(
  assets: PortraitExecutionAssetLike[],
  locale: PortraitExecutionLocale
): string {
  const shot = assetText(findAsset(assets, 'shot'));
  const composition = assetText(findAsset(assets, 'composition'));
  const offCenter =
    /negative.space|one side|thirds|非对称|负空间|一侧|三分/i.test(composition);
  const positionZh = offCenter
    ? '人物落在一侧三分线，视线或动作方向保留负空间'
    : '人物居中，脸部落在上半部视觉中心';
  const positionEn = offCenter
    ? 'place the subject on a side third and leave negative space along the gaze or action direction'
    : 'center the subject with the face in the upper visual center';

  const scales: Array<[RegExp, string, string]> = [
    [
      /extreme-detail|眼部极特写/i,
      '双眼眉部充满画面，从眉上到鼻梁中段自然裁切',
      'fill the frame with the eye-and-brow band, naturally cropped from above the brows to mid nose bridge'
    ],
    [
      /face-closeup|面部特写/i,
      '发顶至下巴完整可见，脸部约占画面高度八成',
      'show crown to chin with the face occupying about eighty percent of frame height'
    ],
    [
      /head-shoulders|头肩/i,
      '从上胸自然裁切，头肩约占画面高度七成',
      'crop naturally at the upper chest with head and shoulders occupying about seventy percent of frame height'
    ],
    [
      /chest-up|胸上/i,
      '从胸廓中段自然裁切，头部位于画面上三分之一',
      'crop at mid ribcage with the head in the upper third'
    ],
    [
      /waist-up|腰上/i,
      '从自然腰线下方裁切，上半身约占画面高度三分之二',
      'crop just below the natural waist with the upper body occupying about two thirds of frame height'
    ],
    [
      /knee-up|膝上/i,
      '从膝部上缘裁切，头部至膝部完整可读',
      'crop immediately above the knees with head-to-knee structure fully readable'
    ],
    [
      /extreme-long|大远景/i,
      '完整头脚可见，人物约占画面高度六分之一，环境主导',
      'show the complete figure at about one sixth of frame height with the environment dominant'
    ],
    [
      /(?:shot-long|\blong shot\b|远景)/i,
      '完整头脚可见，人物约占画面高度三分之一',
      'show the complete figure at about one third of frame height'
    ],
    [
      /full-body|全身/i,
      '完整头脚可见，四周保留稳定安全边距',
      'show the complete figure with stable breathing room around head and feet'
    ]
  ];
  const scale = scales.find(([pattern]) => pattern.test(shot));
  const crop = scale
    ? locale === 'zh-CN'
      ? scale[1]
      : scale[2]
    : locale === 'zh-CN'
      ? '从自然腰线下方裁切，上半身约占画面高度三分之二'
      : 'crop just below the natural waist with the upper body occupying about two thirds of frame height';
  return locale === 'zh-CN'
    ? `${positionZh}；${crop}`
    : `${positionEn}; ${crop}`;
}

function buildPoseMechanics(
  assets: PortraitExecutionAssetLike[],
  locale: PortraitExecutionLocale
): string {
  const poseAsset = findAsset(assets, 'pose');
  const pose = assetText(poseAsset);
  const actionZh = poseAsset?.promptZh || poseAsset?.title || '自然站立';
  const actionEn =
    poseAsset?.prompt || poseAsset?.title || 'a natural standing pose';
  const patterns: Array<[RegExp, string, string]> = [
    [
      /jump|跃|腾空|cartwheel|跑|running/i,
      '双腿共同发力或交替承重，骨盆跟随运动方向，肩线保持自然；唯一动作是',
      'both legs drive or alternate support, the pelvis follows the travel direction, and the shoulders stay natural; the only action is'
    ],
    [
      /sit|seated|seat|坐|盘腿|冥想/i,
      '坐面或交叠腿部承重，骨盆稳定，躯干从支撑点自然上提；唯一动作是',
      'the seat or crossed legs carry the weight, the pelvis stays stable, and the torso rises naturally from that support; the only action is'
    ],
    [
      /kneel|跪/i,
      '膝部与小腿共同承重，骨盆位于支撑面上方，肩线放松；唯一动作是',
      'knees and shins share the weight, the pelvis stays above the support area, and the shoulders relax; the only action is'
    ],
    [
      /lean|靠|倚|撑/i,
      '双脚与接触面共同承重，骨盆和肩线沿接触点自然延伸；唯一动作是',
      'the feet and contact surface share the weight, with pelvis and shoulders extending naturally from that contact; the only action is'
    ],
    [
      /walk|stride|行走|迈步/i,
      '前后脚交替承重，骨盆随步幅轻微转动，非任务肢体自然摆动；唯一动作是',
      'front and rear feet alternate support, the pelvis rotates slightly with the stride, and non-task limbs swing naturally; the only action is'
    ]
  ];
  const mechanic = patterns.find(([pattern]) => pattern.test(pose));
  const base = mechanic
    ? locale === 'zh-CN'
      ? mechanic[1]
      : mechanic[2]
    : locale === 'zh-CN'
      ? '双脚稳定承重，骨盆位于支撑面上方，肩线与其余肢体放松；唯一动作是'
      : 'both feet carry stable weight, the pelvis stays above the support area, and shoulders and non-task limbs relax; the only action is';
  return locale === 'zh-CN' ? `${base}${actionZh}` : `${base} ${actionEn}`;
}

function buildExpressionMechanics(
  assets: PortraitExecutionAssetLike[],
  locale: PortraitExecutionLocale
): string {
  const expression = findAsset(assets, 'expression');
  const expressionName = expression?.title.trim();
  if (locale === 'zh-CN') {
    return `${expressionName ? `“${expressionName}”` : '当前表情'}只作为一个面部时间切片；把它作为主要气质，只在素材已写明时保留一个辅助气质；从相对镜头的视线落点、眼睑、眉部、嘴角、鼻翼或面颊或下颌张力中选择二至四个可共存证据，不向同一肌肉下达冲突动作；头部朝向与下巴高度服从已选姿势和机位，不由表情改写，也不改变妆容、道具或场景`;
  }
  return `${expressionName ? `“${expressionName}”` : 'the selected expression'} is one facial time slice and the primary temperament; keep one auxiliary temperament only when the asset explicitly names it; choose two to four compatible pieces of evidence across gaze target relative to camera, eyelids, brows, mouth corners, nose or cheek or jaw tension; never give one muscle contradictory actions; head orientation and chin height obey the selected pose and viewpoint and are never rewritten by expression, and makeup, props, and scene stay unchanged`;
}

function buildSceneInteraction(
  assets: PortraitExecutionAssetLike[],
  locale: PortraitExecutionLocale
): string {
  const background = findAsset(assets, 'background');
  const pose = findAsset(assets, 'pose');
  const props = findAssets(assets, 'prop');
  if (locale === 'zh-CN') {
    const scene = background?.title ? `“${background.title}”` : '当前场景';
    const action = pose?.title ? `“${pose.title}”` : '人物动作';
    const propContact =
      props.length === 1
        ? `；“${props[0].title}”与任务手或支撑面形成清晰接触`
        : props.length <= 4 && props.length > 1
          ? `；所选道具按构图分布，只有与动作有关的一件进入任务手，其余停留在可信支撑面，不各自触发新动作`
          : props.length > 4
            ? `；从道具候选池只取二至四件，只有与动作有关的一件进入任务手，其余不强制出现`
            : '';
    return `${scene}为${action}提供可见、可信的站立、坐靠或操作区域${propContact}；前景、中景、后景只解释空间，不新增未选择的人物或第二事件`;
  }
  const scene = background?.title ? `“${background.title}”` : 'the scene';
  const action = pose?.title ? `“${pose.title}”` : 'the subject action';
  const propContact =
    props.length === 1
      ? `; “${props[0].title}” has clear contact with the task hand or support surface`
      : props.length <= 4 && props.length > 1
        ? '; arrange selected props compositionally, let only the action-relevant item enter the task hand, and keep the rest on credible support surfaces without spawning more actions'
        : props.length > 4
          ? '; use only two to four items from the prop pool, let only the action-relevant item enter the task hand, and do not force the rest to appear'
          : '';
  return `${scene} provides a visible credible area for ${action} to stand, sit, lean, or operate${propContact}; foreground, midground, and background explain the space without adding unselected people or a second event`;
}

function buildLightingCausality(
  assets: PortraitExecutionAssetLike[],
  locale: PortraitExecutionLocale
): string {
  const lighting = assetText(findAsset(assets, 'lighting'));
  const background = assetText(findAsset(assets, 'background'));
  const context = `${lighting} ${background}`;
  const patterns: Array<[RegExp, string, string]> = [
    [
      /window|窗|格窗|月窗/i,
      '主光来自画面侧方可见窗面，连续照亮脸部与朝窗肩线；墙面或床品只做弱补光，阴影落向背窗侧',
      'the key comes from a visible side window and continuously lights the face and window-side shoulder; walls or bedding provide weak fill and shadows fall away from the window'
    ],
    [
      /neon|霓虹|gel|凝胶/i,
      '主光来自场景侧方霓虹或凝胶灯，脸部保持一块连续中性受光区；环境墙面弱补暗部，阴影落向灯源反侧',
      'the key comes from a side neon or gel practical while the face keeps one continuous neutral light zone; nearby surfaces weakly fill shadows, which fall away from the source'
    ],
    [
      /backlight|rim|逆光|轮廓|夕阳/i,
      '主光来自人物侧前方的现场光，侧后方可见光源只分离发丝与肩线；环境反射轻补脸部，阴影落向主光反侧',
      'the key comes from an on-location front-side source, while a visible rear-side source only separates hair and shoulders; ambient reflection lightly fills the face and shadows fall opposite the key'
    ],
    [
      /overhead|spotlight|顶光|聚光/i,
      '主光来自正上方可解释的顶灯，照亮头顶、肩线与服装上表面；前方浅色地面弱补脸部，阴影垂直落在下方',
      'the key comes from an explainable overhead fixture, lighting crown, shoulders, and upper garment planes; a pale floor weakly fills the face and shadows fall downward'
    ],
    [
      /flash|直闪|ccd|disposable/i,
      '主光来自相机轴附近的单一直闪，脸部与服装正面同步受光；现场环境光只保留背景信息，阴影短而向后落下',
      'the key is one on-axis direct flash lighting face and garment front together; ambient light only preserves background evidence and short shadows fall backward'
    ],
    [
      /oil.lamp|lantern|candle|油灯|纸灯|灯笼|烛/i,
      '主光来自画面内可见灯烛，连续照亮靠近光源的脸部与衣料；木墙或纸面微弱反射补暗部，阴影落向远离灯火的一侧',
      'the key comes from a visible lamp or candle, continuously lighting the near side of face and clothing; wood or paper weakly reflects into shadows, which fall away from the flame'
    ]
  ];
  const match = patterns.find(([pattern]) => pattern.test(context));
  if (match) return locale === 'zh-CN' ? match[1] : match[2];
  return locale === 'zh-CN'
    ? '主光来自画面左前方可解释的柔光源，连续照亮脸部、肩颈与服装正面；右侧环境反射轻补暗部，阴影落向右后方'
    : 'the key comes from an explainable soft source at camera-left front and continuously lights face, shoulders, and garment front; right-side ambient reflection lightly fills shadows, which fall to rear-right';
}

function buildMaterialPhysics(
  assets: PortraitExecutionAssetLike[],
  locale: PortraitExecutionLocale
): string {
  const materialSlots = new Set([
    'top',
    'bottom',
    'outfit',
    'onePiece',
    'shoes',
    'accessory',
    'prop',
    'background'
  ]);
  const text = assets
    .filter((asset) => materialSlots.has(asset.slot))
    .map(assetText)
    .join(' ');
  const materials: Array<[RegExp, string, string]> = [
    [
      /dichroic|iridescent|虹彩|二向色/i,
      '虹彩或二向色只在受光边缘与斜角表面产生有限色偏，透明层保留厚度、连接与内部轮廓',
      'iridescent or dichroic color shifts stay limited to lit edges and oblique planes, while transparent layers retain thickness, joins, and inner contours'
    ],
    [
      /smoked.acrylic|acrylic|烟灰亚克力|亚克力/i,
      '亚克力保留板材厚度、切割边缘与刚性支撑，边缘亮于正面，透射背景自然降低对比',
      'acrylic retains sheet thickness, cut edges, and rigid support; edges read brighter than front planes and transmitted background contrast falls naturally'
    ],
    [
      /chainmail|metal mesh|链甲|金属网/i,
      '金属网按重量下垂并在弯曲处压缩环扣，每个受光环扣产生细小方向性高光',
      'metal mesh sags under its weight and compresses links around bends, with each lit link carrying a small directional highlight'
    ],
    [
      /patent.leather|漆皮/i,
      '漆皮保留皮革厚度、缝线与受力折痕，高光沿曲面连续移动而不变成镜面金属',
      'patent leather retains leather thickness, stitching, and stress creases, with highlights moving continuously across curves without becoming mirror metal'
    ],
    [
      /organza|欧根纱/i,
      '欧根纱保留薄纱层数、硬挺边缘与空气间隙，逆光穿透叠层但轮廓不溶解',
      'organza retains gauze layers, crisp edges, and air gaps; backlight passes through the layers without dissolving the silhouette'
    ],
    [
      /technical nylon|机能尼龙/i,
      '机能尼龙保留防水接缝、真实布料厚度与重力褶皱，湿区窄亮、干区漫反射',
      'technical nylon retains weatherproof seams, real fabric thickness, and gravity folds, with narrow highlights on damp zones and diffuse response on dry zones'
    ],
    [
      /carbon.fiber|碳纤维/i,
      '碳纤维编织方向沿结构连续，壳体保持刚性厚度，斜向高光揭示纹理而不形成棋盘噪点',
      'carbon-fiber weave direction follows the structure, the shell keeps rigid thickness, and oblique highlights reveal the weave without checkerboard noise'
    ],
    [
      /oxidized.copper|patina|氧化铜|铜锈/i,
      '氧化铜保留金属基底、边缘磨损与局部铜锈层次，反射仍服从现场光而非自行发光',
      'oxidized copper retains its metal base, edge wear, and localized patina layers, with reflections obeying the on-location light rather than self-illumination'
    ],
    [
      /mirror.metal|brushed.metal|镜面金属|拉丝金属/i,
      '镜面或拉丝金属保持硬质厚度、接缝与受力边界，高光和反射内容只来自当前场景与主光',
      'mirror or brushed metal retains rigid thickness, seams, and load boundaries, with highlights and reflections coming only from the current scene and key light'
    ],
    [
      /wet|water|湿|水面|水滴/i,
      '湿润边界清楚，水滴沿重力连续附着',
      'wet boundaries stay distinct and droplets adhere continuously under gravity'
    ],
    [
      /glass|pvc|玻璃|透明塑料/i,
      '玻璃或 PVC 只在受光边缘产生透明反射与折射',
      'glass or PVC shows transparent reflection and refraction only along lit edges'
    ],
    [
      /silk|satin|丝|缎|绢|罗|纱/i,
      '丝缎与薄纱按各自重量垂落，只在受光折面形成连续高光',
      'silk, satin, and gauze drape according to their weight and carry continuous highlights only on lit folds'
    ],
    [
      /leather|皮革/i,
      '皮革保持厚度与受力折痕，高光随曲面连续移动',
      'leather keeps thickness and stress creases, with highlights following its curved surface'
    ],
    [
      /knit|针织|毛衣/i,
      '针织保留纱线厚度、拉伸方向与柔软褶皱',
      'knitwear preserves yarn thickness, stretch direction, and soft folds'
    ],
    [
      /metal|金属/i,
      '金属只反射现场主光并保留硬边高光',
      'metal reflects only the on-location key and retains hard-edged highlights'
    ]
  ];
  const details = materials
    .filter(([pattern]) => pattern.test(text))
    .map((item) => (locale === 'zh-CN' ? item[1] : item[2]));
  const uniqueDetails = [...new Set(details)].slice(0, 3);
  const base =
    locale === 'zh-CN'
      ? '衣料保留真实厚度、重量、张力和顺重力褶皱，人物与服装、道具及支撑面之间有可信接触阴影'
      : 'fabric keeps real thickness, weight, tension, and gravity-led folds, with credible contact shadows between subject, clothing, props, and support surfaces';
  const scopeGuard =
    locale === 'zh-CN'
      ? '材质表现只作用于已选服装、配饰、道具或场景表面，不扩散到皮肤、脸部或头发'
      : 'material rendering applies only to selected wardrobe, accessories, props, or set surfaces and never spills into skin, face, or hair';
  return [base, ...uniqueDetails, scopeGuard].join(
    locale === 'zh-CN' ? '；' : '; '
  );
}

export function buildPortraitPhotographicExecution(
  assets: PortraitExecutionAssetLike[],
  locale: PortraitExecutionLocale
): PortraitPhotographicExecution {
  return {
    pictureCoordinates: buildPictureCoordinates(assets, locale),
    expressionMechanics: buildExpressionMechanics(assets, locale),
    poseMechanics: buildPoseMechanics(assets, locale),
    sceneInteraction: buildSceneInteraction(assets, locale),
    lightingCausality: buildLightingCausality(assets, locale),
    materialPhysics: buildMaterialPhysics(assets, locale)
  };
}

export function formatPortraitPhotographicExecution(
  execution: PortraitPhotographicExecution,
  locale: PortraitExecutionLocale
): string {
  return locale === 'zh-CN'
    ? `摄影执行：画面坐标：${execution.pictureCoordinates}；表情观察量：${execution.expressionMechanics}；姿态力学：${execution.poseMechanics}；场景接触：${execution.sceneInteraction}；光线因果：${execution.lightingCausality}；材质物理：${execution.materialPhysics}`
    : `Photographic execution — picture coordinates: ${execution.pictureCoordinates}; expression observables: ${execution.expressionMechanics}; pose mechanics: ${execution.poseMechanics}; scene contact: ${execution.sceneInteraction}; lighting causality: ${execution.lightingCausality}; material physics: ${execution.materialPhysics}`;
}
