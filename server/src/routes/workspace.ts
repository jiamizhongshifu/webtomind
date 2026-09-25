/**
 * 宸ヤ綔鍙?API 璺敱
 * 鏀寔 Supabase 鏁版嵁搴撳拰鍐呭瓨瀛樺偍涓ょ妯″紡
 * 鏀寔鐢ㄦ埛璁よ瘉鍜屾暟鎹殧绂?
 */

import { Hono } from 'hono';
import * as db from '../services/supabase.js';
import { optionalAuth, requireAuth, getUserId } from '../middleware/auth.js';
import { processContentImages } from '../services/image-storage.js';
import { executeWorkspaceTask } from '../services/workspace-task-executor.js';
import {
  confirmSummaryCreate,
  confirmSummaryUpdate,
  confirmSummaryDelete,
  type SummaryCreateParams
} from '../tools/summary.js';
import type {
  WorkspaceTaskRecord,
  WorkspaceTaskRequest
} from '../types/workspace-task.js';

export const workspaceRoutes = new Hono();

// 瀵规墍鏈夎矾鐢卞簲鐢ㄥ彲閫夎璇佷腑闂翠欢
workspaceRoutes.use('*', optionalAuth);

// 妫€鏌ユ槸鍚﹂厤缃簡 Supabase
const useSupabase = !!(
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_ANON_KEY &&
  !process.env.SUPABASE_URL.includes('your-project')
);
const allowDevMemoryFallback = process.env.NODE_ENV !== 'production';

if (useSupabase) {
  console.log('[Workspace] Using Supabase database');
} else {
  console.log('[Workspace] Using in-memory storage (Supabase not configured)');
}

workspaceRoutes.use('*', async (c, next) => {
  // v1.3 鍏ュ彛鏀跺彛璇存槑锛?
  // - 鏂板宸ヤ綔鍙拌兘鍔涳紙渚嬪 cards/weaving锛夌粺涓€鍦?/api/workspace/* 瀹炵幇
  // - 鏈矾鐢变繚鐣欎负鍏煎灞傦紝閬垮厤涓?/api/workspace/* 浜х敓鍙岃建鏂板
  c.header('x-webtomind-workspace-route', 'legacy-compat');

  if (!useSupabase && process.env.NODE_ENV === 'production') {
    console.warn('[Workspace] In-memory storage disabled in production.');
    return c.json({ error: 'Storage is not configured' }, 503);
  }
  await next();
});

// ============================================
// 鍐呭瓨瀛樺偍锛圫upabase 鏈厤缃椂浣跨敤锛?
// ============================================

interface MemorySummary {
  id: string;
  title: string;
  url: string;
  markdown: string;
  tags: string[];
  createdAt: number;
  updatedAt?: number;
}

interface MemoryShortcut {
  id: string;
  name: string;
  prompt: string;
  referenceIds: string[];
  order: number;
  createdAt: number;
  updatedAt?: number;
}

interface MemoryProject {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  isDefault: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
  favoritedAt: number | null;
}

interface MemoryConversation {
  id: string;
  projectId: string;
  title: string;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    createdAt: number;
  }>;
  createdAt: number;
  updatedAt: number;
}

interface MemoryStudioDocument {
  id: string;
  projectId: string;
  title: string;
  status: 'draft' | 'published';
  content: Record<string, unknown>;
  contentType: string;
  createdAt: number;
  updatedAt: number;
}

const memoryProjects: Map<string, MemoryProject> = new Map();
const memorySummaries: Map<string, MemorySummary> = new Map();
const memoryShortcuts: Map<string, MemoryShortcut> = new Map();
const memoryConversations: Map<string, MemoryConversation> = new Map();
const memoryStudioDocuments: Map<string, MemoryStudioDocument> = new Map();
const memoryTasks: Map<string, WorkspaceTaskRecord> = new Map();
const memoryTaskOwners: Map<string, string> = new Map();
const memoryCustomSkills: Map<string, Record<string, unknown>> = new Map();
const DEV_WORKSPACE_USER_ID = '__dev_workspace_user__';

function resolveWorkspaceUserId(c: Parameters<typeof getUserId>[0]): string | null {
  const userId = getUserId(c);
  if (userId) {
    return userId;
  }

  if (allowDevMemoryFallback) {
    return DEV_WORKSPACE_USER_ID;
  }

  return null;
}

function getTaskById(id: string, userId: string): WorkspaceTaskRecord | undefined {
  const ownerId = memoryTaskOwners.get(id);
  if (!ownerId || ownerId !== userId) {
    return undefined;
  }
  return memoryTasks.get(id);
}

function formatProjectResponse(
  project: MemoryProject,
  summaryCount: number,
  conversationCount = 0
) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    icon: project.icon,
    color: project.color,
    isDefault: project.isDefault,
    sortOrder: project.sortOrder,
    summaryCount,
    conversationCount,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    archivedAt: project.archivedAt,
    favoritedAt: project.favoritedAt
  };
}

function getMemorySummaryProjectId(summary: MemorySummary): string | null {
  const projectTag = summary.tags.find((tag) => tag.startsWith('project:'));
  return projectTag ? projectTag.slice('project:'.length) : null;
}

function countMemoryProjectSummaries(projectId: string): number {
  let count = 0;
  for (const summary of memorySummaries.values()) {
    if (getMemorySummaryProjectId(summary) === projectId) {
      count += 1;
    }
  }
  return count;
}


// 初始化示例数据（内存模式）
if (!useSupabase && memoryProjects.size === 0) {
  const now = Date.now();
  memoryProjects.set('default_project', {
    id: 'default_project',
    name: 'Inbox',
    description: '本地测试默认项目',
    icon: '📥',
    color: '#6366f1',
    isDefault: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    favoritedAt: null
  });
}

if (!useSupabase && memorySummaries.size === 0) {
  const sample: MemorySummary = {
    id: 'sample_1',
    title: 'Welcome to AI Mind Mapper',
    url: 'https://example.com',
    markdown: `# Welcome to AI Mind Mapper

## Quick Start

- Click the extension icon on any page
- Click "Summarize Current Page"
- Review the generated mind map
`,
    tags: ['tutorial', 'intro', 'project:default_project'],
    createdAt: Date.now()
  };
  memorySummaries.set(sample.id, sample);
}

if (!memoryProjects.has('proj-1')) {
  const now = Date.now();
  memoryProjects.set('proj-1', {
    id: 'proj-1',
    name: '内容创作',
    description: '本地测试项目',
    icon: '✍️',
    color: '#3b82f6',
    isDefault: false,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    favoritedAt: null
  });
}

if (!memorySummaries.has('sum-1') || !memorySummaries.has('sum-2')) {
  const now = Date.now();
  const samples: MemorySummary[] = [
    {
      id: 'sum-1',
      title: 'AI 驱动内容创作的未来趋势',
      url: 'https://example.com/ai-content-trends',
      markdown: '# AI 驱动内容创作的未来趋势\n\n## 核心观点\n\n1. 多模态生成\n2. 工作流自动化\n3. 个性化输出',
      tags: ['AI', '内容创作', '趋势', 'project:proj-1'],
      createdAt: now - 86400000
    },
    {
      id: 'sum-2',
      title: '如何用思维导图整理复杂信息',
      url: 'https://example.com/mindmap-guide',
      markdown: '# 如何用思维导图整理复杂信息\n\n- 视觉化信息结构\n- 快速发现关联\n- 便于回顾和扩展',
      tags: ['方法论', '思维导图', '效率', 'project:proj-1'],
      createdAt: now - 86400000 * 2
    }
  ];

  for (const sample of samples) {
    memorySummaries.set(sample.id, sample);
  }
}

if (memoryConversations.size === 0) {
  const now = Date.now();
  memoryConversations.set('conv-1', {
    id: 'conv-1',
    projectId: 'proj-1',
    title: 'AI 内容创作趋势讨论',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: '帮我分析一下 AI 内容创作的最新趋势',
        createdAt: now - 7200000
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'AI 内容创作正在朝多模态、自动化和个性化方向发展。',
        createdAt: now - 7180000
      }
    ],
    createdAt: now - 7200000,
    updatedAt: now - 7180000
  });
}

if (memoryStudioDocuments.size === 0) {
  const now = Date.now();
  memoryStudioDocuments.set('doc-draft-1', {
    id: 'doc-draft-1',
    projectId: 'proj-1',
    title: '行业研究报告草稿',
    status: 'draft',
    contentType: 'text',
    createdAt: now,
    updatedAt: now,
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '这是一份本地测试草稿。' }]
        }
      ]
    }
  });
}

// ============================================
// 项目接口
// ============================================

workspaceRoutes.get('/projects', async (c) => {
  try {
    const userId = getUserId(c);

    if (useSupabase) {
      if (!userId) {
        if (!allowDevMemoryFallback) {
          return c.json({ projects: [] });
        }
      } else {
        const supabase = db.getSupabase();
        const { data: projects, error } = await supabase
          .from('workspace_projects')
          .select('*')
          .eq('user_id', userId)
          .order('sort_order', { ascending: true });

        if (error) {
          throw error;
        }

        const rows = (projects || []) as Array<{
          id: string;
          name: string;
          description: string | null;
          icon: string | null;
          color: string | null;
          is_default: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
          favorited_at: string | null;
        }>;

        const projectIds = rows.map((project) => project.id);

        const [summaryCountsResult, conversationCountsResult] = await Promise.all([
          projectIds.length
            ? supabase
                .from('summaries')
                .select('project_id')
                .in('project_id', projectIds)
            : Promise.resolve({ data: [], error: null }),
          projectIds.length
            ? supabase
                .from('conversations')
                .select('project_id')
                .in('project_id', projectIds)
            : Promise.resolve({ data: [], error: null })
        ]);

        if (summaryCountsResult.error) {
          throw summaryCountsResult.error;
        }

        if (conversationCountsResult.error) {
          throw conversationCountsResult.error;
        }

        const summaryCountMap = new Map<string, number>();
        const conversationCountMap = new Map<string, number>();

        for (const item of summaryCountsResult.data || []) {
          const projectId = (item as { project_id: string }).project_id;
          summaryCountMap.set(projectId, (summaryCountMap.get(projectId) || 0) + 1);
        }

        for (const item of conversationCountsResult.data || []) {
          const projectId = (item as { project_id: string }).project_id;
          conversationCountMap.set(projectId, (conversationCountMap.get(projectId) || 0) + 1);
        }

        return c.json({
          projects: rows.map((project) => ({
            id: project.id,
            name: project.name,
            description: project.description,
            icon: project.icon || '📁',
            color: project.color || '#6366f1',
            isDefault: project.is_default,
            sortOrder: project.sort_order,
            summaryCount: summaryCountMap.get(project.id) || 0,
            conversationCount: conversationCountMap.get(project.id) || 0,
            createdAt: new Date(project.created_at).getTime(),
            updatedAt: new Date(project.updated_at).getTime(),
            archivedAt: project.archived_at
              ? new Date(project.archived_at).getTime()
              : null,
            favoritedAt: project.favorited_at
              ? new Date(project.favorited_at).getTime()
              : null
          }))
        });
      }
    }

    const projects = Array.from(memoryProjects.values())
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((project) =>
        formatProjectResponse(project, countMemoryProjectSummaries(project.id))
      );

    return c.json({ projects });
  } catch (error) {
    console.error('[Workspace] Get projects error:', error);
    return c.json({ error: '获取项目列表失败' }, 500);
  }
});

workspaceRoutes.post('/projects', async (c) => {
  try {
    const userId = getUserId(c);
    const body = await c.req.json<{
      name?: string;
      description?: string;
      icon?: string;
      color?: string;
    }>();

    const name = body.name?.trim();
    if (!name) {
      return c.json({ error: '项目名称不能为空' }, 400);
    }

    if (useSupabase) {
      if (!userId) {
        if (!allowDevMemoryFallback) {
          return c.json({ error: '请先登录' }, 401);
        }
      } else {
        const supabase = db.getSupabase();
        const { data: maxOrder } = await supabase
          .from('workspace_projects')
          .select('sort_order')
          .eq('user_id', userId)
          .order('sort_order', { ascending: false })
          .limit(1)
          .single();

        const nextSortOrder = (maxOrder?.sort_order ?? -1) + 1;
        const { data, error } = await supabase
          .from('workspace_projects')
          .insert({
            user_id: userId,
            name,
            description: body.description?.trim() || null,
            icon: body.icon || '📁',
            color: body.color || '#6366f1',
            is_default: false,
            sort_order: nextSortOrder
          })
          .select()
          .single();

        if (error) {
          throw error;
        }

        return c.json({
          project: {
            id: data.id,
            name: data.name,
            description: data.description,
            icon: data.icon || '📁',
            color: data.color || '#6366f1',
            isDefault: data.is_default,
            sortOrder: data.sort_order,
            summaryCount: 0,
            conversationCount: 0,
            createdAt: new Date(data.created_at).getTime(),
            updatedAt: new Date(data.updated_at).getTime(),
            archivedAt: data.archived_at ? new Date(data.archived_at).getTime() : null,
            favoritedAt: data.favorited_at ? new Date(data.favorited_at).getTime() : null
          }
        });
      }
    }

    const nextSortOrder = memoryProjects.size;
    const now = Date.now();
    const project: MemoryProject = {
      id: `project_${now}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      description: body.description?.trim() || null,
      icon: body.icon || '📁',
      color: body.color || '#6366f1',
      isDefault: false,
      sortOrder: nextSortOrder,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      favoritedAt: null
    };

    memoryProjects.set(project.id, project);
    return c.json({ project: formatProjectResponse(project, 0, 0) });
  } catch (error) {
    console.error('[Workspace] Create project error:', error);
    return c.json({ error: '创建项目失败' }, 500);
  }
});

workspaceRoutes.get('/projects/:id', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');

    if (useSupabase) {
      if (!userId) {
        if (!allowDevMemoryFallback) {
          return c.json({ error: '请先登录' }, 401);
        }
      } else {
        const supabase = db.getSupabase();
        const { data: project, error } = await supabase
          .from('workspace_projects')
          .select('*')
          .eq('id', id)
          .eq('user_id', userId)
          .single();

        if (error || !project) {
          return c.json({ error: '项目不存在' }, 404);
        }

        const [summariesResult, conversationsResult] = await Promise.all([
          supabase.from('summaries').select('id', { count: 'exact', head: true }).eq('project_id', id),
          supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('project_id', id)
        ]);

        if (summariesResult.error) {
          throw summariesResult.error;
        }
        if (conversationsResult.error) {
          throw conversationsResult.error;
        }

        return c.json({
          project: {
            id: project.id,
            name: project.name,
            description: project.description,
            icon: project.icon || '📁',
            color: project.color || '#6366f1',
            isDefault: project.is_default,
            sortOrder: project.sort_order,
            summaryCount: summariesResult.count || 0,
            conversationCount: conversationsResult.count || 0,
            createdAt: new Date(project.created_at).getTime(),
            updatedAt: new Date(project.updated_at).getTime(),
            archivedAt: project.archived_at ? new Date(project.archived_at).getTime() : null,
            favoritedAt: project.favorited_at ? new Date(project.favorited_at).getTime() : null
          }
        });
      }
    }

    const project = memoryProjects.get(id);
    if (!project) {
      return c.json({ error: '项目不存在' }, 404);
    }

    return c.json({
      project: formatProjectResponse(project, countMemoryProjectSummaries(project.id))
    });
  } catch (error) {
    console.error('[Workspace] Get project error:', error);
    return c.json({ error: '获取项目失败' }, 500);
  }
});

workspaceRoutes.patch('/projects/:id', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');
    const body = await c.req.json<{
      name?: string;
      description?: string;
      icon?: string;
      color?: string;
      sort_order?: number;
      archived?: boolean;
      favorited?: boolean;
    }>();

    if (useSupabase) {
      if (!userId) {
        if (!allowDevMemoryFallback) {
          return c.json({ error: '请先登录' }, 401);
        }
      } else {
        const updates: Record<string, unknown> = {};
        if (body.name !== undefined) updates.name = body.name;
        if (body.description !== undefined) updates.description = body.description;
        if (body.icon !== undefined) updates.icon = body.icon;
        if (body.color !== undefined) updates.color = body.color;
        if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
        if (body.archived !== undefined) {
          updates.archived_at = body.archived ? new Date().toISOString() : null;
        }
        if (body.favorited !== undefined) {
          updates.favorited_at = body.favorited ? new Date().toISOString() : null;
        }

        const supabase = db.getSupabase();
        const { data, error } = await supabase
          .from('workspace_projects')
          .update(updates)
          .eq('id', id)
          .eq('user_id', userId)
          .select()
          .single();

        if (error) {
          throw error;
        }

        return c.json({ project: data, success: true });
      }
    }

    const project = memoryProjects.get(id);
    if (!project) {
      return c.json({ error: '项目不存在' }, 404);
    }

    if (body.name !== undefined) project.name = body.name;
    if (body.description !== undefined) project.description = body.description ?? null;
    if (body.icon !== undefined) project.icon = body.icon;
    if (body.color !== undefined) project.color = body.color;
    if (body.sort_order !== undefined) project.sortOrder = body.sort_order;
    if (body.archived !== undefined) project.archivedAt = body.archived ? Date.now() : null;
    if (body.favorited !== undefined) project.favoritedAt = body.favorited ? Date.now() : null;
    project.updatedAt = Date.now();
    memoryProjects.set(id, project);

    return c.json({
      project: formatProjectResponse(project, countMemoryProjectSummaries(id)),
      success: true
    });
  } catch (error) {
    console.error('[Workspace] Update project error:', error);
    return c.json({ error: '更新项目失败' }, 500);
  }
});

workspaceRoutes.delete('/projects/:id', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');

    if (useSupabase) {
      if (!userId) {
        if (!allowDevMemoryFallback) {
          return c.json({ error: '请先登录' }, 401);
        }
      } else {
        const supabase = db.getSupabase();
        const { data: project, error: projectError } = await supabase
          .from('workspace_projects')
          .select('id, is_default')
          .eq('id', id)
          .eq('user_id', userId)
          .single();

        if (projectError || !project) {
          return c.json({ error: '项目不存在' }, 404);
        }

        if (project.is_default) {
          return c.json({ error: '默认项目不能删除' }, 403);
        }

        const { data: defaultProject, error: defaultProjectError } = await supabase
          .from('workspace_projects')
          .select('id')
          .eq('user_id', userId)
          .eq('is_default', true)
          .single();

        if (defaultProjectError) {
          throw defaultProjectError;
        }

        if (defaultProject?.id) {
          await Promise.all([
            supabase
              .from('summaries')
              .update({ project_id: defaultProject.id })
              .eq('project_id', id),
            supabase
              .from('conversations')
              .update({ project_id: defaultProject.id })
              .eq('project_id', id)
          ]);
        }

        const { error } = await supabase.from('workspace_projects').delete().eq('id', id);
        if (error) {
          throw error;
        }

        return c.json({ success: true });
      }
    }

    const project = memoryProjects.get(id);
    if (!project) {
      return c.json({ error: '项目不存在' }, 404);
    }

    if (project.isDefault) {
      return c.json({ error: '默认项目不能删除' }, 403);
    }

    memoryProjects.delete(id);
    return c.json({ success: true });
  } catch (error) {
    console.error('[Workspace] Delete project error:', error);
    return c.json({ error: '删除项目失败' }, 500);
  }
});

// ============================================
// 总结/笔记接口
// ============================================

// 鑾峰彇鎵€鏈夋€荤粨
workspaceRoutes.get('/summaries', async (c) => {
  try {
    const userId = getUserId(c);
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const projectId = c.req.query('project_id');

    console.log(
      '[Workspace] GET /summaries - userId:',
      userId || 'undefined',
      'limit:',
      limit,
      'offset:',
      offset,
      'projectId:',
      projectId || 'all'
    );

    if (useSupabase) {
      // 安全性：只返回已登录用户的数据，未登录开发环境回退到内存数据
      if (!userId) {
        if (!allowDevMemoryFallback) {
          console.log(
            '[Workspace] Get summaries: no userId, returning empty array'
          );
          return c.json({ summaries: [], hasMore: false });
        }
      } else {
        const summaries = await db.getAllSummaries(userId, {
          limit: limit + 1,
          offset,
          projectId
        });
        const hasMore = summaries.length > limit;
        const actualSummaries = hasMore ? summaries.slice(0, limit) : summaries;

        console.log(
          '[Workspace] Get summaries: returned',
          actualSummaries.length,
          'items for user:',
          userId,
          'hasMore:',
          hasMore
        );
        const filteredSummaries = actualSummaries.filter(
          (s) => s.user_id === userId
        );
        if (filteredSummaries.length !== actualSummaries.length) {
          console.error(
            '[Workspace] WARNING: Some summaries have wrong user_id! Expected:',
            userId,
            'Got:',
            actualSummaries.map((s) => s.user_id)
          );
        }
        const formatted = filteredSummaries.map((s) => {
          const summaryProjectId = (s as { project_id?: string | null }).project_id ?? null;
          return {
            id: s.id,
            title: s.title,
            url: s.url,
            markdown: s.markdown,
            tags: s.tags,
            contentType: s.content_type,
            createdAt: new Date(s.created_at).getTime(),
            project_id: summaryProjectId,
            projectId: summaryProjectId
          };
        });
        return c.json({ summaries: formatted, hasMore });
      }
    }

    const list = Array.from(memorySummaries.values())
      .filter((summary) => (projectId ? getMemorySummaryProjectId(summary) === projectId : true))
      .sort((a, b) => b.createdAt - a.createdAt);
    const paginatedList = list.slice(offset, offset + limit).map((summary) => ({
      id: summary.id,
      title: summary.title,
      url: summary.url,
      markdown: summary.markdown,
      tags: summary.tags,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
      project_id: getMemorySummaryProjectId(summary),
      projectId: getMemorySummaryProjectId(summary)
    }));
    const hasMore = offset + limit < list.length;
    return c.json({ summaries: paginatedList, hasMore });
  } catch (error) {
    console.error('[Workspace] Get summaries error:', error);
    return c.json({ error: '鑾峰彇鎬荤粨澶辫触' }, 500);
  }
});

// 鑾峰彇鍗曚釜鎬荤粨
workspaceRoutes.get('/summaries/:id', async (c) => {
  const id = c.req.param('id');
  const userId = getUserId(c);
  const projectId = c.req.query('project_id');

  try {
    if (useSupabase) {
      if (!userId) {
        if (!allowDevMemoryFallback) {
          return c.json({ error: 'Summary not found' }, 404);
        }
      } else {
        const summary = await db.getSummaryById(id, userId, projectId);
        if (!summary) {
          return c.json({ error: 'Summary not found' }, 404);
        }
        console.log(
          '[Workspace] GET /summaries/:id - id:',
          id,
          'content_type from DB:',
          summary.content_type
        );
        return c.json({
          summary: {
            id: summary.id,
            title: summary.title,
            url: summary.url,
            markdown: summary.markdown,
            tags: summary.tags,
            contentType: summary.content_type,
            createdAt: new Date(summary.created_at).getTime(),
            project_id: (summary as { project_id?: string | null }).project_id ?? null,
            projectId: (summary as { project_id?: string | null }).project_id ?? null
          }
        });
      }
    }

    const summary = memorySummaries.get(id);
    if (!summary) {
      return c.json({ error: 'Summary not found' }, 404);
    }
    return c.json({
      summary: {
        id: summary.id,
        title: summary.title,
        url: summary.url,
        markdown: summary.markdown,
        tags: summary.tags,
        createdAt: summary.createdAt,
        updatedAt: summary.updatedAt,
        project_id: getMemorySummaryProjectId(summary),
        projectId: getMemorySummaryProjectId(summary)
      }
    });
  } catch (error) {
    console.error('[Workspace] Get summary error:', error);
    return c.json({ error: '获取总结失败' }, 500);
  }
});

// 鍒涘缓鎬荤粨
workspaceRoutes.post('/summaries', async (c) => {
  const body = await c.req.json();
  const { title, url, markdown, tags, content_type, project_id } = body;
  const userId = getUserId(c);

  if (!title || !markdown) {
    return c.json({ error: 'Title and content are required' }, 400);
  }

  // 馃敀 瀹夊叏妫€鏌ワ細蹇呴』鐧诲綍鎵嶈兘鍒涘缓绗旇
  if (!userId) {
    console.warn('[Workspace] POST /summaries - REJECTED: no userId');
    return c.json({ error: '璇峰厛鐧诲綍鍚庡啀淇濆瓨绗旇' }, 401);
  }

  try {
    // 澶勭悊 markdown 涓殑 base64 鍥剧墖锛屼笂浼犲埌 Storage
    let processedMarkdown = markdown;
    const hasBase64 = markdown && markdown.includes('data:image');
    console.log(
      '[Workspace] POST /summaries - markdown length:',
      markdown?.length,
      'hasBase64:',
      hasBase64,
      'useSupabase:',
      useSupabase
    );

    if (hasBase64) {
      console.log('[Workspace] Processing base64 images in markdown...');
      try {
        processedMarkdown = await processContentImages(markdown, userId);
        const stillHasBase64 = processedMarkdown.includes('data:image');
        console.log(
          '[Workspace] After processing - length:',
          processedMarkdown.length,
          'stillHasBase64:',
          stillHasBase64
        );
      } catch (imgError) {
        console.error('[Workspace] Image processing failed:', imgError);
        // 缁х画浣跨敤鍘熷 markdown锛屼笉闃诲淇濆瓨
      }
    }

    if (useSupabase) {
      const result = await db.createSummary({
        title,
        url: url || 'note://local',
        markdown: processedMarkdown,
        tags: tags || [],
        user_id: userId,
        content_type: content_type,
        project_id: project_id
      });
      console.log(
        '[Workspace] Summary created:',
        result.id,
        'user:',
        userId,
        'content_type:',
        content_type
      );
      return c.json({ id: result.id, success: true });
    }

    const id = `summary_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const summary: MemorySummary = {
      id,
      title,
      url: url || 'note://local',
      markdown: processedMarkdown,
      tags: tags || [],
      createdAt: Date.now()
    };
    memorySummaries.set(id, summary);
    console.log('[Workspace] Summary created:', id);
    return c.json({ id, success: true });
  } catch (error) {
    console.error('[Workspace] Create summary error:', error);
    return c.json({ error: '鍒涘缓澶辫触' }, 500);
  }
});

// 鏇存柊鎬荤粨
workspaceRoutes.patch('/summaries/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { title, markdown, tags } = body;
  const userId = getUserId(c);

  // 馃敀 瀹夊叏妫€鏌ワ細蹇呴』鐧诲綍鎵嶈兘鏇存柊绗旇
  if (!userId) {
    console.warn('[Workspace] PATCH /summaries/:id - REJECTED: no userId');
    return c.json({ error: '璇峰厛鐧诲綍鍚庡啀鏇存柊绗旇' }, 401);
  }

  try {
    // 澶勭悊 markdown 涓殑 base64 鍥剧墖锛屼笂浼犲埌 Storage
    let processedMarkdown = markdown;
    if (markdown && markdown.includes('data:image')) {
      console.log('[Workspace] Processing base64 images in markdown update...');
      processedMarkdown = await processContentImages(
        markdown,
        userId || undefined
      );
    }

    if (useSupabase) {
      await db.updateSummary(
        id,
        { title, markdown: processedMarkdown, tags },
        userId
      );
      console.log('[Workspace] Summary updated:', id);
      return c.json({ success: true });
    }

    const summary = memorySummaries.get(id);
    if (!summary) {
      return c.json({ error: 'Summary not found' }, 404);
    }

    if (title !== undefined) summary.title = title;
    if (processedMarkdown !== undefined) summary.markdown = processedMarkdown;
    if (tags !== undefined) summary.tags = tags;
    summary.updatedAt = Date.now();
    memorySummaries.set(id, summary);
    console.log('[Workspace] Summary updated:', id);
    return c.json({ success: true });
  } catch (error) {
    console.error('[Workspace] Update summary error:', error);
    return c.json({ error: '鏇存柊澶辫触' }, 500);
  }
});

// 鍒犻櫎鎬荤粨
workspaceRoutes.delete('/summaries/:id', async (c) => {
  const id = c.req.param('id');
  const userId = getUserId(c);

  // 馃敀 瀹夊叏妫€鏌ワ細蹇呴』鐧诲綍鎵嶈兘鍒犻櫎绗旇
  if (!userId) {
    console.warn('[Workspace] DELETE /summaries/:id - REJECTED: no userId');
    return c.json({ error: '璇峰厛鐧诲綍鍚庡啀鍒犻櫎绗旇' }, 401);
  }

  try {
    if (useSupabase) {
      await db.deleteSummary(id, userId);
      console.log('[Workspace] Summary deleted:', id);
      return c.json({ success: true });
    }

    if (!memorySummaries.has(id)) {
      return c.json({ error: 'Summary not found' }, 404);
    }
    memorySummaries.delete(id);
    console.log('[Workspace] Summary deleted:', id);
    return c.json({ success: true });
  } catch (error) {
    console.error('[Workspace] Delete summary error:', error);
    return c.json({ error: '鍒犻櫎澶辫触' }, 500);
  }
});

// ============================================
// 蹇嵎鎸囦护鎺ュ彛
// ============================================

// 鑾峰彇鎵€鏈夊揩鎹锋寚浠?
workspaceRoutes.get('/shortcuts', async (c) => {
  try {
    const userId = getUserId(c);
    console.log('[Workspace] GET /shortcuts - userId:', userId || 'undefined');

    if (useSupabase) {
      // 瀹夊叏鎬э細鍙繑鍥炲凡鐧诲綍鐢ㄦ埛鐨勬暟鎹紝鏈櫥褰曠敤鎴疯繑鍥炵┖鏁扮粍
      if (!userId) {
        console.log(
          '[Workspace] Get shortcuts: no userId, returning empty array'
        );
        return c.json({ shortcuts: [] });
      }
      const shortcuts = await db.getAllShortcuts(userId);
      console.log(
        '[Workspace] Get shortcuts: returned',
        shortcuts.length,
        'items for user:',
        userId
      );
      // 棰濆楠岃瘉锛氱‘淇濊繑鍥炵殑鏁版嵁纭疄灞炰簬褰撳墠鐢ㄦ埛
      const filteredShortcuts = shortcuts.filter((s) => s.user_id === userId);
      if (filteredShortcuts.length !== shortcuts.length) {
        console.error(
          '[Workspace] WARNING: Some shortcuts have wrong user_id! Expected:',
          userId,
          'Got:',
          shortcuts.map((s) => s.user_id)
        );
      }
      const formatted = filteredShortcuts.map((s) => ({
        id: s.id,
        name: s.name,
        prompt: s.prompt,
        referenceIds: s.reference_ids,
        order: s.sort_order,
        createdAt: new Date(s.created_at).getTime()
      }));
      return c.json({ shortcuts: formatted });
    }

    const list = Array.from(memoryShortcuts.values()).sort(
      (a, b) => a.order - b.order
    );
    return c.json({ shortcuts: list });
  } catch (error) {
    console.error('[Workspace] Get shortcuts error:', error);
    return c.json({ error: '鑾峰彇蹇嵎鎸囦护澶辫触' }, 500);
  }
});

// 鑾峰彇鍗曚釜蹇嵎鎸囦护
workspaceRoutes.get('/shortcuts/:id', async (c) => {
  const id = c.req.param('id');
  const userId = getUserId(c);

  try {
    if (useSupabase) {
      const shortcut = await db.getShortcutById(id, userId);
      if (!shortcut) {
        return c.json({ error: 'Shortcut not found' }, 404);
      }
      return c.json({
        shortcut: {
          id: shortcut.id,
          name: shortcut.name,
          prompt: shortcut.prompt,
          referenceIds: shortcut.reference_ids,
          order: shortcut.sort_order,
          createdAt: new Date(shortcut.created_at).getTime()
        }
      });
    }

    const shortcut = memoryShortcuts.get(id);
    if (!shortcut) {
      return c.json({ error: 'Shortcut not found' }, 404);
    }
    return c.json({ shortcut });
  } catch (error) {
    console.error('[Workspace] Get shortcut error:', error);
    return c.json({ error: '鑾峰彇蹇嵎鎸囦护澶辫触' }, 500);
  }
});

// 鍒涘缓蹇嵎鎸囦护
workspaceRoutes.post('/shortcuts', async (c) => {
  const body = await c.req.json();
  const { name, prompt, referenceIds } = body;
  const userId = getUserId(c);

  if (!name || !prompt) {
    return c.json({ error: '鍚嶇О鍜屾彁绀鸿瘝涓嶈兘涓虹┖' }, 400);
  }

  // 馃敀 瀹夊叏妫€鏌ワ細蹇呴』鐧诲綍鎵嶈兘鍒涘缓蹇嵎鎸囦护
  if (!userId) {
    console.warn('[Workspace] POST /shortcuts - REJECTED: no userId');
    return c.json({ error: '璇峰厛鐧诲綍鍚庡啀鍒涘缓蹇嵎鎸囦护' }, 401);
  }

  try {
    if (useSupabase) {
      const result = await db.createShortcut({
        name,
        prompt,
        reference_ids: referenceIds || [],
        user_id: userId
      });
      console.log('[Workspace] Shortcut created:', result.id, 'user:', userId);
      return c.json({ id: result.id, success: true });
    }

    const id = `shortcut_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const order = memoryShortcuts.size;
    const shortcut: MemoryShortcut = {
      id,
      name,
      prompt,
      referenceIds: referenceIds || [],
      order,
      createdAt: Date.now()
    };
    memoryShortcuts.set(id, shortcut);
    console.log('[Workspace] Shortcut created:', id);
    return c.json({ id, success: true });
  } catch (error) {
    console.error('[Workspace] Create shortcut error:', error);
    return c.json({ error: '鍒涘缓澶辫触' }, 500);
  }
});

// 鏇存柊蹇嵎鎸囦护
workspaceRoutes.patch('/shortcuts/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { name, prompt, referenceIds, order } = body;
  const userId = getUserId(c);

  try {
    if (useSupabase) {
      if (!userId) {
        console.warn('[Workspace] PATCH /shortcuts/:id - REJECTED: no userId');
        return c.json({ error: '璇峰厛鐧诲綍鍚庡啀鏇存柊蹇嵎鎸囦护' }, 401);
      }

      await db.updateShortcut(
        id,
        {
          name,
          prompt,
          reference_ids: referenceIds,
          sort_order: order
        },
        userId
      );
      console.log('[Workspace] Shortcut updated:', id);
      return c.json({ success: true });
    }

    const shortcut = memoryShortcuts.get(id);
    if (!shortcut) {
      return c.json({ error: 'Shortcut not found' }, 404);
    }

    if (name !== undefined) shortcut.name = name;
    if (prompt !== undefined) shortcut.prompt = prompt;
    if (referenceIds !== undefined) shortcut.referenceIds = referenceIds;
    if (order !== undefined) shortcut.order = order;
    shortcut.updatedAt = Date.now();
    memoryShortcuts.set(id, shortcut);
    console.log('[Workspace] Shortcut updated:', id);
    return c.json({ success: true });
  } catch (error) {
    console.error('[Workspace] Update shortcut error:', error);
    return c.json({ error: '鏇存柊澶辫触' }, 500);
  }
});

// 鍒犻櫎蹇嵎鎸囦护
workspaceRoutes.delete('/shortcuts/:id', async (c) => {
  const id = c.req.param('id');
  const userId = getUserId(c);

  try {
    if (useSupabase) {
      if (!userId) {
        console.warn('[Workspace] DELETE /shortcuts/:id - REJECTED: no userId');
        return c.json({ error: '璇峰厛鐧诲綍鍚庡啀鍒犻櫎蹇嵎鎸囦护' }, 401);
      }

      await db.deleteShortcut(id, userId);
      console.log('[Workspace] Shortcut deleted:', id);
      return c.json({ success: true });
    }

    if (!memoryShortcuts.has(id)) {
      return c.json({ error: 'Shortcut not found' }, 404);
    }
    memoryShortcuts.delete(id);
    console.log('[Workspace] Shortcut deleted:', id);
    return c.json({ success: true });
  } catch (error) {
    console.error('[Workspace] Delete shortcut error:', error);
    return c.json({ error: '鍒犻櫎澶辫触' }, 500);
  }
});

workspaceRoutes.get('/skills', async (c) => {
  const builtInSkills = [
    {
      id: 'rewrite',
      name: 'rewrite',
      displayName: '改写润色',
      description: '基于已选来源直接改写正文',
      icon: '🪄',
      category: 'preset',
      source: 'system',
      originType: 'system',
      runtimeCategory: 'preset',
      triggers: [],
      priority: 100,
      isActive: true,
      isInstalled: true
    }
  ];
  const customSkills = Array.from(memoryCustomSkills.values());
  return c.json({ skills: [...builtInSkills, ...customSkills] });
});

workspaceRoutes.post('/skills', async (c) => {
  const body = await c.req.json();
  const id = crypto.randomUUID();
  const now = Date.now();
  const skill = {
    id,
    name: body.name,
    displayName: body.displayName || body.name,
    description: body.description || null,
    icon: body.icon || '✨',
    triggers: body.triggers || [],
    coreInstructions: body.coreInstructions || '',
    outputType: body.outputType || null,
    associatedTools: body.associatedTools || [],
    defaultOptions: body.defaultOptions || {},
    category: body.category || 'custom',
    priority: body.priority || 0,
    sortOrder: 0,
    isActive: true,
    useCount: 0,
    source: body.metadata?.originType === 'market-installed' ? 'market' : 'user',
    originType: body.metadata?.originType || 'user',
    metadata: body.metadata || {},
    createdAt: now,
    updatedAt: now
  };
  memoryCustomSkills.set(id, skill);
  return c.json({ id });
});

workspaceRoutes.patch('/skills/:id', async (c) => {
  const id = c.req.param('id');
  const existing = memoryCustomSkills.get(id);
  if (!existing) return c.json({ error: 'Not found' }, 404);
  const body = await c.req.json();
  const updated = { ...existing, ...body, updatedAt: Date.now() };
  memoryCustomSkills.set(id, updated);
  return c.json({ success: true });
});

workspaceRoutes.delete('/skills/:id', async (c) => {
  const id = c.req.param('id');
  memoryCustomSkills.delete(id);
  return c.json({ success: true });
});

workspaceRoutes.get('/conversations', async (c) => {
  const projectId = c.req.query('project_id');
  const conversations = Array.from(memoryConversations.values())
    .filter((item) => (projectId ? item.projectId === projectId : true))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return c.json({
    conversations: conversations.map((item) => ({
      id: item.id,
      project_id: item.projectId,
      projectId: item.projectId,
      title: item.title,
      messages: item.messages,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }))
  });
});

workspaceRoutes.get('/conversations/:id', async (c) => {
  const id = c.req.param('id');
  const conversation = memoryConversations.get(id);
  if (!conversation) {
    // Return empty conversation for dev mode
    const now = Date.now();
    return c.json({
      id,
      project_id: null,
      projectId: null,
      title: '新对话',
      messages: [],
      createdAt: now,
      updatedAt: now
    });
  }

  return c.json({
    id: conversation.id,
    project_id: conversation.projectId,
    projectId: conversation.projectId,
    title: conversation.title,
    messages: conversation.messages,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt
  });
});

workspaceRoutes.post('/conversations', async (c) => {
  const body = await c.req.json<{
    title?: string;
    project_id?: string;
    projectId?: string;
    messages?: Array<{
      id?: string;
      role?: string;
      content?: string;
      createdAt?: number;
    }>;
  }>();

  const now = Date.now();
  const id = `conv-${now}`;
  const projectId = body.projectId || body.project_id || 'proj-1';
  const conversation: MemoryConversation = {
    id,
    projectId,
    title: body.title?.trim() || '新对话',
    messages: (body.messages || []).map((message, index) => ({
      id: message.id || `msg-${now}-${index}`,
      role: message.role || 'user',
      content: message.content || '',
      createdAt: message.createdAt || now
    })),
    createdAt: now,
    updatedAt: now
  };

  memoryConversations.set(id, conversation);
  return c.json({ id });
});

workspaceRoutes.patch('/conversations/:id', async (c) => {
  const id = c.req.param('id');
  let conversation = memoryConversations.get(id);
  if (!conversation) {
    // Auto-create conversation on first PATCH (dev mode)
    conversation = {
      id,
      projectId: '',
      title: '新对话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    memoryConversations.set(id, conversation);
  }

  const body = await c.req.json<{
    title?: string;
    messages?: Array<{
      id?: string;
      role?: string;
      content?: string;
      createdAt?: number;
    }>;
  }>();

  const now = Date.now();
  const updated: MemoryConversation = {
    ...conversation,
    title: body.title ?? conversation.title,
    messages: body.messages
      ? body.messages.map((message, index) => ({
          id: message.id || `msg-${now}-${index}`,
          role: message.role || 'user',
          content: message.content || '',
          createdAt: message.createdAt || now
        }))
      : conversation.messages,
    updatedAt: now
  };

  memoryConversations.set(id, updated);
  return c.json({ success: true });
});

workspaceRoutes.delete('/conversations/:id', async (c) => {
  const id = c.req.param('id');
  if (!memoryConversations.has(id)) {
    return c.json({ error: 'not found' }, 404);
  }

  memoryConversations.delete(id);
  return c.json({ success: true });
});

workspaceRoutes.get('/studio-documents', async (c) => {
  const projectId = c.req.query('project_id');
  const documents = Array.from(memoryStudioDocuments.values())
    .filter((item) => (projectId ? item.projectId === projectId : true))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return c.json({
    documents: documents.map((item) => ({
      id: item.id,
      project_id: item.projectId,
      projectId: item.projectId,
      title: item.title,
      status: item.status,
      content: item.content,
      content_type: item.contentType,
      created_at: new Date(item.createdAt).toISOString(),
      updated_at: new Date(item.updatedAt).toISOString()
    })),
    hasMore: false
  });
});

workspaceRoutes.get('/studio-documents/:id', async (c) => {
  const document = memoryStudioDocuments.get(c.req.param('id'));
  if (!document) {
    return c.json({ error: 'not found' }, 404);
  }

  return c.json({
    document: {
      id: document.id,
      project_id: document.projectId,
      projectId: document.projectId,
      title: document.title,
      status: document.status,
      content: document.content,
      content_type: document.contentType,
      created_at: new Date(document.createdAt).toISOString(),
      updated_at: new Date(document.updatedAt).toISOString()
    }
  });
});

workspaceRoutes.post('/studio-documents', async (c) => {
  const body = await c.req.json<{
    projectId?: string;
    project_id?: string;
    title?: string;
    status?: 'draft' | 'published';
    content?: Record<string, unknown>;
    content_type?: string;
  }>();
  const now = Date.now();
  const projectId = body.projectId || body.project_id || 'proj-1';
  const document: MemoryStudioDocument = {
    id: `doc-${now}`,
    projectId,
    title: body.title || '未命名文稿',
    status: body.status || 'draft',
    content: body.content || { type: 'doc', content: [{ type: 'paragraph' }] },
    contentType: body.content_type || 'text',
    createdAt: now,
    updatedAt: now
  };
  memoryStudioDocuments.set(document.id, document);

  return c.json({
    document: {
      id: document.id,
      project_id: document.projectId,
      projectId: document.projectId,
      title: document.title,
      status: document.status,
      content: document.content,
      content_type: document.contentType,
      created_at: new Date(document.createdAt).toISOString(),
      updated_at: new Date(document.updatedAt).toISOString()
    }
  });
});

workspaceRoutes.patch('/studio-documents/:id', async (c) => {
  const document = memoryStudioDocuments.get(c.req.param('id'));
  if (!document) {
    return c.json({ error: 'not found' }, 404);
  }

  const body = await c.req.json<{
    title?: string;
    status?: 'draft' | 'published';
    content?: Record<string, unknown>;
    content_type?: string;
  }>();

  const updated: MemoryStudioDocument = {
    ...document,
    title: body.title ?? document.title,
    status: body.status ?? document.status,
    content: body.content ?? document.content,
    contentType: body.content_type ?? document.contentType,
    updatedAt: Date.now()
  };
  memoryStudioDocuments.set(updated.id, updated);

  return c.json({
    document: {
      id: updated.id,
      project_id: updated.projectId,
      projectId: updated.projectId,
      title: updated.title,
      status: updated.status,
      content: updated.content,
      content_type: updated.contentType,
      created_at: new Date(updated.createdAt).toISOString(),
      updated_at: new Date(updated.updatedAt).toISOString()
    }
  });
});

workspaceRoutes.delete('/studio-documents/:id', async (c) => {
  const id = c.req.param('id');
  if (!memoryStudioDocuments.has(id)) {
    return c.json({ error: 'not found' }, 404);
  }

  memoryStudioDocuments.delete(id);
  return c.json({ success: true });
});

// ============================================
// Workspace Task 接口（最小骨架）
// ============================================

workspaceRoutes.post('/tasks', async (c) => {
  const userId = resolveWorkspaceUserId(c);
  if (!userId) {
    return c.json({ error: '请先登录' }, 401);
  }

  try {
    const body = await c.req.json<WorkspaceTaskRequest>();
    if (!body?.type || !body?.params || !body?.context) {
      return c.json({ error: '无效的任务请求' }, 400);
    }

    const { taskRecord } = await executeWorkspaceTask({
      userId,
      task: body
    });

    memoryTasks.set(taskRecord.id, taskRecord);
    memoryTaskOwners.set(taskRecord.id, userId);
    return c.json({ task: taskRecord }, 201);
  } catch (error) {
    console.error('[Workspace] Create task error:', error);
    return c.json({ error: error instanceof Error ? error.message : '创建任务失败' }, 500);
  }
});

workspaceRoutes.get('/tasks/:id', async (c) => {
  const userId = resolveWorkspaceUserId(c);
  if (!userId) {
    return c.json({ error: '请先登录' }, 401);
  }

  const task = getTaskById(c.req.param('id'), userId);
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  return c.json({ task });
});

workspaceRoutes.get('/tasks/:id/result', async (c) => {
  const userId = resolveWorkspaceUserId(c);
  if (!userId) {
    return c.json({ error: '请先登录' }, 401);
  }

  const task = getTaskById(c.req.param('id'), userId);
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  return c.json({ result: task.result ?? null });
});

workspaceRoutes.post('/tasks/:id/cancel', async (c) => {
  const userId = resolveWorkspaceUserId(c);
  if (!userId) {
    return c.json({ error: '请先登录' }, 401);
  }

  const task = getTaskById(c.req.param('id'), userId);
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  if (task.status === 'succeeded' || task.status === 'failed') {
    return c.json({ task });
  }

  const cancelledTask: WorkspaceTaskRecord = {
    ...task,
    status: 'cancelled',
    updatedAt: Date.now(),
    endedAt: Date.now()
  };

  memoryTasks.set(cancelledTask.id, cancelledTask);
  memoryTaskOwners.set(cancelledTask.id, userId);
  return c.json({ task: cancelledTask });
});
workspaceRoutes.post('/summaries/confirm', requireAuth, async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json<{
    action: 'create' | 'update' | 'delete';
    projectId: string;
    data: Record<string, unknown>;
  }>();

  const { action, projectId, data } = body;

  if (!userId) {
    return c.json({ error: '璇峰厛鐧诲綍' }, 401);
  }

  if (!projectId) {
    return c.json({ error: '缂哄皯椤圭洰 ID' }, 400);
  }

  if (!action || !['create', 'update', 'delete'].includes(action)) {
    return c.json({ error: 'Invalid action type' }, 400);
  }

  const context = { userId, projectId };

  try {
    let result;

    switch (action) {
      case 'create': {
        const createParams: SummaryCreateParams = {
          title: data.title as string,
          content: data.content as string,
          url: data.url as string | undefined,
          tags: data.tags as string[] | undefined
        };

        if (!createParams.title || !createParams.content) {
          return c.json({ error: 'Title and content are required' }, 400);
        }

        result = await confirmSummaryCreate(createParams, context);
        break;
      }

      case 'update': {
        const id = data.id as string;
        if (!id) {
          return c.json({ error: '缂哄皯鍗＄墖 ID' }, 400);
        }

        const updates = {
          title: data.title as string | undefined,
          content: data.content as string | undefined,
          tags: data.tags as string[] | undefined
        };

        result = await confirmSummaryUpdate(id, updates, context);
        break;
      }

      case 'delete': {
        const id = data.id as string;
        if (!id) {
          return c.json({ error: '缂哄皯鍗＄墖 ID' }, 400);
        }

        result = await confirmSummaryDelete(id, context);
        break;
      }
    }

    if (!result.success) {
      return c.json({ error: result.error || '鎿嶄綔澶辫触' }, 400);
    }

    console.log(`[Workspace] Summary ${action} confirmed:`, result.data);
    return c.json({ success: true, data: result.data });
  } catch (error) {
    console.error(`[Workspace] Summary ${action} confirm error:`, error);
    return c.json(
      { error: error instanceof Error ? error.message : '鎿嶄綔澶辫触' },
      500
    );
  }
});

// ============================================
// 来源搜索 & 导入
// ============================================

/**
 * 全网搜索新来源（Jina Search API，免费无需 Key）
 */
workspaceRoutes.post('/source-search', async (c) => {
  try {
    const body = await c.req.json<{ query?: string; maxResults?: number }>();
    const query = body.query?.trim();
    if (!query) {
      return c.json({ error: '请输入搜索关键词' }, 400);
    }

    const maxResults = body.maxResults || 10;
    console.log(`[SourceSearch] Searching: "${query}"`);

    // 使用 Gemini + Google Search grounding
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return c.json({ error: 'Google API 未配置' }, 500);
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `搜索：${query}。列出最相关的网页结果。` }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: { maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } }
      }),
      signal: AbortSignal.timeout(20000)
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => '');
      console.error('[SourceSearch] Gemini error:', geminiRes.status, errText);
      return c.json({ error: '搜索失败' }, 500);
    }

    const geminiData = await geminiRes.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        groundingMetadata?: {
          groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>;
        };
      }>;
    };

    const chunks = geminiData.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const summaryText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const results = chunks.slice(0, maxResults).map((chunk: { web?: { title?: string; uri?: string } }) => {
      const url = chunk.web?.uri || '';
      let domain = url;
      try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { /* */ }
      return {
        title: chunk.web?.title || '',
        snippet: '',
        url,
        source: domain,
        favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
      };
    });

    // 如果 grounding 没有返回结构化结果，用 AI 摘要作为兜底
    if (results.length === 0 && summaryText) {
      results.push({
        title: query,
        snippet: summaryText.substring(0, 300),
        url: '',
        source: 'AI Summary',
        favicon: ''
      });
    }

    console.log(`[SourceSearch] Found ${results.length} results`);
    return c.json({ results, query });
  } catch (error) {
    console.error('[SourceSearch] Error:', error);
    return c.json({ error: '搜索失败，请稍后重试' }, 500);
  }
});

/**
 * 批量提取 URL 内容并导入为素材
 */
workspaceRoutes.post('/source-extract', async (c) => {
  try {
    const body = await c.req.json<{ urls?: string[] }>();
    const { urls } = body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return c.json({ error: '请选择要导入的来源' }, 400);
    }
    if (urls.length > 20) {
      return c.json({ error: '一次最多导入 20 个来源' }, 400);
    }

    console.log(`[SourceExtract] Extracting ${urls.length} URLs`);

    const results = await Promise.all(
      urls.map(async (url: string) => {
        try {
          const readerUrl = `https://r.jina.ai/${url}`;
          const res = await fetch(readerUrl, {
            headers: { 'Accept': 'text/markdown', 'X-Return-Format': 'markdown' },
            signal: AbortSignal.timeout(15000)
          });

          if (!res.ok) {
            return { url, title: '', markdown: '', success: false, error: `HTTP ${res.status}` };
          }

          const content = await res.text();
          const titleMatch = content.match(/^#\s+(.+)$/m);
          const title = titleMatch?.[1] || new URL(url).hostname;

          return { url, title, markdown: content, success: true };
        } catch (err) {
          return { url, title: '', markdown: '', success: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
      })
    );

    // 在内存存储模式下，将提取成功的内容保存为 summary
    if (!useSupabase) {
      for (const result of results) {
        if (result.success) {
          const id = `src-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
          memorySummaries.set(id, {
            id,
            title: result.title,
            url: result.url,
            markdown: result.markdown,
            tags: ['web-search'],
            createdAt: Date.now()
          });
        }
      }
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(`[SourceExtract] Extracted ${successCount}/${urls.length} successfully`);

    return c.json({ results, imported: successCount, total: urls.length });
  } catch (error) {
    console.error('[SourceExtract] Error:', error);
    return c.json({ error: '导入失败' }, 500);
  }
});
