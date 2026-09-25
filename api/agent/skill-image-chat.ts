/**
 * Agent 图像创作 API —— 平台官方 Agent + 官方 Skills（插件式）
 *
 * 设计约束（产品定义）：
 * 1. 用户不需要自带 API Key：Agent 使用平台官方 DeepSeek 配置（服务端环境变量）
 * 2. 使用 Agent 功能扣积分：
 *    - 对话/技能执行：按 `skill_chat` action 扣 1 积分（正确 RPC 签名 consume_credits(p_user_id, p_action, p_metadata)）
 *    - 出图：走平台图像创作通道（handleImageGenerateRequest → Tuzi/超机土豆/Krill 多渠道 + 回退，
 *      按平台实时定价扣积分），不再使用 Gemini-only 的 server/tools/generate-image.ts
 * 3. Skill 是插件：Agent 加载官方技能（image_creation / zhong_female_portrait_director）的
 *    coreInstructions，出图仍走平台通道，不引入独立出图链路
 *
 * 流程：
 * 登录 → 校验请求 → 积分门槛 → 平台 DeepSeek Agent（OpenAI Agents SDK，@openai/agents）→
 * SSE 流式返回（text / tool_call / image / done / error）→ 成功后扣对话积分
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  getCorsHeadersForRequest,
  verifyTokenAndGetUserId
} from '../utils/auth';
import { DEEPSEEK_V4_FLASH_0731_MODEL } from '../utils/model-registry';
import {
  createAgent,
  type OpenAgentToolDefinition
} from '../../server/src/agent/openai-agents-sdk.js';
import {
  buildImageCreationSystemPrompt,
  resolveImageCreationMode,
  IMAGE_CREATION_MODES
} from '../../server/src/skills/image-creation-skill.js';
import {
  buildFemalePortraitSystemPrompt,
  resolveFemalePortraitMode,
  FEMALE_PORTRAIT_MODES
} from '../../server/src/skills/zhong-female-portrait-director-skill.js';
import { handleImageGenerateRequest } from '../image/generate.js';
import imageTaskHandler from '../image/task.js';
import {
  normalizeImageGenerationAspectRatio,
  validateImageGenerationSize
} from '../../src/shared/image-generation-output-params.js';
import {
  IMAGE_GENERATION_BASE_CREDIT_COST,
  IMAGE_GENERATION_LARGE_2K_CREDIT_COST,
  IMAGE_GENERATION_4K_CREDIT_COST
} from '../../src/shared/image-generation-pricing.js';

export const config = {
  // Cloudflare Worker（nodejs_compat）运行；此 export 仅兼容旧 Vercel 约定，Worker 不使用
  runtime: 'nodejs',
  maxDuration: 120
};

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 官方图像创作技能白名单 */
export const OFFICIAL_IMAGE_SKILLS = [
  'image_creation',
  'zhong_female_portrait_director'
] as const;
export type OfficialImageSkillId = (typeof OFFICIAL_IMAGE_SKILLS)[number];

const DEFAULT_MAX_TURNS = 8;
/** skillConfig 上限：避免超大前置配置注入系统提示造成 token 滥用 */
const MAX_SKILL_CONFIG_ENTRIES = 24;
const MAX_SKILL_CONFIG_KEY_LENGTH = 40;
const MAX_SKILL_CONFIG_VALUE_LENGTH = 120;
/** 参考图上限：避免超大 base64 请求体 */
const MAX_REFERENCE_IMAGES = 4;
const MAX_REFERENCE_IMAGE_DATA_LENGTH = 4_000_000;
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no'
};

// ---------------------------------------------------------------------------
// 平台 Agent 配置（纯函数，可单测）
// ---------------------------------------------------------------------------

export interface PlatformAgentConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

/** 解析平台官方 DeepSeek 配置；未配置返回 null */
export function resolvePlatformAgentConfig(
  env: Record<string, string | undefined> = process.env
): PlatformAgentConfig | null {
  const apiKey = env.DEEPSEEK_API_KEY || env.OPENAI_API_KEY || '';
  if (!apiKey) return null;
  const rawBaseURL =
    env.DEEPSEEK_BASE_URL || env.OPENAI_BASE_URL || 'https://api.deepseek.com';
  const baseURL = /\/v\d+$/i.test(rawBaseURL)
    ? rawBaseURL
    : `${rawBaseURL}/v1`;
  return {
    apiKey,
    baseURL,
    model: env.DEEPSEEK_MODEL || DEEPSEEK_V4_FLASH_0731_MODEL
  };
}

// ---------------------------------------------------------------------------
// 请求校验（纯函数，可单测）
// ---------------------------------------------------------------------------

export interface SkillImageChatRequest {
  prompt: string;
  /** 官方技能 id，默认 image_creation */
  skillId?: string;
  /** 创作模式 id（可选，缺省由 Agent 判断） */
  mode?: string;
  /** 用户出图参数：画幅比例（auto 或 W:H，如 9:16） */
  aspectRatio?: string;
  /** 用户出图参数：分辨率（1k/2k/4k 或平台 WxH，如 2048x2048） */
  imageSize?: string;
  /** 技能前置配置：用户在生成前交互选择的选项（如姿态/镜头/光线/妆容/表情/尺寸/张数） */
  skillConfig?: Record<string, string | number>;
  /** 参考图（平台已上传图片 id）与角色一致参数 */
  referenceImageIds?: string[];
  characterCardIds?: string[];
  characterReferenceGroups?: Array<{
    referenceImageIds?: string[];
    label?: string;
    description?: string;
  }>;
  referenceMode?: 'image_reference' | 'character_consistency';
  context?: {
    referenceImages?: Array<{ data: string; mimeType: string }>;
    /** 图像创作会话 id（与普通对话一致，出图任务挂到该 session） */
    sessionId?: string;
  };
}

export type ValidateResult =
  | {
      ok: true;
      value: Omit<SkillImageChatRequest, 'skillId'> & {
        skillId: OfficialImageSkillId;
      };
    }
  | { ok: false; error: string; status: number };

/** 校验并归一化请求（无需用户自带 Key，Agent 由平台提供） */
export function validateRequest(body: unknown): ValidateResult {
  const raw = (body || {}) as SkillImageChatRequest;
  const prompt = String(raw.prompt || '').trim();
  if (!prompt) {
    return { ok: false, error: '缺少必需参数: prompt', status: 400 };
  }
  if (prompt.length > 4000) {
    return { ok: false, error: 'prompt 过长（上限 4000 字符）', status: 400 };
  }

  const skillId = (raw.skillId?.trim() ||
    'image_creation') as OfficialImageSkillId;
  if (!OFFICIAL_IMAGE_SKILLS.includes(skillId)) {
    return {
      ok: false,
      error: `暂不支持技能: ${skillId}（支持：${OFFICIAL_IMAGE_SKILLS.join(' / ')}）`,
      status: 400
    };
  }

  const mode = raw.mode?.trim() || '';
  const validModes =
    skillId === 'zhong_female_portrait_director'
      ? FEMALE_PORTRAIT_MODES.map((m) => m.id)
      : IMAGE_CREATION_MODES.map((m) => m.id);
  if (mode && !validModes.includes(mode)) {
    return {
      ok: false,
      error: `未知创作模式: ${mode}（技能 ${skillId} 支持：${validModes.join(' / ')}）`,
      status: 400
    };
  }

  let skillConfig: Record<string, string | number> | undefined;
  if (
    raw.skillConfig &&
    typeof raw.skillConfig === 'object' &&
    !Array.isArray(raw.skillConfig)
  ) {
    const entries = Object.entries(raw.skillConfig).filter(
      ([key, value]) =>
        (typeof value === 'string' || typeof value === 'number') &&
        key.trim().length <= MAX_SKILL_CONFIG_KEY_LENGTH
    );
    if (entries.length > MAX_SKILL_CONFIG_ENTRIES) {
      return {
        ok: false,
        error: `skillConfig 条目过多（上限 ${MAX_SKILL_CONFIG_ENTRIES}）`,
        status: 400
      };
    }
    skillConfig = Object.fromEntries(
      entries
        .map(([key, value]) => [
          key.trim(),
          typeof value === 'number'
            ? value
            : String(value).trim().slice(0, MAX_SKILL_CONFIG_VALUE_LENGTH)
        ] as const)
        .filter(([, value]) => String(value).trim())
    );
  }

  const referenceImages = Array.isArray(raw.context?.referenceImages)
    ? raw.context.referenceImages
    : [];
  if (referenceImages.length > MAX_REFERENCE_IMAGES) {
    return {
      ok: false,
      error: `参考图数量过多（上限 ${MAX_REFERENCE_IMAGES} 张）`,
      status: 400
    };
  }
  for (const image of referenceImages) {
    const data = String(image?.data || '');
    if (!data || data.length > MAX_REFERENCE_IMAGE_DATA_LENGTH) {
      return {
        ok: false,
        error: '参考图数据无效或过大（单张上限约 3MB）',
        status: 400
      };
    }
  }

  const sessionId =
    typeof raw.context?.sessionId === 'string'
      ? raw.context.sessionId.trim().slice(0, 80) || undefined
      : undefined;

  // 用户出图参数：画幅比例（auto 或 W:H，长边/短边 ≤3）与分辨率（1k/2k/4k 或平台 WxH）
  let aspectRatio: string | undefined;
  if (raw.aspectRatio !== undefined) {
    const normalized = normalizeImageGenerationAspectRatio(
      String(raw.aspectRatio).trim().slice(0, 16)
    );
    if (!normalized) {
      return { ok: false, error: '无效的画幅比例: aspectRatio', status: 400 };
    }
    aspectRatio = normalized === 'auto' ? undefined : normalized;
  }

  let imageSize: string | undefined;
  if (raw.imageSize !== undefined) {
    const sizeRaw = String(raw.imageSize).trim().slice(0, 24);
    const tier = sizeRaw.toLowerCase();
    if (tier === '1k' || tier === '2k' || tier === '4k' || tier === 'auto') {
      imageSize = tier === 'auto' ? undefined : tier;
    } else {
      const validated = validateImageGenerationSize(sizeRaw);
      if (!validated.ok) {
        return { ok: false, error: '无效的分辨率: imageSize', status: 400 };
      }
      imageSize = validated.size;
    }
  }

  // 参考图 / 角色一致参数（与平台 sanitize 约束一致：参考图 ≤4、角色组 ≤2、每组 ≤3）
  const cleanIdList = (value: unknown, max: number): string[] | undefined => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) return undefined;
    const ids = Array.from(
      new Set(
        value
          .map((id) => String(id || '').trim())
          .filter((id) => id && id.length <= 200)
      )
    ).slice(0, max);
    return ids;
  };
  const referenceImageIds = cleanIdList(raw.referenceImageIds, 4);
  const characterCardIds = cleanIdList(raw.characterCardIds, 4);

  let characterReferenceGroups: SkillImageChatRequest['characterReferenceGroups'];
  if (raw.characterReferenceGroups !== undefined) {
    if (!Array.isArray(raw.characterReferenceGroups)) {
      return {
        ok: false,
        error: '无效的 characterReferenceGroups',
        status: 400
      };
    }
    if (raw.characterReferenceGroups.length > 2) {
      return {
        ok: false,
        error: '角色组数量过多（上限 2 组）',
        status: 400
      };
    }
    characterReferenceGroups = raw.characterReferenceGroups
      .slice(0, 2)
      .map((group) => ({
        ...(group.label ? { label: String(group.label).slice(0, 80) } : {}),
        ...(group.description
          ? { description: String(group.description).slice(0, 300) }
          : {}),
        referenceImageIds:
          cleanIdList(group?.referenceImageIds, 3) || []
      }))
      .filter((group) => group.referenceImageIds.length > 0);
  }

  const referenceMode = raw.referenceMode;
  if (
    referenceMode !== undefined &&
    referenceMode !== 'image_reference' &&
    referenceMode !== 'character_consistency'
  ) {
    return { ok: false, error: '无效的 referenceMode', status: 400 };
  }

  return {
    ok: true,
    value: {
      prompt,
      skillId,
      mode,
      aspectRatio,
      imageSize,
      referenceImageIds,
      characterCardIds,
      characterReferenceGroups,
      referenceMode,
      skillConfig,
      context:
        referenceImages.length || sessionId
          ? {
              ...(referenceImages.length
                ? {
                    referenceImages: referenceImages as Array<{
                      data: string;
                      mimeType: string;
                    }>
                  }
                : {}),
              ...(sessionId ? { sessionId } : {})
            }
          : undefined
    }
  };
}

/** 用户前置配置 → 系统提示片段（纯函数，可单测） */
export function buildSkillConfigPrompt(
  skillConfig?: Record<string, string | number>
): string {
  if (!skillConfig) return '';
  const entries = Object.entries(skillConfig).filter(
    ([key, value]) => key.trim() && String(value).trim() && String(value) !== 'auto'
  );
  if (entries.length === 0) return '';
  const lines = entries.map(([key, value]) => `- ${key}：${value}`).join('\n');
  return `\n## 用户前置配置（严格遵循）\n${lines}\n请在对应结构池内严格按以上组合编译提示词；如与用户自由描述冲突，以用户最新描述为准并说明调整。`;
}

/** 组装系统提示（纯函数，可单测） */
export function buildSystemPrompt(
  skillId: string,
  mode?: string,
  skillConfig?: Record<string, string | number>,
  userParams?: SkillImageUserParams
): string {
  const base =
    skillId === 'zhong_female_portrait_director'
      ? buildFemalePortraitSystemPrompt(mode)
      : buildImageCreationSystemPrompt(mode);
  const configSection = buildSkillConfigPrompt(skillConfig);
  const outputParamsSection = buildUserOutputParamsPrompt(userParams);
  const referenceSection = buildReferenceContextPrompt(userParams);
  return [
    '[Skill] ' + skillId + ' (official)',
    '',
    base,
    configSection,
    outputParamsSection,
    referenceSection
  ]
    .filter(Boolean)
    .join('\n');
}

/** 用户出图参数（画幅比例/分辨率）→ 系统提示片段（纯函数，可单测） */
export function buildUserOutputParamsPrompt(params?: {
  aspectRatio?: string;
  imageSize?: string;
}): string {
  if (!params) return '';
  const lines: string[] = [];
  if (params.aspectRatio && params.aspectRatio !== 'auto') {
    lines.push('- 画幅比例：' + params.aspectRatio);
  }
  if (params.imageSize && params.imageSize !== 'auto') {
    lines.push('- 出图尺寸：' + params.imageSize);
  }
  if (lines.length === 0) return '';
  return (
    '\n## 用户出图参数（严格遵循）\n' +
    lines.join('\n') +
    '\n编译七段提示卡与调用 generate_image 时必须符合以上画幅与尺寸：' +
    '构图/镜头/景别要适配所选比例（竖版用竖构图、横版用横构图、方形居中），' +
    '不要选择与用户比例冲突的焦段或机位；调用 generate_image 时按此比例出图。'
  );
}

/** 参考图/角色一致上下文 → 系统提示片段（纯函数，可单测） */
export function buildReferenceContextPrompt(
  params?: SkillImageUserParams
): string {
  const lines: string[] = [];
  const referenceCount = params?.referenceImageIds?.length || 0;
  const characterCardCount = params?.characterCardIds?.length || 0;
  const groupCount = params?.characterReferenceGroups?.length || 0;
  if (referenceCount > 0) {
    lines.push('- 参考图 ' + referenceCount + ' 张（已随 generate_image 传递）');
  }
  if (groupCount > 0) {
    lines.push('- 角色一致：' + groupCount + ' 组角色参考（已随 generate_image 传递）');
  } else if (characterCardCount > 0) {
    lines.push('- 角色卡 ' + characterCardCount + ' 张（已随 generate_image 传递）');
  }
  if (lines.length === 0) return '';
  const NL = String.fromCharCode(10);
  return (
    NL + '## 参考图/角色一致（硬性规则）' + NL +
    lines.join(NL) +
    NL + '编译提示词时必须保持参考图/角色的外观一致（人物脸型、五官、发型、服装、氛围沿用参考），' +
    '不要把参考主体的身份/外貌改写成无关设定；调用 generate_image 时不要修改参考图参数。'
  );
}

// ---------------------------------------------------------------------------
// SDK 消息 → SSE 事件（纯函数，可单测）
// ---------------------------------------------------------------------------

export type ImageChatSseEvent =
  | { event: 'text'; data: { content: string } }
  | { event: 'tool_call'; data: { name: string; input: unknown; status: string } }
  | { event: 'tool_result'; data: { name: string; result: unknown; success: boolean } }
  | { event: 'image'; data: { url: string; prompt?: string } }
  | { event: 'done'; data: Record<string, never> }
  | { event: 'error'; data: { message: string } };

interface SdkMsg {
  type: string;
  content?: string | Array<{ type: string; text?: string }>;
  message?: {
    content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
  };
  tool_use_id?: string;
  id?: string;
  tool_name?: string;
  name?: string;
  result?: unknown;
  is_error?: boolean;
  subtype?: string;
}

/** 从工具结果中提取图片 URL */
export function extractImageUrl(result: unknown): string | undefined {
  if (!result) return undefined;
  if (typeof result === 'string') {
    const trimmed = result.trim();
    if (trimmed.startsWith('data:image/')) return trimmed;
    try {
      const parsed = JSON.parse(trimmed);
      const url = parsed?.imageUrl || parsed?.data?.imageUrl;
      return typeof url === 'string' && url ? url : undefined;
    } catch {
      return undefined;
    }
  }
  const obj = result as Record<string, unknown>;
  const url = obj?.imageUrl || (obj?.data as Record<string, unknown>)?.imageUrl;
  return typeof url === 'string' && url ? url : undefined;
}

/** 将 SDK 消息映射为 SSE 事件序列 */
export function mapSdkMessageToEvents(msg: SdkMsg): ImageChatSseEvent[] {
  switch (msg.type) {
    case 'partial_message': {
      const content = typeof msg.content === 'string' ? msg.content : '';
      return content ? [{ event: 'text', data: { content } }] : [];
    }
    case 'assistant': {
      const events: ImageChatSseEvent[] = [];
      for (const block of msg.message?.content || []) {
        if (block.type === 'text' && block.text) {
          events.push({ event: 'text', data: { content: block.text } });
        } else if (block.type === 'tool_use') {
          events.push({
            event: 'tool_call',
            data: {
              name: block.name || '',
              input: block.input ?? {},
              status: 'running'
            }
          });
        }
      }
      return events;
    }
    case 'tool_result': {
      const result = msg.result ?? msg.content;
      const name = msg.tool_name || msg.name || '';
      const events: ImageChatSseEvent[] = [
        {
          event: 'tool_result',
          data: { name, result, success: !msg.is_error }
        }
      ];
      const imageUrl = extractImageUrl(result);
      if (imageUrl) {
        events.push({ event: 'image', data: { url: imageUrl } });
      }
      return events;
    }
    case 'result': {
      if (msg.subtype && msg.subtype.startsWith('error')) {
        return [
          {
            event: 'error',
            data: { message: String(msg.result || 'Agent 执行失败') }
          }
        ];
      }
      return [{ event: 'done', data: {} }];
    }
    default:
      return [];
  }
}

function encodeSse(event: ImageChatSseEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

// ---------------------------------------------------------------------------
// 工具：generate_image —— 走平台图像创作通道（handleImageGenerateRequest）
// 平台通道 = Tuzi / 超机土豆 / Krill / ZImage 多渠道 + 健康路由 + 回退 + 平台实时计费。
// 不再使用 Gemini-only 的 server/src/tools/generate-image.ts。
// ---------------------------------------------------------------------------

/** skill 档位 → 平台 WxH 尺寸（平台限制：长边≤3840、16px 步进） */
const SKILL_IMAGE_SIZE_TO_PLATFORM: Record<string, string> = {
  '1k': '1024x1024',
  '2k': '2048x2048',
  '4k': '2880x2880'
};

/** generate_image 同步出图批量上限：2 张。
 * 平台 imageCount>1 走 strict 串行（≈每张 40-60s），4 张实测 ~173s 超路由 120s 预算；
 * 2 张 ≈ 90-120s 在预算内。更多张数建议分轮探索（每轮 2 张基于上一轮微调）。 */
const MAX_IMAGE_COUNT = 2;

/** 技能出图透传的用户参数（比例/分辨率/参考图/角色一致） */
export interface SkillImageUserParams {
  aspectRatio?: string;
  imageSize?: string;
  sessionId?: string;
  referenceImageIds?: string[];
  characterCardIds?: string[];
  characterReferenceGroups?: Array<{
    referenceImageIds?: string[];
    label?: string;
    description?: string;
  }>;
  referenceMode?: 'image_reference' | 'character_consistency';
}

/** 平台异步队列任务轮询上限（ms）：对齐队列预算，给慢通道充分余量 */
const SKILL_IMAGE_TASK_POLL_TIMEOUT_MS = 240_000;

/**
 * 轮询平台异步出图任务（/api/image/task）直到成功/失败/超时。
 * 直接调用 Worker 内部 handler，避免经网络回源（与 handleImageGenerateRequest 同思路）。
 */
export async function waitForImageTask(
  taskId: string,
  token: string,
  maxWaitMs: number
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + maxWaitMs;
  const taskUrl =
    'https://webtomind.com/api/image/task?id=' + encodeURIComponent(taskId);
  while (Date.now() < deadline) {
    const taskRequest = new Request(taskUrl, {
      headers: { Authorization: 'Bearer ' + token }
    });
    // 用 task.ts 的 handler（GET 轮询会自动 claim+run 未完成任务），
    // 生产由 Queue consumer 执行、本地无 Queue 时由轮询兜底执行，二者通过 claim 互斥。
    const taskResponse = await imageTaskHandler(taskRequest);
    const body = (await taskResponse
      .json()
      .catch(() => ({}))) as Record<string, unknown>;
    const status = String(body?.status || '');
    if (status === 'succeeded') return body;
    if (status === 'failed') {
      throw new Error(String(body?.error || '图片生成失败'));
    }
    if (status === 'cancelled') {
      throw new Error('图片生成已取消');
    }
    const pollAfterMs = Math.max(2000, Number(body?.pollAfterMs) || 8000);
    await new Promise((resolve) => setTimeout(resolve, pollAfterMs));
  }
  throw new Error('图片生成队列等待超时，请稍后重试');
}

function createGenerateImageTool(
  token: string,
  userParams?: SkillImageUserParams
): OpenAgentToolDefinition {
  return {
    name: 'generate_image',
    description:
      `使用平台图像创作通道生成图片（Tuzi/超机土豆等渠道，按平台实时定价扣积分：` +
      `1k≈${IMAGE_GENERATION_BASE_CREDIT_COST}、2k≈${IMAGE_GENERATION_LARGE_2K_CREDIT_COST}、` +
      `4k≈${IMAGE_GENERATION_4K_CREDIT_COST}，多张按张计费）。prompt 必填（英文效果更好），` +
      `imageSize 支持 1k/2k/4k（默认 2k），imageCount 支持 1-${MAX_IMAGE_COUNT} 张（默认 1；同步出图批量上限 ${MAX_IMAGE_COUNT}）。`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '图片生成提示词（英文效果最好）' },
        imageSize: {
          type: 'string',
          enum: ['1k', '2k', '4k'],
          description:
            '图片尺寸档位：1k/2k/4k，默认 2k；用户已指定分辨率时以用户为准'
        },
        aspectRatio: {
          type: 'string',
          enum: ['auto', '1:1', '3:4', '4:5', '9:16', '2:3', '4:3', '3:2', '16:9'],
          description:
            '画幅比例（auto 或 W:H）；用户已指定比例时以用户为准，不要更改'
        },
        imageCount: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_IMAGE_COUNT,
          description: '本次生成张数（1-2，默认 1）；批量探索/连续写真时使用，最多 2 张'
        }
      },
      required: ['prompt']
    },
    async call(input: Record<string, unknown>): Promise<string> {
      // 平台尺寸优先级：用户已选分辨率（前端解析好的 WxH 或 1k/2k/4k）> Agent 传入档位 > 2k
      const userSize = userParams?.imageSize;
      const sizeKey = String(input.imageSize || '2k');
      const dimensions =
        userSize && userSize !== 'auto'
          ? SKILL_IMAGE_SIZE_TO_PLATFORM[userSize] || userSize
          : SKILL_IMAGE_SIZE_TO_PLATFORM[sizeKey] ||
            SKILL_IMAGE_SIZE_TO_PLATFORM['2k'];
      // 画幅比例：用户已选比例 > Agent 传入 > auto（由平台/provider 决定）
      const aspectRatio = String(
        input.aspectRatio || userParams?.aspectRatio || 'auto'
      );
      const imageCount = Math.min(
        Math.max(Number(input.imageCount) || 1, 1),
        MAX_IMAGE_COUNT
      );

      // 构造内部请求复用平台 /api/image/generate 的完整链路：
      // 鉴权（同一 token）→ 安全策略 → 平台计费 → 异步队列（async:true）→ 轮询 task 出图。
      // 队列模式预算更宽（240s+），参考图/角色一致参数随请求透传。
      const internalRequest = new Request(
        'https://webtomind.com/api/image/generate',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            prompt: String(input.prompt || ''),
            imageSize: dimensions,
            aspectRatio,
            imageCount,
            referenceImageIds: userParams?.referenceImageIds,
            characterCardIds: userParams?.characterCardIds,
            characterReferenceGroups: userParams?.characterReferenceGroups,
            referenceMode: userParams?.referenceMode,
            ...(userParams?.sessionId
              ? { creationContext: { sessionId: userParams.sessionId } }
              : {}),
            async: true
          })
        }
      );

      const response = await handleImageGenerateRequest(internalRequest);
      const body = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      if (response.status === 202 && body?.queued && body?.taskId) {
        const result = await waitForImageTask(
          String(body.taskId),
          token,
          SKILL_IMAGE_TASK_POLL_TIMEOUT_MS
        );
        const images = Array.isArray(result.images)
          ? (result.images as Array<{
              imageUrl?: string;
              generationId?: string;
            }>)
              .filter((img) => typeof img.imageUrl === 'string' && img.imageUrl)
              .map((img) => ({
                imageUrl: img.imageUrl,
                generationId: img.generationId || ''
              }))
          : [];
        if (images.length === 0) {
          throw new Error('图片生成失败：平台未返回图片地址');
        }
        return JSON.stringify({
          taskId: String(body.taskId),
          imageUrl: images[0].imageUrl,
          generationId: images[0].generationId,
          provider: String(result.provider || ''),
          model: String(result.model || ''),
          imageCount: images.length,
          images,
          credits: result.credits ?? undefined
        });
      }

      if (!response.ok || !body || body.success !== true) {
        const message = String(
          body?.error || body?.message || `图片生成失败（HTTP ${response.status}）`
        );
        throw new Error(message);
      }

      if (typeof body.imageUrl !== 'string' || !body.imageUrl) {
        throw new Error('图片生成失败：平台未返回图片地址');
      }

      const images = Array.isArray(body.images)
        ? (body.images as Array<{ imageUrl?: string; generationId?: string }>)
            .filter((img) => typeof img.imageUrl === 'string' && img.imageUrl)
            .map((img) => ({
              imageUrl: img.imageUrl,
              generationId: img.generationId || ''
            }))
        : [];

      return JSON.stringify({
        imageUrl: body.imageUrl,
        generationId: body.generationId || '',
        provider: body.provider || '',
        model: body.model || '',
        imageCount: images.length || imageCount,
        images,
        credits: body.credits ?? undefined
      });
    }
  };
}

// ---------------------------------------------------------------------------
// 积分（Supabase）
// ---------------------------------------------------------------------------

let supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    supabase = createClient(url, key);
  }
  return supabase;
}

interface UserCreditsRow {
  daily_credits?: number | null;
  subscription_credits?: number | null;
  bonus_credits?: number | null;
  referral_credits?: number | null;
  media_credits?: number | null;
  promo_media_credits?: number | null;
}

/** 按平台口径合计用户积分：daily + subscription + bonus + referral + media + promo_media */
export function sumCreditBalance(data: UserCreditsRow | null): number {
  if (!data) return 0;
  return (
    Number(data.daily_credits || 0) +
    Number(data.subscription_credits || 0) +
    Number(data.bonus_credits || 0) +
    Number(data.referral_credits || 0) +
    Number(data.media_credits || 0) +
    Number(data.promo_media_credits || 0)
  );
}

/**
 * 查询用户积分余额；环境缺失返回 null（不拦截）。
 * user_credits 无 balance 列，按平台口径合计（见 sumCreditBalance）。
 */
export async function getUserCreditBalance(
  userId: string
): Promise<number | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('user_credits')
      .select(
        'daily_credits, subscription_credits, bonus_credits, referral_credits, media_credits, promo_media_credits'
      )
      .eq('user_id', userId)
      .single();
    if (error || !data) return null;
    return sumCreditBalance(data as UserCreditsRow);
  } catch {
    return null;
  }
}

/** 对话/技能执行积分门槛（余额 > 0） */
export async function checkUserCredits(userId: string): Promise<boolean> {
  const balance = await getUserCreditBalance(userId);
  if (balance === null) return true; // 无 Supabase 环境（本地联调）不拦截
  return balance > 0;
}

/** 成功后扣除技能对话积分（正确 RPC 签名） */
export async function consumeSkillChatCredits(
  userId: string,
  skillId: string
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return true;
  try {
    const { error } = await sb.rpc('consume_credits', {
      p_user_id: userId,
      p_action: 'skill_chat',
      p_metadata: { feature: 'agent_image_creation', skill: skillId }
    });
    if (error) {
      console.warn('[SkillImageChat] consume skill_chat credits failed:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[SkillImageChat] consume skill_chat credits error:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  const cors = getCorsHeadersForRequest(request);
  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
    status: 405,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

/**
 * Cloudflare Worker 默认导出：方法分发（OPTIONS 预检 / POST 主逻辑 / 其余 405）
 * 由 workers/webtomind.ts 的 WORKER_API_ROUTES 注册调用。
 */
export default async function handler(request: Request): Promise<Response> {
  const cors = getCorsHeadersForRequest(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method === 'POST') {
    return POST(request);
  }
  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
    status: 405,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

export async function POST(request: Request): Promise<Response> {
  const cors = getCorsHeadersForRequest(request);
  const respondJson = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });

  // 鉴权
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  const userId = await verifyTokenAndGetUserId(token);
  if (!userId) {
    return respondJson(401, { error: 'UNAUTHORIZED' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respondJson(400, { error: '请求体不是合法 JSON' });
  }

  const validated = validateRequest(body);
  if (!validated.ok) {
    return respondJson(validated.status, { error: validated.error });
  }
  const {
    prompt,
    skillId,
    mode,
    context,
    aspectRatio,
    imageSize,
    referenceImageIds,
    characterCardIds,
    characterReferenceGroups,
    referenceMode
  } = validated.value;

  // 平台官方 Agent 配置
  const platform = resolvePlatformAgentConfig();
  if (!platform) {
    return respondJson(503, {
      error: '官方 Agent 服务未配置（服务端缺少 DEEPSEEK_API_KEY）'
    });
  }

  // 对话积分门槛
  const hasCredits = await checkUserCredits(userId);
  if (!hasCredits) {
    return respondJson(402, { error: '积分不足，请先充值后使用 Agent 图像创作' });
  }

  // 模式预判（供系统提示强化；Agent 仍可自主判断）
  const resolvedMode =
    mode ||
    (skillId === 'zhong_female_portrait_director'
      ? resolveFemalePortraitMode(prompt)?.id
      : resolveImageCreationMode(prompt)?.id);

  const userParams = {
    aspectRatio: aspectRatio || undefined,
    imageSize: imageSize || undefined,
    sessionId: context?.sessionId || undefined,
    referenceImageIds: referenceImageIds || undefined,
    characterCardIds: characterCardIds || undefined,
    characterReferenceGroups: characterReferenceGroups || undefined,
    referenceMode: referenceMode || undefined
  };
  const systemPrompt = buildSystemPrompt(
    skillId,
    resolvedMode,
    validated.value.skillConfig,
    userParams
  );
  const referenceImages = context?.referenceImages?.length
    ? context.referenceImages
    : undefined;

  const agent = createAgent({
    apiType: 'openai-completions' as const,
    model: platform.model,
    apiKey: platform.apiKey,
    baseURL: platform.baseURL,
    systemPrompt,
    tools: [createGenerateImageTool(token, userParams)],
    maxTurns: DEFAULT_MAX_TURNS,
    persistSession: false // Worker 无持久磁盘，会话仅存内存
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ImageChatSseEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeSse(event)));
        } catch {
          // 客户端断开
        }
      };
      let completed = false;
      let hadOutput = false;

      try {
        console.log(
          `[SkillImageChat] user=${userId.slice(0, 8)} skill=${skillId} model=${
            platform.model
          } mode=${resolvedMode || 'auto'} config=${
            validated.value.skillConfig
              ? Object.keys(validated.value.skillConfig).length
              : 0
          } images=${referenceImages?.length || 0}`
        );

        const enrichedPrompt = referenceImages?.length
          ? `${prompt}\n\n[参考图 ${referenceImages.length} 张，已随工具调用传递]`
          : prompt;

        for await (const msg of agent.query(enrichedPrompt)) {
          for (const event of mapSdkMessageToEvents(msg as SdkMsg)) {
            send(event);
            if (event.event === 'done') completed = true;
            if (
              event.event === 'text' ||
              event.event === 'image' ||
              event.event === 'tool_result'
            ) {
              hadOutput = true;
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        send({ event: 'error', data: { message } });
      } finally {
        try {
          await agent.close();
        } catch {
          // ignore
        }
        // 成功完成（或产生过结果）才扣对话积分
        if (completed || hadOutput) {
          await consumeSkillChatCredits(userId, skillId);
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    }
  });

  return new Response(stream, { headers: { ...cors, ...SSE_HEADERS } });
}
