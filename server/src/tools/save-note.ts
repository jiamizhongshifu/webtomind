/**
 * 保存笔记工具
 * 使用 Supabase 持久化存储
 */

import type { ToolResult } from '../types/api.js';
import { createNote, getAllNotes as dbGetAllNotes, getNoteById as dbGetNoteById } from '../services/supabase.js';

interface SaveNoteParams {
  title: string;
  content: string;
  tags?: string[];
  sourceUrl?: string;
}

// 工具执行上下文（由 Agent 传入）
export interface ToolContext {
  userId?: string;
  projectId?: string;  // 当前项目 ID（用于卡片工具的项目隔离）
  referenceImages?: Array<{ data: string; mimeType: string }>;
}

/**
 * 保存笔记到 Supabase
 */
export async function saveNote(
  params: SaveNoteParams,
  context?: ToolContext
): Promise<ToolResult> {
  const { title, content, tags = [], sourceUrl } = params;

  console.log(`[SaveNote] Saving: ${title}, userId: ${context?.userId || 'none'}`);

  try {
    // 验证参数
    if (!title || title.trim().length === 0) {
      return {
        success: false,
        error: '标题不能为空',
      };
    }

    if (!content || content.trim().length === 0) {
      return {
        success: false,
        error: '内容不能为空',
      };
    }

    // 强制登录模式：必须有 userId
    if (!context?.userId) {
      return {
        success: false,
        error: '请先登录后再保存笔记',
      };
    }

    // 保存到 Supabase
    const note = await createNote(
      {
        title: title.trim(),
        content: content.trim(),
        tags: tags.map((t) => t.trim()).filter((t) => t.length > 0),
        source_url: sourceUrl,
      },
      context.userId
    );

    console.log(`[SaveNote] Saved to Supabase: ${note.id}`);

    return {
      success: true,
      data: {
        noteId: note.id,
        message: `笔记 "${title}" 已保存`,
        note: {
          id: note.id,
          title: note.title,
          tags: note.tags,
          createdAt: note.created_at,
        },
      },
    };
  } catch (error) {
    console.error('[SaveNote] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '保存失败',
    };
  }
}

/**
 * 获取所有笔记
 * @param userId 用户ID（强制登录模式下必需）
 */
export async function getAllNotes(userId: string) {
  try {
    return await dbGetAllNotes(userId);
  } catch (error) {
    console.error('[SaveNote] getAllNotes error:', error);
    return [];
  }
}

/**
 * 获取单个笔记
 * @param noteId 笔记ID
 * @param userId 用户ID（强制登录模式下必需）
 */
export async function getNote(noteId: string, userId: string) {
  try {
    return await dbGetNoteById(noteId, userId);
  } catch (error) {
    console.error('[SaveNote] getNote error:', error);
    return null;
  }
}

/**
 * 工具定义（Anthropic 格式）
 */
export const saveNoteDefinition = {
  name: 'save_note',
  description: '保存笔记到用户的历史记录。适用于保存总结、摘要、重要信息等场景。',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: '笔记标题，简洁明了',
      },
      content: {
        type: 'string',
        description: '笔记内容，支持 Markdown 格式',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '标签列表，便于分类和搜索',
      },
      sourceUrl: {
        type: 'string',
        description: '来源 URL（如果有）',
      },
    },
    required: ['title', 'content'],
  },
};
