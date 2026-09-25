/**
 * Skill 图像创作（Agent 模式）共享常量与 SSE 解析
 * 供 ImageStudioComposer（技能入口）与 ImageCreatePage（结果渲染）复用。
 *
 * 产品收敛：技能固定为「女性写真视觉导演」（zhong_female_portrait_director），
 * 用户只需在图像创作输入框底部选择两个模式之一：
 * - 日常写真 → mode=free
 * - 写真探索 → mode=explore
 */

export const PORTRAIT_SKILL_ID = 'zhong_female_portrait_director';

/** 官方女性写真视觉导演 skill（技能浮窗第一步：先选 skill 再选模式） */
export const PORTRAIT_SKILL = {
  id: PORTRAIT_SKILL_ID,
  name: '女性写真视觉导演',
  description: '官方预设写真技能：日常写真与风格化写真探索'
} as const;

export const PORTRAIT_SKILL_MODES = [
  {
    id: 'free',
    name: '日常写真',
    description: '自然随拍，聚焦真实瞬间与日常氛围'
  },
  {
    id: 'explore',
    name: '写真探索',
    description: '风格化探索，一次出 2 张、按 2 张计费'
  }
] as const;

export type PortraitSkillModeId = (typeof PORTRAIT_SKILL_MODES)[number]['id'];

export function getPortraitModeName(
  modeId: string | undefined
): string | undefined {
  return PORTRAIT_SKILL_MODES.find((mode) => mode.id === modeId)?.name;
}

/** Agent 对话中的一条消息（用户提问 / Agent 回复） */
export interface SkillChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Agent 调用平台出图通道后返回的生成图 */
export interface SkillChatImage {
  url: string;
  prompt?: string;
}

/**
 * 从 generate_image 工具的 tool_result 中提取 generationId（用于挂到创作会话 turn）。
 * 工具返回 JSON 字符串：{ imageUrl, generationId, images: [{ imageUrl, generationId }] }。
 */
export function extractSkillGenerationIds(result: unknown): string[] {
  if (typeof result !== 'string') return [];
  try {
    const parsed = JSON.parse(result) as {
      generationId?: string;
      images?: Array<{ generationId?: string }>;
    };
    if (Array.isArray(parsed.images)) {
      return parsed.images
        .map((image) => image?.generationId)
        .filter((id): id is string => Boolean(id));
    }
    return parsed.generationId ? [parsed.generationId] : [];
  } catch {
    return [];
  }
}

/**
 * 从 generate_image 工具的 tool_result 提取 taskId + generationIds。
 * 工具返回 JSON 字符串：{ taskId, imageUrl, generationId, images: [{ imageUrl, generationId }] }。
 */
export function extractSkillToolResult(result: unknown): {
  taskId?: string;
  generationIds: string[];
} {
  if (typeof result !== 'string') return { generationIds: [] };
  try {
    const parsed = JSON.parse(result) as {
      taskId?: string;
      generationId?: string;
      images?: Array<{ generationId?: string }>;
    };
    const generationIds = Array.isArray(parsed.images)
      ? parsed.images
          .map((image) => image?.generationId)
          .filter((id): id is string => Boolean(id))
      : parsed.generationId
        ? [parsed.generationId]
        : [];
    return {
      taskId:
        typeof parsed.taskId === 'string' && parsed.taskId
          ? parsed.taskId
          : undefined,
      generationIds
    };
  } catch {
    return { generationIds: [] };
  }
}

export type SkillImageChatStreamEvent =
  | { event: 'text'; data: { content: string } }
  | {
      event: 'tool_call';
      data: { name: string; input: unknown; status: string };
    }
  | {
      event: 'tool_result';
      data: { name: string; result: unknown; success: boolean };
    }
  | { event: 'image'; data: { url: string; prompt?: string } }
  | { event: 'done'; data: Record<string, never> }
  | { event: 'error'; data: { message: string } };

/** 解析 SSE 缓冲区，返回完整事件与剩余未闭合字节 */
export function parseSkillSseBuffer(buffer: string): {
  events: SkillImageChatStreamEvent[];
  rest: string;
} {
  const events: SkillImageChatStreamEvent[] = [];
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() || '';
  for (const block of blocks) {
    let event = '';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
    }
    if (dataLines.length) {
      try {
        events.push({
          event: (event || 'text') as SkillImageChatStreamEvent['event'],
          data: JSON.parse(dataLines.join('\n'))
        });
      } catch {
        // 忽略无法解析的帧
      }
    }
  }
  return { events, rest };
}

/**
 * 从 Agent 完整回复中提取「最终结果反馈」，过滤模式判断/故事契约/七段提示卡等过程性内容。
 * 优先取「已生成/生成成功/完成」等结果句；找不到时回退为整段文本。
 */
export function extractSkillResultSummary(text: string): string {
  const normalized = String(text || '').trim();
  if (!normalized) return '';

  const resultMarkers = [
    /图片已生成[^\n]*/,
    /已为您生成[^\n]*/,
    /已生成[^\n]*样张[^\n]*/,
    /已生成[^\n]*/,
    /生成成功[^\n]*/
  ];
  for (const marker of resultMarkers) {
    const match = normalized.match(marker);
    if (match) {
      return match[0].replace(/^[\s\n*#]+/, '').trim();
    }
  }
  const afterResult = normalized.match(/生成结果[\s\S]*$/);
  if (afterResult) {
    return afterResult[0].replace(/^生成结果[\s\n*#:：]*/, '').trim();
  }
  const lines = normalized
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[lines.length - 1] || normalized;
}
