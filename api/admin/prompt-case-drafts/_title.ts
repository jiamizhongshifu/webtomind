function cleanText(value: unknown): string {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPromptForTheme(value: unknown): string {
  let text = String(value || '').replace(/\u00a0/g, ' ');
  const negativeSectionIndex = text.search(
    /(?:^|\n)\s*(?:#{1,6}\s*)?(?:negative prompt|negative|负面提示词|反向提示词|avoid|避免|ネガティブ)(?:\s*[（(]\s*(?:negative prompt|negative)\s*[)）])?\s*[:：]?/imu
  );
  if (negativeSectionIndex >= 0) {
    text = text.slice(0, negativeSectionIndex);
  }
  return cleanText(
    text.replace(
      /(?:没有|并无|无|不要|避免|禁止)[^。.!?\n]{0,24}(?:影棚|摄影棚|工作室)(?:感|灯光)?/gu,
      ''
    )
  );
}

function matchesAll(text: string, patterns: RegExp[]): boolean {
  return patterns.every((pattern) => pattern.test(text));
}

function buildPromptSpecificTitle(text: string): string {
  if (
    matchesAll(text, [
      /iPhone 17 Pro[^。]{0,32}(?:前置自拍|前摄)/iu,
      /泳池边[^。]{0,24}躺椅/iu,
      /浅蓝色[^。]{0,36}(?:罩衫|泳装)/iu,
      /冰柠檬茶/iu
    ])
  ) {
    return '夏日泳池躺椅冰柠檬茶手机自拍';
  }

  if (
    matchesAll(text, [
      /机场候机(?:大厅|厅)|机场大厅/iu,
      /韩系甜妹/iu,
      /蹲在机场地面|蹲地/iu,
      /翻包|打开[^。]{0,24}(?:手提包|包)[^。]{0,24}(?:寻找|找)/iu,
      /手机抓拍|iPhone生活摄影/iu
    ])
  ) {
    return '机场候机厅韩系甜妹蹲地翻包手机随拍';
  }

  if (
    matchesAll(text, [
      /early-2000s CCD mirror selfie|CCD镜面自拍/iu,
      /completely dark room|暗室|全黑房间/iu,
      /direct camera flash|直闪/iu,
      /soft goth|柔和哥特|甜辣哥特/iu
    ])
  ) {
    return '暗室直闪甜辣哥特CCD镜面自拍';
  }

  if (
    matchesAll(text, [
      /窗边/iu,
      /抹胸蕾丝婚纱/iu,
      /花束/iu,
      /婚礼晨间纪实|从低头、整理头纱、坐姿停留到望向窗外/iu
    ])
  ) {
    return '窗边抹胸蕾丝婚纱晨间纪实组照';
  }

  if (
    matchesAll(text, [
      /editorial typography poster/iu,
      /oversized,\s*cropped letters|oversized type/iu,
      /breaks? through (?:the )?(?:letters|typography|type)/iu
    ])
  ) {
    return '超大字母人景穿透编辑海报模板';
  }

  if (
    matchesAll(text, [
      /(?:DV|tape) (?:16mm )?(?:tape )?camcorder/iu,
      /(?:dorm room|宿舍)/iu,
      /(?:backstage|stage|舞台)/iu,
      /(?:time-lapse )?montage|蒙太奇/iu
    ])
  ) {
    return '女团偶像宿舍至舞台DV蒙太奇短片';
  }

  if (
    matchesAll(text, [
      /tiny animal|小动物/iu,
      /(?:stolen|stole|grab) (?:a |the )?(?:young woman[’']?s )?phone|偷走.{0,12}手机/u,
      /rooftop|屋顶|天台/iu,
      /ultra-low-angle|超低机位|极低机位/iu
    ])
  ) {
    return '屋顶追手机动物视角超低机位写真';
  }

  if (
    matchesAll(text, [
      /(?:iPhone|phone) selfie|手机自拍/iu,
      /direct (?:phone )?flash|手机直闪|直接闪光/iu,
      /human shadow|人物影子|人影/iu
    ])
  ) {
    return '室内直闪人影低机位手机自拍模板';
  }

  if (
    matchesAll(text, [
      /sailor-style|sailor-inspired|水手服|セーラー/iu,
      /side leap|mid-air|侧跃|跳跃/iu,
      /(?:slightly )?low angle|低机位|ローアングル/iu
    ])
  ) {
    return '水手服侧跃青春动作写真';
  }

  if (
    matchesAll(text, [
      /sailor-style|sailor-inspired|水手服|セーラー/iu,
      /mid-turn|turning|转身|振り向/iu,
      /deep-blue summer sky|蓝色夏日天空|夏空/iu,
      /(?:very )?low-angle|低机位|ローアングル/iu
    ])
  ) {
    return '蓝天下水手风短裙低机位转身写真';
  }

  if (
    matchesAll(text, [
      /公園|公园|park/iu,
      /レースドレス|蕾丝长裙|lace dress/iu,
      /回る|回転|旋转|spin|twirl/iu,
      /逆光|backlight/iu
    ])
  ) {
    return '夏日公园蕾丝长裙旋转逆光写真';
  }

  if (
    matchesAll(text, [
      /subway platform|地铁站|地下鉄.*ホーム/iu,
      /wet-look|湿发|濡れ髪/iu,
      /ringer (?:baby-)?tee|运动T恤|リンガーT/iu,
      /low angle|低机位|ローアングル/iu
    ])
  ) {
    return '地铁站湿发运动T恤低机位写真';
  }

  if (
    matchesAll(text, [
      /暖白色摄影棚|warm[- ]white studio|cream[- ]white studio/iu,
      /双眼自然闭合|eyes closed|閉じた目/iu,
      /低位双层发髻|低发髻|low bun/iu,
      /蕾丝[^。]{0,80}(?:文胸|内衣)|(?:文胸|内衣)[^。]{0,80}蕾丝|lace (?:bra|lingerie)/iu
    ])
  ) {
    return '暖白影棚闭眼低髻蕾丝内衣写真';
  }

  if (
    matchesAll(text, [
      /Korean streetwear/iu,
      /fashion campaign/iu,
      /minimalist editorial/iu
    ])
  ) {
    return '韩国街头时尚极简编辑写真';
  }

  if (
    matchesAll(text, [
      /Y2K street (?:photography )?portrait/iu,
      /(?:messy )?bob haircut/iu,
      /peace sign/iu
    ])
  ) {
    return 'Y2K街头短波波剪刀手写真';
  }

  if (
    matchesAll(text, [
      /Ricoh GR III HDF/iu,
      /direct (?:on-camera )?flash|直闪/iu,
      /close-up portrait|近距离写真/iu
    ])
  ) {
    return 'Ricoh HDF直闪近距离写真';
  }

  return '';
}

const CJK_SCENE_NOUNS =
  '机场候机大厅|机场候机厅|机场大厅|候机大厅|公寓厨房|家庭厨房|酒店房间|室内健身房|健身房|更衣区|水泥空间|木质缘廊|木廊|缘廊|縁側|和风庭院|和風庭園|日式庭院|公园|公園|厨房|公寓|卧室|客厅|书店|图书馆|咖啡馆|酒吧|海滩|沙滩|泳池|庭院|水榭|寝殿|宫廷|街道|小巷|路地|车站|列车|地铁|机场|森林|雪山|影棚|摄影棚|工作室|酒店|房间|店铺|办公室|校园|河畔|湖畔|舞台|浴室|屋顶|天台|停车场|加油站';

function extractCjkSceneLabel(text: string): string {
  if (/机场候机(?:大厅|厅)|机场大厅|候机大厅/u.test(text)) {
    return '机场候机厅';
  }
  if (/明亮极简(?:公寓|家庭)?厨房/u.test(text)) {
    return '明亮极简公寓厨房';
  }
  const hasAthleticCue =
    /运动时尚|运动上衣|运动内衣|运动裤|运动装|スポーツウェア|athletic/iu.test(
      text
    );
  if (
    /(?:极简)?(?:室内)?健身房|トレーニングジム|ジムの更衣/u.test(text) ||
    (hasAthleticCue && /更衣区|水泥空间/u.test(text))
  ) {
    return /极简/u.test(text) ? '极简健身房' : '室内健身房';
  }
  if (
    /(?:和風庭園|和风庭院|日式庭院)/u.test(text) &&
    /(?:縁側|缘廊|木廊)/u.test(text)
  ) {
    return '和风庭院木质缘廊';
  }
  if (/暗い夜[^。]{0,30}(?:路地|小巷)|夜晚?[^。]{0,20}(?:路地|小巷)/u.test(text)) {
    return '夜巷';
  }
  if (/公寓[^。]{0,24}(?:走廊|过道)|apartment hallway/iu.test(text)) {
    return '公寓走廊';
  }
  if (/米色沙发/u.test(text)) return '米色沙发';
  if (/夏日[^。]{0,20}(?:窗边|客厅)|(?:窗边|客厅)[^。]{0,20}夏日/u.test(text)) {
    return '夏日窗边';
  }
  if (/雾蓝色[^。]{0,16}(?:垂幔|背景)/u.test(text)) {
    return '雾蓝垂幔';
  }

  const matches = Array.from(
    text.matchAll(
      new RegExp(
        `([\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}]{0,10}(?:${CJK_SCENE_NOUNS}))`,
        'gu'
      )
    )
  )
    .map((match) =>
      cleanText(match[1])
        .replace(/^.*?(?:位于|坐在|站在|走在|来到)/u, '')
        .replace(
          /^(?:人物|主体|环境|场景)?(?:为|是|位于|坐在|站在|走在|来到)?(?:一个|一处|一间|一座|冷白色小)?/u,
          ''
        )
        .replace(/^(?:的|在|于)/u, '')
    )
    .filter((value) => value.length >= 2 && value.length <= 12);

  return (
    matches.find((value) => /极简|现代|古风|日式|中式|公寓/u.test(value)) ||
    matches[0] ||
    ''
  );
}

function extractCjkSubjectLabel(text: string): string {
  return /(?:两位|两名|两人|双人|二人|2人)[^。]{0,80}(?:女性|女人|人物|角色|模特|女子)/u.test(
    text
  )
    ? '双人'
    : '';
}

function extractCjkConceptLabel(text: string): string {
  if (/韩系甜妹/u.test(text)) return '韩系甜妹';
  if (/粉色针织(?:衫|开衫)/u.test(text)) return '粉色针织衫';
  if (/白色[^。]{0,24}(?:卫衣|连帽衫)|(?:卫衣|连帽衫)[^。]{0,24}白色/u.test(text)) {
    return '白色卫衣';
  }
  if (/运动T恤|リンガーT|ringer (?:baby-)?tee/iu.test(text)) {
    return '运动T恤';
  }
  if (/系带比基尼/u.test(text)) return '系带比基尼';
  if (/比基尼|泳装|泳衣|水着/u.test(text)) return '泳装';
  if (
    /运动时尚|运动上衣|运动内衣|运动裤|运动装|スポーツウェア|athletic/iu.test(
      text
    )
  ) {
    return /黑色[^。]{0,80}(?:运动上衣|运动内衣|运动裤|运动装)|(?:运动上衣|运动内衣|运动裤|运动装)[^。]{0,80}黑色/u.test(
      text
    )
      ? '黑色运动装'
      : '运动时尚';
  }
  if (/古风婚服|中式婚服|婚服/u.test(text)) return '古风婚服';
  if (/街头穿搭|街头时尚|街头服装|ストリートウェア/u.test(text)) {
    return '街头时尚';
  }
  if (/汉服|古装|东方古风|古风/u.test(text)) return '古风';
  if (/四つん這い|両手と両膝|双手(?:和|与)?双膝|双手双膝/u.test(text)) {
    return '跪撑姿势';
  }
  if (/产品|商品|包装|瓶身/u.test(text)) return '产品';
  return '';
}

function extractCjkActionLabel(text: string): string {
  if (
    /蹲在[^。]{0,24}(?:地面|地上)|蹲地/u.test(text) &&
    /翻包|打开[^。]{0,24}(?:手提包|包)[^。]{0,24}(?:寻找|找)/u.test(text)
  ) {
    return '蹲地翻包';
  }
  if (/翻包|(?:手提包|包)[^。]{0,24}(?:寻找|找)/u.test(text)) {
    return '翻包';
  }
  return '';
}

function extractCjkCameraLabel(text: string): string {
  if (
    /低机位[^。]{0,24}(?:仰拍|低角度)|(?:极低|贴地|地面)机位|ローアングル|低い位置から(?:見上げ|撮影)/u.test(
      text
    )
  ) {
    return '低机位';
  }
  if (/俯拍|高机位|鸟瞰|トップダウン|ハイアングル/u.test(text)) {
    return '俯拍';
  }
  if (/直闪|直接闪光|机顶闪光|オンカメラフラッシュ/u.test(text)) {
    return '直闪';
  }
  if (/极近距离|特写|クローズアップ/u.test(text)) return '近距离';
  return '';
}

function extractCjkFormatLabel(text: string): string {
  if (/\[(?:00:)?\d{2}:\d{2}|视频|镜头\s*\d|動画/u.test(text)) {
    return '视频';
  }
  if (/海报|主视觉|封面|ポスター|キービジュアル/u.test(text)) {
    return '海报';
  }
  if (/产品|商品|包装|瓶身/u.test(text)) return '产品图';
  if (/分镜|ストーリーボード/u.test(text)) return '分镜';
  if (/手机自拍|前置摄像头自拍|iPhone[^。]{0,24}自拍/iu.test(text)) {
    return '手机自拍';
  }
  if (/手机摄影|手机抓拍|iPhone[^。]{0,24}(?:抓拍|原片)/iu.test(text)) {
    return '手机抓拍';
  }
  if (
    /人物|女性|男人|男性|角色|模特|人像|写真|摄影|写す|撮る|ポートレート|photorealistic|portrait/iu.test(
      text
    )
  ) {
    return '写真';
  }
  return '';
}

function buildCjkPromptThemeTitle(text: string): string {
  const normalized = cleanText(text);
  if (
    !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(normalized)
  ) {
    return '';
  }

  const scene = extractCjkSceneLabel(normalized);
  const subject = extractCjkSubjectLabel(normalized);
  const concept = extractCjkConceptLabel(normalized);
  const action = extractCjkActionLabel(normalized);
  const camera = extractCjkCameraLabel(normalized);
  const format = extractCjkFormatLabel(normalized);
  const parts = Array.from(
    new Set([scene, subject, concept, action, camera, format].filter(Boolean))
  );
  const title = parts.join('').slice(0, 32);
  const themePartCount = [scene, subject, concept, action, camera].filter(
    Boolean
  ).length;
  if (!format || themePartCount < 1 || title.length < 6) return '';
  return title;
}

type EnglishTitleRule = {
  label: string;
  pattern: RegExp;
};

function matchEnglishLabel(text: string, rules: EnglishTitleRule[]): string {
  return rules.find(({ pattern }) => pattern.test(text))?.label || '';
}

function buildEnglishPromptThemeTitle(text: string): string {
  if (
    !/[a-z]/iu.test(text) ||
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)
  ) {
    return '';
  }

  const scene = matchEnglishLabel(text, [
    { label: '地铁站', pattern: /subway platform/iu },
    { label: '日本住宅街', pattern: /Japanese residential street/iu },
    { label: '公寓走廊', pattern: /apartment hallway/iu },
    { label: '屋顶', pattern: /\brooftop\b/iu },
    { label: '公寓厨房', pattern: /apartment kitchen|home kitchen/iu },
    { label: '室内健身房', pattern: /indoor gym|locker room/iu },
    { label: '卧室', pattern: /bedroom|dorm room/iu },
    { label: '咖啡馆', pattern: /caf[eé]|coffee shop/iu },
    { label: '海滩', pattern: /beach|seaside/iu },
    { label: '校园', pattern: /campus|school grounds/iu },
    { label: '舞台', pattern: /\bstage\b/iu },
    { label: '公园', pattern: /(?:summer |green )?park/iu },
    { label: '街头', pattern: /\bstreet\b|urban alley/iu },
    { label: '影棚', pattern: /photo studio|studio background/iu }
  ]);
  const concept = matchEnglishLabel(text, [
    {
      label: '白色卫衣',
      pattern: /(?:oversized )?white (?:streetwear )?hoodie/iu
    },
    { label: '运动T恤', pattern: /ringer (?:baby-)?tee/iu },
    { label: '水手风', pattern: /sailor-(?:style|inspired)/iu },
    { label: '街头时尚', pattern: /streetwear|street fashion/iu },
    { label: '运动时尚', pattern: /athletic|sportswear|sporty/iu },
    { label: '蕾丝内衣', pattern: /lace (?:bra|lingerie)/iu },
    { label: '蕾丝长裙', pattern: /lace dress/iu },
    { label: '手机自拍', pattern: /(?:iPhone|phone) selfie/iu }
  ]);
  const appearance = matchEnglishLabel(text, [
    { label: '双马尾', pattern: /twin ponytails?/iu },
    { label: '湿发', pattern: /wet-look|wet hair|damp hair/iu },
    { label: '短波波', pattern: /(?:short |messy )?bob haircut/iu },
    { label: '低髻', pattern: /low bun/iu }
  ]);
  const action = matchEnglishLabel(text, [
    { label: '侧跃', pattern: /side leap/iu },
    { label: '转身', pattern: /mid-turn|turning toward/iu },
    { label: '回眸', pattern: /turns? back|looking back|look-back/iu },
    { label: '旋转', pattern: /spin(?:ning)?|twirl(?:ing)?/iu },
    { label: '行走', pattern: /\bwalking\b/iu },
    { label: '坐姿', pattern: /\bsitting\b|\bseated\b/iu }
  ]);
  const camera = matchEnglishLabel(text, [
    { label: '超低机位', pattern: /ultra-low-angle|worm'?s-eye/iu },
    { label: '低机位', pattern: /low-angle|low angle/iu },
    { label: '俯拍', pattern: /high-angle|top-down|overhead/iu },
    { label: '直闪', pattern: /direct (?:on-camera |phone )?flash/iu },
    { label: '近距离', pattern: /close-up/iu }
  ]);
  const format = matchEnglishLabel(text, [
    {
      label: '短片',
      pattern: /storyboard|(?:\d+\s*)?(?:second|seconds|s) video|montage/iu
    },
    { label: '编辑海报', pattern: /editorial (?:typography )?poster/iu },
    { label: '产品图', pattern: /packshot|product photography/iu },
    { label: '写真', pattern: /portrait|photo(?:graph)?|photorealistic/iu }
  ]);
  const parts = Array.from(
    new Set(
      [scene, appearance, concept, action, camera, format].filter(Boolean)
    )
  );
  const themePartCount = [scene, appearance, concept, action, camera].filter(
    Boolean
  ).length;
  if (!format || themePartCount < 2) return '';
  return parts.join('').slice(0, 32);
}

export function buildPromptThemeTitle(text: string): string {
  const normalized = cleanPromptForTheme(text);
  if (!normalized) return '';
  return (
    buildPromptSpecificTitle(normalized) ||
    buildCjkPromptThemeTitle(normalized) ||
    buildEnglishPromptThemeTitle(normalized)
  );
}

export function isWeakPromptCaseTitle(title: string, prompt = ''): boolean {
  const normalized = cleanText(title);
  const normalizedPrompt = cleanText(prompt);
  if (!normalized) return true;
  if (/^[{[]/u.test(normalized)) return true;
  if (/^\s*\d+\s*:\s*\d+\b/u.test(normalized)) return true;
  if (
    /^(?:please\s+)?(?:create|generate|make|design|produce|render)\b/iu.test(
      normalized
    ) ||
    /^(?:生成|创建|製作|作成|描画)(?:一张|一幅|一个|して)?/u.test(normalized)
  ) {
    return true;
  }
  if (
    normalizedPrompt &&
    normalized.length >= 24 &&
    normalizedPrompt.toLowerCase().startsWith(normalized.toLowerCase())
  ) {
    return true;
  }

  if (/^[\x20-\x7E]+$/u.test(normalized)) {
    const words = normalized.split(/\s+/u).filter(Boolean);
    const hasCaseType =
      /\b(?:portrait|poster|campaign|editorial|photo|photography|video|film|short|storyboard|template|portraits)\b/iu.test(
        normalized
      );
    if (words.length <= 2 && !hasCaseType) return true;
  }

  return false;
}
