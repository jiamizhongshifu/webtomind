/**
 * Official Image Creation Skill
 * WebToMind 官方预设的图像创作技能（Agent Skills 三层结构）
 *
 * 设计：Agent（默认 DeepSeek）通过该技能的 coreInstructions 学会「按创作模式做提示词工程」，
 * 然后调用 generate_image 工具（复用 WebToMind 服务端图像生成链路）完成出图。
 * 本模块为纯数据 + 纯函数，不依赖任何 I/O，便于单元测试与前后端复用。
 */

import type { AgentSkillDefinition, SkillCategory } from './types.js';

/** 图像创作模式 */
export interface ImageCreationMode {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  /** 推荐生成尺寸 */
  defaultImageSize: '1k' | '2k' | '4k';
  /** 提示词工程要点（注入 system prompt） */
  promptGuidance: string;
}

/** 官方预设的 7 种图像创作模式 */
export const IMAGE_CREATION_MODES: ImageCreationMode[] = [
  {
    id: 'portrait',
    name: '人像写真',
    description: '真人感/时尚感人像写真，控制姿势、光线、镜头、妆容与情绪',
    triggers: ['写真', '人像', '肖像', '自拍', 'portrait', 'selfie', '模特', '拍照'],
    defaultImageSize: '2k',
    promptGuidance: `主体：描述年龄、性别、发型、五官、服装、神态。
光线：自然光/窗光/影棚光/霓虹/逆光，注明方向与色温。
镜头：焦段（35mm/50mm/85mm）、景深、机位（平视/俯视/仰视）、构图（中心/三分/留白）。
氛围：情绪词（慵懒/高级/温柔/酷飒）、背景场景。
负面：畸变、多余肢体、穿帮、过度磨皮。`
  },
  {
    id: 'poster',
    name: '海报/封面',
    description: '营销海报、小红书封面、公众号封面、活动主视觉',
    triggers: ['海报', '封面', '主视觉', 'banner', 'poster', '封面图', '宣传图', '小红书封面'],
    defaultImageSize: '2k',
    promptGuidance: `版式：明确主标题视觉位、副文案位、留白比例（推荐 3:4 竖版封面）。
主体：商品/人物/场景与文案的关系，层级清晰。
风格：极简/国潮/杂志编辑/赛博/渐变弥散等，写明配色（2-3 主色）。
文字：如需画面内文字，注明字体气质与排布；纯视觉海报则不写文字。`
  },
  {
    id: 'product',
    name: '商品图',
    description: '电商主图、白底图、场景图、细节图',
    triggers: ['商品图', '产品图', '白底图', '电商', '产品摄影', 'product shot', '主图'],
    defaultImageSize: '2k',
    promptGuidance: `视角：平视/45°/俯拍，主体占比与居中。
背景：纯白/纯色/场景/光影氛围，注明材质与反光。
质感：材质细节、光比、阴影软硬，商品标签/文案是否入画。
用途：主图（信息清晰）vs 氛围图（情绪优先）。`
  },
  {
    id: 'infographic',
    name: '信息图',
    description: '数据可视化、流程说明、知识卡片',
    triggers: ['信息图', '数据图', '可视化', '知识卡片', '流程图', 'infographic'],
    defaultImageSize: '2k',
    promptGuidance: `结构：标题区、数据/指标区、结论区，纵向 3-4 段。
风格：扁平/手绘/科技感/莫兰迪，配色克制。
图表：柱状/环形/时间轴等，注明数据语义；不编造具体数字，占位符用示例值。`
  },
  {
    id: 'sticker',
    name: '表情包/贴纸',
    description: '4×4 表情网格、贴纸包、IP 表情',
    triggers: ['表情包', '贴纸', 'sticker', '表情', 'emoticon', '4x4', '4×4'],
    defaultImageSize: '1k',
    promptGuidance: `网格：4×4 统一表情，同一角色，不同情绪/动作。
角色：明确 IP 特征（脸型/配色/服饰），跨格保持一致。
风格：粗描边/扁平/3D 软胶/像素，透明底或纯色底。
一致性：每个表情都要可复用同一角色描述。`
  },
  {
    id: 'character_sheet',
    name: '角色三视图',
    description: '角色设定三视图（正面/侧面/背面），用于视频/动画/设计',
    triggers: ['三视图', '角色设定', '人物设定', 'character sheet', 'turnaround', '原画'],
    defaultImageSize: '2k',
    promptGuidance: `布局：同角色正面/侧面/背面三视图，等距并排或 3:4 竖排。
风格：写实/日漫/国漫/3D 手办/水彩/油画，明确画风。
特征：脸型、发型、身材比例、服装、配饰逐项描述，保证三视图一致。
参考：如有参考图，先提取特征再套用。`
  },
  {
    id: 'illustration',
    name: '概念插画',
    description: '风格化插画、封面插画、故事场景',
    triggers: ['插画', '概念图', '场景插画', 'illustration', 'concept art', '壁纸', '画'],
    defaultImageSize: '2k',
    promptGuidance: `主题：场景/人物/叙事，明确主体与陪体。
风格：吉卜力/宫崎骏/新海诚/赛博朋克/扁平/水墨/油画/像素。
色彩：主色调与点缀色，光影氛围。
构图：视觉焦点、景深层次、留白。`
  }
];

const MODE_BY_ID = new Map(IMAGE_CREATION_MODES.map((mode) => [mode.id, mode]));

/** 根据用户输入解析创作模式（按触发词命中数打分，未命中返回 undefined，由 Agent 自行判断） */
export function resolveImageCreationMode(
  prompt: string
): ImageCreationMode | undefined {
  const normalized = String(prompt || '').toLowerCase();
  let best: ImageCreationMode | undefined;
  let bestScore = 0;
  for (const mode of IMAGE_CREATION_MODES) {
    const score = mode.triggers.filter((trigger) =>
      normalized.includes(trigger.toLowerCase())
    ).length;
    if (score > bestScore) {
      best = mode;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : undefined;
}

/** 组装图像创作系统提示（含可选模式强化） */
export function buildImageCreationSystemPrompt(
  explicitModeId?: string
): string {
  const mode = explicitModeId ? MODE_BY_ID.get(explicitModeId) : undefined;
  const modeSection = mode
    ? `\n## 当前创作模式：${mode.name}\n${mode.promptGuidance}\n`
    : '';

  return `# 图像创作 Agent

你是 WebToMind 官方图像创作 Agent。你的任务是把用户的创作意图转成高质量的图像生成结果。

## 工作流程
1. 理解用户意图 → 判断创作模式（人像写真 / 海报封面 / 商品图 / 信息图 / 表情包 / 角色三视图 / 概念插画）。
2. 按模式规则做提示词工程：主体、风格、光线、镜头/构图、色彩、氛围、负面要素。
3. 调用 generate_image 工具生成图片（prompt 用英文效果更好；可按需要选择 imageSize）。
4. 生成结果返回后，如果用户要求调整，基于结果描述做一次精准修改（只改必要的部分，不要推翻重写）。
5. 每轮最多生成 1-2 张，不要批量刷图；出图后简要说明生成内容。

## 通用提示词工程规则
- 一段式完整描述优于零散短语；先主体后环境，先风格后细节。
- 明确负面要素：畸变、多余手指、文字乱码、水印、低清。
- 图片尺寸：1k(1024)、2k(2048)、4k(4096)；默认 2k，表情包默认 1k。
- 涉及真实人物：避免真实名人姓名；保持得体，不生成侵权或违规内容。
${modeSection}
## 输出约定
- 每次调用 generate_image 前，先用一句话说明你选择了哪个模式、为什么。
- 工具返回图片后，把图片以可点击的形式展示给用户，并附上使用的 prompt 摘要。

## 失败与重试（静默，硬性规则）
- 若 generate_image 超时、失败或返回错误：**静默重试**（最多再重试 1 次），
  重试期间不要输出任何「超时/失败/正在重试/请稍等」之类的说明文字。
- 重试仍失败时，只输出一句简短的结果反馈，不展示超时原因、重试次数或过程细节。
`
}

/** 官方 image_creation 技能定义 */
export const imageCreationSkill: AgentSkillDefinition = {
  metadata: {
    name: 'image_creation',
    description:
      '官方图像创作技能：人像写真、海报封面、商品图、信息图、表情包、角色三视图、概念插画',
    triggers: [
      '图像创作',
      '生成图片',
      '画一张',
      '做一张图',
      '写真',
      '海报',
      '封面',
      '商品图',
      '信息图',
      '表情包',
      '三视图',
      '插画',
      'image creation',
      'generate image',
      'poster',
      'portrait',
      'sticker',
      'character sheet',
      'infographic'
    ],
    version: '1.0.0',
    category: 'creative' as SkillCategory,
    priority: 85,
    source: 'system',
    status: 'active',
    runtime: { mode: 'async', planner: 'llm', timeoutMs: 120000, maxSteps: 8 },
    capabilities: {
      allowedTools: ['generate_image'],
      artifactTypes: ['image']
    },
    permissions: { confirmationMode: 'never', sideEffects: [] },
    output: { primaryType: 'image' }
  },

  coreInstructions: buildImageCreationSystemPrompt(),

  supplementaryContent: {
    examples: [
      '「给我做一张秋冬大衣的电商白底图，45度视角」→ product 模式',
      '「生成一组我宠物的表情包，4x4 网格」→ sticker 模式',
      '「做一张新年活动海报，国潮风，3:4 竖版」→ poster 模式',
      '「给这个角色画三视图，日漫风」→ character_sheet 模式'
    ],
    edgeCases:
      '用户描述模糊时先问 1 个关键澄清问题（主体/风格/用途），不要盲目生成；' +
      '用户说「再改一下」时基于上一张图的结果做最小修改。',
    bestPractices:
      '一段式英文 prompt 效果最好；先出 2k 主图，确认后再出变体；' +
      '涉及人像时优先写真模式的光线与镜头规则。',
    commonMistakes:
      '一次生成过多图片；prompt 过短缺乏风格/光线/构图；忽略负面要素；' +
      '真实人物场景使用真实姓名。'
  },

  associatedTools: ['generate_image'],

  toolGuidelines: `generate_image：唯一出图工具。
- prompt：必填，英文完整描述。
- imageSize：1k/2k/4k，默认 2k。
- referenceImages：可选，传入参考图做风格/特征参考（base64 + mimeType）。`
};
