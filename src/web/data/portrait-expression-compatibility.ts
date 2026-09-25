export interface PortraitExpressionAssetLike {
  id: string;
  slot: string;
  title: string;
  subtitle?: string;
  prompt: string;
  promptZh?: string;
  tags: string[];
}

export interface PortraitExpressionConflict {
  leftId: string;
  rightId: string;
  reasonZh: string;
  reasonEn: string;
}

function assetText(asset?: PortraitExpressionAssetLike): string {
  if (!asset) return '';
  return [
    asset.id,
    asset.title,
    asset.subtitle || '',
    asset.prompt,
    asset.promptZh || '',
    ...asset.tags
  ]
    .join(' ')
    .toLowerCase();
}

const expressionSignals = {
  mouthClosed:
    /pressed lips|closed lips|sealed lips|tight lips|lips? tightly closed|嘴唇(?:紧闭|合拢)|嘴角紧绷|抿嘴/i,
  mouthOpenLaugh:
    /open-mouth(?:ed)? laugh|wide laugh|laughing with teeth|露齿大笑|张嘴大笑|开怀大笑/i,
  lipBite: /biting? (?:the )?(?:lower )?lip|轻咬下唇|咬唇/i,
  tongue: /tongue|吐舌|舌尖/i,
  directGaze:
    /direct gaze|look(?:ing)? (?:straight )?(?:into|at) (?:the )?camera|eye contact with (?:the )?camera|直视镜头|凝视镜头/i,
  avertedGaze:
    /averted gaze|look(?:ing)? away|not looking at (?:the )?camera|gaze past (?:the )?camera|看向画外|避开镜头|目光穿过镜头|视线穿过镜头/i,
  chinRaised:
    /chin (?:slightly )?(?:raised|lifted|up)|抬下巴|下巴(?:微微)?抬起|仰头/i,
  chinLowered:
    /chin (?:slightly )?(?:tucked|lowered|down)|下巴(?:微微)?收起|下巴微收|低头/i,
  solemn: /sacred|solemn|ritual|ceremonial|神圣|肃穆|仪式感|祭司|神女/i,
  unstableFrame:
    /dutch|full roll|oblique roll|ninety.degree roll|tilted composition|荷兰角|九十度滚转|斜滚转|倾斜构图/i
} as const;

function detectsSameFaceInstantConflict(
  expression: PortraitExpressionAssetLike
): PortraitExpressionConflict[] {
  const text = assetText(expression);
  const conflicts: PortraitExpressionConflict[] = [];
  const push = (reasonZh: string, reasonEn: string) =>
    conflicts.push({
      leftId: expression.id,
      rightId: expression.id,
      reasonZh,
      reasonEn
    });

  if (
    expressionSignals.mouthClosed.test(text) &&
    (expressionSignals.mouthOpenLaugh.test(text) ||
      expressionSignals.tongue.test(text))
  ) {
    push(
      '同一嘴部同时被要求紧闭和张开，无法发生在同一个面部时间切片中',
      'The mouth is asked to stay closed and open in the same facial instant.'
    );
  }
  if (
    expressionSignals.lipBite.test(text) &&
    (expressionSignals.mouthOpenLaugh.test(text) ||
      expressionSignals.tongue.test(text))
  ) {
    push(
      '咬唇与张嘴大笑或吐舌占用同一嘴部动作，应只保留一个',
      'Lip biting conflicts with an open laugh or tongue gesture; keep one mouth action.'
    );
  }
  if (
    expressionSignals.directGaze.test(text) &&
    expressionSignals.avertedGaze.test(text)
  ) {
    push(
      '视线同时被要求直视与避开镜头，镜头关系互相否定',
      'The gaze is asked to make and avoid camera contact at the same time.'
    );
  }
  if (
    expressionSignals.chinRaised.test(text) &&
    expressionSignals.chinLowered.test(text)
  ) {
    push(
      '头部同时被要求抬起与下巴内收，姿态方向互相否定',
      'The head is asked to lift and tuck the chin at the same time.'
    );
  }
  return conflicts;
}

export function hasPortraitExpressionCameraConflict(
  expression: PortraitExpressionAssetLike,
  viewpoint: PortraitExpressionAssetLike
): boolean {
  return (
    expressionSignals.solemn.test(assetText(expression)) &&
    expressionSignals.unstableFrame.test(assetText(viewpoint))
  );
}

export function getPortraitExpressionConflicts(
  assets: PortraitExpressionAssetLike[]
): PortraitExpressionConflict[] {
  const expression = assets.find((asset) => asset.slot === 'expression');
  if (!expression) return [];

  const conflicts = detectsSameFaceInstantConflict(expression);
  const viewpoint = assets.find((asset) => asset.slot === 'viewpoint');
  if (viewpoint && hasPortraitExpressionCameraConflict(expression, viewpoint)) {
    conflicts.push({
      leftId: expression.id,
      rightId: viewpoint.id,
      reasonZh:
        '神圣肃穆依赖稳定、水平的镜头关系，倾斜或滚转机位会把它推向失序感',
      reasonEn:
        'Sacred solemnity depends on a stable level camera relationship; a tilted or rolled viewpoint introduces disorder.'
    });
  }
  return conflicts;
}
