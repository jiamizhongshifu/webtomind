/**
 * PromptAssetReverse — 反推一张图为可复用的 Prompt 素材
 *
 * 输入：单张图片（base64 / data URL）
 * 输出：结构化 JSON，可直接预填创意工作流"我的素材"的编辑表单。
 *
 * 三级 fallback:
 *   1. Tuzi VLM (OpenAI 兼容 chat)              主力
 *   2. Gemini 3.5 Flash (thinkingBudget=0)      官方通道显式启用时兜底
 *   3. Gemini 3.1 Pro Preview (默认 thinking)   官方通道显式启用时深度兜底
 *
 * 任一层成功立即返回；全部失败返回 ok=false 让前端走"手动填写"。
 */

import { isOfficialGeminiEnabled } from './model-provider-routing.js';

export const SUPPORTED_SLOTS = [
  'character',
  'expression',
  'hairstyle',
  'pose',
  'top',
  'bottom',
  'outfit',
  'onePiece',
  'shoes',
  'background',
  'productSubject',
  'productSurface',
  'composition',
  'titleArea',
  'style',
  'lighting',
  'visualEffect',
  'layoutDesign',
  'accessory',
  'prop',
  'lens',
  'shot',
  'viewpoint',
  'makeup'
] as const;

export type PromptAssetSlot = (typeof SUPPORTED_SLOTS)[number];

const SUPPORTED_SLOT_BY_LOWER = new Map<string, PromptAssetSlot>(
  SUPPORTED_SLOTS.map((slot) => [slot.toLowerCase(), slot])
);

export interface ReversePromptAssetItem {
  slot: PromptAssetSlot;
  title: string;
  subtitle: string;
  prompt: string;
  negativePrompt?: string;
  tags: string[];
  confidence?: number;
}

export interface ReversePromptAssetResult {
  /** VLM 识别出的多个 slot 素材；调用失败或无内容时为空数组 */
  items: ReversePromptAssetItem[];
  /** 模型未识别成功时为 false；前端可继续显示空表单让用户手填 */
  ok: boolean;
  sourceType: 'image' | 'prompt';
  /** 反推得到的完整可生成提示词，用于临时组合预览和提示词编辑器 */
  fullPrompt: string;
  /** 全局负向提示词，不复制到每个素材 */
  negativePrompt: string;
  /** skill route / 视觉风格判断结果 */
  routeHint?: string;
  confidence?: number;
  error?: string;
}

/* ----------------------- 公共工具 ----------------------- */

/**
 * 不同 provider 对 base URL 的约定不一致：
 *   智谱 `https://open.bigmodel.cn/api/paas/v4` 已含 /v4
 *   OpenAI 官方 `https://api.openai.com/v1` 已含 /v1
 *   Tuzi 项目内约定 `https://api.tu-zi.com` 不含 /v1（调用方自己拼）
 *   DeepSeek `https://api.deepseek.com` 不含 /v1
 * 这里归一化：若末尾没有 /v\d+ 就补 /v1，让下游统一拼 `/chat/completions`。
 */
function normalizeChatBaseURL(url: string): string {
  const trimmed = url.replace(/\/+$/, '');
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

function normalizeSlot(value: unknown): PromptAssetSlot {
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    const slot = SUPPORTED_SLOT_BY_LOWER.get(lower);
    if (slot) {
      return slot;
    }
  }
  return 'style';
}

function normalizeStringArray(value: unknown, max = 6): string[] {
  if (!Array.isArray(value)) return [];
  const arr: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      arr.push(item.trim());
      if (arr.length >= max) break;
    }
  }
  return arr;
}

function buildEmptyResult(
  sourceType: ReversePromptAssetResult['sourceType'] = 'image',
  error?: string
): ReversePromptAssetResult {
  return {
    items: [],
    ok: false,
    sourceType,
    fullPrompt: '',
    negativePrompt: '',
    ...(error ? { error } : {})
  };
}

function truncateText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength).trim()}...`
    : trimmed;
}

function parseItem(raw: unknown): ReversePromptAssetItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const prompt = typeof r.prompt === 'string' ? r.prompt.trim() : '';
  // 兼容历史模型协议；新协议不再要求 promptZh/negativePromptZh。
  const promptZh = typeof r.promptZh === 'string' ? r.promptZh.trim() : '';
  if (!prompt && !promptZh) return null;
  return {
    slot: normalizeSlot(r.slot),
    title: typeof r.title === 'string' ? r.title.trim() : '',
    subtitle: typeof r.subtitle === 'string' ? r.subtitle.trim() : '',
    prompt: prompt || promptZh,
    negativePrompt:
      typeof r.negativePrompt === 'string'
        ? r.negativePrompt.trim() || undefined
        : typeof r.negativePromptZh === 'string'
          ? r.negativePromptZh.trim() || undefined
          : undefined,
    // tags 强制收敛到最多 3 个,服务端兜底:即便模型不听话,也截断成子分类级别
    tags: normalizeStringArray(r.tags, 3),
    confidence:
      typeof r.confidence === 'number'
        ? Math.max(0, Math.min(1, r.confidence))
        : undefined
  };
}

export function buildImagePromptAssetReverseSystemPrompt(
  locale: 'zh-CN' | 'en-US' = 'zh-CN'
): string {
  const slotList = SUPPORTED_SLOTS.join(' | ');
  const targetLanguage =
    locale === 'en-US'
      ? 'English. Keep title/subtitle short and natural in English. Use English prompt and negativePrompt.'
      : '中文。title/subtitle/tags/prompt/negativePrompt/fullPrompt 全部使用中文，不要输出英文，不要中英双写。';
  return `你是一名「GPT Image 2 女性写真提示词工程专家」。用户上传了一张参考图，请你按下面的 baseline 把图拆解成多条可复用的"提示词素材"——每个真实出现的素材分类一条。仅返回 JSON，不要 markdown fence 或多余说明。

# 输出语言
当前用户界面语言要求：${targetLanguage}

# 主体 baseline（只负责确认主体边界，不覆盖参考图实际可见特征）
- 主体必须明确成年；不要根据外貌猜测或补写具体年龄，不要引入校园未成年、幼态化或年龄模糊语境。
- 忠实提取参考图可见的人物身份、脸部结构、体态和写真方向，不强制统一民族、脸型、身材或审美模板。
- 合法 SFW 的泳装、贴身、短款、镂空、露背、薄纱层次、性感时尚造型都可以如实拆解；不得因为露肤程度而省略、降级或改写服装类别。
- 仅排除明确裸露、性行为、器官聚焦、偷拍窥视语境，以及未成年或年龄不明确主体的性化表达。

# slot 分类语义（每个 slot 应贴近以下专业维度的某个方向）
- character → "人设"：从下列 9 种人设方向选最接近的并落实到脸型/眼型/鼻型/唇型/骨相：温柔圆脸型 / 清冷高级脸 / 古典鹅蛋脸 / 明艳浓颜脸 / 甜酷小方脸 / 电影故事脸 / 知性长脸型 / 东方丹凤眼 / 自然生活感脸。必须保持"不平均但协调"。
- expression → 表情控制：面部表情、眼神、嘴角和情绪强度；如果原图或 prompt 含 emoji 表情（如 😁 / 🥺 / 😎），必须保留 emoji 作为 prompt 片段的一部分。
- hairstyle → 发型本体：长度、剪裁、分缝、卷曲、编发、马尾或盘发结构；发簪、帽子、发箍等可拆卸物归 accessory。
- pose → 姿态与身体重心：上身、腰胯与腿部的一个主要动作；不得混入景别或机位。
- top → 独立上装：剪裁、面料、颜色；不得包含配套下装、连衣裙或连体服。
- bottom → 独立下装：剪裁、面料、颜色；不得包含配套上装、连衣裙或连体服。
- outfit → 明确配套的独立上装与下装，两者边界可见；不得再拆成 top 和 bottom。
- onePiece → 单件连续覆盖躯干与下半身的服装，如连衣裙、连体裤、连体泳装；不得再拆成 top 和 bottom。
- shoes → 鞋履：款式、颜色、材质。
- accessory → 配饰：项链 / choker / 耳环 / 手包 / 帽子 / 眼镜等。
- prop → 手中物或互动道具：咖啡杯、书、相机、雨伞、花、手机等。
- background → "场景方向"：从下列选择最贴近的——窗边 / 高级卧室 / 城市街头 / 雨后街道 / 海边 / 咖啡馆 / 东方庭院 / 夜景街区 / 影棚。
- productSubject → 产品主体：商品 / 食物 / 建筑 / 物件本体的形态、材质、卖点和可识别轮廓。
- productSurface → 台面环境：承托面、展台、背景材质、辅助道具和商业环境关系。
- composition → 构图方式：只描述主体位置、视觉配重、引导路径、框中框和前中后景关系；不得混入主体裁切、机位、焦段、光线或文字版式。
- titleArea → 标题区：标题安全区、文案留白、信息区位置和可后期叠字空间。
- style → "写真风格 + 气质标签"：写真风格从（温柔治愈 / 轻性感氛围 / 电影故事感 / 都市时尚 / 明艳吸睛 / 夜色情绪 / 假日旅行 / 古典东方 / 活力运动）中选；气质从（温柔 / 松弛 / 清冷 / 明艳 / 自信 / 故事感 / 知性 / 活力）中调和。
- lighting → 光影方向：自然柔光 / 电影感侧逆光 / 大型柔光箱 / 霓虹夜景 / 金色时刻 / 阴天漫反射 等。
- visualEffect → 画面影响 / 后期效果：轻微叠影 / 速度线 / 轻微体积雾 / 戏剧化景深 / RGB颜色分离 / 色散 / 高光溢色 / 胶片颗粒 等。
- layoutDesign → 版式设计：标题位置、字体质感、信息栏、标签系统、海报边框、世界观设定文字、阅读路径；只描述版式骨架和文字系统，不要虚构具体长文案。
- lens → 镜头质感：只描述介质与光学成像，如现代数码、中画幅、35mm 彩色负片、一次性相机直闪、柔光镜、变形宽银幕、鱼眼、手机计算摄影、银盐黑白；不得混入景别、自拍动作或构图。
- shot → 景别：只描述裁切边界与主体占比，如眼部极特写、面部特写、头肩、胸上、腰上、膝上、全身、远景、大远景；不得混入焦段、机位、侧身、自拍或动作。
- viewpoint → 机位与视角：平视 / 俯拍 / 顶视 / 低机位 / 地面仰视 / 三分之四侧面 / 侧面 / 越肩 / 荷兰角；不得混入景别或焦段。
- makeup → 妆容方向：自然淡妆 / 明艳浓妆 / 清冷裸妆 / 古典东方妆 / 街头日常妆 等。

# 表达安全规则
- 对明确成年主体，保留合法 SFW 的性感、时尚、泳装、贴身、短款、镂空、露背和半透明叠层语义；只把描述落实到服装结构、材质、姿态、镜头与光线，不擅自弱化或删除。
- 只改写露骨器官聚焦、明确性行为、偷拍窥视或把年龄不明确主体性化的内容；不得用笼统的"尺度过大"代替分类判断。

# 输出 schema
{
  "fullPrompt": "基于参考图反推出的完整可生成提示词。必须是一个 coherent photographed moment，不要只列字段；首句写明画幅/构图方向。",
  "negativePrompt": "全局负向提示词，只放一次，不要复制到每个素材",
  "routeHint": "最接近的写真/视觉 route，例如 clean-lifestyle / urban-fashion / studio-retouched / fantasy 等",
  "confidence": 0.0-1.0,
  "items": [
    {
      "slot": 上述分类之一 (${slotList}),
      "title": "与用户界面语言一致的 2-8 字/词短标题（例如清冷高级脸 / cream knit cardigan）",
      "subtitle": "与用户界面语言一致的短副标题（定位标签）",
      "prompt": "与用户界面语言一致的 prompt 片段；只描述该 slot 的视觉本质，不复述整张图",
      "negativePrompt": "可选；仅放该 slot 强相关负向限制，不要复制全局负向提示词",
      "tags": 1-3 个中文"子分类标签"(见下方 tag 规则,严格收敛)
    }
  ]
}

# tag 规则(严格,违反就视为错误输出)
**tags 字段只允许放该 slot 下的"子分类"——即用户用来筛选同 slot 内不同种类素材的二级分类标签。**

每个 slot 的合法 tag 方向:
- character → 人设标签:温柔圆脸型 / 清冷高级脸 / 古典鹅蛋脸 / 明艳浓颜脸 / 甜酷小方脸 / 电影故事脸 / 知性长脸型 / 东方丹凤眼 / 自然生活感脸
- expression → 表情类型:开心 / 温柔 / 俏皮 / 喜欢 / 思考 / 酷感 / 惊讶 / 委屈 / 伤感 / 生气 / 困倦
- hairstyle → 发型类型:短发 / 长直发 / 波浪卷发 / 马尾 / 编发 / 盘发 / 湿发 / 古风发型
- pose → 姿态类型:站姿 / 坐姿 / 行走 / 蹲坐 / 倚靠 / 回眸 / 侧身 / 俯仰
- top → 上装品类:衬衫 / 西装 / 针织 / T恤 / 卫衣 / 吊带 / 外套
- bottom → 下装品类:长裤 / 短裤 / 半裙 / 长裙 / 牛仔 / 西裤
- outfit → 套装品类:通勤套装 / 运动套装 / 居家套装 / 时装套装 / 中国古装 / 新中式套装
- onePiece → 一体式品类:连衣裙 / 连体裤 / 连体泳装 / 连体时装 / 礼服 / 旗袍
- shoes → 鞋款:平底鞋 / 高跟鞋 / 运动鞋 / 靴子 / 凉鞋
- accessory → 配饰品类:项链 / 耳环 / 手包 / 帽子 / 眼镜 / 围巾 / 手表
- prop → 道具品类:**包 / 饮品 / 书 / 花 / 雨伞 / 手机 / 相机**(只写"是什么"不写细节)
- background → 场景类型:窗边 / 卧室 / 街头 / 海边 / 咖啡馆 / 庭院 / 夜景 / 影棚
- productSubject → 主体类型:消费品 / 食物饮品 / 空间建筑 / 品牌物件
- productSurface → 台面类型:台面 / 展示场景 / 自然环境 / 生活方式
- composition → 构图类型:中心对称 / 左三分位 / 右三分位 / 负空间 / 框中框 / 引导线 / 对角线平衡 / 前景分层 / 非对称配重
- titleArea → 标题区类型:顶部标题 / 侧边标题 / 底部信息 / 大留白
- style → 写真风格名:温柔治愈 / 轻性感氛围 / 电影故事感 / 都市时尚 / 明艳吸睛 / 夜色情绪 / 假日旅行 / 古典东方 / 活力运动
- lighting → 光影方向:自然柔光 / 侧逆光 / 柔光箱 / 霓虹夜景 / 金色时刻 / 阴天漫反射
- visualEffect → 画面效果:叠影 / 动效 / 雾化 / 景深 / 故障 / 色散 / 高光 / 颗粒
- layoutDesign → 版式类型:标题 / 注释 / 档案 / 世界观 / 封面 / 电商 / 留白 / 标签
- lens → 成像类型:现代数码 / 中画幅 / 35mm负片 / 一次性相机 / 柔光镜 / 变形宽银幕 / 鱼眼 / 手机计算摄影 / 黑白银盐
- shot → 景别类型:眼部极特写 / 面部特写 / 头肩近景 / 胸上近景 / 腰上中景 / 膝上中全景 / 全身景 / 远景 / 大远景
- viewpoint → 机位类型:平视 / 俯拍 / 顶视 / 低机位 / 地面仰视 / 三分之四 / 侧面 / 越肩 / 荷兰角
- makeup → 妆容方向:自然淡妆 / 明艳浓妆 / 清冷裸妆 / 古典东方妆 / 街头日常妆

**严禁出现在 tags 里的内容**(这些应该写进 prompt / subtitle):
- 颜色:米白 / 黑色 / 卡其 / 浅蓝(❌)
- 材质:帆布 / 丝绸 / 棉麻 / 针织(❌ 除非该 slot 就是 top/bottom)
- 细分形态:单肩 / 斜挎 / 短款 / 阔腿(❌)
- 情绪/气质:松弛 / 自信 / 慵懒(❌ 除非该 slot 是 style)
- 用途:通勤 / 度假 / 居家(❌)
- 季节:春夏 / 秋冬(❌)

# 提取规则
1. 走查图里每个分类,真实可见才生成;不要 fabricate 不存在的内容。典型一张全身照能产出 6-10 个 item。
2. 每个 slot 最多 1 项;不要重复。
3. 每条 prompt 只描述该 slot 的视觉特征——不要复述场景全貌(除非 slot 就是 background)。**所有颜色/材质/廓形/情绪/用途细节都进 prompt,不进 tags。**
4. character 这条必须显式落到一个"人设方向"(如清冷高级脸 / 温柔圆脸型 等),并把脸型/眼型/鼻型/唇型/骨相用 1-2 句概括,保持"不平均但协调"。
5. style 这条必须同时点出"写真风格 + 气质标签",让用户后续可以与其它素材组合。
6. title / subtitle / tags / prompt / negativePrompt / fullPrompt 全部使用当前用户界面语言，不要中英双写。
7. 严禁输出未成年或年龄不明确主体的性化表达、明确裸露、性行为、器官聚焦或偷拍窥视语境；不得过滤合法 SFW 的性感时尚服装。
8. 仅返回 raw JSON,不要 markdown 围栏。

# 正确示例(参照)
用户上传一张"米白色单肩帆布托特包,通勤生活感"的图片:
- ❌ 错误:tags = ["帆布包", "米白", "单肩", "生活感", "通勤"]
- ✅ 正确:tags = ["包"]
- ✅ 正确:title = "米白帆布托特", subtitle = "通勤生活感", prompt = "Off-white canvas tote bag, single shoulder strap, soft slouchy silhouette, everyday commuter feel"`;
}

export function buildPromptImportSystemPrompt(): string {
  const slotList = SUPPORTED_SLOTS.join(' | ');
  return `你是一名「图片生成提示词素材拆解专家」。用户会粘贴一段完整的图片生成 prompt。你的任务是从成品 prompt 中提取可复用的视觉素材条目，用于可视化提示词库。

只返回 raw JSON，不要 markdown fence 或解释。

# slot 分类
- character → 人设 / 人物外貌 / 角色设定
- expression → 表情控制 / 眼神 / 嘴角 / emoji 表情
- hairstyle → 发型本体 / 长度 / 剪裁 / 卷曲 / 编发 / 马尾 / 盘发；发饰归 accessory
- pose → 姿态与身体重心
- top → 独立上装；不得包含配套下装或一体式服装
- bottom → 独立下装；不得包含配套上装或一体式服装
- outfit → 明确配套且上下装边界可见的成套服装；不得再拆成 top + bottom
- onePiece → 连衣裙、连体裤、连体泳装等单件连续服装；不得再拆成 top + bottom
- shoes → 鞋履
- accessory → 配饰: 项链 / choker / 耳环 / 手包 / 帽子 / 眼镜 / 发饰等
- prop → 手中物或互动道具: 传单 / 玩偶 / 咖啡杯 / 书 / 相机 / 雨伞 / 花 / 手机等
- background → 场景方向 / 空间环境
- productSubject → 产品主体 / 商品 / 食物 / 建筑 / 物件本体
- productSurface → 台面环境 / 承托面 / 展示背景
- composition → 主体位置 / 视觉配重 / 引导路径 / 框中框 / 前中后景；不得混入景别、机位、光线或版式
- titleArea → 标题区 / 文案留白 / 信息安全区
- style → 写真风格 + 气质标签
- lighting → 光影方向
- visualEffect → 画面影响 / 后期效果 / 速度线 / 叠影 / 色散 / 雾化
- layoutDesign → 版式设计 / 标题 / 字体质感 / 信息栏 / 标签系统
- lens → 拍摄介质与光学成像；不得混入景别、自拍动作或构图
- shot → 人物裁切边界与主体占比；不得混入焦段、机位、朝向或动作
- viewpoint → 机位高度 / 俯仰 / 环绕方位 / 画面滚转
- makeup → 妆容方向

# 文本 prompt 拆解规则
1. 必须进行模型级语义提炼，不要简单按关键词整段截取。每条素材 prompt 应该是该 slot 的可复用提示词片段，只描述该分类的视觉本质。
2. 保持用户原始语言。用户输入中文，就输出中文 prompt；用户输入英文，就输出英文 prompt。不要翻译，不要中英双写。
3. 如果原 prompt 内含全局负向提示词，只提取与该 slot 强相关的负向限制；不要把完整负向提示词复制到每一项。
4. 如果原 prompt 很长，重点拆 character / expression / hairstyle / pose / top / bottom / outfit / onePiece / shoes / background / productSubject / productSurface / composition / titleArea / style / lighting / visualEffect / layoutDesign / lens / shot / viewpoint / makeup / accessory / prop 中最有复用价值的 4-10 项。发型必须独立归入 hairstyle，不与 character 或 accessory 混合；完整配套上下装必须归入 outfit；连衣裙、连体裤等单件完整服装归入 onePiece；两者都不得同时拆成 top 和 bottom。
5. 如果原 prompt 含占位符（例如【指定角色】/ 用户填写 / TBD），不要把占位符原样作为素材；只提取已经具体化的视觉内容。
6. 每个 slot 最多 1 项。
7. title / subtitle / tags 使用用户界面语言的简短中文词组；prompt / negativePrompt 保持原 prompt 语言。
8. 明确成年且合法 SFW 的性感、泳装、贴身、短款、镂空、露背与半透明叠层语义必须忠实保留，不因尺度省略或降级；仅排除未成年或年龄不明确主体的性化表达、明确裸露、性行为、器官聚焦和偷拍窥视语境。

# tag 规则
tags 字段只允许放该 slot 下的子分类标签，1-3 个。不要放颜色、材质、情绪、用途、季节等描述。
- character → 温柔圆脸型 / 清冷高级脸 / 古典鹅蛋脸 / 明艳浓颜脸 / 甜酷小方脸 / 电影故事脸 / 知性长脸型 / 东方丹凤眼 / 自然生活感脸
- expression → 开心 / 温柔 / 俏皮 / 喜欢 / 思考 / 酷感 / 惊讶 / 委屈 / 伤感 / 生气 / 困倦
- hairstyle → 短发 / 长直发 / 波浪卷发 / 马尾 / 编发 / 盘发 / 湿发 / 古风发型
- pose → 站姿 / 坐姿 / 行走 / 蹲坐 / 倚靠 / 回眸 / 侧身 / 俯仰
- top → 衬衫 / 西装 / 针织 / T恤 / 卫衣 / 吊带 / 外套
- bottom → 长裤 / 短裤 / 半裙 / 长裙 / 牛仔 / 西裤
- outfit → 通勤套装 / 运动套装 / 居家套装 / 时装套装 / 中国古装 / 新中式套装
- onePiece → 连衣裙 / 连体裤 / 连体泳装 / 连体时装 / 礼服 / 旗袍
- shoes → 平底鞋 / 高跟鞋 / 运动鞋 / 靴子 / 凉鞋
- accessory → 项链 / 耳环 / 手包 / 帽子 / 眼镜 / 围巾 / 手表
- prop → 包 / 饮品 / 书 / 花 / 雨伞 / 手机 / 相机
- background → 窗边 / 卧室 / 街头 / 海边 / 咖啡馆 / 庭院 / 夜景 / 影棚
- productSubject → 消费品 / 食物饮品 / 空间建筑 / 品牌物件
- productSurface → 台面 / 展示场景 / 自然环境 / 生活方式
- composition → 中心对称 / 左三分位 / 右三分位 / 负空间 / 框中框 / 引导线 / 对角线平衡 / 前景分层 / 非对称配重
- titleArea → 顶部标题 / 侧边标题 / 底部信息 / 大留白
- style → 温柔治愈 / 轻性感氛围 / 电影故事感 / 都市时尚 / 明艳吸睛 / 夜色情绪 / 假日旅行 / 古典东方 / 活力运动
- lighting → 自然柔光 / 侧逆光 / 柔光箱 / 霓虹夜景 / 金色时刻 / 阴天漫反射
- visualEffect → 叠影 / 动效 / 雾化 / 景深 / 故障 / 色散 / 高光 / 颗粒
- layoutDesign → 标题 / 注释 / 档案 / 世界观 / 封面 / 电商 / 留白 / 标签
- lens → 现代数码 / 中画幅 / 35mm负片 / 一次性相机 / 柔光镜 / 变形宽银幕 / 鱼眼 / 手机计算摄影 / 黑白银盐
- shot → 眼部极特写 / 面部特写 / 头肩近景 / 胸上近景 / 腰上中景 / 膝上中全景 / 全身景 / 远景 / 大远景
- viewpoint → 平视 / 俯拍 / 顶视 / 低机位 / 地面仰视 / 三分之四 / 侧面 / 越肩 / 荷兰角
- makeup → 自然淡妆 / 明艳浓妆 / 清冷裸妆 / 古典东方妆 / 街头日常妆

# 输出 schema
{
  "fullPrompt": "保持用户原语言的完整成品提示词；可以在不改变意图的前提下按导演式结构整理，但不要翻译",
  "negativePrompt": "保持用户原语言的全局负向提示词，只放一次",
  "routeHint": "最接近的写真/视觉 route",
  "confidence": 0.0-1.0,
  "items": [
    {
      "slot": 上述分类之一 (${slotList}),
      "title": "中文短标题",
      "subtitle": "中文副标题",
      "prompt": "保持用户原语言的可复用提示词片段",
      "negativePrompt": "保持用户原语言的可选负向提示词片段",
      "tags": ["1-3 个中文子分类标签"]
    }
  ]
}`;
}

function normalizeConfidence(value: unknown): number | undefined {
  return typeof value === 'number'
    ? Math.max(0, Math.min(1, value))
    : undefined;
}

/** 把 raw JSON 文本拆解成完整 reverse result,失败返回 null */
function extractReverseResultFromJson(
  raw: string,
  sourceType: ReversePromptAssetResult['sourceType'],
  fallbackFullPrompt = ''
): ReversePromptAssetResult | null {
  if (!raw) return null;
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch {
    return null;
  }

  let rawItems: unknown[] = [];
  if (Array.isArray(parsed.items)) {
    rawItems = parsed.items;
  } else if (parsed.slot || parsed.prompt) {
    // 兼容老协议：模型偷懒只给单条
    rawItems = [parsed];
  }

  const items: ReversePromptAssetItem[] = [];
  const seenSlots = new Set<PromptAssetSlot>();
  for (const raw of rawItems) {
    const item = parseItem(raw);
    if (!item) continue;
    if (seenSlots.has(item.slot)) continue;
    seenSlots.add(item.slot);
    items.push(item);
  }
  const fullPrompt =
    typeof parsed.fullPrompt === 'string'
      ? parsed.fullPrompt.trim()
      : typeof parsed.finalPrompt === 'string'
        ? parsed.finalPrompt.trim()
        : fallbackFullPrompt.trim();
  const negativePrompt =
    typeof parsed.negativePrompt === 'string'
      ? parsed.negativePrompt.trim()
      : typeof parsed.negative === 'string'
        ? parsed.negative.trim()
        : '';
  const routeHint =
    typeof parsed.routeHint === 'string' ? parsed.routeHint.trim() : undefined;
  const confidence = normalizeConfidence(parsed.confidence);

  if (items.length === 0 && !fullPrompt) return null;
  return {
    items,
    ok: true,
    sourceType,
    fullPrompt:
      fullPrompt ||
      items
        .map((item) => item.prompt)
        .filter(Boolean)
        .join('\n\n'),
    negativePrompt,
    routeHint,
    confidence
  };
}

function splitPromptText(promptText: string): {
  positive: string;
  negative: string;
} {
  const trimmed = promptText.trim();
  if (!trimmed) return { positive: '', negative: '' };

  const matches = Array.from(
    trimmed.matchAll(
      /(?:负面提示词|负面限制词|负面限制|负向\s*Prompt|negative\s*prompt|negative)\s*[：:]/gi
    )
  );
  const last = matches.at(-1);
  if (!last || typeof last.index !== 'number') {
    return { positive: trimmed, negative: '' };
  }

  const positive = trimmed.slice(0, last.index).trim();
  const negative = trimmed
    .slice(last.index + last[0].length)
    .trim()
    .replace(/^[\s：:]+/, '');
  return { positive: positive || trimmed, negative };
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function firstNonEmptyLine(value: string): string {
  return (
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || ''
  );
}

function collectSentencesByKeywords(
  source: string,
  keywords: string[],
  maxLength = 520
): string {
  const normalized = source.replace(/\r/g, '\n');
  const chunks = normalized
    .split(/(?<=[。！？!?])\s*|\n+/u)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const matched: string[] = [];
  for (const chunk of chunks) {
    if (keywords.some((keyword) => chunk.includes(keyword))) {
      matched.push(chunk);
    }
    if (matched.join('。').length >= maxLength) break;
  }
  return truncateText(matched.join('。'), maxLength);
}

function inferTagsForSlot(slot: PromptAssetSlot, text: string): string[] {
  const has = (keyword: string) => text.includes(keyword);
  switch (slot) {
    case 'character':
      if (has('圆脸')) return ['温柔圆脸型'];
      if (has('高级') || has('冷淡') || has('清冷')) return ['清冷高级脸'];
      if (has('明艳') || has('浓颜')) return ['明艳浓颜脸'];
      if (has('电影') || has('故事')) return ['电影故事脸'];
      return ['自然生活感脸'];
    case 'expression':
      if (has('😁') || has('😄') || has('😂') || has('开心') || has('大笑'))
        return ['开心'];
      if (has('😊') || has('温柔') || has('微笑')) return ['温柔'];
      if (has('😉') || has('俏皮') || has('眨眼')) return ['俏皮'];
      if (has('😍') || has('喜欢') || has('爱心')) return ['喜欢'];
      if (has('🤔') || has('思考') || has('疑问')) return ['思考'];
      if (has('😎') || has('酷')) return ['酷感'];
      if (has('😮') || has('惊讶')) return ['惊讶'];
      if (has('🥺') || has('委屈')) return ['委屈'];
      if (has('😢') || has('哭') || has('伤感')) return ['伤感'];
      if (has('😠') || has('生气')) return ['生气'];
      if (has('😴') || has('困')) return ['困倦'];
      return ['温柔'];
    case 'hairstyle':
      if (has('湿发') || has('wet-look')) return ['湿发'];
      if (has('盘发') || has('发髻') || has('髻')) return ['盘发'];
      if (has('编发') || has('辫')) return ['编发'];
      if (has('马尾')) return ['马尾'];
      if (has('卷发') || has('波浪')) return ['波浪卷发'];
      if (has('短发') || has('波波头') || has('pixie')) return ['短发'];
      if (has('古风') || has('古代') || has('汉') || has('唐') || has('宋')) {
        return ['古风发型'];
      }
      return ['长直发'];
    case 'pose':
      if (has('走')) return ['行走'];
      if (has('坐')) return ['坐姿'];
      if (has('蹲') || has('跪')) return ['蹲坐'];
      if (has('回眸')) return ['回眸'];
      if (has('侧身')) return ['侧身'];
      return ['站姿'];
    case 'top':
      if (has('比基尼') || has('泳装')) return ['吊带'];
      if (has('衬衫')) return ['衬衫'];
      if (has('西装')) return ['西装'];
      if (has('针织')) return ['针织'];
      if (has('外套')) return ['外套'];
      return ['上装'];
    case 'bottom':
      if (has('短裙')) return ['半裙'];
      if (has('长裙')) return ['长裙'];
      if (has('短裤')) return ['短裤'];
      if (has('长裤')) return ['长裤'];
      return ['半裙'];
    case 'outfit':
      if (has('古装') || has('汉服') || has('唐制') || has('宋制')) {
        return ['中国古装'];
      }
      if (has('新中式')) return ['新中式套装'];
      if (has('运动')) return ['运动套装'];
      if (has('居家') || has('睡衣')) return ['居家套装'];
      if (has('通勤') || has('西装')) return ['通勤套装'];
      return ['时装套装'];
    case 'onePiece':
      if (has('连体泳装') || has('连身泳装')) return ['连体泳装'];
      if (has('连体裤')) return ['连体裤'];
      if (has('旗袍')) return ['旗袍'];
      if (has('礼服')) return ['礼服'];
      if (has('连体服') || has('bodysuit')) return ['连体时装'];
      return ['连衣裙'];
    case 'accessory':
      if (has('耳环') || has('耳坠')) return ['耳环'];
      if (has('项圈') || has('项链')) return ['项链'];
      if (has('帽')) return ['帽子'];
      if (has('眼镜')) return ['眼镜'];
      return ['项链'];
    case 'prop':
      if (has('手机')) return ['手机'];
      if (has('相机')) return ['相机'];
      if (has('花')) return ['花'];
      if (has('书')) return ['书'];
      if (has('传单') || has('导览')) return ['书'];
      return ['包'];
    case 'background':
      if (has('卧室') || has('房间')) return ['卧室'];
      if (has('街')) return ['街头'];
      if (has('海')) return ['海边'];
      if (has('咖啡')) return ['咖啡馆'];
      if (has('影棚')) return ['影棚'];
      return ['街头'];
    case 'productSubject':
      if (has('食物') || has('甜品') || has('蛋糕') || has('饮品')) {
        return ['食物饮品'];
      }
      if (has('建筑') || has('空间') || has('舞台')) return ['空间建筑'];
      if (has('品牌') || has('logo') || has('联名')) return ['品牌物件'];
      return ['消费品'];
    case 'productSurface':
      if (has('自然') || has('植物') || has('水面')) return ['自然环境'];
      if (has('居家') || has('厨房') || has('浴室') || has('办公')) {
        return ['生活方式'];
      }
      if (has('展台') || has('橱窗') || has('棚拍')) return ['展示场景'];
      return ['台面'];
    case 'composition':
      if (has('中心') || has('对称')) return ['中心对称'];
      if (has('左三分')) return ['左三分位'];
      if (has('右三分')) return ['右三分位'];
      if (has('负空间') || has('留白')) return ['负空间'];
      if (has('框中框') || has('门框')) return ['框中框'];
      if (has('引导线') || has('汇聚')) return ['引导线'];
      if (has('对角线')) return ['对角线平衡'];
      if (has('前景') || has('分层')) return ['前景分层'];
      return ['非对称配重'];
    case 'titleArea':
      if (has('侧边') || has('竖排')) return ['侧边标题'];
      if (has('底部') || has('信息栏') || has('卖点')) return ['底部信息'];
      if (has('留白') || has('安全区') || has('空白')) return ['大留白'];
      return ['顶部标题'];
    case 'style':
      if (has('电影')) return ['电影故事感'];
      if (has('甜美') || has('治愈')) return ['温柔治愈'];
      if (has('时尚')) return ['都市时尚'];
      if (has('运动')) return ['活力运动'];
      return ['温柔治愈'];
    case 'lighting':
      if (has('逆光')) return ['侧逆光'];
      if (has('金色') || has('午后') || has('阳光')) return ['金色时刻'];
      if (has('柔光')) return ['自然柔光'];
      if (has('霓虹')) return ['霓虹夜景'];
      return ['自然柔光'];
    case 'visualEffect':
      if (has('叠影') || has('残像')) return ['叠影'];
      if (has('速度线') || has('动势')) return ['动效'];
      if (has('体积雾') || has('雾')) return ['雾化'];
      if (has('景深') || has('虚化')) return ['景深'];
      if (has('RGB') || has('故障')) return ['故障'];
      if (has('色散')) return ['色散'];
      if (has('高光') || has('溢色')) return ['高光'];
      if (has('颗粒') || has('胶片')) return ['颗粒'];
      return ['动效'];
    case 'layoutDesign':
      if (has('玻璃') || has('标题') || has('角色名称')) return ['标题'];
      if (has('手写') || has('注释')) return ['注释'];
      if (has('档案') || has('阵营') || has('称号')) return ['档案'];
      if (has('世界观') || has('神秘符号')) return ['世界观'];
      if (has('封面') || has('杂志')) return ['封面'];
      if (has('电商') || has('卖点')) return ['电商'];
      if (has('留白')) return ['留白'];
      if (has('标签') || has('贴纸')) return ['标签'];
      return ['标题'];
    case 'lens':
      if (has('中画幅')) return ['中画幅'];
      if (has('一次性相机')) return ['一次性相机'];
      if (has('柔光镜') || has('扩散镜')) return ['柔光镜'];
      if (has('变形宽') || has('anamorphic')) return ['变形宽银幕'];
      if (has('鱼眼')) return ['鱼眼'];
      if (has('手机') || has('计算摄影')) return ['手机计算摄影'];
      if (has('黑白') || has('银盐')) return ['黑白银盐'];
      if (has('35mm') || has('彩色负片')) return ['35mm负片'];
      return ['现代数码'];
    case 'shot':
      if (has('眼部') || has('双眼') || has('眉部')) return ['眼部极特写'];
      if (has('面部特写') || has('发顶至下巴')) return ['面部特写'];
      if (has('头肩')) return ['头肩近景'];
      if (has('胸上') || has('上胸')) return ['胸上近景'];
      if (has('腰上') || has('腰部')) return ['腰上中景'];
      if (has('膝上') || has('膝部')) return ['膝上中全景'];
      if (has('大远景') || has('六分之一')) return ['大远景'];
      if (has('远景') || has('三分之一')) return ['远景'];
      return ['全身景'];
    case 'viewpoint':
      if (has('近顶视') || has('顶视')) return ['顶视'];
      if (has('地面仰视')) return ['地面仰视'];
      if (has('低机位') || has('仰拍')) return ['低机位'];
      if (has('俯拍')) return ['俯拍'];
      if (has('三分之四')) return ['三分之四'];
      if (has('越肩')) return ['越肩'];
      if (has('荷兰角')) return ['荷兰角'];
      if (has('侧面')) return ['侧面'];
      return ['平视'];
    case 'makeup':
      if (has('浓妆') || has('明艳')) return ['明艳浓妆'];
      if (has('裸妆') || has('清冷')) return ['清冷裸妆'];
      if (has('日常')) return ['街头日常妆'];
      return ['自然淡妆'];
    default:
      return [];
  }
}

function makeHeuristicItem(
  slot: PromptAssetSlot,
  title: string,
  subtitle: string,
  prompt: string,
  negativePrompt = ''
): ReversePromptAssetItem | null {
  const text = compactWhitespace(prompt);
  if (!text) return null;
  return {
    slot,
    title: truncateText(title, 8),
    subtitle: truncateText(subtitle, 14),
    prompt: text,
    negativePrompt: negativePrompt
      ? compactWhitespace(negativePrompt)
      : undefined,
    tags: inferTagsForSlot(slot, text)
  };
}

function buildHeuristicWardrobeItems(
  positive: string,
  negative: string
): Array<ReversePromptAssetItem | null> {
  const onePiecePrompt = collectSentencesByKeywords(positive, [
    '连衣裙',
    '连体裤',
    '连体泳装',
    '连身泳装',
    '连体服',
    '旗袍',
    '单件礼服'
  ]);
  if (onePiecePrompt) {
    return [
      makeHeuristicItem(
        'onePiece',
        '一体式服装',
        '单件连续结构',
        onePiecePrompt,
        negative
      )
    ];
  }

  const outfitPrompt = collectSentencesByKeywords(positive, [
    '套装',
    '成套',
    '配套上下装',
    '上衣与下装',
    '上装与下装',
    '上衣和长裤',
    '上衣和短裤',
    '上衣和半裙'
  ]);
  if (outfitPrompt) {
    return [
      makeHeuristicItem(
        'outfit',
        '配套服装',
        '上下装成套',
        outfitPrompt,
        negative
      )
    ];
  }

  return [
    makeHeuristicItem(
      'top',
      '独立上装',
      '上装结构',
      collectSentencesByKeywords(positive, [
        '上装',
        '上衣',
        '衬衫',
        '西装',
        '针织',
        'T恤',
        '卫衣',
        '吊带',
        '外套',
        '比基尼上装'
      ]),
      negative
    ),
    makeHeuristicItem(
      'bottom',
      '独立下装',
      '下装结构',
      collectSentencesByKeywords(positive, [
        '下装',
        '长裤',
        '短裤',
        '半裙',
        '长裙',
        '牛仔裤',
        '西裤',
        '比基尼下装'
      ]),
      negative
    )
  ];
}

export function buildHeuristicPromptImportItems(
  promptText: string
): ReversePromptAssetItem[] {
  const { positive, negative } = splitPromptText(promptText);
  const lead = firstNonEmptyLine(positive);
  const items: Array<ReversePromptAssetItem | null> = [
    makeHeuristicItem(
      'style',
      '整体风格',
      '粘贴导入',
      collectSentencesByKeywords(positive, [
        '生成',
        '风格',
        '气质',
        '真实',
        '抓拍',
        '写真'
      ]) ||
        lead ||
        positive,
      negative
    ),
    makeHeuristicItem(
      'character',
      '人设',
      '人物气质',
      collectSentencesByKeywords(positive, [
        '女性',
        '人物',
        '五官',
        '脸型',
        '眼型',
        '鼻型',
        '唇型',
        '骨相'
      ]),
      negative
    ),
    makeHeuristicItem(
      'expression',
      '表情',
      '面部情绪',
      collectSentencesByKeywords(positive, [
        '表情',
        '人物表情',
        '笑容',
        '微笑',
        '大笑',
        '眨眼',
        '眼神',
        '哭',
        '委屈',
        '生气',
        '惊讶',
        '😁',
        '😄',
        '😂',
        '😊',
        '😉',
        '😍',
        '😎',
        '🥺'
      ]),
      negative
    ),
    makeHeuristicItem(
      'hairstyle',
      '发型结构',
      '头发本体',
      collectSentencesByKeywords(positive, [
        '发型',
        '发色',
        '短发',
        '长发',
        '卷发',
        '波浪',
        '马尾',
        '编发',
        '发髻',
        '盘发',
        '湿发'
      ]),
      negative
    ),
    makeHeuristicItem(
      'pose',
      '动作姿态',
      '身体重心',
      collectSentencesByKeywords(positive, [
        '姿势',
        '姿态',
        '正在',
        '身体',
        '右手',
        '左手',
        '侧身',
        '走'
      ]),
      negative
    ),
    makeHeuristicItem(
      'visualEffect',
      '画面影响',
      '后期效果',
      collectSentencesByKeywords(positive, [
        '叠影',
        '残像',
        '速度线',
        '体积雾',
        '戏剧化景深',
        '景深',
        'RGB',
        '颜色分离',
        '色散',
        '高光溢色'
      ]),
      negative
    ),
    makeHeuristicItem(
      'layoutDesign',
      '版式设计',
      '信息层级',
      collectSentencesByKeywords(positive, [
        '版式',
        '排版',
        '标题',
        '字体',
        '角色名称',
        '透明玻璃',
        '手写英文',
        '人物称号',
        '阵营',
        '世界观',
        '标签',
        '神秘符号',
        '设定文字',
        '信息栏'
      ]),
      negative
    ),
    ...buildHeuristicWardrobeItems(positive, negative),
    makeHeuristicItem(
      'accessory',
      '配饰细节',
      '造型统一',
      collectSentencesByKeywords(positive, [
        '项圈',
        '铃铛',
        '耳朵',
        '发箍',
        '耳环',
        '项链',
        '发饰'
      ]),
      negative
    ),
    makeHeuristicItem(
      'prop',
      '互动道具',
      '自然抓拍',
      collectSentencesByKeywords(positive, [
        '传单',
        '导览',
        '玩偶',
        '道具',
        '手机',
        '相机',
        '花'
      ]),
      negative
    ),
    makeHeuristicItem(
      'background',
      '场景环境',
      '空间氛围',
      collectSentencesByKeywords(positive, [
        '场景',
        '背景',
        '动物园',
        '户外',
        '步道',
        '围栏',
        '游客',
        '绿植'
      ]),
      negative
    ),
    makeHeuristicItem(
      'lighting',
      '光线质感',
      '自然手机感',
      collectSentencesByKeywords(positive, [
        '光线',
        '日光',
        '阳光',
        '柔光',
        '侧逆光',
        '霓虹',
        '金色时刻'
      ]),
      negative
    ),
    makeHeuristicItem(
      'composition',
      '构图组织',
      '视觉配重',
      collectSentencesByKeywords(positive, [
        '构图',
        '中心对称',
        '三分位',
        '负空间',
        '框中框',
        '引导线',
        '对角线平衡',
        '前景分层',
        '非对称配重'
      ]),
      negative
    ),
    makeHeuristicItem(
      'lens',
      '镜头质感',
      '介质与光学',
      collectSentencesByKeywords(positive, [
        '现代数码',
        '中画幅',
        '35mm',
        '彩色负片',
        '一次性相机',
        '柔光镜',
        '变形宽银幕',
        '鱼眼',
        '手机计算摄影',
        '银盐黑白'
      ]),
      negative
    ),
    makeHeuristicItem(
      'shot',
      '景别',
      '裁切与主体占比',
      collectSentencesByKeywords(positive, [
        '眼部极特写',
        '面部特写',
        '头肩近景',
        '胸上近景',
        '腰上中景',
        '膝上中全景',
        '全身景',
        '大远景',
        '远景',
        '人物占画面'
      ]),
      negative
    ),
    makeHeuristicItem(
      'viewpoint',
      '机位视角',
      '相机观察位置',
      collectSentencesByKeywords(positive, [
        '平视',
        '俯拍',
        '顶视',
        '低机位',
        '地面仰视',
        '三分之四侧面',
        '九十度侧面',
        '越肩',
        '荷兰角'
      ]),
      negative
    ),
    makeHeuristicItem(
      'makeup',
      '妆容结构',
      '面部妆效',
      collectSentencesByKeywords(positive, [
        '妆容',
        '底妆',
        '眼妆',
        '腮红',
        '唇妆',
        '裸妆',
        '烟熏妆',
        '红唇'
      ]),
      negative
    )
  ];

  const compacted = items.filter(Boolean) as ReversePromptAssetItem[];
  const seenSlots = new Set<PromptAssetSlot>();
  return compacted.filter((item) => {
    if (seenSlots.has(item.slot)) return false;
    seenSlots.add(item.slot);
    return true;
  });
}

/** 从 image.data 提取纯 base64 (Gemini inlineData 不接受 data: URL 前缀) */
function stripDataUrlPrefix(data: string): string {
  if (data.startsWith('data:')) {
    const comma = data.indexOf(',');
    if (comma >= 0) return data.slice(comma + 1);
  }
  return data;
}

/* ----------------------- 第一级 & 第二级: Gemini ----------------------- */

interface GeminiCallOptions {
  model: string;
  /** thinkingBudget=0 仅 flash 支持;pro 必须默认开启 thinking,传 undefined */
  disableThinking: boolean;
  timeoutMs: number;
}

async function callGeminiReverse(
  systemPrompt: string,
  image: { data: string; mimeType: string },
  apiKey: string,
  options: GeminiCallOptions
): Promise<ReversePromptAssetResult | null> {
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: 8000,
    responseMimeType: 'application/json',
    temperature: 0.2
  };
  if (options.disableThinking) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: '请从这张图中提取所有可见的写真要素,按 slot 拆分输出。'
          },
          {
            inlineData: {
              mimeType: image.mimeType,
              data: stripDataUrlPrefix(image.data)
            }
          }
        ]
      }
    ],
    generationConfig
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text();
      console.error(
        `[PromptAssetReverse] Gemini ${options.model} error ${response.status}:`,
        text.slice(0, 400)
      );
      return null;
    }
    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    };
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts
      .map((p) => (typeof p.text === 'string' ? p.text : ''))
      .join('')
      .trim();
    if (!text) {
      console.warn(
        `[PromptAssetReverse] Gemini ${options.model} returned no text; finishReason=${data.candidates?.[0]?.finishReason}`
      );
      return null;
    }
    return extractReverseResultFromJson(text, 'image');
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') {
      console.error(
        `[PromptAssetReverse] Gemini ${options.model} timed out after ${options.timeoutMs}ms`
      );
    } else {
      console.error(
        `[PromptAssetReverse] Gemini ${options.model} threw:`,
        error
      );
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiPromptImport(
  systemPrompt: string,
  promptText: string,
  apiKey: string,
  options: GeminiCallOptions
): Promise<ReversePromptAssetResult | null> {
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: 8000,
    responseMimeType: 'application/json',
    temperature: 0.2
  };
  if (options.disableThinking) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `请把下面这段成品图片生成 prompt 拆解为可复用素材 JSON。\n\n${promptText}`
          }
        ]
      }
    ],
    generationConfig
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text();
      console.error(
        `[PromptAssetImport] Gemini ${options.model} error ${response.status}:`,
        text.slice(0, 400)
      );
      return null;
    }
    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    };
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts
      .map((p) => (typeof p.text === 'string' ? p.text : ''))
      .join('')
      .trim();
    if (!text) {
      console.warn(
        `[PromptAssetImport] Gemini ${options.model} returned no text; finishReason=${data.candidates?.[0]?.finishReason}`
      );
      return null;
    }
    return extractReverseResultFromJson(text, 'prompt', promptText);
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') {
      console.error(
        `[PromptAssetImport] Gemini ${options.model} timed out after ${options.timeoutMs}ms`
      );
    } else {
      console.error(
        `[PromptAssetImport] Gemini ${options.model} threw:`,
        error
      );
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ----------------------- 第三级: Tuzi gpt-5.5 (OpenAI 兼容) ----------------------- */

function resolveTuziVLMModel(): string {
  return (
    process.env.OPENAI_VLM_MODEL || process.env.TUZI_VLM_MODEL || 'gpt-5.5'
  );
}

function resolvePromptImportModel(): string {
  return (
    process.env.PROMPT_ASSET_IMPORT_MODEL ||
    process.env.OPENAI_TEXT_MODEL ||
    process.env.TUZI_TEXT_MODEL ||
    'gpt-5.4'
  );
}

async function callAnthropicPromptImport(
  systemPrompt: string,
  promptText: string
): Promise<ReversePromptAssetResult | null> {
  const apiKey =
    process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const baseURL = (
    process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
  )
    .replace(/\/+$/, '')
    .replace(/\/v1$/, '');
  const model =
    process.env.PROMPT_ASSET_IMPORT_ANTHROPIC_MODEL ||
    process.env.ANTHROPIC_MODEL ||
    'claude-sonnet-4-20250514';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(`${baseURL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0.2,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `请把下面这段成品图片生成 prompt 拆解为可复用素材 JSON。\n\n${promptText}`
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(
        `[PromptAssetImport] Anthropic error ${response.status}:`,
        text.slice(0, 400),
        { model }
      );
      return null;
    }

    const result = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const raw = (result.content || [])
      .map((part) => (part.type === 'text' && part.text ? part.text : ''))
      .join('')
      .trim();
    return extractReverseResultFromJson(raw, 'prompt', promptText);
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') {
      console.error('[PromptAssetImport] Anthropic timed out after 45s', {
        model
      });
    } else {
      console.error('[PromptAssetImport] Anthropic threw:', error, { model });
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isRetryableTuziVLMStatus(status: number): boolean {
  return [429, 500, 502, 503, 504].includes(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callTuziReverse(
  systemPrompt: string,
  image: { data: string; mimeType: string }
): Promise<ReversePromptAssetResult | null> {
  const apiKey =
    process.env.OPENAI_VLM_API_KEY ||
    process.env.TUZI_API_KEY ||
    process.env.OPENAI_API_KEY;
  const baseURL =
    process.env.OPENAI_VLM_BASE_URL ||
    process.env.TUZI_API_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://api.tu-zi.com';
  if (!apiKey) {
    console.warn(
      '[PromptAssetReverse] no Tuzi/OpenAI VLM key; skipping Tuzi fallback'
    );
    return null;
  }

  let imageUrl = image.data;
  if (!imageUrl.startsWith('data:') && !imageUrl.startsWith('http')) {
    imageUrl = `data:${image.mimeType};base64,${imageUrl}`;
  }

  // Tuzi gpt-5.5 反推历史观测 60-150s,这里 90s 兜底,超过就让上层失败
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);

  try {
    const response = await fetch(
      `${normalizeChatBaseURL(baseURL)}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: resolveTuziVLMModel(),
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Analyze this image and reverse-engineer it into a prompt asset JSON object.'
                },
                { type: 'image_url', image_url: { url: imageUrl } }
              ]
            }
          ],
          max_tokens: 1024,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          stream: false
        }),
        signal: controller.signal
      }
    );
    if (!response.ok) {
      const text = await response.text();
      console.error(
        `[PromptAssetReverse] Tuzi VLM error ${response.status}:`,
        text.slice(0, 400)
      );
      return null;
    }
    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = result.choices?.[0]?.message?.content?.trim() || '';
    return extractReverseResultFromJson(raw, 'image');
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') {
      console.error('[PromptAssetReverse] Tuzi VLM timed out after 90s');
    } else {
      console.error('[PromptAssetReverse] Tuzi VLM threw:', error);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function callTuziPromptImport(
  systemPrompt: string,
  promptText: string
): Promise<ReversePromptAssetResult | null> {
  const apiKey =
    process.env.OPENAI_VLM_API_KEY ||
    process.env.TUZI_API_KEY ||
    process.env.OPENAI_API_KEY;
  const baseURL =
    process.env.OPENAI_VLM_BASE_URL ||
    process.env.TUZI_API_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://api.tu-zi.com';
  if (!apiKey) return null;

  const model = resolvePromptImportModel();
  const maxAttempts = 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 22_000);

    try {
      const response = await fetch(
        `${normalizeChatBaseURL(baseURL)}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: `请把下面这段成品图片生成 prompt 拆解为可复用素材 JSON。\n\n${promptText}`
              }
            ],
            max_tokens: 2048,
            temperature: 0.2,
            response_format: { type: 'json_object' },
            stream: false
          }),
          signal: controller.signal
        }
      );
      if (!response.ok) {
        const text = await response.text();
        const retrying =
          attempt < maxAttempts && isRetryableTuziVLMStatus(response.status);
        console.error(
          `[PromptAssetImport] Tuzi text model error ${response.status}:`,
          text.slice(0, 400),
          { attempt, maxAttempts, retrying, model }
        );
        if (retrying) {
          await sleep(1200 * attempt);
          continue;
        }
        return null;
      }
      const result = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = result.choices?.[0]?.message?.content?.trim() || '';
      return extractReverseResultFromJson(raw, 'prompt', promptText);
    } catch (error) {
      const isAbort = (error as { name?: string }).name === 'AbortError';
      const retrying = attempt < maxAttempts && isAbort;
      if (isAbort) {
        console.error(
          '[PromptAssetImport] Tuzi text model timed out after 22s',
          {
            attempt,
            maxAttempts,
            retrying,
            model
          }
        );
      } else {
        console.error('[PromptAssetImport] Tuzi text model threw:', error, {
          attempt,
          maxAttempts,
          model
        });
      }
      if (retrying) {
        await sleep(1200 * attempt);
        continue;
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

/* ----------------------- 主入口 ----------------------- */

/**
 * 反推一张图为 Prompt 素材结构化数据。
 *
 * 三级 fallback,任一层成功立即返回。全部失败返回 ok=false 的空壳。
 */
export async function reverseImageToPromptAsset(image: {
  data: string;
  mimeType: string;
  locale?: 'zh-CN' | 'en-US';
}): Promise<ReversePromptAssetResult> {
  const systemPrompt = buildImagePromptAssetReverseSystemPrompt(
    image.locale || 'zh-CN'
  );
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const hasTuziVlmKey = Boolean(
    process.env.OPENAI_VLM_API_KEY ||
    process.env.TUZI_API_KEY ||
    process.env.OPENAI_API_KEY
  );

  // 第一级:Tuzi VLM。官方 Gemini 只在显式开启后作为兜底。
  const tuziResult = await callTuziReverse(systemPrompt, image);
  if (tuziResult && (tuziResult.items.length > 0 || tuziResult.fullPrompt)) {
    return tuziResult;
  }

  if (geminiKey && isOfficialGeminiEnabled()) {
    const flashResult = await callGeminiReverse(
      systemPrompt,
      image,
      geminiKey,
      {
        model: 'gemini-3.5-flash',
        disableThinking: true,
        timeoutMs: 30_000
      }
    );
    if (
      flashResult &&
      (flashResult.items.length > 0 || flashResult.fullPrompt)
    ) {
      return flashResult;
    }

    // 第二级:Gemini 3.1 Pro Preview (with thinking, 50s 兜底)
    const proResult = await callGeminiReverse(systemPrompt, image, geminiKey, {
      model: 'gemini-3.1-pro-preview',
      disableThinking: false,
      timeoutMs: 50_000
    });
    if (proResult && (proResult.items.length > 0 || proResult.fullPrompt)) {
      return proResult;
    }
  } else {
    console.warn(
      '[PromptAssetReverse] official Gemini disabled or missing key; skipping fallback'
    );
  }

  return buildEmptyResult(
    'image',
    geminiKey && isOfficialGeminiEnabled() && !hasTuziVlmKey
      ? '图片反推服务暂不可用：Tuzi/OpenAI VLM 未配置，且 Gemini 未返回可用结果'
      : '图片反推服务暂不可用，请稍后重试'
  );
}

export async function reversePromptTextToPromptAsset(
  promptText: string
): Promise<ReversePromptAssetResult> {
  const normalizedPrompt = promptText.trim();
  if (!normalizedPrompt) return buildEmptyResult('prompt');

  const systemPrompt = buildPromptImportSystemPrompt();
  const promptForModel = truncateText(normalizedPrompt, 12_000);
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  const tuziResult = await callTuziPromptImport(systemPrompt, promptForModel);
  if (tuziResult && (tuziResult.items.length > 0 || tuziResult.fullPrompt)) {
    return tuziResult;
  }

  const anthropicResult = await callAnthropicPromptImport(
    systemPrompt,
    promptForModel
  );
  if (
    anthropicResult &&
    (anthropicResult.items.length > 0 || anthropicResult.fullPrompt)
  ) {
    return anthropicResult;
  }

  if (geminiKey && isOfficialGeminiEnabled()) {
    const flashResult = await callGeminiPromptImport(
      systemPrompt,
      promptForModel,
      geminiKey,
      {
        model: 'gemini-3.5-flash',
        disableThinking: true,
        timeoutMs: 16_000
      }
    );
    if (
      flashResult &&
      (flashResult.items.length > 0 || flashResult.fullPrompt)
    ) {
      return flashResult;
    }
  } else {
    console.warn(
      '[PromptAssetImport] official Gemini disabled or missing key; skipping fallback'
    );
  }

  const heuristicItems = buildHeuristicPromptImportItems(normalizedPrompt);
  if (heuristicItems.length > 0) {
    console.warn(
      '[PromptAssetImport] using local heuristic prompt split fallback',
      {
        itemCount: heuristicItems.length
      }
    );
    return {
      items: heuristicItems,
      ok: false,
      sourceType: 'prompt',
      fullPrompt: splitPromptText(normalizedPrompt).positive,
      negativePrompt: splitPromptText(normalizedPrompt).negative,
      routeHint: 'heuristic-fallback'
    };
  }

  return buildEmptyResult('prompt');
}
