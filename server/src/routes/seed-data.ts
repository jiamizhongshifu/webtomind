/**
 * Seed Data — 本地开发模拟数据
 * 仅在 SEED_MOCK_DATA=1 时激活，生产环境不加载。
 * 挂载在 workspace 路由之前，对 /api/workspace/* 的请求优先返回模拟数据。
 */

import { Hono } from 'hono';

export const seedDataRoutes = new Hono();

const now = () => new Date().toISOString();
const ts = () => Date.now();

// ─── Seed 数据 ──────────────────────────────────────────

const seedProjects = [
  {
    id: 'proj-1',
    name: '内容创作',
    description: '日常内容创作项目',
    icon: '✍️',
    color: '#3b82f6',
    isDefault: false,
    sortOrder: 0,
    summaryCount: 3,
    conversationCount: 2,
    createdAt: ts() - 86400000 * 3,
    updatedAt: ts() - 3600000,
    archivedAt: null,
    favoritedAt: ts() - 86400000,
  },
  {
    id: 'proj-2',
    name: '行业研究',
    description: '行业动态与竞品分析',
    icon: '📊',
    color: '#8b5cf6',
    isDefault: false,
    sortOrder: 1,
    summaryCount: 2,
    conversationCount: 1,
    createdAt: ts() - 86400000 * 7,
    updatedAt: ts() - 86400000,
    archivedAt: null,
    favoritedAt: null,
  },
  {
    id: 'proj-3',
    name: '个人笔记',
    description: '读书笔记与灵感记录',
    icon: '📖',
    color: '#10b981',
    isDefault: true,
    sortOrder: 2,
    summaryCount: 1,
    conversationCount: 0,
    createdAt: ts() - 86400000 * 14,
    updatedAt: ts() - 86400000 * 2,
    archivedAt: null,
    favoritedAt: null,
  },
];

const seedSummaries = [
  {
    id: 'sum-1',
    project_id: 'proj-1',
    title: 'AI 驱动内容创作的未来趋势',
    url: 'https://example.com/ai-content-trends',
    markdown:
      '# AI 驱动内容创作的未来趋势\n\n## 核心观点\n\n1. **多模态生成**：AI 从纯文本扩展到图文视频一体化生成\n2. **工作流自动化**：从素材采集到发布全程 AI 辅助\n3. **个性化输出**：根据创作者风格自适应调整\n\n## 关键数据\n\n- 2025 年 AI 内容工具市场增长 47%\n- 超过 60% 的自媒体创作者使用 AI 辅助工具\n- 平均效率提升 3-5 倍\n\n## 行动建议\n\n- 尽早建立 AI 辅助工作流\n- 保留人审环节确保质量\n- 关注多模态能力发展',
    tags: ['AI', '内容创作', '趋势'],
    contentType: 'article',
    createdAt: ts() - 86400000,
  },
  {
    id: 'sum-2',
    project_id: 'proj-1',
    title: '如何用思维导图整理复杂信息',
    url: 'https://example.com/mindmap-guide',
    markdown:
      '# 如何用思维导图整理复杂信息\n\n## 为什么用思维导图\n\n- 视觉化信息结构\n- 快速发现关联\n- 便于回顾和扩展\n\n## 实践技巧\n\n1. 从核心主题出发\n2. 用关键词而非长句\n3. 分层展开，不超过 3 层\n4. 用颜色区分不同分支',
    tags: ['方法论', '思维导图', '效率'],
    contentType: 'article',
    createdAt: ts() - 86400000 * 2,
  },
  {
    id: 'sum-3',
    project_id: 'proj-1',
    title: 'Supabase Realtime 订阅最佳实践',
    url: 'https://example.com/supabase-realtime',
    markdown:
      '# Supabase Realtime 订阅最佳实践\n\n## 核心 API\n\n```typescript\nconst channel = supabase\n  .channel(\'custom-all-channel\')\n  .on(\'postgres_changes\', {\n    event: \'*\',\n    schema: \'public\',\n    table: \'messages\'\n  }, (payload) => {\n    console.log(payload)\n  })\n  .subscribe()\n```\n\n## 注意事项\n\n- 需要在数据库启用 RLS\n- 订阅时注意去重\n- 断开时务必 unsubscribe',
    tags: ['技术', 'Supabase', '实时'],
    contentType: 'article',
    createdAt: ts() - 86400000 * 3,
  },
  {
    id: 'sum-4',
    project_id: 'proj-2',
    title: '竞品功能对比：AI 内容工具评测',
    url: 'https://example.com/competitor-review',
    markdown:
      '# 竞品功能对比：AI 内容工具评测\n\n## 评测对象\n\n- 工具 A：擅长长文生成\n- 工具 B：专注短视频脚本\n- 工具 C：全流程覆盖\n\n## 评测维度\n\n| 维度 | 工具 A | 工具 B | 工具 C |\n|------|--------|--------|--------|\n| 内容质量 | ★★★★ | ★★★ | ★★★★ |\n| 工作流 | ★★ | ★★★ | ★★★★★ |',
    tags: ['竞品分析', 'AI工具', '评测'],
    contentType: 'article',
    createdAt: ts() - 86400000 * 4,
  },
  {
    id: 'sum-5',
    project_id: 'proj-2',
    title: '2026 内容创作行业报告摘要',
    url: 'https://example.com/industry-report',
    markdown:
      '# 2026 内容创作行业报告摘要\n\n## 市场规模\n\n- 全球市场达 120 亿美元\n- 中国市场占比 23%\n- YoY 增长 31%\n\n## 关键趋势\n\n1. AI 原生创作工具崛起\n2. 短视频仍是主战场\n3. 付费内容质量门槛持续提高',
    tags: ['行业报告', '趋势', '2026'],
    contentType: 'article',
    createdAt: ts() - 86400000 * 5,
  },
  {
    id: 'sum-6',
    project_id: 'proj-3',
    title: '《卡片笔记写作法》读书笔记',
    url: 'https://example.com/card-notes',
    markdown:
      '# 《卡片笔记写作法》读书笔记\n\n## 核心方法\n\n- 闪念笔记 → 永久笔记 → 项目笔记\n- 每条笔记只记一个想法\n- 用自己的话重述\n\n## 实践心得\n\n- 工具不重要，流程才重要\n- 定期回顾和链接笔记\n- 写作不是从零开始',
    tags: ['读书笔记', '写作方法', '知识管理'],
    contentType: 'article',
    createdAt: ts() - 86400000 * 6,
  },
];

const seedStudioDocuments = [
  {
    id: 'doc-pub-1',
    project_id: 'proj-1',
    title: 'AI 内容创作 2025 年度报告',
    status: 'published',
    created_at: now(),
    updated_at: now(),
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'AI 内容创作 2025 年度报告' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '本报告汇总了 2025 年 AI 内容创作领域的关键趋势、技术突破和市场变化。',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: '一、市场概况' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '2025 年 AI 内容工具市场继续保持高速增长，全球市场规模已突破 50 亿美元，同比增长 47%。超过 60% 的自媒体创作者在日常工作中使用 AI 辅助工具。',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: '二、技术突破' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '多模态生成能力显著提升，工作流自动化从简单的单步辅助，发展到端到端的"采集-整理-创作-发布"全链路覆盖。',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'doc-draft-1',
    project_id: 'proj-1',
    title: '行业研究报告草稿',
    status: 'draft',
    created_at: now(),
    updated_at: now(),
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: '行业研究报告草稿' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '这是一份待发布的行业研究报告草稿。基于近期的行业动态和竞品分析，整理了关键发现和趋势预判。',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'doc-draft-2',
    project_id: 'proj-2',
    title: '竞品分析笔记',
    status: 'draft',
    created_at: now(),
    updated_at: now(),
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: '竞品分析笔记' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '对比了市场上 5 款主流 AI 内容创作工具的功能和定位差异。',
            },
          ],
        },
      ],
    },
  },
];

const seedConversations = [
  {
    id: 'conv-1',
    project_id: 'proj-1',
    title: 'AI 内容创作趋势讨论',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: '帮我分析一下 AI 内容创作的最新趋势',
        createdAt: ts() - 7200000,
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content:
          '根据最近的行业数据，AI 内容创作有以下几个关键趋势：\n\n1. **多模态融合**：从纯文本到图文视频一体化\n2. **工作流自动化**：端到端的创作流程\n3. **个性化输出**：根据创作者风格自适应',
        createdAt: ts() - 7180000,
      },
    ],
    createdAt: ts() - 7200000,
    updatedAt: ts() - 7180000,
  },
  {
    id: 'conv-2',
    project_id: 'proj-1',
    title: '文章结构优化',
    messages: [
      {
        id: 'msg-3',
        role: 'user',
        content: '帮我把最近的素材整理成一篇文章大纲',
        createdAt: ts() - 3600000,
      },
      {
        id: 'msg-4',
        role: 'assistant',
        content:
          '基于你最近的 3 条素材，我建议以下文章结构：\n\n## 一、开篇引言\n- 引用市场增长数据\n\n## 二、核心技术趋势\n- 多模态生成\n- 工作流自动化\n\n## 三、实践建议\n- 工具选择\n- 人机协作模式',
        createdAt: ts() - 3580000,
      },
    ],
    createdAt: ts() - 3600000,
    updatedAt: ts() - 3580000,
  },
];

// ─── 路由 ────────────────────────────────────────────────

// Projects
seedDataRoutes.get('/projects', (c) => c.json({ projects: seedProjects }));
seedDataRoutes.get('/projects/:id', (c) => {
  const p = seedProjects.find((p) => p.id === c.req.param('id'));
  return p ? c.json({ project: p }) : c.json({ error: 'not found' }, 404);
});
seedDataRoutes.post('/projects', async (c) => {
  const body = await c.req.json();
  const p = {
    id: `proj-${Date.now()}`,
    name: body.name || '新项目',
    description: body.description || null,
    icon: body.icon || '📁',
    color: body.color || '#6b7280',
    isDefault: false,
    sortOrder: seedProjects.length,
    summaryCount: 0,
    conversationCount: 0,
    createdAt: ts(),
    updatedAt: ts(),
    archivedAt: null,
    favoritedAt: null,
  };
  seedProjects.push(p);
  return c.json({ project: p });
});
seedDataRoutes.patch('/projects/:id', async (c) => {
  const p = seedProjects.find((p) => p.id === c.req.param('id'));
  if (!p) return c.json({ error: 'not found' }, 404);
  Object.assign(p, await c.req.json(), { updatedAt: ts() });
  return c.json({ project: p });
});
seedDataRoutes.delete('/projects/:id', (c) => {
  const i = seedProjects.findIndex((p) => p.id === c.req.param('id'));
  if (i === -1) return c.json({ error: 'not found' }, 404);
  seedProjects.splice(i, 1);
  return c.json({ success: true });
});

// Summaries
seedDataRoutes.get('/summaries', (c) => {
  const projectId = c.req.query('project_id');
  const list = projectId
    ? seedSummaries.filter((s) => s.project_id === projectId)
    : seedSummaries;
  // Add projectId (camelCase) for frontend compatibility
  const formatted = list.map(({ project_id, ...rest }) => ({
    ...rest,
    project_id,
    projectId: project_id,
  }));
  return c.json({ summaries: formatted, hasMore: false });
});
seedDataRoutes.get('/summaries/:id', (c) => {
  const s = seedSummaries.find((s) => s.id === c.req.param('id'));
  if (!s) return c.json({ error: 'not found' }, 404);
  const { project_id, ...rest } = s;
  return c.json({ summary: { ...rest, project_id, projectId: project_id } });
});
seedDataRoutes.post('/summaries', async (c) => {
  const body = await c.req.json();
  const s = {
    id: `sum-${Date.now()}`,
    project_id: body.project_id || 'proj-1',
    title: body.title,
    url: body.url || 'note://local',
    markdown: body.markdown || '',
    tags: body.tags || [],
    contentType: body.content_type || 'article',
    createdAt: ts(),
  };
  seedSummaries.push(s);
  return c.json({ id: s.id, success: true });
});
seedDataRoutes.patch('/summaries/:id', async (c) => {
  const s = seedSummaries.find((s) => s.id === c.req.param('id'));
  if (!s) return c.json({ error: 'not found' }, 404);
  Object.assign(s, await c.req.json());
  return c.json({ success: true });
});
seedDataRoutes.delete('/summaries/:id', (c) => {
  const i = seedSummaries.findIndex((s) => s.id === c.req.param('id'));
  if (i === -1) return c.json({ error: 'not found' }, 404);
  seedSummaries.splice(i, 1);
  return c.json({ success: true });
});

// Shortcuts
seedDataRoutes.get('/shortcuts', (c) => c.json({ shortcuts: [] }));

// Conversations
seedDataRoutes.get('/conversations', (c) => {
  const projectId = c.req.query('project_id');
  const list = projectId
    ? seedConversations.filter((c) => c.project_id === projectId)
    : seedConversations;
  return c.json({ conversations: list });
});
seedDataRoutes.get('/conversations/:id', (c) => {
  const cv = seedConversations.find((cv) => cv.id === c.req.param('id'));
  return cv ? c.json(cv) : c.json({ error: 'not found' }, 404);
});
seedDataRoutes.post('/conversations', async (c) => {
  const body = await c.req.json();
  const cv = {
    id: `conv-${Date.now()}`,
    project_id: body.project_id || 'proj-1',
    title: body.title || '新对话',
    messages: [],
    createdAt: ts(),
    updatedAt: ts(),
  };
  seedConversations.push(cv);
  return c.json({ id: cv.id });
});
seedDataRoutes.patch('/conversations/:id', async (c) => {
  const cv = seedConversations.find((cv) => cv.id === c.req.param('id'));
  if (!cv) return c.json({ error: 'not found' }, 404);
  Object.assign(cv, await c.req.json(), { updatedAt: ts() });
  return c.json({ success: true });
});
seedDataRoutes.delete('/conversations/:id', (c) => {
  const i = seedConversations.findIndex((cv) => cv.id === c.req.param('id'));
  if (i === -1) return c.json({ error: 'not found' }, 404);
  seedConversations.splice(i, 1);
  return c.json({ success: true });
});

// Studio Documents
seedDataRoutes.get('/studio-documents', (c) => {
  const projectId = c.req.query('project_id');
  const list = projectId
    ? seedStudioDocuments.filter((d) => d.project_id === projectId)
    : seedStudioDocuments;
  return c.json({ documents: list, hasMore: false });
});
seedDataRoutes.get('/studio-documents/:id', (c) => {
  const d = seedStudioDocuments.find((d) => d.id === c.req.param('id'));
  return d ? c.json({ document: d }) : c.json({ error: 'not found' }, 404);
});
seedDataRoutes.post('/studio-documents', async (c) => {
  const body = await c.req.json();
  const d = {
    id: `doc-${Date.now()}`,
    project_id: body.project_id || 'proj-1',
    title: body.title || '未命名文稿',
    status: body.status || 'draft',
    content: body.content || { type: 'doc', content: [{ type: 'paragraph' }] },
    created_at: now(),
    updated_at: now(),
  };
  seedStudioDocuments.unshift(d);
  return c.json({ document: d });
});
seedDataRoutes.patch('/studio-documents/:id', async (c) => {
  const d = seedStudioDocuments.find((d) => d.id === c.req.param('id'));
  if (!d) return c.json({ error: 'not found' }, 404);
  Object.assign(d, await c.req.json(), { updated_at: now() });
  return c.json({ document: d });
});
seedDataRoutes.delete('/studio-documents/:id', (c) => {
  const i = seedStudioDocuments.findIndex((d) => d.id === c.req.param('id'));
  if (i === -1) return c.json({ error: 'not found' }, 404);
  seedStudioDocuments.splice(i, 1);
  return c.json({ success: true });
});

// Studio Readiness
seedDataRoutes.post('/studio-readiness', (c) =>
  c.json({
    score: 85,
    level: 'mostly_ready',
    summary: '文稿结构完整，内容充实。建议补充结尾行动号召后即可发布。',
    checks: [
      { key: 'structure', label: '结构完整度', score: 28, maxScore: 30, passed: true, detail: '段落结构清晰' },
      { key: 'content', label: '内容充实度', score: 27, maxScore: 30, passed: true, detail: '核心论点有数据支撑' },
      { key: 'cta', label: '行动号召', score: 15, maxScore: 25, passed: false, detail: '缺少明确的结尾行动建议' },
      { key: 'readability', label: '可读性', score: 15, maxScore: 15, passed: true, detail: '语言流畅' },
    ],
    suggestions: ['补充一个更具体的结尾行动建议'],
    model: 'seed-readiness',
  })
);

// Skills
seedDataRoutes.get('/skills', (c) => c.json({ skills: [] }));
