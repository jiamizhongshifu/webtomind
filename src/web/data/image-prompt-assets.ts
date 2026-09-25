import { portraitCategoryExpansionSeeds } from './portrait-category-expansion-assets';
import { applyPortraitExpressionTemperamentSearchAliases } from './portrait-expression-temperaments';
import {
  isImagePromptSlot,
  resolveAssetCompatibility,
  slotVisualDefaults,
  type ImagePromptAsset,
  type ImagePromptAssetCompatibility,
  type ImagePromptSlot
} from './image-prompt-core';

export * from './image-prompt-core';

function promptLibraryAssetUrl(slot: ImagePromptSlot, id: string): string {
  return new URL(`../assets/prompt-library/${slot}/${id}.webp`, import.meta.url)
    .href;
}

function definePromptAsset(
  asset: Omit<ImagePromptAsset, 'visual' | 'thumbnailUrl' | 'compatibility'> & {
    visual?: ImagePromptAsset['visual'];
    thumbnailUrl?: string;
    compatibility?: Partial<ImagePromptAssetCompatibility>;
  }
): ImagePromptAsset {
  const inferredCompatibility = resolveAssetCompatibility(
    asset as ImagePromptAsset
  );
  return {
    ...asset,
    // Public assets always use the curated square artwork. Emoji remain useful
    // inside prompts, but made expression/pose thumbnails visually inconsistent.
    thumbnailEmoji: undefined,
    thumbnailUrl:
      asset.thumbnailUrl || promptLibraryAssetUrl(asset.slot, asset.id),
    visual: asset.visual || slotVisualDefaults[asset.slot],
    compatibility: {
      ...inferredCompatibility,
      ...asset.compatibility
    }
  };
}

type GeneratedManifestPromptAsset = {
  id?: unknown;
  slot?: unknown;
  title?: unknown;
  subtitle?: unknown;
  prompt?: unknown;
  promptZh?: unknown;
  negativePrompt?: unknown;
  negativePromptZh?: unknown;
  tags?: unknown;
  searchAliases?: unknown;
};

function toGeneratedPromptAsset(
  asset: GeneratedManifestPromptAsset
): ImagePromptAsset | null {
  if (
    typeof asset.id !== 'string' ||
    typeof asset.slot !== 'string' ||
    !isImagePromptSlot(asset.slot) ||
    typeof asset.title !== 'string' ||
    typeof asset.subtitle !== 'string' ||
    typeof asset.prompt !== 'string'
  ) {
    return null;
  }

  return definePromptAsset({
    id: asset.id,
    slot: asset.slot,
    title: asset.title,
    subtitle: asset.subtitle,
    prompt: asset.prompt,
    promptZh: typeof asset.promptZh === 'string' ? asset.promptZh : undefined,
    negativePrompt:
      typeof asset.negativePrompt === 'string'
        ? asset.negativePrompt
        : undefined,
    negativePromptZh:
      typeof asset.negativePromptZh === 'string'
        ? asset.negativePromptZh
        : undefined,
    tags: Array.isArray(asset.tags)
      ? asset.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    searchAliases: Array.isArray(asset.searchAliases)
      ? asset.searchAliases.filter(
          (alias): alias is string => typeof alias === 'string'
        )
      : undefined
  });
}

function dedupePromptAssets(assets: ImagePromptAsset[]): ImagePromptAsset[] {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    if (seen.has(asset.id)) return false;
    seen.add(asset.id);
    return true;
  });
}

function removeEmojiPromptLeakage(asset: ImagePromptAsset): ImagePromptAsset {
  if (asset.slot !== 'expression' && asset.slot !== 'pose') return asset;

  const strip = (value: string) =>
    value
      .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
      .replace(/:\s*,/g, ':')
      .replace(/：\s*，/g, '：')
      .replace(/\s{2,}/g, ' ')
      .trim();

  return {
    ...asset,
    prompt: strip(asset.prompt),
    ...(asset.promptZh ? { promptZh: strip(asset.promptZh) } : {}),
    tags: asset.tags.filter((tag) => tag.toLowerCase() !== 'emoji')
  };
}

function applyPortraitAssetQualityContract(
  asset: ImagePromptAsset
): ImagePromptAsset {
  if (
    asset.slot !== 'expression' &&
    asset.slot !== 'pose' &&
    asset.slot !== 'makeup'
  ) {
    return asset;
  }

  if (asset.slot === 'expression') {
    const promptContract =
      'one photographed facial time slice only; choose two to four compatible cues across gaze target, eyelids, brows, mouth corners, nose or cheek or jaw tension; describe gaze relative to the camera; never give the same facial muscle contradictory actions; keep head orientation and chin height fixed, with every non-facial attribute unchanged';
    const promptZhContract =
      '只表现一个被拍到的面部时间切片；从视线落点、眼睑、眉部、嘴角、鼻翼或面颊或下颌张力中选择二至四个可共存观察量，并说明视线与镜头的关系；不向同一面部肌肉下达冲突动作；头部朝向与下巴高度固定，其他非面部属性保持不变';
    return {
      ...asset,
      prompt: /gaze target, eyelids, brows, mouth corners/i.test(asset.prompt)
        ? asset.prompt
        : `${asset.prompt}; ${promptContract}`,
      ...(asset.promptZh
        ? {
            promptZh: /视线落点、眼睑、眉部、嘴角/.test(asset.promptZh)
              ? asset.promptZh
              : `${asset.promptZh}；${promptZhContract}`
          }
        : {})
    };
  }

  if (asset.slot === 'makeup') {
    const promptContract =
      'one recognizable makeup anchor only; eye, cheek, lip, and skin details support one palette and finish; leave every non-makeup attribute unchanged';
    const promptZhContract =
      '只保留一个可识别妆容锚点；眼妆、腮红、唇色与肤质共同支持同一配色和质感；所有非妆容属性保持不变';
    return {
      ...asset,
      prompt: /one recognizable makeup anchor/i.test(asset.prompt)
        ? asset.prompt
        : `${asset.prompt}; ${promptContract}`,
      ...(asset.promptZh
        ? {
            promptZh: /一个可识别妆容锚点/.test(asset.promptZh)
              ? asset.promptZh
              : `${asset.promptZh}；${promptZhContract}`
          }
        : {})
    };
  }

  const promptContract =
    'exactly one action; support points, center of gravity, pelvis, shoulder line, task hand, and free limbs stay anatomically coherent; do not invent handheld props or a second action';
  const promptZhContract =
    '只保留一个动作；支撑点、重心、骨盆、肩线、任务手与非任务肢体保持解剖连贯；不凭空增加手持物或第二动作';
  return {
    ...asset,
    prompt: /support points, center of gravity, pelvis/i.test(asset.prompt)
      ? asset.prompt
      : `${asset.prompt}; ${promptContract}`,
    ...(asset.promptZh
      ? {
          promptZh: /支撑点、重心、骨盆/.test(asset.promptZh)
            ? asset.promptZh
            : `${asset.promptZh}；${promptZhContract}`
        }
      : {})
  };
}

const emojiExpressionPromptAssets: ImagePromptAsset[] = [
  {
    id: 'grinning',
    emoji: '😃',
    title: '开朗笑脸',
    subtitle: '明亮亲和',
    en: 'open cheerful smile, bright friendly eyes',
    zh: '开朗笑脸，眼神明亮亲和',
    tags: ['开心', '笑容']
  },
  {
    id: 'sweat-smile',
    emoji: '😅',
    title: '尴尬笑',
    subtitle: '轻松缓和',
    en: 'tight self-conscious smile, slightly raised inner brows and alert eyes, light awkward humor without sweat droplets',
    zh: '嘴角略紧的自嘲笑，内侧眉峰轻抬、眼神警觉，呈现尴尬缓和感，不出现汗滴',
    tags: ['尴尬', '轻松']
  },
  {
    id: 'rofl',
    emoji: '🤣',
    title: '爆笑翻滚',
    subtitle: '喜剧夸张',
    en: 'bursting laughter, comedic overjoyed facial reaction',
    zh: '爆笑反应，喜剧感强，情绪外放',
    tags: ['开心', '夸张']
  },
  {
    id: 'slight-smile',
    emoji: '🙂',
    title: '礼貌浅笑',
    subtitle: '克制友好',
    en: 'slight polite smile, restrained friendly expression',
    zh: '礼貌浅笑，友好但克制',
    tags: ['微笑', '克制']
  },
  {
    id: 'upside-down',
    emoji: '🙃',
    title: '反向幽默',
    subtitle: '荒诞俏皮',
    en: 'playfully ironic smile, subtle absurd humor',
    zh: '反向幽默感，荒诞俏皮的微笑',
    tags: ['俏皮', '幽默']
  },
  {
    id: 'halo',
    emoji: '😇',
    title: '天真光环',
    subtitle: '无辜清澈',
    en: 'innocent angelic smile, clean kind eyes',
    zh: '无辜清澈的天真笑容，眼神干净',
    tags: ['无辜', '温柔']
  },
  {
    id: 'star-struck',
    emoji: '🤩',
    title: '崇拜亮眼',
    subtitle: '强烈惊喜',
    en: 'wide delighted eyes with bright natural catchlights, excited admiration, no symbolic pupils',
    zh: '双眼欣喜睁大并保留自然眼神光，呈现强烈惊喜与崇拜感，不出现符号瞳孔',
    tags: ['惊喜', '喜欢']
  },
  {
    id: 'blowing-kiss',
    emoji: '😘',
    title: '飞吻',
    subtitle: '甜美互动',
    en: 'sweet blowing-kiss expression, playful affectionate interaction',
    zh: '飞吻表情，甜美互动感，俏皮但克制',
    tags: ['甜感', '互动']
  },
  {
    id: 'savoring',
    emoji: '😋',
    title: '满足馋笑',
    subtitle: '可爱生活感',
    en: 'savoring pleased face, cute lifestyle satisfaction',
    zh: '满足馋笑，可爱生活感，像刚尝到喜欢的味道',
    tags: ['可爱', '满足']
  },
  {
    id: 'tongue',
    emoji: '😛',
    title: '吐舌俏皮',
    subtitle: '轻松玩笑',
    en: 'playful tongue-out face, casual joking energy',
    zh: '吐舌俏皮表情，轻松开玩笑的状态',
    tags: ['俏皮', '互动']
  },
  {
    id: 'zany',
    emoji: '🤪',
    title: '鬼脸',
    subtitle: '夸张玩闹',
    en: 'zany goofy face, intentionally exaggerated playful mood',
    zh: '鬼脸，夸张玩闹，适合搞怪情绪',
    tags: ['搞怪', '夸张']
  },
  {
    id: 'raised-brow',
    emoji: '🤨',
    title: '挑眉怀疑',
    subtitle: '审视判断',
    en: 'one eyebrow raised, skeptical evaluating expression',
    zh: '单边挑眉，带怀疑和审视判断感',
    tags: ['怀疑', '思考']
  },
  {
    id: 'neutral',
    emoji: '😐',
    title: '中性平静',
    subtitle: '无明显情绪',
    en: 'neutral calm face, unreadable restrained emotion',
    zh: '中性平静表情，没有明显情绪波动',
    tags: ['平静', '克制']
  },
  {
    id: 'expressionless',
    emoji: '😑',
    title: '无语脸',
    subtitle: '冷淡克制',
    en: 'expressionless unimpressed face, dry restrained attitude',
    zh: '无语脸，冷淡克制，像不想评价',
    tags: ['冷淡', '克制']
  },
  {
    id: 'no-mouth',
    emoji: '😶',
    title: '沉默脸',
    subtitle: '留白情绪',
    en: 'silent face with withheld emotion, subtle blank reaction',
    zh: '沉默脸，情绪留白，像把话收住',
    tags: ['沉默', '留白']
  },
  {
    id: 'unamused',
    emoji: '😒',
    title: '不爽斜眼',
    subtitle: '轻微嫌弃',
    en: 'unamused side-eye, mild annoyance and dry attitude',
    zh: '不爽斜眼，轻微嫌弃和冷淡态度',
    tags: ['嫌弃', '冷感']
  },
  {
    id: 'roll-eyes',
    emoji: '🙄',
    title: '翻白眼',
    subtitle: '吐槽反应',
    en: 'eye-roll reaction, sarcastic unimpressed expression',
    zh: '翻白眼，吐槽式反应，带一点讽刺感',
    tags: ['吐槽', '反应']
  },
  {
    id: 'grimacing',
    emoji: '😬',
    title: '龇牙紧张',
    subtitle: '局促瞬间',
    en: 'grimacing nervous teeth, awkward tension in the face',
    zh: '龇牙紧张，局促、不知道如何回应的瞬间',
    tags: ['紧张', '尴尬']
  },
  {
    id: 'relieved',
    emoji: '😌',
    title: '安心舒缓',
    subtitle: '松一口气',
    en: 'relieved soft face, calm after-tension release',
    zh: '安心舒缓，像松了一口气，情绪稳定下来',
    tags: ['安心', '平静']
  },
  {
    id: 'pensive',
    emoji: '😔',
    title: '低落沉思',
    subtitle: '安静失落',
    en: 'pensive downcast face, quiet sadness and reflection',
    zh: '低落沉思，安静失落，眼神向内',
    tags: ['低落', '沉思']
  },
  {
    id: 'anxious-sweat',
    emoji: '😓',
    title: '焦虑紧绷',
    subtitle: '压力反应',
    en: 'anxious strained eyes, knitted inner brows and a tense closed mouth, pressured but controlled emotion without sweat droplets',
    zh: '眼神焦虑紧绷、内侧眉峰收拢、嘴唇紧闭，压力明显但保持克制，不出现汗滴',
    tags: ['焦虑', '压力']
  },
  {
    id: 'weary',
    emoji: '😩',
    title: '疲惫崩溃',
    subtitle: '强烈疲劳',
    en: 'weary exhausted face, dramatic tired reaction',
    zh: '疲惫崩溃脸，强烈疲劳和无力感',
    tags: ['疲惫', '夸张']
  },
  {
    id: 'confounded',
    emoji: '😖',
    title: '纠结痛苦',
    subtitle: '情绪拧巴',
    en: 'confounded scrunched expression, conflicted discomfort',
    zh: '纠结痛苦的皱脸，情绪拧巴不顺',
    tags: ['纠结', '痛苦']
  },
  {
    id: 'scream',
    emoji: '😱',
    title: '震惊尖叫',
    subtitle: '强剧情',
    en: 'shocked scream face, widened eyes and dramatic surprise',
    zh: '震惊尖叫，眼睛睁大，强剧情转折感',
    tags: ['震惊', '剧情']
  },
  {
    id: 'flushed',
    emoji: '😳',
    title: '害羞错愕',
    subtitle: '突然害羞',
    en: 'wide startled eyes, lifted inner brows and a restrained uncertain smile showing sudden shy embarrassment, no blush or skin-color change',
    zh: '双眼错愕睁大、内侧眉峰抬起并带克制迟疑的浅笑，呈现突然害羞，不改变腮红或肤色',
    tags: ['脸红', '害羞']
  },
  {
    id: 'hot-face',
    emoji: '🥵',
    title: '闷热疲惫',
    subtitle: '高温疲惫',
    en: 'heavy eyelids, slightly parted lips and relaxed facial tension suggesting overheated fatigue, no sweat or skin-color change',
    zh: '眼皮沉重、嘴唇微张、面部张力放松，呈现闷热疲惫感，不出现汗滴或肤色变化',
    tags: ['高温', '疲惫']
  },
  {
    id: 'cold-face',
    emoji: '🥶',
    title: '冷到发抖',
    subtitle: '寒冷反应',
    en: 'tight jaw, pressed lips and narrowed tense eyes suggesting a chilly reaction, no frost or skin-color change',
    zh: '下颌收紧、双唇紧抿、眼睛紧张微眯，呈现寒冷反应，不出现霜冻或肤色变化',
    tags: ['寒冷', '反应']
  },
  {
    id: 'dizzy-face',
    emoji: '😵',
    title: '晕眩脸',
    subtitle: '混乱失焦',
    en: 'dizzy unfocused face, overwhelmed disoriented reaction',
    zh: '晕眩脸，混乱失焦，像被信息冲击',
    tags: ['晕眩', '混乱']
  },
  {
    id: 'exploding-head',
    emoji: '🤯',
    title: '震撼顿悟',
    subtitle: '信息冲击',
    en: 'eyes widened, brows lifted and lips slightly parted in an intense moment of realization, no explosion effect',
    zh: '双眼睁大、眉峰抬起、嘴唇微张，呈现突然顿悟的强烈震撼，不出现爆炸特效',
    tags: ['震撼', '信息']
  },
  {
    id: 'party-face',
    emoji: '🥳',
    title: '兴奋庆祝',
    subtitle: '节日开心',
    en: 'broad celebratory smile with lifted cheeks and lively eyes, no party props or confetti',
    zh: '灿烂庆祝笑容，双颊上提、眼神活跃，情绪高涨，不出现派对道具或彩屑',
    tags: ['庆祝', '开心']
  },
  {
    id: 'disguised-face',
    emoji: '🥸',
    title: '心虚装镇定',
    subtitle: '压住笑意',
    en: 'asymmetric brows, guarded side glance and a suppressed smile suggesting playful self-consciousness, no disguise accessories',
    zh: '眉形轻微不对称，眼神谨慎侧移并压住笑意，呈现心虚装镇定，不出现伪装配件',
    tags: ['搞怪', '角色']
  },
  {
    id: 'monocle',
    emoji: '🧐',
    title: '精细审视',
    subtitle: '认真观察',
    en: 'one brow subtly lifted, eyes narrowed in precise curious scrutiny, no eyewear or handheld prop',
    zh: '单侧眉峰轻抬，双眼微眯进行精细审视，不出现眼镜或手持道具',
    tags: ['审视', '知性']
  },
  {
    id: 'shushing',
    emoji: '🤫',
    title: '抿唇保密',
    subtitle: '神秘互动',
    en: 'gently pursed lips, steady confidential gaze and subtly lifted brows suggesting a quiet secret, no hand gesture',
    zh: '嘴唇轻抿、眼神稳定而私密、眉峰微抬，呈现安静保密感，不出现手势',
    tags: ['神秘', '互动']
  },
  {
    id: 'hand-over-mouth',
    emoji: '🤭',
    title: '忍笑偷乐',
    subtitle: '克制惊喜',
    en: 'eyes smiling with lifted cheeks and one mouth corner suppressing a giggle, restrained amused surprise, no hand near the face',
    zh: '眼睛带笑、双颊上提、单侧嘴角压住笑意，呈现克制惊喜，不出现手靠近脸部',
    tags: ['偷笑', '害羞']
  },
  {
    id: 'teary-smile',
    emoji: '🥹',
    title: '含泪微笑',
    subtitle: '感动克制',
    en: 'teary gentle smile, touched emotional restraint',
    zh: '含泪微笑，被触动但努力克制',
    tags: ['感动', '克制']
  },
  {
    id: 'melting-face',
    emoji: '🫠',
    title: '疲惫失守',
    subtitle: '无力幽默',
    en: 'heavy eyelids, relaxed cheeks and a weak self-aware smile, exhausted with dry humor, no melting effect',
    zh: '眼皮沉重、面颊放松并带虚弱自嘲的浅笑，疲惫而幽默，不出现融化特效',
    tags: ['疲惫', '幽默']
  },
  {
    id: 'woozy-face',
    emoji: '🥴',
    title: '迷糊脸',
    subtitle: '微醺混乱',
    en: 'woozy confused face, slightly disoriented playful expression',
    zh: '迷糊脸，微醺或混乱感，表情松散',
    tags: ['迷糊', '混乱']
  },
  {
    id: 'zipper-mouth',
    emoji: '🤐',
    title: '闭嘴保密',
    subtitle: '谨慎沉默',
    en: 'lips firmly pressed together with a guarded steady gaze, careful secrecy and restraint, no zipper',
    zh: '双唇紧抿、眼神谨慎稳定，呈现保密与克制，不出现拉链',
    tags: ['保密', '沉默']
  },
  {
    id: 'lying-face',
    emoji: '🤥',
    title: '心虚闪躲',
    subtitle: '回避目光',
    en: 'averted gaze, tense mouth corners and subtly uneven brows suggesting a guilty evasion, no altered nose',
    zh: '目光闪躲、嘴角紧张、眉形轻微不对称，呈现心虚回避，不改变鼻部结构',
    tags: ['剧情', '隐喻']
  }
].map((seed) =>
  definePromptAsset({
    id: `expression-${seed.id}`,
    slot: 'expression',
    title: seed.title,
    subtitle: seed.subtitle,
    prompt: `facial expression only: ${seed.en}; treat it as one photographed time slice, with gaze target, eyelids, brows, mouth corners, and cheek or jaw tension supporting the same emotion; no emoji symbols, and every non-facial attribute stays unchanged`,
    promptZh: `仅改变面部表情：${seed.zh}；把它表现为一个被拍到的时间切片，视线落点、眼睑、眉部、嘴角与面颊或下颌张力共同支持同一情绪；不出现表情符号，脸部以外的属性保持不变`,
    tags: [...seed.tags, '面部表情']
  })
);

const emojiPosePromptAssets: ImagePromptAsset[] = [
  {
    id: 'ok-hand',
    emoji: '👌',
    title: 'OK 手势',
    subtitle: '确认认可',
    en: 'one hand making an OK sign near the upper body',
    zh: '一只手做 OK 手势，表达确认与认可',
    tags: ['手势', '互动']
  },
  {
    id: 'thumbs-up',
    emoji: '👍',
    title: '点赞手势',
    subtitle: '正向反馈',
    en: 'one hand giving a thumbs-up toward camera',
    zh: '一只手对镜头点赞，正向反馈明确',
    tags: ['手势', '互动']
  },
  {
    id: 'clapping',
    emoji: '👏',
    title: '鼓掌',
    subtitle: '庆祝支持',
    en: 'hands clapping in front of the chest',
    zh: '双手在胸前鼓掌，庆祝或支持动作',
    tags: ['手势', '庆祝']
  },
  {
    id: 'folded-hands',
    emoji: '🙏',
    title: '合掌',
    subtitle: '感谢祈愿',
    en: 'folded hands gesture in front of the chest',
    zh: '双手合掌放在胸前，感谢或祈愿感',
    tags: ['手势', '安静']
  },
  {
    id: 'writing-hand',
    emoji: '✍️',
    title: '书写动作',
    subtitle: '创作记录',
    en: 'one hand writing or signing with focused posture',
    zh: '一只手正在书写或签名，姿态专注',
    tags: ['手中物', '创作']
  },
  {
    id: 'raised-fist',
    emoji: '✊',
    title: '举拳',
    subtitle: '坚定力量',
    en: 'one fist raised with determined upright posture',
    zh: '单拳举起，身体挺直，坚定有力量',
    tags: ['手势', '力量']
  },
  {
    id: 'call-me',
    emoji: '🤙',
    title: 'Call Me',
    subtitle: '轻松邀约',
    en: 'call-me hand gesture near the face, relaxed friendly energy',
    zh: '手在脸旁做 call me 动作，轻松邀约感',
    tags: ['手势', '互动']
  },
  {
    id: 'love-you',
    emoji: '🤟',
    title: '爱你手势',
    subtitle: '友好表达',
    en: 'I-love-you hand sign held clearly toward camera',
    zh: '向镜头做爱你手势，友好表达但不过度甜腻',
    tags: ['手势', '友好']
  },
  {
    id: 'crossed-fingers',
    emoji: '🤞',
    title: '交叉手指',
    subtitle: '期待好运',
    en: 'crossed fingers gesture, hopeful subtle body language',
    zh: '交叉手指，期待好运的细微身体语言',
    tags: ['手势', '期待']
  },
  {
    id: 'palms-up',
    emoji: '🤲',
    title: '双手托起',
    subtitle: '展示承接',
    en: 'both palms held upward as if presenting something',
    zh: '双手掌心向上，像在承接或展示物品',
    tags: ['手势', '展示']
  },
  {
    id: 'pointing-up',
    emoji: '☝️',
    title: '向上指',
    subtitle: '强调重点',
    en: 'one index finger pointing upward to emphasize a key idea',
    zh: '一根食指向上，强调重点或引导视线',
    tags: ['手势', '引导']
  },
  {
    id: 'facepalm',
    emoji: '🤦',
    title: '扶额',
    subtitle: '无奈反应',
    en: 'one hand covering the forehead in a restrained facepalm',
    zh: '单手扶额，无奈但克制的反应动作',
    tags: ['手势', '无奈']
  },
  {
    id: 'bowing',
    emoji: '🙇',
    title: '鞠躬',
    subtitle: '礼貌致意',
    en: 'polite bowing posture with respectful body angle',
    zh: '礼貌鞠躬姿态，身体角度表达致意',
    tags: ['站姿', '礼貌']
  },
  {
    id: 'walking',
    emoji: '🚶',
    title: '自然行走',
    subtitle: '生活抓拍',
    en: 'natural walking stride, candid full-body movement',
    zh: '自然行走步伐，生活方式抓拍感',
    tags: ['行走', '动态']
  },
  {
    id: 'standing',
    emoji: '🧍',
    title: '正立站姿',
    subtitle: '稳定展示',
    en: 'upright standing pose, balanced centered silhouette',
    zh: '正立站姿，身体重心居中，轮廓稳定可读',
    tags: ['站姿', '稳定']
  },
  {
    id: 'kneeling',
    emoji: '🧎',
    title: '单膝低姿',
    subtitle: '层次构图',
    en: 'tasteful kneeling pose, low body level for layered composition',
    zh: '克制的低姿态跪姿，降低身体层级，增强构图层次',
    tags: ['低姿', '构图']
  },
  {
    id: 'cartwheel',
    emoji: '🤸',
    title: '侧手翻',
    subtitle: '高动态',
    en: 'cartwheel-inspired athletic motion, readable full-body action',
    zh: '侧手翻感运动动作，全身动态清晰可读',
    tags: ['动态', '运动']
  },
  {
    id: 'climbing',
    emoji: '🧗',
    title: '攀爬',
    subtitle: '纵向动作',
    en: 'climbing posture with clear vertical body tension',
    zh: '攀爬姿态，身体纵向发力关系清晰',
    tags: ['运动', '纵向']
  },
  {
    id: 'surfing',
    emoji: '🏄',
    title: '冲浪平衡',
    subtitle: '横向动势',
    en: 'surfing-inspired balance pose, lateral dynamic energy',
    zh: '冲浪平衡姿态，横向动势和身体张力明显',
    tags: ['运动', '动态']
  },
  {
    id: 'raising-hand',
    emoji: '🙋',
    title: '举手回应',
    subtitle: '主动参与',
    en: 'one hand raised as if answering or volunteering',
    zh: '单手举起回应，主动参与和互动感',
    tags: ['手势', '互动']
  }
].map((seed) =>
  definePromptAsset({
    id: `pose-${seed.id}`,
    slot: 'pose',
    title: seed.title,
    subtitle: seed.subtitle,
    prompt: `body pose only: ${seed.en}; keep exactly one action, with support points, center of gravity, pelvis, shoulder line, task hand, and free limbs anatomically coherent; do not invent handheld props, emoji symbols, or unrelated scene effects`,
    promptZh: `仅改变人物姿势：${seed.zh}；只保留一个动作，支撑点、重心、骨盆、肩线、任务手与非任务肢体符合解剖并保持连贯；不凭空增加手持物、表情符号或无关场景特效`,
    tags: [...seed.tags, '人物姿势']
  })
);

const clothingExpansionAssets: ImagePromptAsset[] = (
  [
    [
      'top-knit-off-shoulder-rib',
      'top',
      '一字肩罗纹针织',
      '柔和肩颈线',
      'ivory off-shoulder rib-knit fitted top, folded neckline, refined feminine silhouette',
      '象牙白一字肩罗纹修身针织上装，翻折领口，柔和突出肩颈线',
      ['针织', '一字肩', '修身']
    ],
    [
      'top-knit-asymmetric-halter',
      'top',
      '交叉挂脖针织',
      '不对称肩线',
      'ivory asymmetric cross-halter rib-knit top, sculpted neckline, clean fitted waist',
      '象牙白不对称交叉挂脖罗纹针织上装，领口立体，腰线干净修身',
      ['针织', '挂脖', '不对称']
    ],
    [
      'top-knit-fitted-button-cardigan',
      'top',
      '方领纽扣针织衫',
      '复古贴身剪裁',
      'cream square-neck fitted rib cardigan, delicate buttons, softly scalloped hem',
      '奶油色方领修身罗纹开衫，精致纽扣与轻微波浪下摆',
      ['开衫', '方领', '复古']
    ],
    [
      'top-knit-wrap-tie',
      'top',
      '侧系带裹身针织',
      '腰线自然收束',
      'soft ivory wrap-front knit top with side tie, flattering waist definition',
      '柔软象牙白裹身针织上装，侧边系带自然收束腰线',
      ['裹身', '系带', '针织']
    ],
    [
      'top-knit-square-neck',
      'top',
      '方领修身针织',
      '干净锁骨线',
      'minimal cream square-neck rib-knit top, slim long sleeves, clean collarbone framing',
      '极简奶油色方领罗纹针织上装，修身长袖，锁骨线条干净',
      ['方领', '修身', '极简']
    ],
    [
      'top-knit-keyhole-front',
      'top',
      '水滴镂空针织',
      '领口设计感',
      'cream turtleneck rib-knit top with tasteful keyhole front and gathered detail',
      '奶油色高领罗纹针织上装，胸前克制水滴镂空与收褶细节',
      ['镂空', '高领', '设计感']
    ],
    [
      'top-knit-slouchy-shoulder',
      'top',
      '松弛斜肩毛衣',
      '慵懒日常感',
      'soft ivory slouchy one-shoulder sweater, relaxed drape, cozy editorial styling',
      '柔软象牙白松弛斜肩毛衣，自然垂坠，带慵懒编辑感',
      ['斜肩', '松弛', '毛衣']
    ],
    [
      'top-knit-deep-v-cable',
      'top',
      '深V麻花毛衣',
      '复古宽松轮廓',
      'ivory deep V-neck cable-knit sweater, relaxed oversized silhouette, rich knit texture',
      '象牙白深V领麻花毛衣，宽松轮廓，针织纹理丰富',
      ['深V', '麻花', '宽松']
    ],
    [
      'top-knit-open-back-bow',
      'top',
      '露背蝴蝶结针织',
      '背部视觉重点',
      'cream long-sleeve rib-knit top with a large tasteful open-back cutout and soft bow',
      '奶油色长袖罗纹针织上装，背部大面积克制镂空与柔软蝴蝶结',
      ['露背', '蝴蝶结', '针织']
    ],
    [
      'top-academy-navy-blazer',
      'outfit',
      '海军蓝学院西装套装',
      '成人复古学院风',
      'adult womens navy blazer, ivory blouse, burgundy bow and gray pleated skirt editorial set',
      '成年女性海军蓝西装、象牙白衬衫、酒红领结与灰色百褶裙编辑套装',
      ['成人学院风', '西装', '百褶裙']
    ],
    [
      'top-academy-gray-vest',
      'outfit',
      '灰色针织背心套装',
      '清爽知性层搭',
      'adult womens gray sweater vest over white shirt with navy tie and pleated skirt',
      '成年女性灰色针织背心叠穿白衬衫，搭配海军蓝领带与百褶裙',
      ['成人学院风', '针织背心', '层搭']
    ],
    [
      'top-academy-sailor-navy',
      'outfit',
      '海军领时装套装',
      '复古制服灵感',
      'adult womens navy sailor-collar fashion top with matching pleated skirt, refined editorial styling',
      '成年女性海军领时装上装与同色百褶裙，复古灵感但保持成熟编辑感',
      ['海军领', '复古', '套装']
    ],
    [
      'top-academy-summer-stripe',
      'outfit',
      '夏日条纹衬衫套装',
      '轻盈通勤感',
      'adult womens blue striped short-sleeve shirt with navy bow and pleated skirt',
      '成年女性蓝色条纹短袖衬衫，搭配海军蓝蝴蝶结与百褶裙',
      ['条纹', '短袖', '套装']
    ],
    [
      'top-academy-burgundy-bow',
      'outfit',
      '酒红领结西装套装',
      '深色精致层次',
      'adult womens charcoal blazer, ivory blouse, burgundy bow and dark plaid pleated skirt',
      '成年女性炭灰西装、象牙白衬衫、酒红领结与深色格纹百褶裙',
      ['西装', '酒红', '格纹']
    ],
    [
      'top-academy-beige-cardigan',
      'outfit',
      '米色开衫格裙套装',
      '温柔书卷气',
      'adult womens beige cardigan layered over white blouse with brown bow and plaid skirt',
      '成年女性米色开衫叠穿白衬衫，搭配棕色领结与格纹裙',
      ['开衫', '米色', '书卷气']
    ],
    [
      'top-academy-cream-knit-vest',
      'outfit',
      '奶油针织背心套装',
      '绿格复古点缀',
      'adult womens cream cable sweater vest, white blouse, deep green bow and green plaid skirt',
      '成年女性奶油色麻花针织背心、白衬衫、深绿领结与绿色格纹裙',
      ['针织背心', '绿色', '格纹']
    ],
    [
      'top-academy-modern-cropped-blazer',
      'outfit',
      '短款西装百褶套装',
      '现代利落学院感',
      'adult womens cropped charcoal blazer with white camisole and ivory pleated skirt',
      '成年女性炭灰短款西装，搭配白色内搭与象牙白百褶裙',
      ['短西装', '现代', '百褶裙']
    ],
    [
      'top-sport-blush-badminton',
      'outfit',
      '樱粉羽毛球套装',
      '清甜运动感',
      'blush pink womens badminton polo and pleated sport skort, lightweight performance fabric',
      '樱粉色女性羽毛球Polo衫与百褶运动裙裤，轻量速干面料',
      ['羽毛球', '樱粉', '运动']
    ],
    [
      'top-sport-navy-gradient',
      'outfit',
      '海军渐变运动套装',
      '速度线动感',
      'navy womens performance polo and shorts with original coral blue gradient motion pattern',
      '海军蓝女性运动Polo衫与短裤，原创珊瑚蓝渐变速度纹样',
      ['运动', '渐变', '海军蓝']
    ],
    [
      'top-sport-mint-layered',
      'outfit',
      '薄荷分层运动套装',
      '轻盈清爽',
      'mint womens mesh sport tee with white layered skort and fitted safety shorts',
      '薄荷色女性网眼运动上衣，搭配白色分层裙裤与安全短裤',
      ['薄荷色', '网眼', '运动']
    ],
    [
      'top-sport-black-coral',
      'outfit',
      '黑珊瑚运动套装',
      '冷酷力量感',
      'black womens V-neck performance top and sport skort with subtle coral abstract print',
      '黑色女性V领运动上衣与裙裤，带克制珊瑚色抽象印花',
      ['黑色', '运动', '力量感']
    ],
    [
      'top-sweatshirt-ivory-bunny',
      'top',
      '奶油兔印花卫衣',
      '柔软甜酷',
      'oversized ivory sweatshirt with an original delicate floral bunny illustration',
      '宽松奶油色卫衣，搭配原创花卉小兔插画',
      ['卫衣', '小兔', '奶油色']
    ],
    [
      'top-sweatshirt-pink-cat',
      'top',
      '粉色猫咪卫衣',
      '温柔可爱',
      'oversized pastel pink sweatshirt with an original ribbon cat illustration',
      '宽松粉色卫衣，搭配原创蝴蝶结猫咪插画',
      ['卫衣', '猫咪', '粉色']
    ],
    [
      'top-sweatshirt-charcoal-moon-puppy',
      'top',
      '月夜小狗卫衣',
      '暗色梦幻',
      'oversized charcoal sweatshirt with an original puppy sleeping on a crescent moon illustration',
      '宽松炭黑卫衣，搭配原创弯月熟睡小狗插画',
      ['卫衣', '月夜', '小狗']
    ],
    [
      'top-sweatshirt-blue-travel-penguin',
      'top',
      '旅行企鹅卫衣',
      '清新趣味',
      'oversized sky-blue sweatshirt with an original traveling penguin and tiny suitcase illustration',
      '宽松天蓝色卫衣，搭配原创旅行企鹅与小行李箱插画',
      ['卫衣', '企鹅', '旅行']
    ],
    [
      'top-sweatshirt-lavender-music-poodle',
      'top',
      '音乐贵宾犬卫衣',
      '淡紫俏皮',
      'oversized lavender sweatshirt with an original headphone poodle illustration',
      '宽松淡紫色卫衣，搭配原创戴耳机贵宾犬插画',
      ['卫衣', '贵宾犬', '音乐']
    ],
    [
      'top-cami-heather-lounge-set',
      'outfit',
      '灰色罗纹吊带套装',
      '柔软居家感',
      'heather gray ribbed camisole with matching lounge shorts and lettuce-edge trim',
      '麻灰色罗纹吊带与同款居家短裤，带细腻木耳边',
      ['吊带', '居家', '罗纹']
    ],
    [
      'top-cami-white-square-neck-set',
      'outfit',
      '白色方领吊带套装',
      '极简清透',
      'white square-neck fitted camisole with matching soft lounge shorts',
      '白色方领修身吊带与同款柔软居家短裤',
      ['吊带', '白色', '极简']
    ],
    [
      'top-cami-pink-pinstripe-set',
      'outfit',
      '粉色条纹荷叶边套装',
      '甜美度假感',
      'pink pinstripe ruffle camisole with matching drawstring shorts, tasteful coverage',
      '粉色细条纹荷叶边吊带与抽绳短裤，覆盖得体',
      ['吊带', '条纹', '荷叶边']
    ],
    [
      'top-cami-blue-floral-set',
      'outfit',
      '蓝花棉质吊带套装',
      '清新田园感',
      'ivory cotton camisole and shorts with tiny original blue floral print',
      '象牙白棉质吊带与短裤，带原创蓝色小花印花',
      ['吊带', '碎花', '棉质']
    ],
    [
      'top-cami-black-satin-set',
      'outfit',
      '黑色缎面蕾丝套装',
      '精致夜间质感',
      'black satin camisole and shorts with refined scalloped lace trim, tasteful adult lounge styling',
      '黑色缎面吊带与短裤，搭配精致扇贝蕾丝边，成熟居家造型',
      ['吊带', '缎面', '蕾丝']
    ],
    [
      'top-dress-denim-mini-cami',
      'onePiece',
      '牛仔吊带短裙',
      '利落曲线剪裁',
      'washed denim mini camisole dress with vertical seam shaping and clean fitted silhouette',
      '水洗牛仔吊带短裙，纵向分割线塑形，修身轮廓干净',
      ['连衣裙', '牛仔', '修身']
    ],
    [
      'top-dress-powder-blue-tiered',
      'onePiece',
      '雾蓝分层吊带裙',
      '轻盈度假风',
      'powder-blue tiered camisole midi dress, airy soft fabric and relaxed feminine shape',
      '雾蓝色分层吊带中长裙，面料轻盈，轮廓柔和松弛',
      ['连衣裙', '雾蓝', '分层']
    ],
    [
      'top-dress-ivory-eyelet',
      'onePiece',
      '象牙白镂花吊带裙',
      '清新日光感',
      'ivory eyelet camisole midi dress with delicate perforated floral texture and tiered hem',
      '象牙白镂花吊带中长裙，细腻花卉孔眼纹理与分层裙摆',
      ['连衣裙', '镂花', '象牙白']
    ],
    [
      'top-dress-olive-open-back-satin',
      'onePiece',
      '橄榄绿露背缎面长裙',
      '克制晚宴感',
      'olive satin open-back camisole maxi dress with slim tie detail and fluid drape',
      '橄榄绿缎面露背吊带长裙，细系带与流动垂坠感',
      ['连衣裙', '缎面', '露背']
    ],
    [
      'bottom-navy-knife-pleated',
      'bottom',
      '海军蓝刀褶短裙',
      '干净学院轮廓',
      'navy knife-pleated mini skirt with structured waistband and crisp adult fashion styling',
      '海军蓝刀褶短裙，腰头结构清晰，成熟时装化处理',
      ['百褶裙', '海军蓝', '利落']
    ],
    [
      'bottom-charcoal-plaid-pleated',
      'bottom',
      '炭灰格纹百褶裙',
      '复古深色层次',
      'charcoal plaid pleated mini skirt with clean structured folds',
      '炭灰格纹百褶短裙，褶裥清晰，结构利落',
      ['百褶裙', '格纹', '炭灰']
    ],
    [
      'bottom-beige-tennis-skort',
      'bottom',
      '米色网球裙裤',
      '极简运动线条',
      'beige A-line tennis skort with subtle side pleat and secure inner shorts',
      '米色A字网球裙裤，侧边克制褶裥，带安全内衬短裤',
      ['裙裤', '网球', '米色']
    ],
    [
      'bottom-blush-badminton-skort',
      'bottom',
      '樱粉羽毛球裙裤',
      '轻甜活力',
      'blush pink badminton skort with white inset pleats and lightweight performance fabric',
      '樱粉色羽毛球裙裤，白色嵌入褶裥，轻量运动面料',
      ['裙裤', '羽毛球', '樱粉']
    ],
    [
      'bottom-navy-performance-shorts',
      'bottom',
      '海军蓝运动短裤',
      '专业速干感',
      'navy performance shorts with white piping, curved hem and drawstring waist',
      '海军蓝速干运动短裤，白色滚边、弧形裤脚与抽绳腰头',
      ['短裤', '运动', '海军蓝']
    ],
    [
      'bottom-mint-layered-skort',
      'bottom',
      '薄荷分层裙裤',
      '清爽流动感',
      'mint layered sport skort with flared overlay and fitted inner shorts',
      '薄荷色分层运动裙裤，外层轻盈展开，内置修身安全短裤',
      ['裙裤', '薄荷色', '分层']
    ],
    [
      'bottom-heather-lounge-shorts',
      'bottom',
      '麻灰居家短裤',
      '柔软松弛',
      'heather gray lounge shorts with ivory drawstring and softly curved side hem',
      '麻灰色居家短裤，象牙白抽绳与柔和弧形侧裤脚',
      ['短裤', '居家', '麻灰']
    ],
    [
      'bottom-pink-pinstripe-ruffle-shorts',
      'bottom',
      '粉条纹荷叶边短裤',
      '甜美居家感',
      'pink pinstripe lounge shorts with drawstring waist and delicate ruffle hem',
      '粉色细条纹居家短裤，抽绳腰头与细腻荷叶边裤脚',
      ['短裤', '条纹', '荷叶边']
    ],
    [
      'bottom-black-satin-lace-shorts',
      'bottom',
      '黑色缎面蕾丝短裤',
      '精致夜间质感',
      'black satin lounge shorts with refined scalloped lace hem and drawstring waist',
      '黑色缎面居家短裤，精致扇贝蕾丝裤脚与抽绳腰头',
      ['短裤', '缎面', '蕾丝']
    ]
  ] as const
).map(([id, slot, title, subtitle, prompt, promptZh, tags]) =>
  definePromptAsset({
    id,
    slot,
    title,
    subtitle,
    prompt,
    promptZh,
    tags: [...tags]
  })
);

const growthPromptAssets: ImagePromptAsset[] = [
  ...clothingExpansionAssets,
  ...emojiExpressionPromptAssets,
  ...emojiPosePromptAssets,
  definePromptAsset({
    id: 'expression-grinning-face',
    slot: 'expression',
    title: '露齿笑',
    subtitle: '高能开心',
    prompt:
      'character expression: 😁, broad grinning smile, bright eyes, cheerful confident mood',
    promptZh: '人物表情：😁，露齿灿笑，眼神明亮，开心而自信',
    tags: ['开心', '笑容', 'emoji']
  }),
  definePromptAsset({
    id: 'expression-beaming-smile',
    slot: 'expression',
    title: '眯眼大笑',
    subtitle: '亲和活力',
    prompt:
      'character expression: 😄, beaming smile with smiling eyes, warm approachable energy',
    promptZh: '人物表情：😄，眯眼大笑，亲和、温暖、有活力',
    tags: ['开心', '笑容', 'emoji']
  }),
  definePromptAsset({
    id: 'expression-joy-tears',
    slot: 'expression',
    title: '笑到流泪',
    subtitle: '夸张喜剧',
    prompt:
      'character expression: 😂, laughing with tears, playful comedic emotion, lively face',
    promptZh: '人物表情：😂，笑到流泪，喜剧感强，表情生动',
    tags: ['开心', '夸张', 'emoji']
  }),
  definePromptAsset({
    id: 'expression-smiling-eyes',
    slot: 'expression',
    title: '温柔微笑',
    subtitle: '治愈亲近',
    prompt:
      'character expression: 😊, gentle closed-mouth smile, soft eyes, tender healing mood',
    promptZh: '人物表情：😊，温柔微笑，眼神柔和，治愈亲近',
    tags: ['温柔', '笑容', 'emoji']
  }),
  definePromptAsset({
    id: 'expression-wink',
    slot: 'expression',
    title: '俏皮眨眼',
    subtitle: '轻松互动',
    prompt:
      'character expression: 😉, playful wink, relaxed smile, friendly interactive mood',
    promptZh: '人物表情：😉，俏皮眨眼，嘴角轻扬，轻松互动感',
    tags: ['俏皮', '互动', 'emoji']
  }),
  definePromptAsset({
    id: 'expression-heart-eyes',
    slot: 'expression',
    title: '迷恋欣喜',
    subtitle: '强烈喜欢',
    prompt:
      'facial expression only: soft wide eyes with bright natural catchlights, lifted cheeks and a delighted smile showing charming admiration; no heart-shaped pupils or symbols',
    promptZh:
      '仅改变面部表情：双眼柔和睁大并保留自然眼神光，双颊上提、欣喜微笑，呈现明显喜欢；不出现爱心瞳孔或符号',
    tags: ['甜感', '喜欢', '面部表情']
  }),
  definePromptAsset({
    id: 'expression-smirk',
    slot: 'expression',
    title: '得意坏笑',
    subtitle: '故事张力',
    prompt:
      'character expression: 😏, subtle smirk, confident mischievous eyes, story tension',
    promptZh: '人物表情：😏，轻微得意坏笑，眼神自信，有故事张力',
    tags: ['自信', '故事感', 'emoji']
  }),
  definePromptAsset({
    id: 'expression-thinking',
    slot: 'expression',
    title: '思考脸',
    subtitle: '疑问判断',
    prompt:
      'character expression: 🤔, thoughtful face, slightly raised brow, analytical mood',
    promptZh: '人物表情：🤔，思考脸，轻微挑眉，像正在判断问题',
    tags: ['思考', '疑问', 'emoji']
  }),
  definePromptAsset({
    id: 'expression-sunglasses',
    slot: 'expression',
    title: '酷感自信',
    subtitle: '潮流态度',
    prompt:
      'facial expression only: relaxed eyelids, steady direct gaze and firm calm mouth conveying cool confidence; no glasses or accessories',
    promptZh:
      '仅改变面部表情：眼皮放松、直视稳定、嘴角沉着，呈现酷感自信；不出现眼镜或其他配件',
    tags: ['酷感', '自信', '面部表情']
  }),
  definePromptAsset({
    id: 'expression-surprised',
    slot: 'expression',
    title: '惊讶张口',
    subtitle: '剧情转折',
    prompt:
      'character expression: 😮, surprised open mouth, widened eyes, clean dramatic reaction',
    promptZh: '人物表情：😮，惊讶张口，眼睛睁大，适合剧情转折',
    tags: ['惊讶', '剧情', 'emoji']
  }),
  definePromptAsset({
    id: 'expression-pleading',
    slot: 'expression',
    title: '委屈请求',
    subtitle: '湿润眼神',
    prompt:
      'character expression: 🥺, pleading eyes, soft pout, vulnerable but tasteful emotion',
    promptZh: '人物表情：🥺，委屈请求感，眼神湿润，情绪柔软克制',
    tags: ['委屈', '柔软', 'emoji']
  }),
  definePromptAsset({
    id: 'expression-crying',
    slot: 'expression',
    title: '轻微落泪',
    subtitle: '伤感情绪',
    prompt:
      'character expression: 😢, single tear, sad restrained emotion, cinematic subtlety',
    promptZh: '人物表情：😢，轻微落泪，伤感但克制，电影感情绪',
    tags: ['伤感', '克制', 'emoji']
  }),
  definePromptAsset({
    id: 'expression-angry',
    slot: 'expression',
    title: '生气皱眉',
    subtitle: '冲突情绪',
    prompt:
      'character expression: 😠, angry frown, focused eyes, controlled conflict emotion',
    promptZh: '人物表情：😠，生气皱眉，眼神集中，冲突情绪明确',
    tags: ['生气', '冲突', 'emoji']
  }),
  definePromptAsset({
    id: 'expression-sleepy',
    slot: 'expression',
    title: '困倦睡意',
    subtitle: '松弛日常',
    prompt:
      'character expression: 😴, sleepy relaxed face, calm eyelids, cozy quiet mood',
    promptZh: '人物表情：😴，困倦睡意，眼皮放松，安静日常感',
    tags: ['困倦', '日常', 'emoji']
  }),
  definePromptAsset({
    id: 'pose-victory-hand',
    slot: 'pose',
    title: '比耶手势',
    subtitle: '头像友好',
    prompt:
      'character pose: ✌️, one hand making a victory sign near the face, casual friendly body language',
    promptZh: '人物姿势：✌️，一只手在脸旁比耶，轻松亲和，适合头像构图',
    tags: ['手势', '站姿', 'emoji']
  }),
  definePromptAsset({
    id: 'pose-waving-hand',
    slot: 'pose',
    title: '挥手问候',
    subtitle: '互动开场',
    prompt:
      'character pose: 👋, one hand waving toward camera, open friendly greeting gesture',
    promptZh: '人物姿势：👋，面向镜头挥手问候，开放亲切的互动动作',
    tags: ['手势', '互动', 'emoji']
  }),
  definePromptAsset({
    id: 'pose-raised-hands',
    slot: 'pose',
    title: '双手欢呼',
    subtitle: '庆祝动作',
    prompt:
      'character pose: 🙌, both hands raised in celebration, energetic upright silhouette',
    promptZh: '人物姿势：🙌，双手上举欢呼，站姿有活力，轮廓清晰',
    tags: ['动态', '站姿', 'emoji']
  }),
  definePromptAsset({
    id: 'pose-salute',
    slot: 'pose',
    title: '敬礼动作',
    subtitle: '确认收到',
    prompt:
      'character pose: 🫡, neat salute gesture, upright posture, crisp confident attitude',
    promptZh: '人物姿势：🫡，干净敬礼动作，身体挺直，确认收到的姿态',
    tags: ['手势', '站姿', 'emoji']
  }),
  definePromptAsset({
    id: 'pose-shrug',
    slot: 'pose',
    title: '摊手耸肩',
    subtitle: '轻松无奈',
    prompt:
      'character pose: 🤷, shrugging with both hands slightly open, casual puzzled body language',
    promptZh: '人物姿势：🤷，双手轻微摊开并耸肩，轻松无奈的身体语言',
    tags: ['手势', '互动', 'emoji']
  }),
  definePromptAsset({
    id: 'pose-running',
    slot: 'pose',
    title: '奔跑姿态',
    subtitle: '速度动态',
    prompt:
      'character pose: 🏃, running stride, clear forward momentum, full-body action readable',
    promptZh: '人物姿势：🏃，奔跑步伐，身体向前推进，全身动作清晰',
    tags: ['动态', '行走', 'emoji']
  }),
  definePromptAsset({
    id: 'pose-dancer',
    slot: 'pose',
    title: '舞蹈旋转',
    subtitle: '优雅动态',
    prompt:
      'character pose: 💃, elegant dance turn, flowing arm line, graceful full-body motion',
    promptZh: '人物姿势：💃，舞蹈旋转动作，手臂线条流动，全身优雅动态',
    tags: ['动态', '优雅', 'emoji']
  }),
  definePromptAsset({
    id: 'pose-yoga',
    slot: 'pose',
    title: '冥想坐姿',
    subtitle: '平静中心',
    prompt:
      'character pose: 🧘, calm cross-legged meditation seat, both crossed legs and both hands resting on the knees fully visible, centered body balance, quiet mood; do not convert to kneeling',
    promptZh:
      '人物姿势：🧘，平静盘腿冥想坐姿，交叉的双腿与放在膝上的双手完整可见，身体重心居中，情绪安定；不得改成跪姿',
    tags: ['坐姿', '平静', 'emoji']
  }),
  definePromptAsset({
    id: 'pose-muscle-flex',
    slot: 'pose',
    title: '弯臂发力',
    subtitle: '自信力量',
    prompt:
      'character pose: 💪, one arm flexed with confident body angle, energetic but tasteful',
    promptZh: '人物姿势：💪，单臂弯曲发力，身体角度自信，活力但克制',
    tags: ['手势', '活力', 'emoji']
  }),
  definePromptAsset({
    id: 'pose-pointing-right',
    slot: 'pose',
    title: '指向旁边',
    subtitle: '引导信息',
    prompt:
      'character pose: 👉, one hand pointing to the side, clear directional gesture for poster layout',
    promptZh: '人物姿势：👉，一只手指向画面侧边，适合引导版面信息',
    tags: ['手势', '互动', 'emoji']
  }),
  definePromptAsset({
    id: 'visualEffect-subtle-double-exposure',
    slot: 'visualEffect',
    title: '轻微叠影',
    subtitle: '梦感残像',
    prompt:
      'subtle double exposure ghosting around the subject, slight offset afterimage, clean premium finish',
    promptZh: '轻微叠影，人物边缘有淡淡残像偏移，梦感增强但画面保持干净',
    tags: ['叠影', '氛围', '后期']
  }),
  definePromptAsset({
    id: 'visualEffect-speed-lines',
    slot: 'visualEffect',
    title: '速度线',
    subtitle: '动势强化',
    prompt:
      'controlled speed lines following the action direction, manga-inspired motion energy without clutter',
    promptZh: '沿动作方向加入克制速度线，强化动势，有漫画感但不杂乱',
    tags: ['动效', '速度', '后期']
  }),
  definePromptAsset({
    id: 'visualEffect-volumetric-haze',
    slot: 'visualEffect',
    title: '轻微体积雾',
    subtitle: '空间层次',
    prompt:
      'light volumetric haze in the air, visible depth layers, soft atmospheric diffusion',
    promptZh: '轻微体积雾，空气中有柔和雾化层次，增强空间深度',
    tags: ['雾化', '空间', '氛围']
  }),
  definePromptAsset({
    id: 'visualEffect-dramatic-depth',
    slot: 'visualEffect',
    title: '戏剧景深',
    subtitle: '主体突出',
    prompt:
      'dramatic shallow depth of field, strong subject separation, creamy background blur',
    promptZh: '戏剧化浅景深，主体和背景强分离，背景虚化柔顺',
    tags: ['景深', '主体', '镜头']
  }),
  definePromptAsset({
    id: 'visualEffect-rgb-split',
    slot: 'visualEffect',
    title: 'RGB 分离',
    subtitle: '数字故障',
    prompt:
      'subtle RGB color channel separation on high-contrast edges, controlled digital glitch accent',
    promptZh: '高反差边缘出现轻微 RGB 颜色分离，数字故障感克制',
    tags: ['故障', 'RGB', '后期']
  }),
  definePromptAsset({
    id: 'visualEffect-chromatic-aberration',
    slot: 'visualEffect',
    title: '色散边缘',
    subtitle: '镜头缺陷',
    prompt:
      'fine chromatic aberration at bright edges, premium lens imperfection, not overdone',
    promptZh: '亮边加入细腻色散，像高级镜头缺陷，不要过度夸张',
    tags: ['色散', '镜头', '后期']
  }),
  definePromptAsset({
    id: 'visualEffect-bloom-highlights',
    slot: 'visualEffect',
    title: '高光溢色',
    subtitle: '发光边缘',
    prompt:
      'soft blooming highlights, gentle glow spill from bright areas, cinematic highlight rolloff',
    promptZh: '高光轻微溢色，亮部有柔和发光边缘，电影感高光过渡',
    tags: ['高光', '发光', '后期']
  }),
  definePromptAsset({
    id: 'visualEffect-fine-film-grain',
    slot: 'visualEffect',
    title: '细腻颗粒',
    subtitle: '胶片质地',
    prompt:
      'fine film grain texture, analog surface feel, clean tonal consistency',
    promptZh: '细腻胶片颗粒，模拟胶片表面质感，色调仍然干净统一',
    tags: ['颗粒', '胶片', '质感']
  }),
  definePromptAsset({
    id: 'visualEffect-rain-streaks',
    slot: 'visualEffect',
    title: '雨痕前景',
    subtitle: '玻璃水迹',
    prompt:
      'rain streaks on foreground glass, wet reflective surface, moody rainy atmosphere without hiding the face',
    promptZh: '前景玻璃加入雨痕和水珠，湿润反光质感，阴雨氛围明显但不遮挡脸部',
    tags: ['雨景', '前景', '氛围']
  }),
  definePromptAsset({
    id: 'visualEffect-floating-dust',
    slot: 'visualEffect',
    title: '漂浮微尘',
    subtitle: '空气可见',
    prompt:
      'tiny floating dust particles visible in the light beam, subtle cinematic air texture',
    promptZh: '光束中有细小漂浮微尘，空气质感可见，电影感但保持克制',
    tags: ['微尘', '空间', '氛围']
  }),
  definePromptAsset({
    id: 'visualEffect-warm-light-leak',
    slot: 'visualEffect',
    title: '暖色漏光',
    subtitle: '胶片边缘',
    prompt:
      'warm light leak along one frame edge, analog film accident feeling, controlled premium glow',
    promptZh: '画面一侧加入暖色漏光，像胶片意外曝光，光晕高级且克制',
    tags: ['漏光', '胶片', '氛围']
  }),
  definePromptAsset({
    id: 'visualEffect-soft-vignette',
    slot: 'visualEffect',
    title: '柔和暗角',
    subtitle: '视线聚焦',
    prompt:
      'soft subtle vignette around the frame edges, guide attention toward the subject, natural tonal falloff',
    promptZh: '画面边缘加入柔和暗角，引导视线回到主体，自然影调衰减',
    tags: ['暗角', '聚焦', '后期']
  }),
  definePromptAsset({
    id: 'layoutDesign-glass-title-bottom',
    slot: 'layoutDesign',
    title: '玻璃角色名',
    subtitle: '底部大字',
    prompt:
      'layout design: add an oversized character name at the bottom, transparent glass typography, text integrated behind foreground depth cues',
    promptZh:
      '版式设计：画面底部加入超大角色名称，字体为透明玻璃质感，与前景景深关系融合',
    negativePrompt: 'random unreadable text, typo-heavy typography',
    negativePromptZh: '随机乱码文字，错别字过多的排版',
    tags: ['标题', '玻璃', '海报']
  }),
  definePromptAsset({
    id: 'layoutDesign-japanese-handwritten-notes',
    slot: 'layoutDesign',
    title: '日系手写注释',
    subtitle: '边缘装饰',
    prompt:
      'layout design: add small Japanese-inspired handwritten English notes around the poster edges, airy annotation rhythm, no clutter',
    promptZh: '版式设计：海报四周加入日系手写英文小注释，空气感分布，不要拥挤',
    negativePrompt: 'dense messy text blocks, illegible wall of text',
    negativePromptZh: '密集混乱文字块，不可读的大段文字',
    tags: ['注释', '手写', '边框']
  }),
  definePromptAsset({
    id: 'layoutDesign-character-profile',
    slot: 'layoutDesign',
    title: '角色档案栏',
    subtitle: '称号阵营',
    prompt:
      'layout design: add a clean character profile information band with title, faction, codename, and small setting labels',
    promptZh:
      '版式设计：加入干净的角色档案信息栏，包含人物称号、阵营、代号、小型设定标签',
    negativePrompt: 'busy UI dashboard, cheap game menu',
    negativePromptZh: '廉价游戏菜单感，杂乱 UI 仪表盘',
    tags: ['档案', '信息', '角色']
  }),
  definePromptAsset({
    id: 'layoutDesign-worldview-tags',
    slot: 'layoutDesign',
    title: '世界观标签',
    subtitle: '设定文字',
    prompt:
      'layout design: add compact worldview tags, mysterious symbols, small lore captions, arranged as a readable poster system',
    promptZh:
      '版式设计：加入世界观标签、神秘符号、小型设定文字，形成可读的海报信息系统',
    negativePrompt: 'unrelated logo, watermark, random symbols overload',
    negativePromptZh: '无关 logo，水印，随机符号过载',
    tags: ['世界观', '符号', '设定']
  }),
  definePromptAsset({
    id: 'layoutDesign-magazine-cover-grid',
    slot: 'layoutDesign',
    title: '杂志封面栅格',
    subtitle: '主副标题',
    prompt:
      'layout design: premium magazine cover grid, large masthead, secondary cover lines, disciplined margins and reading hierarchy',
    promptZh:
      '版式设计：高级杂志封面栅格，大刊头、副标题线、边距系统和阅读层级清晰',
    negativePrompt: 'template clutter, poor alignment',
    negativePromptZh: '模板感杂乱，对齐混乱',
    tags: ['封面', '栅格', '标题']
  }),
  definePromptAsset({
    id: 'layoutDesign-ecommerce-kv',
    slot: 'layoutDesign',
    title: '电商 KV',
    subtitle: '卖点层级',
    prompt:
      'layout design: commercial key visual with product-style headline hierarchy, offer badge, clean feature callouts, high conversion layout',
    promptZh:
      '版式设计：商业 KV，产品式标题层级、优惠角标、干净卖点 callout，高转化布局',
    negativePrompt: 'cheap sale template, excessive stickers',
    negativePromptZh: '廉价促销模板，过多贴纸',
    tags: ['电商', '卖点', 'KV']
  }),
  definePromptAsset({
    id: 'layoutDesign-negative-space-poster',
    slot: 'layoutDesign',
    title: '留白海报',
    subtitle: '呼吸感',
    prompt:
      'layout design: generous negative space poster, off-center subject, small caption cluster, restrained premium editorial rhythm',
    promptZh:
      '版式设计：大面积留白海报，主体偏心，小型说明文字簇，克制高级的编辑节奏',
    negativePrompt: 'filled every corner, no breathing room',
    negativePromptZh: '填满每个角落，没有呼吸感',
    tags: ['留白', '海报', '编辑']
  }),
  definePromptAsset({
    id: 'layoutDesign-sticker-label-system',
    slot: 'layoutDesign',
    title: '标签贴纸系统',
    subtitle: '可读装饰',
    prompt:
      'layout design: controlled sticker label system, small readable labels, arrows, thin rules, and modular visual notes',
    promptZh:
      '版式设计：克制的标签贴纸系统，小型可读标签、箭头、细线和模块化视觉注释',
    negativePrompt: 'overcrowded stickers, noisy labels',
    negativePromptZh: '贴纸过密，标签噪音过大',
    tags: ['标签', '贴纸', '注释']
  }),
  definePromptAsset({
    id: 'accessory-pearl-earrings',
    slot: 'accessory',
    title: '珍珠耳环',
    subtitle: '温柔点缀',
    prompt:
      'small pearl earrings, refined soft shine, elegant feminine detail without overpowering the face',
    promptZh: '小颗珍珠耳环，光泽柔和精致，优雅点缀但不抢脸部',
    tags: ['耳环', '珍珠', '优雅']
  }),
  definePromptAsset({
    id: 'accessory-clear-glasses',
    slot: 'accessory',
    title: '透明眼镜',
    subtitle: '知性干净',
    prompt:
      'transparent frame glasses, clean intellectual detail, subtle reflection, lightweight styling',
    promptZh: '透明框眼镜，知性干净，轻微反光，造型轻盈',
    tags: ['眼镜', '知性', '轻盈']
  }),
  definePromptAsset({
    id: 'accessory-silk-scarf',
    slot: 'accessory',
    title: '丝巾',
    subtitle: '法式色点',
    prompt:
      'small silk scarf tied near the neck or hair, refined color accent, soft fabric movement',
    promptZh: '小丝巾系在颈部或发间，作为精致色彩点缀，面料轻柔',
    tags: ['围巾', '优雅', '色点']
  }),
  definePromptAsset({
    id: 'accessory-mini-shoulder-bag',
    slot: 'accessory',
    title: '迷你肩包',
    subtitle: '通勤细节',
    prompt:
      'mini shoulder bag with clean leather texture, compact silhouette, daily commuter styling',
    promptZh: '迷你肩包，皮革质感干净，轮廓小巧，日常通勤细节',
    tags: ['手包', '通勤', '皮革']
  }),
  definePromptAsset({
    id: 'accessory-red-hair-ribbon',
    slot: 'accessory',
    title: '红色发带',
    subtitle: '角色记忆点',
    prompt:
      'deep red ribbon tied into the hair, clean bow shape, memorable character color accent',
    promptZh: '深红色发带系在头发上，蝴蝶结形态干净，形成角色记忆点',
    tags: ['发饰', '色点', '角色']
  }),
  definePromptAsset({
    id: 'accessory-silver-pendant',
    slot: 'accessory',
    title: '银色吊坠',
    subtitle: '颈部高光',
    prompt:
      'delicate silver pendant necklace, small reflective highlight near the collarbone, refined detail',
    promptZh: '精致银色吊坠项链，在锁骨附近形成小高光，细节克制高级',
    tags: ['项链', '银色', '精致']
  }),
  definePromptAsset({
    id: 'accessory-black-beret',
    slot: 'accessory',
    title: '黑色贝雷帽',
    subtitle: '法式轮廓',
    prompt:
      'black beret with clean soft silhouette, French editorial styling, balanced with the hairstyle',
    promptZh: '黑色贝雷帽，柔和干净的帽型，法式编辑感，与发型比例协调',
    tags: ['帽子', '法式', '轮廓']
  }),
  definePromptAsset({
    id: 'accessory-slim-leather-belt',
    slot: 'accessory',
    title: '细皮带',
    subtitle: '腰线收束',
    prompt:
      'slim leather belt defining the waistline, small polished buckle, clean wardrobe structure',
    promptZh: '细皮带明确腰线，小型金属扣有干净高光，强化服装结构',
    tags: ['腰带', '皮革', '结构']
  }),
  definePromptAsset({
    id: 'prop-coffee-cup',
    slot: 'prop',
    title: '咖啡杯',
    subtitle: '生活抓拍',
    prompt:
      'simple takeaway coffee cup held naturally in one hand, lifestyle snapshot detail',
    promptZh: '一只简洁外带咖啡杯，自然拿在手中，生活方式抓拍细节',
    tags: ['饮品', '日常', '手中物']
  }),
  definePromptAsset({
    id: 'prop-open-book',
    slot: 'prop',
    title: '摊开的书',
    subtitle: '安静叙事',
    prompt:
      'open book held or placed near the subject, quiet intellectual storytelling prop',
    promptZh: '一本摊开的书，可手持或放在人物身旁，安静知性的叙事道具',
    tags: ['书', '知性', '叙事']
  }),
  definePromptAsset({
    id: 'prop-flower-bouquet',
    slot: 'prop',
    title: '小花束',
    subtitle: '柔和浪漫',
    prompt:
      'small bouquet of pale flowers, soft romantic hand-held prop, not blocking the face',
    promptZh: '一束浅色小花，柔和浪漫的手持道具，不遮挡脸部',
    tags: ['花', '浪漫', '手中物']
  }),
  definePromptAsset({
    id: 'prop-compact-camera',
    slot: 'prop',
    title: '小相机',
    subtitle: '旅行记录',
    prompt:
      'compact camera held casually, travel documentary mood, clean lifestyle detail',
    promptZh: '小型相机自然手持，旅行记录感，干净的生活方式细节',
    tags: ['相机', '旅行', '手中物']
  }),
  definePromptAsset({
    id: 'prop-smartphone',
    slot: 'prop',
    title: '智能手机',
    subtitle: '现代互动',
    prompt:
      'smartphone held naturally in one hand, modern casual interaction cue, screen not dominant',
    promptZh: '一只手自然拿着智能手机，现代互动情境明确，屏幕不要喧宾夺主',
    tags: ['设备', '现代', '手中物']
  }),
  definePromptAsset({
    id: 'prop-transparent-umbrella',
    slot: 'prop',
    title: '透明雨伞',
    subtitle: '雨天叙事',
    prompt:
      'transparent umbrella held above the subject, visible raindrops, soft rainy story atmosphere',
    promptZh: '透明雨伞撑在人物上方，伞面可见雨滴，形成柔和雨天叙事',
    tags: ['雨伞', '雨景', '手中物']
  }),
  definePromptAsset({
    id: 'prop-white-headphones',
    slot: 'prop',
    title: '白色耳机',
    subtitle: '音乐生活感',
    prompt:
      'white headphones worn or held casually, clean music lifestyle prop, rounded modern shape',
    promptZh: '白色耳机可佩戴或自然手持，干净的音乐生活方式道具，现代圆润造型',
    tags: ['耳机', '音乐', '设备']
  }),
  definePromptAsset({
    id: 'prop-vintage-microphone',
    slot: 'prop',
    title: '复古麦克风',
    subtitle: '舞台叙事',
    prompt:
      'vintage microphone held near the subject, polished metal texture, subtle performance-story cue',
    promptZh: '复古麦克风靠近人物，金属质感干净，带轻微舞台表演叙事',
    tags: ['麦克风', '舞台', '金属']
  }),
  definePromptAsset({
    id: 'top-black-turtleneck',
    slot: 'top',
    title: '黑色高领衫',
    subtitle: '极简收束',
    prompt:
      'minimal black fitted turtleneck top, clean neckline, understated modern silhouette',
    promptZh: '极简黑色修身高领上装，领口干净，现代感轮廓克制',
    tags: ['极简', '黑色', '针织']
  }),
  definePromptAsset({
    id: 'bottom-plaid-mini-skirt',
    slot: 'bottom',
    title: '格纹短裙',
    subtitle: '学院甜感',
    prompt:
      'plaid mini skirt with neat pleats, school-inspired styling, crisp fabric structure',
    promptZh: '格纹百褶短裙，学院风造型，面料结构清晰利落',
    tags: ['学院', '格纹', '短裙']
  }),
  definePromptAsset({
    id: 'shoes-red-mary-jane',
    slot: 'shoes',
    title: '红色玛丽珍',
    subtitle: '角色色点',
    prompt:
      'deep red mary jane shoes with polished leather, small heel, strong character color accent',
    promptZh: '深红色玛丽珍鞋，皮革光泽，小跟，形成明确角色色点',
    tags: ['复古', '红色', '皮鞋']
  }),
  definePromptAsset({
    id: 'background-rainy-window',
    slot: 'background',
    title: '雨夜窗边',
    subtitle: '湿润反光',
    prompt:
      'rainy window-side interior with visible raindrops on glass, cool reflections, quiet intimate mood',
    promptZh: '雨夜窗边室内场景，玻璃上有雨滴，冷色反光，安静私密氛围',
    tags: ['雨景', '室内', '氛围']
  }),
  definePromptAsset({
    id: 'background-neon-alley',
    slot: 'background',
    title: '霓虹巷口',
    subtitle: '夜景赛博',
    prompt:
      'clean neon alley at night, wet pavement reflections, cinematic urban depth',
    promptZh: '干净的夜晚霓虹巷口，湿润地面反光，城市空间有电影纵深',
    tags: ['夜景', '城市', '霓虹']
  }),
  definePromptAsset({
    id: 'background-train-platform',
    slot: 'background',
    title: '车站站台',
    subtitle: '旅途叙事',
    prompt:
      'quiet train platform with soft overhead lights, travel-story atmosphere, clean spatial lines',
    promptZh: '安静车站站台，顶灯柔和，带旅途叙事感，空间线条干净',
    tags: ['车站', '旅行', '空间']
  }),
  definePromptAsset({
    id: 'background-recording-studio',
    slot: 'background',
    title: '录音棚',
    subtitle: '音乐场景',
    prompt:
      'cozy recording studio background, acoustic panels, warm practical lights, music-production mood',
    promptZh: '舒适录音棚背景，吸音板和暖色实用灯，音乐制作氛围',
    tags: ['室内', '音乐', '暖光']
  }),
  definePromptAsset({
    id: 'lens-disposable-flash',
    slot: 'lens',
    title: '一次性闪光',
    subtitle: '胶片抓拍',
    prompt:
      'disposable camera flash feel, direct frontal flash, candid film snapshot texture',
    promptZh: '一次性相机闪光感，正面直闪，胶片抓拍质地明显',
    tags: ['胶片', '闪光', '抓拍']
  }),
  definePromptAsset({
    id: 'lens-fisheye-street',
    slot: 'lens',
    title: '鱼眼街拍',
    subtitle: '近距张力',
    prompt:
      'subtle fisheye street lens feel, close wide perspective, playful spatial distortion',
    promptZh: '轻微鱼眼街拍镜头感，近距离广角透视，空间变形有趣但克制',
    tags: ['鱼眼', '街拍', '广角']
  }),
  definePromptAsset({
    id: 'lens-vintage-film',
    slot: 'lens',
    title: '复古胶片镜',
    subtitle: '柔和年代感',
    prompt:
      'vintage film lens character, soft contrast, gentle halation, analog portrait mood',
    promptZh: '复古胶片镜头特性，对比柔和，轻微卤化光晕，模拟人像氛围',
    tags: ['胶片', '复古', '柔和']
  }),
  definePromptAsset({
    id: 'shot-over-shoulder',
    slot: 'shot',
    title: '越肩视角',
    subtitle: '同一人物回望',
    prompt:
      "single-subject over-the-shoulder framing from immediately behind the woman's own near shoulder, the same woman's turned face remains readable, no second person",
    promptZh:
      '单人越肩视角，相机紧贴同一位女性自己的近侧肩后方，她回望镜头且脸部清晰，不出现第二个人',
    tags: ['越肩', '叙事', '前景']
  }),
  definePromptAsset({
    id: 'shot-profile-closeup',
    slot: 'shot',
    title: '侧脸近景',
    subtitle: '轮廓优先',
    prompt:
      'profile close-up framing, clean side facial silhouette, calm portrait tension',
    promptZh: '侧脸近景构图，侧面脸部轮廓干净，安静但有张力',
    tags: ['侧脸', '近景', '轮廓']
  }),
  definePromptAsset({
    id: 'shot-dutch-angle',
    slot: 'shot',
    title: '倾斜机位',
    subtitle: '不稳定张力',
    prompt:
      'subtle dutch angle framing, controlled visual tension, dynamic diagonal composition',
    promptZh: '轻微倾斜机位，带克制的不稳定张力，形成动态对角构图',
    tags: ['倾斜', '动态', '电影感']
  }),
  definePromptAsset({
    id: 'makeup-peach-blush',
    slot: 'makeup',
    title: '蜜桃腮红',
    subtitle: '亲和气色',
    prompt:
      'peach blush makeup, soft warm cheeks, fresh approachable complexion',
    promptZh: '蜜桃腮红妆，脸颊柔和暖色，气色清新亲和',
    tags: ['腮红', '清新', '暖色']
  }),
  definePromptAsset({
    id: 'makeup-smoky-eyeliner',
    slot: 'makeup',
    title: '烟熏眼线',
    subtitle: '冷感锐利',
    prompt:
      'soft smoky eyeliner makeup, defined eyes, cool sharp beauty mood without harshness',
    promptZh: '柔和烟熏眼线妆，眼部轮廓清晰，冷感锐利但不过硬',
    tags: ['眼线', '冷感', '锐利']
  }),
  definePromptAsset({
    id: 'makeup-dewy-gloss',
    slot: 'makeup',
    title: '水光唇妆',
    subtitle: '通透湿润',
    prompt:
      'dewy glossy makeup, hydrated skin highlights, translucent lip gloss, clean beauty finish',
    promptZh: '水光妆面，肤质高光湿润，透明唇釉，干净美妆完成度',
    tags: ['水光', '唇妆', '通透']
  }),
  definePromptAsset({
    id: 'composition-rule-of-thirds-portrait',
    slot: 'composition',
    title: '三分法人像',
    subtitle: '自然视觉平衡',
    prompt:
      'rule-of-thirds portrait composition, subject placed on an intersection point, balanced environmental context',
    promptZh: '三分法人像构图，人物落在视觉交点，环境与主体自然平衡',
    tags: ['三分法', '人像', '平衡']
  }),
  definePromptAsset({
    id: 'composition-centered-symmetry',
    slot: 'composition',
    title: '中心对称',
    subtitle: '稳定高级秩序',
    prompt:
      'centered symmetrical portrait composition, strong visual axis, calm premium order',
    promptZh: '中心对称人像构图，视觉轴线明确，稳定而高级',
    tags: ['中心', '对称', '秩序']
  }),
  definePromptAsset({
    id: 'composition-diagonal-motion',
    slot: 'composition',
    title: '对角线动势',
    subtitle: '动态叙事张力',
    prompt:
      'diagonal portrait composition, body and environment creating a clear dynamic visual path',
    promptZh: '对角线人像构图，身体与环境形成清晰动态路径',
    tags: ['对角线', '动态', '叙事']
  }),
  definePromptAsset({
    id: 'composition-frame-within-frame',
    slot: 'composition',
    title: '框中框',
    subtitle: '空间层次聚焦',
    prompt:
      'frame-within-frame portrait composition using doorway or foreground structure to focus the subject',
    promptZh: '框中框人像构图，利用门框或前景结构聚焦人物',
    tags: ['框景', '层次', '聚焦']
  }),
  definePromptAsset({
    id: 'composition-negative-space-copy',
    slot: 'composition',
    title: '大留白构图',
    subtitle: '侧置视觉配重',
    prompt:
      'portrait composition with the subject on one side and calm negative space counterbalancing the frame',
    promptZh: '人物位于画面一侧，平静负空间在另一侧形成视觉配重',
    tags: ['留白', '配重', '空间关系']
  }),
  definePromptAsset({
    id: 'composition-golden-spiral',
    slot: 'composition',
    title: '黄金螺旋',
    subtitle: '柔和视线引导',
    prompt:
      'golden spiral portrait composition, face at the visual focal curl, gentle guided viewing path',
    promptZh: '黄金螺旋人像构图，脸部位于视觉焦点，视线引导柔和',
    tags: ['黄金螺旋', '焦点', '引导']
  }),
  definePromptAsset({
    id: 'composition-triangular-fashion',
    slot: 'composition',
    title: '三角形构图',
    subtitle: '时装姿态稳定',
    prompt:
      'triangular fashion portrait composition formed by the head, shoulders and neutral torso silhouette, with the arms and pose unchanged',
    promptZh: '由头肩与手臂形成三角形时装构图，轮廓稳定有编辑感',
    tags: ['三角形', '时装', '稳定']
  }),
  definePromptAsset({
    id: 'lens-24mm-environmental',
    slot: 'lens',
    title: '24mm 环境广角',
    subtitle: '空间纵深明显',
    prompt:
      '24mm environmental portrait lens feel, immersive wide perspective, controlled edge distortion',
    promptZh: '24mm 环境人像广角，空间沉浸感强，边缘畸变保持克制',
    tags: ['24mm', '广角', '环境']
  }),
  definePromptAsset({
    id: 'lens-135mm-telephoto',
    slot: 'lens',
    title: '135mm 长焦',
    subtitle: '背景强压缩',
    prompt:
      '135mm telephoto portrait feel, strong background compression, elegant subject isolation',
    promptZh: '135mm 长焦人像感，背景压缩明显，人物分离优雅',
    tags: ['135mm', '长焦', '压缩']
  }),
  definePromptAsset({
    id: 'lens-macro-beauty',
    slot: 'lens',
    title: '微距美妆镜头',
    subtitle: '妆面细节清晰',
    prompt:
      'macro beauty lens rendering, crisp eye and lip detail, controlled shallow focus',
    promptZh: '微距美妆镜头质感，眼妆与唇妆细节清晰，浅景深克制',
    tags: ['微距', '美妆', '细节']
  }),
  definePromptAsset({
    id: 'lens-soft-focus-dream',
    slot: 'lens',
    title: '柔焦梦幻镜',
    subtitle: '柔光轻雾质感',
    prompt:
      'soft-focus portrait lens, gentle highlight bloom, dreamy low-contrast diffusion without blur',
    promptZh: '柔焦人像镜头，高光轻微泛光，梦幻低反差但主体不糊',
    tags: ['柔焦', '梦幻', '泛光']
  }),
  definePromptAsset({
    id: 'shot-extreme-eye-closeup',
    slot: 'shot',
    title: '眼部极特写',
    subtitle: '情绪与妆面细节',
    prompt:
      'extreme close-up framing around the eyes, precise gaze and makeup detail as the focus',
    promptZh: '眼部极特写景别，眼神与妆面细节成为视觉核心',
    tags: ['极特写', '眼部', '妆面']
  }),
  definePromptAsset({
    id: 'shot-cowboy-three-quarter',
    slot: 'shot',
    title: '七分身景别',
    subtitle: '姿态服装兼顾',
    prompt:
      'three-quarter cowboy portrait framing from head to mid-thigh, balanced pose and outfit readability',
    promptZh: '从头到大腿中部的七分身景别，姿态与服装信息兼顾',
    tags: ['七分身', '服装', '姿态']
  }),
  definePromptAsset({
    id: 'shot-top-down-portrait',
    slot: 'shot',
    title: '俯拍人像',
    subtitle: '轻盈亲近视角',
    prompt:
      'top-down portrait framing, subject looking upward, clean flattering perspective',
    promptZh: '俯拍人像景别，人物抬眼看向镜头，透视干净亲近',
    tags: ['俯拍', '视角', '人像']
  }),
  definePromptAsset({
    id: 'shot-wide-environmental',
    slot: 'shot',
    title: '远景环境人像',
    subtitle: '人物融入场景',
    prompt:
      'wide environmental portrait shot, full scene context dominant while the person remains readable',
    promptZh: '远景环境人像，场景语境占主导，同时人物仍清晰可辨',
    tags: ['远景', '环境', '叙事']
  }),
  definePromptAsset({
    id: 'makeup-korean-glass-skin',
    slot: 'makeup',
    title: '韩系水光妆',
    subtitle: '清透发光肤质',
    prompt:
      'Korean glass-skin makeup, luminous hydrated complexion, softly defined brows and glossy neutral lips',
    promptZh: '韩系水光妆，肤质清透发光，柔和眉形与中性水润唇',
    tags: ['韩系', '水光肌', '清透']
  }),
  definePromptAsset({
    id: 'makeup-douyin-glam',
    slot: 'makeup',
    title: '氛围感上镜妆',
    subtitle: '轮廓精致吸睛',
    prompt:
      'camera-ready glam makeup, refined contour, defined lashes, glossy gradient lips, tasteful social portrait finish',
    promptZh: '氛围感上镜妆，轮廓精致，睫毛清晰，渐变水润唇，吸睛但克制',
    tags: ['上镜', '氛围感', '精致']
  }),
  definePromptAsset({
    id: 'makeup-sunkissed-freckles',
    slot: 'makeup',
    title: '日晒雀斑妆',
    subtitle: '自然度假气色',
    prompt:
      'sun-kissed freckle makeup, warm bronzed cheeks, natural freckles, healthy vacation glow',
    promptZh: '日晒雀斑妆，暖调古铜脸颊，自然雀斑与健康度假光泽',
    tags: ['雀斑', '日晒', '度假']
  }),
  definePromptAsset({
    id: 'makeup-editorial-metallic',
    slot: 'makeup',
    title: '金属编辑妆',
    subtitle: '秀场未来质感',
    prompt:
      'editorial metallic eye makeup, controlled silver accent, sculpted clean skin, runway beauty finish',
    promptZh: '金属编辑妆，克制银色眼妆点缀，干净立体肤质，秀场完成度',
    tags: ['金属', '编辑妆', '秀场']
  }),
  definePromptAsset({
    id: 'lens-35mm-documentary',
    slot: 'lens',
    title: '35mm 纪实',
    subtitle: '空间真实',
    prompt:
      '35mm documentary lens feel, moderate wide perspective, natural environmental context',
    promptZh: '35mm 纪实镜头感，中等广角透视，保留自然环境语境',
    tags: ['35mm', '纪实', '空间']
  }),
  definePromptAsset({
    id: 'lens-85mm-portrait',
    slot: 'lens',
    title: '85mm 人像',
    subtitle: '压缩虚化',
    prompt:
      '85mm portrait lens feel, flattering compression, creamy shallow depth of field',
    promptZh: '85mm 人像镜头感，透视压缩漂亮，浅景深虚化柔顺',
    tags: ['85mm', '人像', '虚化']
  }),
  definePromptAsset({
    id: 'lens-anamorphic-cinematic',
    slot: 'lens',
    title: '变形宽银幕',
    subtitle: '电影横向',
    prompt:
      'anamorphic cinematic lens character, horizontal flare hint, widescreen spatial feeling',
    promptZh: '电影变形宽银幕镜头感，轻微横向光晕，空间更具电影性',
    tags: ['电影变形宽', '电影感', '横向']
  }),
  definePromptAsset({
    id: 'lens-phone-selfie',
    slot: 'lens',
    title: '手机自拍',
    subtitle: '近距离真实',
    prompt:
      'phone selfie lens feel, close conversational distance, slight wide-angle intimacy',
    promptZh: '手机自拍镜头感，近距离对话感，轻微广角亲近感',
    tags: ['手机自拍', '近景', '真实']
  }),
  definePromptAsset({
    id: 'shot-face-closeup',
    slot: 'shot',
    title: '面部特写',
    subtitle: '表情优先',
    prompt:
      'face close-up framing, eyes and expression as the primary visual focus, clean crop',
    promptZh: '面部特写景别，眼神和表情是第一视觉焦点，裁切干净',
    tags: ['特写', '面部', '表情']
  }),
  definePromptAsset({
    id: 'shot-half-body',
    slot: 'shot',
    title: '半身人像',
    subtitle: '头像封面',
    prompt:
      'half-body portrait framing from head to waist, readable face and outfit balance',
    promptZh: '半身人像景别，从头到腰，脸部和服装比例平衡可读',
    tags: ['半身', '封面', '人像']
  }),
  definePromptAsset({
    id: 'shot-full-body',
    slot: 'shot',
    title: '全身构图',
    subtitle: '造型完整',
    prompt:
      'full-body framing with complete silhouette visible, enough margin around the body',
    promptZh: '全身构图，完整身体轮廓可见，四周留出足够边距',
    tags: ['全身', '造型', '留白']
  }),
  definePromptAsset({
    id: 'shot-low-angle-hero',
    slot: 'shot',
    title: '低机位英雄',
    subtitle: '气场增强',
    prompt:
      'subtle low-angle hero framing, stronger presence, legs and posture elongated tastefully',
    promptZh: '轻微低机位英雄构图，气场更强，身形被克制拉长',
    tags: ['低机位', '气场', '全身']
  }),
  definePromptAsset({
    id: 'makeup-natural-clean',
    slot: 'makeup',
    title: '自然淡妆',
    subtitle: '干净肤质',
    prompt:
      'natural clean makeup, translucent skin texture, soft brows, muted lip color',
    promptZh: '自然淡妆，肤质通透，眉形柔和，唇色低饱和',
    tags: ['自然淡妆', '干净', '肤质']
  }),
  definePromptAsset({
    id: 'makeup-red-lip-glam',
    slot: 'makeup',
    title: '红唇浓妆',
    subtitle: '明艳吸睛',
    prompt:
      'bold red lip makeup, defined eyeliner, polished glamorous beauty look',
    promptZh: '红唇明艳妆，眼线清晰，精修商业美妆质感',
    tags: ['明艳浓妆', '红唇', '商业']
  }),
  definePromptAsset({
    id: 'makeup-cool-nude',
    slot: 'makeup',
    title: '清冷裸妆',
    subtitle: '低饱和',
    prompt:
      'cool nude makeup, low-saturation tones, clean matte skin, restrained refined mood',
    promptZh: '清冷裸妆，低饱和色调，干净哑光肤质，克制高级',
    tags: ['清冷裸妆', '低饱和', '高级']
  }),
  definePromptAsset({
    id: 'makeup-oriental-classic',
    slot: 'makeup',
    title: '东方古典妆',
    subtitle: '眉眼韵味',
    prompt:
      'classic oriental makeup, refined brows, softly defined eye shape, elegant red-brown lip',
    promptZh: '东方古典妆，眉形精致，眼型柔和勾勒，红棕唇色优雅',
    tags: ['古典东方妆', '眉眼', '东方']
  })
];

const baseImagePromptAssets: ImagePromptAsset[] = [
  {
    id: 'character-violet-anime-girl',
    slot: 'character',
    title: '紫发少女',
    subtitle: '二次元头像稳定',
    prompt:
      'an elegant anime girl with long violet hair, soft confident expression, clean character design',
    promptZh: '气质优雅的二次元少女，紫色长发，神情柔和而自信，干净的角色设计',
    negativePrompt: 'deformed face, inconsistent eyes',
    negativePromptZh: '面部变形，眼神不一致',
    tags: ['女性', '二次元', '角色'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/character/character-violet-anime-girl.webp',
      import.meta.url
    ).href,
    visual: { tone: '#f2ecff', accent: '#7c5cff', shape: 'portrait' }
  },
  {
    id: 'character-black-hair-boy',
    slot: 'character',
    title: '黑发休闲人物',
    subtitle: '中性外套',
    prompt:
      'an original relaxed casual young adult with short dark hair, black hoodie and dark jacket, modern neutral character design',
    promptZh: '原创休闲黑发人物，黑色连帽衫和深色外套，中性现代角色设计',
    negativePrompt: 'copied character, existing IP likeness, aged face',
    negativePromptZh: '照搬已有角色，已有 IP 相似脸，面孔老态',
    tags: ['人物', '休闲', '现代'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/character/character-black-hair-boy.webp',
      import.meta.url
    ).href,
    visual: { tone: '#e9eef7', accent: '#27354a', shape: 'portrait' }
  },
  {
    id: 'character-refined-model',
    slot: 'character',
    title: '时装模特',
    subtitle: '商业成片主体',
    prompt:
      'a poised fashion model, refined facial features, editorial posture, premium commercial look',
    promptZh: '气场沉稳的时装模特，五官精致，杂志感站姿，高级商业影像质感',
    negativePrompt: 'uncanny face, distorted body',
    negativePromptZh: '怪异面孔，身形扭曲',
    tags: ['写实', '时装', '商业'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/character/character-refined-model.webp',
      import.meta.url
    ).href,
    visual: { tone: '#f6eee8', accent: '#a45d44', shape: 'portrait' }
  },
  {
    id: 'character-soft-elf-girl',
    slot: 'character',
    title: '柔和精灵少女',
    subtitle: '幻想角色',
    prompt:
      'a soft fantasy elf girl with delicate features, calm expression, refined ethereal character design',
    promptZh: '柔和奇幻风的精灵少女，五官细腻，神情宁静，空灵精致的角色设计',
    tags: ['幻想', '女性', '角色'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/character/character-soft-elf-girl.webp',
      import.meta.url
    ).href,
    visual: { tone: '#eef5e8', accent: '#809e72', shape: 'portrait' }
  },
  {
    id: 'pose-relaxed-standing',
    slot: 'pose',
    title: '松弛站姿',
    subtitle: '自然重心转移',
    prompt:
      'relaxed standing pose, weight shifted naturally to one leg, arms resting loosely',
    promptZh: '松弛站姿，重心自然落在一条腿上，双臂放松',
    tags: ['站姿', '松弛', '重心'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/pose/pose-relaxed-standing.webp',
      import.meta.url
    ).href,
    visual: { tone: '#eef7fb', accent: '#54a7bd', shape: 'pose' }
  },
  {
    id: 'pose-hand-near-face',
    slot: 'pose',
    title: '手靠近脸',
    subtitle: '轻触面部关系',
    prompt:
      'one hand resting gently near the cheek without covering the face, other arm relaxed',
    promptZh: '一只手轻靠近脸颊但不遮挡面部，另一只手臂放松',
    tags: ['手靠近脸', '轻触', '站姿'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/pose/pose-hand-near-face.webp',
      import.meta.url
    ).href,
    visual: { tone: '#eef7fb', accent: '#54a7bd', shape: 'pose' }
  },
  {
    id: 'pose-energetic-jump',
    slot: 'pose',
    title: '垂直跃起',
    subtitle: '双脚离地动作',
    prompt: 'energetic vertical jump, both feet off the ground, arms raised',
    promptZh: '垂直跃起，双脚离地，双臂上扬',
    tags: ['跃起', '动态', '离地'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/pose/pose-energetic-jump.webp',
      import.meta.url
    ).href,
    visual: { tone: '#fff2d9', accent: '#ed9f2a', shape: 'pose' }
  },
  {
    id: 'pose-side-lookback',
    slot: 'pose',
    title: '侧身回望',
    subtitle: '躯干扭转关系',
    prompt: 'torso turned three-quarter away, head looking back, arms relaxed',
    promptZh: '躯干四分之三转开，头部回望，双臂放松',
    tags: ['回望', '扭转', '侧身'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/pose/pose-side-lookback.webp',
      import.meta.url
    ).href,
    visual: { tone: '#f4edf2', accent: '#b15b83', shape: 'pose' }
  },
  {
    id: 'top-cream-oversized-blazer',
    slot: 'top',
    title: '奶油西装',
    subtitle: '干净通勤',
    prompt:
      'cream oversized blazer over a soft knit top, minimal tailoring, clean layered outfit',
    promptZh:
      '奶油色 oversized 西装外套，内搭柔软针织上衣，极简剪裁，干净的叠穿造型',
    tags: ['外套', '通勤', '浅色'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/top/top-cream-oversized-blazer.webp',
      import.meta.url
    ).href,
    visual: { tone: '#f7f0e7', accent: '#c5a98c', shape: 'outfit' }
  },
  {
    id: 'top-soft-pink-cardigan',
    slot: 'top',
    title: '浅粉短开衫',
    subtitle: '柔和甜感',
    prompt:
      'soft pink cropped cardigan with delicate knit texture, gentle feminine styling',
    promptZh: '柔和粉色短款开衫，细腻针织肌理，温柔甜美的女性风格',
    tags: ['针织', '甜美', '浅色'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/top/top-soft-pink-cardigan.webp',
      import.meta.url
    ).href,
    visual: { tone: '#fff0f5', accent: '#e67fa8', shape: 'outfit' }
  },
  {
    id: 'top-pale-denim-jacket',
    slot: 'top',
    title: '浅蓝牛仔夹克',
    subtitle: '日常街头',
    prompt:
      'pale blue denim jacket with clean seams, relaxed casual streetwear styling',
    promptZh: '浅蓝牛仔夹克，线缝干净利落，松弛的街头休闲造型',
    tags: ['街头', '日常', '蓝色'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/top/top-pale-denim-jacket.webp',
      import.meta.url
    ).href,
    visual: { tone: '#eaf2f9', accent: '#3f74a3', shape: 'outfit' }
  },
  {
    id: 'top-ivory-knit-vest',
    slot: 'top',
    title: '象牙针织马甲',
    subtitle: '学院叠穿',
    prompt:
      'ivory knit vest with neat ribbed texture, school-inspired layered outfit styling',
    promptZh: '象牙色针织马甲，整齐的罗纹纹理，学院风叠穿造型',
    tags: ['学院', '针织', '上装'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/top/top-ivory-knit-vest.webp',
      import.meta.url
    ).href,
    visual: { tone: '#f7f0e7', accent: '#c5a98c', shape: 'outfit' }
  },
  {
    id: 'top-idol-blouse',
    slot: 'top',
    title: '蝴蝶结衬衫',
    subtitle: '偶像服饰',
    prompt:
      'frilled idol blouse with a large ribbon bow, delicate lace sleeves, pastel trim',
    promptZh: '偶像感荷叶边衬衫，前襟大蝴蝶结，精致蕾丝袖口，淡彩色镶边',
    tags: ['偶像', '甜美', '上装'],
    visual: { tone: '#fff0f5', accent: '#e67fa8', shape: 'outfit' }
  },
  {
    id: 'top-denim-jacket',
    slot: 'top',
    title: '牛仔夹克',
    subtitle: '日常街头',
    prompt:
      'blue denim jacket over a clean white shirt, relaxed streetwear styling',
    promptZh: '蓝色牛仔夹克搭配干净的白衬衫，松弛街头造型',
    tags: ['街头', '日常', '蓝色'],
    visual: { tone: '#eaf2f9', accent: '#3f74a3', shape: 'outfit' }
  },
  {
    id: 'bottom-navy-pleated-skirt',
    slot: 'bottom',
    title: '百褶短裙',
    subtitle: '学院轮廓',
    prompt:
      'navy pleated skirt with crisp folds, neat school-inspired silhouette',
    promptZh: '深蓝百褶短裙，褶皱挺括，整洁的学院风轮廓',
    tags: ['学院', '半身', '裙装'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/bottom/bottom-navy-pleated-skirt.webp',
      import.meta.url
    ).href,
    visual: { tone: '#eef1f8', accent: '#344b7a', shape: 'outfit' }
  },
  {
    id: 'bottom-beige-wide-trousers',
    slot: 'bottom',
    title: '阔腿长裤',
    subtitle: '松弛高级',
    prompt:
      'high-waisted wide-leg trousers, soft drape fabric, refined relaxed proportion',
    promptZh: '高腰阔腿长裤，柔软垂坠面料，比例松弛而精致',
    tags: ['通勤', '长裤', '松弛'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/bottom/bottom-beige-wide-trousers.webp',
      import.meta.url
    ).href,
    visual: { tone: '#f2eee9', accent: '#94755e', shape: 'outfit' }
  },
  {
    id: 'bottom-black-tailored-shorts',
    slot: 'bottom',
    title: '短裤长袜',
    subtitle: '轻甜街拍',
    prompt:
      'tailored black shorts with clean pressed seams, youthful fashion styling',
    promptZh: '剪裁利落的黑色短裤，线缝平整，年轻时髦的造型',
    tags: ['街拍', '短裤', '年轻'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/bottom/bottom-black-tailored-shorts.webp',
      import.meta.url
    ).href,
    visual: { tone: '#f2f0f4', accent: '#20222a', shape: 'outfit' }
  },
  {
    id: 'bottom-ivory-flowing-skirt',
    slot: 'bottom',
    title: '象牙长裙',
    subtitle: '柔和飘逸',
    prompt:
      'ivory flowing long skirt with soft fabric movement, gentle romantic styling',
    promptZh: '象牙色飘逸长裙，面料随风轻摆，柔和浪漫的造型',
    tags: ['长裙', '柔和', '浅色'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/bottom/bottom-ivory-flowing-skirt.webp',
      import.meta.url
    ).href,
    visual: { tone: '#fbf4e7', accent: '#c9ad84', shape: 'outfit' }
  },
  {
    id: 'shoes-black-mary-jane',
    slot: 'shoes',
    title: '玛丽珍鞋',
    subtitle: '复古甜感',
    prompt:
      'black mary jane shoes with a small heel, polished leather, retro feminine detail',
    promptZh: '黑色玛丽珍鞋，带小跟，皮面光泽，复古少女细节',
    tags: ['复古', '皮鞋', '甜美'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/shoes/shoes-black-mary-jane.webp',
      import.meta.url
    ).href,
    visual: { tone: '#f7ece7', accent: '#1d1b1b', shape: 'shoe' }
  },
  {
    id: 'shoes-clean-white-sneakers',
    slot: 'shoes',
    title: '白色球鞋',
    subtitle: '干净百搭',
    prompt:
      'clean white sneakers with subtle texture, casual everyday footwear',
    promptZh: '干净的白色运动鞋，细腻质感，日常休闲鞋款',
    tags: ['日常', '运动', '白色'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/shoes/shoes-clean-white-sneakers.webp',
      import.meta.url
    ).href,
    visual: { tone: '#eef4f3', accent: '#aebfc0', shape: 'shoe' }
  },
  {
    id: 'shoes-black-ankle-boots',
    slot: 'shoes',
    title: '短靴',
    subtitle: '利落造型',
    prompt: 'black ankle boots with structured shape, sleek modern styling',
    promptZh: '黑色短靴，鞋型立体硬挺，现代利落造型',
    tags: ['靴子', '酷感', '黑色'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/shoes/shoes-black-ankle-boots.webp',
      import.meta.url
    ).href,
    visual: { tone: '#eeeef0', accent: '#2b2f36', shape: 'shoe' }
  },
  {
    id: 'shoes-beige-ballet-flats',
    slot: 'shoes',
    title: '米色芭蕾鞋',
    subtitle: '轻盈柔和',
    prompt:
      'beige ribbon ballet flats, delicate feminine footwear, soft romantic detail',
    promptZh: '米色丝带芭蕾鞋，精致女性化鞋款，柔和浪漫的细节',
    tags: ['芭蕾', '浅色', '柔和'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/shoes/shoes-beige-ballet-flats.webp',
      import.meta.url
    ).href,
    visual: { tone: '#f7efe4', accent: '#c1966f', shape: 'shoe' }
  },
  {
    id: 'background-warm-studio',
    slot: 'background',
    title: '纯净影棚',
    subtitle: '可控商业光',
    prompt:
      'minimal warm white studio background, subtle floor shadow, clean product-grade composition',
    promptZh: '极简暖白色影棚背景，地面带微妙投影，干净的商业产品构图',
    tags: ['影棚', '干净', '商业'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/background/background-warm-studio.webp',
      import.meta.url
    ).href,
    visual: { tone: '#fbf7ef', accent: '#d7c4ad', shape: 'landscape' }
  },
  {
    id: 'background-city-corner',
    slot: 'background',
    title: '城市街角',
    subtitle: '生活方式场景',
    prompt:
      'quiet city street corner in soft afternoon light, shallow depth of field, lifestyle mood',
    promptZh: '安静的城市街角，柔和的午后光线，浅景深，生活方式氛围',
    tags: ['城市', '街拍', '生活'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/background/background-city-corner.webp',
      import.meta.url
    ).href,
    visual: { tone: '#eaf0f1', accent: '#527d82', shape: 'landscape' }
  },
  {
    id: 'background-soft-bedroom',
    slot: 'background',
    title: '柔和卧室',
    subtitle: '私密日常',
    prompt:
      'soft bedroom interior with warm textile details, clean lifestyle photography mood',
    promptZh: '柔和的卧室室内场景，温暖的布艺细节，干净的生活方式摄影氛围',
    tags: ['室内', '日常', '柔和'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/background/background-soft-bedroom.webp',
      import.meta.url
    ).href,
    visual: { tone: '#f6eee8', accent: '#c5a98c', shape: 'landscape' }
  },
  {
    id: 'background-garden-path',
    slot: 'background',
    title: '花园小径',
    subtitle: '柔和自然',
    prompt:
      'lush garden path with pale flowers, soft natural depth, gentle romantic atmosphere',
    promptZh: '繁盛的花园小径，浅色花朵点缀，自然柔和的景深，温柔浪漫的氛围',
    tags: ['自然', '花园', '柔和'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/background/background-garden-path.webp',
      import.meta.url
    ).href,
    visual: { tone: '#edf6ec', accent: '#6ea876', shape: 'landscape' }
  },
  {
    id: 'style-delicate-anime-watercolor',
    slot: 'style',
    title: '水彩二次元',
    subtitle: '柔边透明感',
    prompt:
      'delicate anime watercolor illustration, airy linework, translucent color washes, refined details',
    promptZh: '细腻的二次元水彩插画，线条通透，半透明色块叠加，细节精致',
    negativePrompt: 'muddy color, rough sketch',
    negativePromptZh: '色彩浑浊，线条潦草',
    tags: ['二次元', '水彩', '柔和'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/style/style-delicate-anime-watercolor.webp',
      import.meta.url
    ).href,
    visual: { tone: '#eef6ff', accent: '#6e9bd6', shape: 'style' }
  },
  {
    id: 'style-high-end-fashion-photo',
    slot: 'style',
    title: '时装摄影',
    subtitle: '商业质感',
    prompt:
      'high-end fashion photography, realistic fabric texture, editorial color grading, sharp details',
    promptZh: '高端时装摄影，写实面料质感，杂志级调色，细节锐利',
    negativePrompt: 'cartoon, plastic skin',
    negativePromptZh: '卡通感，塑料皮肤',
    tags: ['写实', '摄影', '时装'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/style/style-high-end-fashion-photo.webp',
      import.meta.url
    ).href,
    visual: { tone: '#f4efe7', accent: '#9b543f', shape: 'style' }
  },
  {
    id: 'style-game-character-concept',
    slot: 'style',
    title: '游戏设定稿',
    subtitle: '清晰角色设计',
    prompt:
      'polished game character concept art, clean silhouette, readable costume details, neutral presentation',
    promptZh: '精修的游戏角色设定图，剪影干净，服装细节清晰可辨，呈现中性',
    tags: ['游戏', '设定', '角色'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/style/style-game-character-concept.webp',
      import.meta.url
    ).href,
    visual: { tone: '#edeef8', accent: '#5864b5', shape: 'style' }
  },
  {
    id: 'style-soft-3d-clay',
    slot: 'style',
    title: '软陶 3D',
    subtitle: '亲和立体',
    prompt:
      'soft 3D clay render, matte material, friendly rounded shapes, high-key studio lighting',
    promptZh: '柔和的 3D 软陶渲染，哑光材质，圆润亲和的形态，高调影棚布光',
    tags: ['3D', '软陶', '亲和'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/style/style-soft-3d-clay.webp',
      import.meta.url
    ).href,
    visual: { tone: '#f4eadf', accent: '#bd8b61', shape: 'style' }
  },
  {
    id: 'lighting-large-softbox',
    slot: 'lighting',
    title: '柔光箱',
    subtitle: '皮肤干净',
    prompt:
      'large softbox lighting, gentle highlights, smooth shadows, clean skin tones',
    promptZh: '大型柔光箱布光，高光柔和，阴影顺滑，肤色干净',
    tags: ['柔光', '影棚', '干净'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/lighting/lighting-large-softbox.webp',
      import.meta.url
    ).href,
    visual: { tone: '#fff8e8', accent: '#f0c35b', shape: 'style' }
  },
  {
    id: 'lighting-soft-backlit',
    slot: 'lighting',
    title: '逆光轮廓',
    subtitle: '氛围增强',
    prompt:
      'soft backlight outlining the silhouette, subtle rim light, atmospheric glow',
    promptZh: '柔和的逆光勾勒人物轮廓，细致的边缘光，氛围感光晕',
    tags: ['逆光', '氛围', '轮廓'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/lighting/lighting-soft-backlit.webp',
      import.meta.url
    ).href,
    visual: { tone: '#eef2ff', accent: '#8091d6', shape: 'style' }
  },
  {
    id: 'lighting-overcast-diffuse',
    slot: 'lighting',
    title: '阴天漫反射',
    subtitle: '自然低对比',
    prompt:
      'overcast diffuse daylight, low contrast, natural color, calm realistic mood',
    promptZh: '阴天漫反射日光，低对比，自然色调，平静写实的氛围',
    tags: ['自然光', '低对比', '写实'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/lighting/lighting-overcast-diffuse.webp',
      import.meta.url
    ).href,
    visual: { tone: '#edf1f0', accent: '#7d8d8a', shape: 'style' }
  },
  {
    id: 'lighting-golden-hour',
    slot: 'lighting',
    title: '金色时刻',
    subtitle: '温暖电影感',
    prompt:
      'warm golden hour lighting, gentle amber highlights, cinematic cozy atmosphere',
    promptZh: '温暖的黄金时刻光线，柔和的琥珀色高光，电影感温馨氛围',
    tags: ['暖光', '电影感', '氛围'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/lighting/lighting-golden-hour.webp',
      import.meta.url
    ).href,
    visual: { tone: '#fff0d7', accent: '#d79b44', shape: 'style' }
  },
  {
    id: 'lighting-neon-rim',
    slot: 'lighting',
    title: '霓虹轮廓光',
    subtitle: '赛博边缘',
    prompt:
      'pink and cyan neon rim lighting outlining the hair and shoulders, dark clean background, glossy cyber mood',
    promptZh: '粉蓝霓虹轮廓光勾勒头发和肩线，背景干净偏暗，带克制赛博质感',
    tags: ['霓虹', '轮廓光', '夜景'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/lighting/lighting-neon-rim.webp',
      import.meta.url
    ).href,
    visual: { tone: '#eef2ff', accent: '#4f7dff', shape: 'style' }
  },
  {
    id: 'lighting-candle-warm',
    slot: 'lighting',
    title: '烛光暖调',
    subtitle: '近景氛围',
    prompt:
      'warm candle-like key light from one side, soft amber highlights, intimate low-light portrait mood',
    promptZh: '一侧烛光般暖色主光，琥珀高光柔和，近景低照度氛围感',
    tags: ['暖光', '低照度', '氛围'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/lighting/lighting-candle-warm.webp',
      import.meta.url
    ).href,
    visual: { tone: '#fff0dd', accent: '#be6c2f', shape: 'style' }
  },
  {
    id: 'lighting-window-stripes',
    slot: 'lighting',
    title: '窗影硬光',
    subtitle: '条纹投影',
    prompt:
      'hard sunlight through window blinds, clear striped shadows across the scene, dramatic graphic light pattern',
    promptZh: '强阳光穿过百叶窗形成清晰条纹阴影，光影图形感强，戏剧化但干净',
    tags: ['硬光', '窗影', '戏剧'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/lighting/lighting-window-stripes.webp',
      import.meta.url
    ).href,
    visual: { tone: '#fff5df', accent: '#d58a2a', shape: 'style' }
  },
  {
    id: 'lighting-colored-gel',
    slot: 'lighting',
    title: '彩色凝胶光',
    subtitle: '双色影棚',
    prompt:
      'controlled colored gel studio lighting, one warm side and one cool side, saturated but tasteful color contrast',
    promptZh: '影棚彩色凝胶光，一侧暖色一侧冷色，色彩对比饱满但不廉价',
    tags: ['影棚', '彩光', '对比'],
    thumbnailUrl: new URL(
      '../assets/prompt-library/lighting/lighting-colored-gel.webp',
      import.meta.url
    ).href,
    visual: { tone: '#f0f4ff', accent: '#935cff', shape: 'style' }
  }
];

const portraitCategoryExpansionAssets = portraitCategoryExpansionSeeds.map(
  ([id, slot, title, subtitle, prompt, promptZh, tags]) =>
    definePromptAsset({
      id,
      slot,
      title,
      subtitle,
      prompt,
      promptZh,
      tags: [...tags]
    })
);

const cameraTaxonomyV2Seeds = [
  [
    'lens-clean-digital',
    'lens',
    '现代数码',
    '中性清晰成像',
    'clean modern full-frame digital rendering, neutral contrast, crisp natural detail',
    '现代全画幅数码成像，中性对比，细节清晰自然，不改变景别与机位',
    ['数码', '中性', '清晰']
  ],
  [
    'lens-medium-format-editorial',
    'lens',
    '中画幅编辑感',
    '细腻层次过渡',
    'medium-format editorial rendering, smooth tonal rolloff, exceptional natural micro-detail',
    '中画幅编辑摄影成像，明暗过渡细腻，微细节丰富自然，不改变景别与机位',
    ['中画幅', '编辑感', '细腻']
  ],
  [
    'lens-35mm-color-negative',
    'lens',
    '35mm 彩色负片',
    '有机颗粒色彩',
    '35mm color-negative film rendering, organic fine grain, gentle color response and highlight rolloff',
    '35mm 彩色负片成像，有机细颗粒、柔和色彩响应与高光过渡，不改变景别与机位',
    ['35mm', '负片', '颗粒']
  ],
  [
    'lens-disposable-direct-flash',
    'lens',
    '一次性相机直闪',
    '闪光抓拍质地',
    'disposable-camera direct-flash rendering, frontal flash falloff, visible film grain and candid snapshot character',
    '一次性相机正面直闪成像，闪光衰减和胶片颗粒明显，呈现抓拍质地，不改变景别与机位',
    ['一次性相机', '直闪', '抓拍']
  ],
  [
    'lens-vintage-diffusion',
    'lens',
    '复古柔光镜',
    '轻卤化低反差',
    'vintage diffusion-filter rendering, subtle halation, lowered contrast, retained facial detail without blur',
    '复古柔光滤镜成像，轻微卤化光晕与低反差，保留面部细节而不糊，不改变景别与机位',
    ['柔光镜', '卤化', '低反差']
  ],
  [
    'lens-anamorphic-rendering',
    'lens',
    '变形宽银幕成像',
    '横向炫光椭圆焦外',
    'anamorphic cinematic rendering, restrained horizontal flare, oval bokeh and cinematic edge character',
    '变形宽银幕光学成像，克制横向炫光、椭圆焦外与电影边缘特性，不改变景别与机位',
    ['变形宽银幕', '横向炫光', '椭圆焦外']
  ],
  [
    'lens-fisheye-optical',
    'lens',
    '鱼眼光学',
    '桶形弯曲畸变',
    'fisheye optical rendering, unmistakable controlled barrel curvature and expanded edge space',
    '鱼眼光学成像，桶形弯曲和边缘空间扩张明确可见，不改变人物裁切与机位',
    ['鱼眼', '桶形畸变', '光学']
  ],
  [
    'lens-smartphone-computational',
    'lens',
    '手机计算摄影',
    '深景深轻 HDR',
    'smartphone computational-photo rendering, deep focus, restrained HDR and subtle edge sharpening',
    '手机计算摄影成像，深景深、克制 HDR 与轻微边缘锐化，不加入自拍距离或角度',
    ['手机', '计算摄影', 'HDR']
  ],
  [
    'lens-monochrome-silver-gelatin',
    'lens',
    '银盐黑白胶片',
    '单色颗粒层次',
    'black-and-white silver-gelatin film rendering, rich monochrome grain and luminous highlight rolloff',
    '银盐黑白胶片成像，单色颗粒丰富，高光过渡通透，不改变景别与机位',
    ['黑白胶片', '银盐', '颗粒']
  ],
  [
    'shot-extreme-detail-eyes',
    'shot',
    '眼部极特写',
    '仅眼睛与眉部',
    'extreme detail shot cropped tightly around both eyes and brows',
    '眼部极特写，仅保留双眼与眉部',
    ['极特写', '眼部', '裁切']
  ],
  [
    'shot-face-closeup',
    'shot',
    '面部特写',
    '发顶至下巴',
    'facial close-up from the top of the hair to just below the chin',
    '面部特写，从发顶裁到下巴下方',
    ['特写', '面部', '裁切']
  ],
  [
    'shot-head-shoulders',
    'shot',
    '头肩近景',
    '裁至上胸',
    'head-and-shoulders close-up cropped at the upper chest',
    '头肩近景，包含头颈肩并裁至上胸',
    ['近景', '头肩', '上胸']
  ],
  [
    'shot-chest-up',
    'shot',
    '胸上近景',
    '裁至胸部中段',
    'chest-up medium close-up cropped at mid-chest',
    '胸上近景，裁至胸部中段',
    ['中近景', '胸上', '裁切']
  ],
  [
    'shot-waist-up',
    'shot',
    '腰上中景',
    '裁至自然腰线',
    'waist-up medium shot cropped at the natural waist',
    '腰上中景，裁至自然腰线',
    ['中景', '腰上', '裁切']
  ],
  [
    'shot-knee-up',
    'shot',
    '膝上中全景',
    '裁至膝部',
    'knee-up medium-full shot cropped at or just above the knees',
    '膝上中全景，裁至膝部或膝部略上',
    ['中全景', '膝上', '裁切']
  ],
  [
    'shot-full-body',
    'shot',
    '全身景',
    '完整头脚小留白',
    'full-body shot with the complete figure visible head to toe and a small clean margin',
    '全身景，人物从头到脚完整可见并保留小幅边距',
    ['全身', '完整轮廓', '小留白']
  ],
  [
    'shot-long',
    'shot',
    '远景',
    '人物约占画面三分一',
    'shot scale is a hard constraint: camera placed roughly eight meters from the subject, long shot with the complete figure occupying about one third of frame height, environment clearly visible; do not tighten to a medium or close shot',
    '景别为硬约束：相机距人物约八米，远景，完整人物约占画面高度三分之一，环境明显增加；不得收紧为中景或近景',
    ['远景', '环境', '主体占比']
  ],
  [
    'shot-extreme-long',
    'shot',
    '大远景',
    '人物约占画面六分一',
    'shot scale is a hard constraint: camera placed at least twenty meters from the subject, extreme long shot with the complete figure appearing small and occupying no more than about one sixth of frame height, environment dominant; do not tighten to a medium or close shot',
    '景别为硬约束：相机距人物至少二十米，大远景，完整人物以小比例出现且不超过画面高度约六分之一，环境占主导；不得收紧为中景或近景',
    ['大远景', '环境主导', '主体占比']
  ],
  [
    'shot-lower-face-detail',
    'shot',
    '下半脸细节特写',
    '鼻下至下巴',
    'lower-face detail shot cropped from just below the nose through the lips to the chin',
    '下半脸细节特写，从鼻下经唇部裁至下巴',
    ['细节特写', '下半脸', '裁切']
  ],
  [
    'shot-clavicle-closeup',
    'shot',
    '锁骨近景',
    '发顶至锁骨',
    'tight portrait close-up cropped from the crown to the clavicles',
    '锁骨近景，从发顶裁至锁骨',
    ['近景', '锁骨', '裁切']
  ],
  [
    'shot-ribcage-up',
    'shot',
    '肋下近景',
    '裁至肋骨下缘',
    'upper-torso portrait cropped from the crown to just below the ribcage',
    '肋下近景，从发顶裁至肋骨下缘',
    ['中近景', '肋下', '裁切']
  ],
  [
    'shot-elbow-up',
    'shot',
    '肘上中景',
    '完整包含双肘',
    'medium portrait cropped from the crown to just below both elbows',
    '肘上中景，从发顶裁至双肘下方，完整包含双肘',
    ['中景', '肘上', '裁切']
  ],
  [
    'shot-hip-up',
    'shot',
    '臀上中景',
    '裁至上臀线',
    'hip-up medium portrait cropped from the crown to the upper hip line',
    '臀上中景，从发顶裁至上臀线',
    ['中景', '臀上', '裁切']
  ],
  [
    'shot-mid-thigh',
    'shot',
    '大腿中部七分身',
    '裁至大腿中部',
    'three-quarter portrait cropped from the crown to mid-thigh',
    '大腿中部七分身，从发顶裁至大腿中部',
    ['七分身', '大腿中部', '裁切']
  ],
  [
    'shot-mid-calf',
    'shot',
    '小腿上中全景',
    '裁至小腿中部',
    'loose medium-full portrait cropped from the crown to mid-calf',
    '小腿上中全景，从发顶裁至小腿中部',
    ['中全景', '小腿', '裁切']
  ],
  [
    'shot-loose-full-body',
    'shot',
    '宽松全身景',
    '人物约占画面四分之三',
    'loose full-body shot with the complete figure occupying about three quarters of frame height',
    '宽松全身景，完整人物约占画面高度四分之三',
    ['全身', '宽松全身', '主体占比']
  ],
  [
    'shot-environmental-quarter',
    'shot',
    '环境全景',
    '人物约占画面四分一',
    'environmental long shot with the complete figure occupying about one quarter of frame height and the environment clearly dominant',
    '环境全景，完整人物约占画面高度四分之一，环境清晰占主导',
    ['全景', '环境', '主体占比']
  ]
] as const;

const cameraTaxonomyV2Assets: ImagePromptAsset[] = cameraTaxonomyV2Seeds.map(
  ([id, slot, title, subtitle, prompt, promptZh, tags]) =>
    definePromptAsset({
      id,
      slot,
      title,
      subtitle,
      prompt,
      promptZh,
      tags: [...tags]
    })
);

function buildImagePromptAssetCatalog(
  generatedManifestPromptAssets: ImagePromptAsset[]
): ImagePromptAsset[] {
  return dedupePromptAssets(
    [
      ...generatedManifestPromptAssets,
      ...baseImagePromptAssets,
      ...growthPromptAssets,
      ...portraitCategoryExpansionAssets
    ]
      .filter((asset) => asset.slot !== 'lens' && asset.slot !== 'shot')
      .concat(cameraTaxonomyV2Assets)
  )
    .map(removeEmojiPromptLeakage)
    .map(applyPortraitExpressionTemperamentSearchAliases)
    .map(applyPortraitAssetQualityContract)
    .map((asset) =>
      asset.compatibility
        ? asset
        : { ...asset, compatibility: resolveAssetCompatibility(asset) }
    );
}

/**
 * Hydrates the generated prompt-library manifest on demand. Keeping the raw
 * manifest outside this module prevents its 1,000+ records from blocking the
 * creation workspace's first render.
 */
export function createImagePromptAssetCatalog(
  manifest: unknown
): ImagePromptAsset[] {
  const assets =
    manifest &&
    typeof manifest === 'object' &&
    'assets' in manifest &&
    Array.isArray((manifest as { assets?: unknown }).assets)
      ? ((manifest as { assets: GeneratedManifestPromptAsset[] }).assets ?? [])
      : [];
  const generatedManifestPromptAssets = assets
    .map(toGeneratedPromptAsset)
    .filter((asset): asset is ImagePromptAsset => Boolean(asset));
  return buildImagePromptAssetCatalog(generatedManifestPromptAssets);
}

/**
 * Full built-in catalog without the generated manifest. Runtime surfaces
 * import `image-prompt-core` and only reach this module through the async
 * catalog boundary.
 */
export const imagePromptAssets: ImagePromptAsset[] =
  buildImagePromptAssetCatalog([]);
