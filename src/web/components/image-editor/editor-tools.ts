export type EditorToolId =
  | 'region'
  | 'annotate'
  | 'crop'
  | 'adjust'
  | 'lighting'
  | 'draw'
  | 'camera'
  | 'palette'
  | 'enhance'
  | 'background-remover'
  | 'video';

export interface EditorToolOption {
  id: string;
  label: string;
  labelEn: string;
  instruction: string;
  instructionEn: string;
}

export interface EditorRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  prompt?: string;
  kind: 'rect' | 'brush';
  /** Draw Region 画笔式区域的原始笔迹点（用于在画布上复现涂抹范围） */
  points?: BrushPoint[];
}

export interface BrushPoint {
  x: number;
  y: number;
}

export interface BrushStroke {
  id: string;
  points: BrushPoint[];
  size: number; // 1-100
  color: string;
  /** Draw Region 画笔预览标记，用于按区域画笔样式渲染 */
  region?: boolean;
}

export interface ImageAdjustmentValues {
  brightness: number;
  contrast: number;
  saturation: number;
  colorTemp: number;
}

export interface CameraAngleState {
  rotate: number; // 方位角 0-360
  vertical: number; // 仰角 -60..60
  zoom: number; // 0.5..2
}

export const DEFAULT_CAMERA_ANGLE: CameraAngleState = {
  rotate: 0,
  vertical: 0,
  zoom: 1
};

/**
 * 把 0-100 的调整值转成 CSS filter，用于画布实时预览。
 * 50 为中性值，不做任何处理。
 */
export function buildAdjustmentFilter(values: ImageAdjustmentValues): string {
  const filters: string[] = [];
  const brightness = values.brightness / 50;
  const contrast = values.contrast / 50;
  const saturation = values.saturation / 50;
  if (Math.abs(brightness - 1) > 0.01) {
    filters.push(`brightness(${brightness.toFixed(2)})`);
  }
  if (Math.abs(contrast - 1) > 0.01) {
    filters.push(`contrast(${contrast.toFixed(2)})`);
  }
  if (Math.abs(saturation - 1) > 0.01) {
    filters.push(`saturate(${saturation.toFixed(2)})`);
  }
  const colorTemp = (values.colorTemp - 50) / 50; // -1..1
  if (Math.abs(colorTemp) > 0.02) {
    if (colorTemp > 0) {
      filters.push(`sepia(${(colorTemp * 0.35).toFixed(2)})`);
    }
    filters.push(`hue-rotate(${(-colorTemp * 14).toFixed(1)}deg)`);
  }
  return filters.join(' ');
}

/**
 * 把 0-100 的调整值转成生成指令（后端以文字指令近似实现参数调整）。
 */
export function buildAdjustmentInstruction(
  values: ImageAdjustmentValues,
  isEnglish: boolean
): string {
  const parts: string[] = [];
  const delta = (value: number) => Math.round((value - 50) * 2);
  const brightness = delta(values.brightness);
  const contrast = delta(values.contrast);
  const saturation = delta(values.saturation);
  if (brightness > 4) {
    parts.push(
      isEnglish
        ? `brighten the image overall by about ${brightness}%`
        : `整体提亮约 ${brightness}%`
    );
  } else if (brightness < -4) {
    parts.push(
      isEnglish
        ? `darken the image overall by about ${-brightness}%`
        : `整体压暗约 ${-brightness}%`
    );
  }
  if (contrast > 4) {
    parts.push(
      isEnglish
        ? `increase contrast by about ${contrast}%`
        : `增强对比约 ${contrast}%`
    );
  } else if (contrast < -4) {
    parts.push(
      isEnglish
        ? `reduce contrast by about ${-contrast}%`
        : `降低对比约 ${-contrast}%`
    );
  }
  if (saturation > 4) {
    parts.push(
      isEnglish
        ? `increase color saturation by about ${saturation}%`
        : `增强饱和度约 ${saturation}%`
    );
  } else if (saturation < -4) {
    parts.push(
      isEnglish
        ? `reduce color saturation by about ${-saturation}%`
        : `降低饱和度约 ${-saturation}%`
    );
  }
  const colorTemp = values.colorTemp - 50;
  if (colorTemp > 4) {
    parts.push(
      isEnglish
        ? 'shift the color temperature warmer'
        : '让整体色温偏暖'
    );
  } else if (colorTemp < -4) {
    parts.push(
      isEnglish
        ? 'shift the color temperature cooler'
        : '让整体色温偏冷'
    );
  }
  return parts.join(isEnglish ? '; ' : '；');
}

/**
 * 把 3D 相机角度转成生成指令：方位角 + 仰角 + 镜头距离。
 */
export function buildCameraInstruction(
  camera: CameraAngleState,
  isEnglish: boolean
): string {
  const rotate = Math.round(((camera.rotate % 360) + 360) % 360);
  const vertical = Math.round(camera.vertical);
  const zoom = camera.zoom;
  const parts: string[] = [];
  let side = 'front';
  if (rotate > 45 && rotate <= 135) side = 'right';
  else if (rotate > 135 && rotate <= 225) side = 'back';
  else if (rotate > 225 && rotate <= 315) side = 'left';
  if (Math.abs(rotate) > 8) {
    parts.push(
      isEnglish
        ? `shoot from the ${side} side (azimuth ${rotate}°)`
        : `从${side === 'front' ? '正' : side === 'right' ? '右' : side === 'back' ? '背' : '左'}侧拍摄（方位角 ${rotate}°）`
    );
  }
  if (Math.abs(vertical) > 5) {
    if (vertical > 0) {
      // vertical 90° = 相机在弧顶（高机位俯拍）
      parts.push(
        isEnglish
          ? `high camera angle looking down (elevation ${vertical}°)`
          : `高机位俯拍（俯角 ${vertical}°）`
      );
    } else {
      // vertical -90° = 相机在弧底（低机位仰拍）
      parts.push(
        isEnglish
          ? `low camera angle looking up (elevation ${vertical}°)`
          : `低机位仰拍（仰角 ${-vertical}°）`
      );
    }
  }
  if (Math.abs(zoom - 1) > 0.08) {
    if (zoom < 1) {
      // zoom 0.6 贴近纸板，1.4 最远
      parts.push(
        isEnglish
          ? `move the camera close to the subject (zoom ${zoom.toFixed(1)}x)`
          : `镜头贴近主体（${zoom.toFixed(1)}x）`
      );
    } else {
      parts.push(
        isEnglish
          ? `pull the camera back (zoom ${zoom.toFixed(1)}x)`
          : `镜头拉远（${zoom.toFixed(1)}x）`
      );
    }
  }
  return parts.join(isEnglish ? '; ' : '；');
}

/**
 * 把画笔笔触转成生成指令：位置（区域描述）+ 颜色 + 粗细。
 * 后端模型看不到笔触图层，用文字近似表达每个标记。
 */
export function buildDrawInstructions(
  strokes: BrushStroke[],
  prompt: string,
  isEnglish: boolean
): string {
  const trimmedPrompt = prompt.trim();
  if (strokes.length === 0) return trimmedPrompt;
  const lines = strokes.map((stroke, index) => {
    const xs = stroke.points.map((p) => p.x);
    const ys = stroke.points.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const xLabel =
      cx < 1 / 3
        ? isEnglish
          ? 'left'
          : '左'
        : cx > 2 / 3
          ? isEnglish
            ? 'right'
            : '右'
          : isEnglish
            ? 'center'
            : '中';
    const yLabel =
      cy < 1 / 3
        ? isEnglish
          ? 'top'
          : '上'
        : cy > 2 / 3
          ? isEnglish
            ? 'bottom'
            : '下'
          : isEnglish
            ? 'middle'
            : '中';
    const thickness =
      stroke.size < 20
        ? isEnglish
          ? 'thin'
          : '细'
        : stroke.size < 50
          ? isEnglish
            ? 'medium'
            : '中等'
          : isEnglish
            ? 'thick'
            : '粗';
    const colorName = stroke.color;
    return isEnglish
      ? `Stroke ${index + 1}: a ${thickness} ${colorName} brush mark in the ${yLabel}-${xLabel} area`
      : `笔触 ${index + 1}：位于画面${yLabel}${xLabel}侧的一条${colorName}色${thickness}线条标记`;
  });
  return [
    trimmedPrompt,
    isEnglish
      ? 'Draw / integrate the following brush marks into the image:'
      : '请把以下画笔标记绘制/融入图片：',
    ...lines,
    isEnglish
      ? 'Follow the position, color and thickness of each mark.'
      : '遵循每个标记的位置、颜色与粗细。'
  ]
    .filter(Boolean)
    .join('\n');
}

export interface EditorToolDefinition {
  id: EditorToolId;
  label: string;
  labelEn: string;
  hint: string;
  hintEn: string;
  options: EditorToolOption[];
}

export const EDITOR_TOOLS: EditorToolDefinition[] = [
  {
    id: 'region',
    label: '更改区域',
    labelEn: 'Change Region',
    hint: '在画布上框选一个区域，只修改该区域。',
    hintEn: 'Box an area on the canvas to change only that region.',
    // krea.ai 的 Change Region 只有 Select / Draw Region / Auto-Mask 三种模式，
    // 没有"保持其他区域不变/替换区域内内容"这类选项按钮；区域范围本身即修改意图。
    options: []
  },
  {
    id: 'annotate',
    label: '标注',
    labelEn: 'Annotate',
    hint: '框选多个区域，分别填写每个区域的修改指令。',
    hintEn: 'Box multiple regions and write a separate instruction for each.',
    options: []
  },
  {
    id: 'crop',
    label: '裁剪与扩展',
    labelEn: 'Crop & Expand',
    hint: '在画布上框选保留范围进行裁剪，可拖拽手柄微调。',
    hintEn: 'Box the area to keep on the canvas, then fine-tune with the handles.',
    options: [
      {
        id: 'crop-local',
        label: '框选裁剪',
        labelEn: 'Box & crop',
        instruction: '',
        instructionEn: ''
      }
    ]
  },
  {
    id: 'adjust',
    label: '图像调整',
    labelEn: 'Image Adjustments',
    hint: '快速调整画面的明暗、对比与饱和度。',
    hintEn: 'Quickly adjust brightness, contrast, and saturation.',
    options: []
  },
  {
    id: 'draw',
    label: '绘画',
    labelEn: 'Draw',
    hint: '用画笔涂抹要修改的区域，AI 只重绘涂抹范围。',
    hintEn: 'Paint over the area to change; AI redraws only the painted range.',
    options: []
  },
  {
    id: 'camera',
    label: '更改相机角度',
    labelEn: 'Change Camera Angle',
    hint: '旋转虚拟相机，直观调整方位、仰角与距离后重新生成。',
    hintEn: 'Rotate the virtual camera around your subject, then generate from the new angle.',
    options: []
  },
  {
    id: 'enhance',
    label: '放大图片',
    labelEn: 'Upscale image',
    hint: '直接将当前原图放大到 2K / 4K，结果保留在版本历史中。',
    hintEn: 'Upscale the current original to 2K / 4K and keep it in version history.',
    options: []
  },
  {
    id: 'background-remover',
    label: '去除背景',
    labelEn: 'Remove Background',
    hint: '自动识别主体并移除背景，输出透明 PNG。',
    hintEn: 'Auto-detect the subject, remove the background, and export a transparent PNG.',
    options: []
  },
  {
    id: 'video',
    label: '转为视频',
    labelEn: 'Turn into Video',
    hint: '把当前图片作为首帧，发送到视频创作生成动态视频。',
    hintEn: 'Send the current image as the first frame into Video creation.',
    options: []
  }
];

const POSITION_LABELS: Array<{ x: string; y: string }> = [
  { x: '左', y: '上' },
  { x: '中', y: '上' },
  { x: '右', y: '上' },
  { x: '左', y: '中' },
  { x: '中', y: '中' },
  { x: '右', y: '中' },
  { x: '左', y: '下' },
  { x: '中', y: '下' },
  { x: '右', y: '下' }
];

function describeRegionPosition(region: EditorRegion): string {
  const cx = region.x + region.width / 2;
  const cy = region.y + region.height / 2;
  const xIndex = cx < 1 / 3 ? 0 : cx > 2 / 3 ? 2 : 1;
  const yIndex = cy < 1 / 3 ? 0 : cy > 2 / 3 ? 2 : 1;
  const position = POSITION_LABELS[yIndex * 3 + xIndex];
  return `${position.y}${position.x}`;
}

function describeRegionSize(region: EditorRegion): string {
  const areaRatio = region.width * region.height;
  if (areaRatio < 0.04) return '较小';
  if (areaRatio < 0.16) return '中等';
  return '较大';
}

/**
 * 把画布上框选/涂抹的区域翻译成空间指令。
 * 后端模型只能看到原图与文字，无法看到叠加框，
 * 因此用相对位置 + 大小描述区域，保证指令可被模型理解。
 */
export function buildRegionInstructions(
  regions: EditorRegion[],
  isEnglish: boolean
): string {
  if (regions.length === 0) return '';
  if (isEnglish) {
    const lines = regions.map((region, index) => {
      const position = describeRegionPosition(region);
      const size = describeRegionSize(region);
      const regionLabel = regions.length > 1 ? `Region ${index + 1}` : 'marked region';
      const instruction = region.prompt?.trim() || 'modify this region';
      return `${regionLabel} is on the ${position} side, ${size} in size. Instruction: ${instruction}.`;
    });
    return [
      'Please modify only the following marked regions of the image:',
      ...lines,
      'Only change the marked regions and keep the rest of the image as unchanged as possible.'
    ].join('\n');
  }
  const lines = regions.map((region, index) => {
    const position = describeRegionPosition(region);
    const size = describeRegionSize(region);
    const regionLabel = regions.length > 1 ? `区域 ${index + 1}` : '标记区域';
    const instruction = region.prompt?.trim() || '修改这个区域';
    return `${regionLabel}位于画面${position}侧、${size}范围，要求：${instruction}`;
  });
  return [
    '请针对图片中的以下标记区域进行修改：',
    ...lines,
    '仅修改标记区域，保持画面其他部分尽量不变。'
  ].join('\n');
}

export function buildAnnotateInstructions(
  regions: EditorRegion[],
  isEnglish: boolean
): string {
  const annotated = regions.filter((region) => region.prompt?.trim());
  if (annotated.length === 0) return '';
  if (isEnglish) {
    const lines = annotated.map((region, index) => {
      const position = describeRegionPosition(region);
      return `Region ${index + 1} (${position} side): ${region.prompt?.trim()}`;
    });
    return [
      'Please modify the following regions of the image separately:',
      ...lines,
      'Follow each region’s instruction independently and keep the rest unchanged.'
    ].join('\n');
  }
  const lines = annotated.map((region, index) => {
    const position = describeRegionPosition(region);
    return `区域 ${index + 1}（画面${position}侧）：${region.prompt?.trim()}`;
  });
  return [
    '请分别修改图片中的以下区域：',
    ...lines,
    '按每个区域的指令单独处理，保持其余部分不变。'
  ].join('\n');
}

export function getToolOption(
  toolId: EditorToolId,
  optionId: string
): EditorToolOption | undefined {
  return EDITOR_TOOLS.find((tool) => tool.id === toolId)?.options.find(
    (option) => option.id === optionId
  );
}

/**
 * 把提示词里的 `@图片N` / `@参考图N` / `@Image N` / `@Reference N`
 * 统一替换为「参考图 N」/「Image N」，供模型与参考图对应。
 */
export function translateReferenceMentions(
  prompt: string,
  isEnglish: boolean
): string {
  if (!prompt) return prompt;
  const label = isEnglish ? 'Image' : '参考图';
  return prompt
    .replace(/@(?:参考图|图片)\s*(\d+)/gi, (_, index: string) => {
      return `${label} ${index}`;
    })
    .replace(/@(?:image|reference)\s*(\d+)/gi, (_, index: string) => {
      return `${label} ${index}`;
    });
}

/**
 * 生成参考图说明块，让模型明确每张图的角色（1 = 编辑源图，其余为补充参考）。
 */
export function buildReferenceMapping(
  referenceLabels: string[],
  isEnglish: boolean
): string {
  if (referenceLabels.length === 0) return '';
  const lines = referenceLabels.map((label, index) => {
    if (isEnglish) {
      return `- Image ${index + 1}: ${label}`;
    }
    return `- 参考图 ${index + 1}：${label}`;
  });
  if (isEnglish) {
    return [
      'Reference image list (refer to them as “Image N” in your instructions):',
      ...lines,
      'Image 1 is the main image being edited.'
    ].join('\n');
  }
  return [
    '参考图清单（请在指令中用「参考图 N」指代对应图片）：',
    ...lines,
    '参考图 1 是需要编辑的主图。'
  ].join('\n');
}

export function resolveReferenceMentionsInPrompt(
  prompt: string,
  referenceCount: number,
  isEnglish: boolean
): string {
  const translated = translateReferenceMentions(prompt, isEnglish);
  const labels = Array.from(
    { length: referenceCount },
    (_, index) =>
      isEnglish
        ? index === 0
          ? 'main image being edited'
          : `auxiliary reference ${index}`
        : index === 0
          ? '正在编辑的主图'
          : `补充参考图 ${index}`
  );
  const mapping = buildReferenceMapping(labels, isEnglish);
  return [translated, mapping].filter(Boolean).join('\n');
}

/**
 * 组合最终编辑指令。判空基于用户实际输入（提示词 + 区域指令），
 * 参考图清单只在用户写了指令或存在多张参考图时追加，
 * 避免“空指令 + 单张源图”时仍然生成非空请求。
 */
export function composeEditorInstruction(
  userPrompt: string,
  regionPrompt: string,
  annotatePrompt: string,
  referenceCount: number,
  isEnglish: boolean
): string {
  const trimmedUser = userPrompt.trim();
  const parts = [trimmedUser, regionPrompt, annotatePrompt].filter(Boolean);
  if (parts.length === 0) return '';
  const joined = parts.join('\n');
  const hasMention = /@(?:图片|参考图|image|reference)\s*\d/i.test(joined);
  // 区域/标注指令里也可能写 @图片N，需要整体翻译一次（对已翻译文本幂等）。
  const translatedJoined = translateReferenceMentions(joined, isEnglish);
  // 只要存在引用 token 或多张参考图，就追加参考图清单。
  const needsMapping = referenceCount > 1 || hasMention;
  if (!needsMapping) return translatedJoined;
  const labels = Array.from(
    { length: referenceCount },
    (_, index) =>
      isEnglish
        ? index === 0
          ? 'main image being edited'
          : `auxiliary reference ${index}`
        : index === 0
          ? '正在编辑的主图'
          : `补充参考图 ${index}`
  );
  const mapping = buildReferenceMapping(labels, isEnglish);
  return [translatedJoined, mapping].filter(Boolean).join('\n');
}
