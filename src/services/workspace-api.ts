/**
 * 工作台数据服务抽象层
 * 统一 Chrome API 和 HTTP API，使工作台组件可在两种环境下运行
 */

import type { SavedSummary, Shortcut } from '@/services/database';
import { getApiBaseUrl, isExtensionEnv } from '@/utils/env';
import { recordApiRequest } from '@/utils/perf-monitor';
import { createLogger } from '@/utils/logger';
import { withRetry } from '@/utils/retry';
import { addSummaryToCache } from './workspace-cache';
import { dispatchWorkspaceSummarySaved } from './workspace-events';

const log = createLogger('WorkspaceAPI');

// API 基础地址
// 生产环境：优先使用当前域名避免 CORS 问题
// 开发环境：使用环境变量或 localhost
const API_BASE = getApiBaseUrl();

function buildSavedSummaryFromPayload(
  id: string,
  data: {
    title: string;
    url: string;
    markdown: string;
    tags?: string[];
    project_id?: string;
    content_type?: 'article' | 'image' | 'video';
    metadata?: Record<string, unknown>;
  }
): SavedSummary {
  return {
    id,
    title: data.title,
    url: data.url || 'note://local',
    markdown: data.markdown,
    tags: data.tags || [],
    projectId: data.project_id || undefined,
    contentType: data.content_type,
    metadata: data.metadata,
    createdAt: Date.now()
  };
}

function notifySummarySaved(summary: SavedSummary): void {
  void addSummaryToCache(summary, { initializeIfMissing: true }).catch(
    (error) => {
      log.warn(
        '[WorkspaceAPI] Failed to update summary cache after save:',
        error
      );
    }
  );
  dispatchWorkspaceSummarySaved(summary);
}

// ============================================
// Token 管理（用于 Web 端认证）
// ============================================

let _accessToken: string | null = null;

/**
 * 带认证的 fetch 封装（含性能监控）
 */
async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);

  // 添加认证头
  if (_accessToken) {
    headers.set('Authorization', `Bearer ${_accessToken}`);
  }

  const startTime = performance.now();
  const response = await fetch(url, {
    ...options,
    headers
  });
  const duration = performance.now() - startTime;

  // 记录 API 性能指标
  try {
    const urlPath = new URL(url).pathname;
    recordApiRequest(
      urlPath,
      duration,
      response.status,
      options.method || 'GET'
    );
  } catch {
    // URL 解析失败时忽略
  }

  return response;
}

/**
 * 获取访问令牌
 */
export function getAccessToken(): string | null {
  return _accessToken;
}

/**
 * 设置访问令牌
 */
export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

// ============================================
// 项目管理 API
// ============================================

/**
 * 项目定义
 */
export interface Project {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  isDefault: boolean;
  sortOrder: number;
  summaryCount: number;
  conversationCount: number;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
  favoritedAt: number | null;
  /** ChatGPT-style 项目自定义指令,空字符串/null 表示未设置 */
  instructions?: string | null;
}

/**
 * 获取所有项目
 */
export async function getProjects(): Promise<Project[]> {
  const response = await authFetch(`${API_BASE}/api/workspace/projects`);
  if (!response.ok) {
    throw new Error('获取项目列表失败');
  }
  const result = await response.json();
  return result.projects;
}

/**
 * 获取单个项目详情
 */
export async function getProject(id: string): Promise<Project> {
  const response = await authFetch(`${API_BASE}/api/workspace/projects/${id}`);
  if (!response.ok) {
    throw new Error('获取项目详情失败');
  }
  const result = await response.json();
  return result.project;
}

/**
 * 创建新项目
 */
export async function createProject(data: {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}): Promise<Project> {
  const response = await authFetch(`${API_BASE}/api/workspace/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '创建项目失败');
  }
  const result = await response.json();
  return result.project;
}

/**
 * 更新项目
 */
export async function updateProject(
  id: string,
  data: {
    name?: string;
    description?: string;
    icon?: string;
    color?: string;
    sort_order?: number;
    archived?: boolean;
    favorited?: boolean;
    /** 项目自定义指令(ChatGPT-style),传空字符串清除 */
    instructions?: string | null;
  }
): Promise<void> {
  const response = await authFetch(`${API_BASE}/api/workspace/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    throw new Error('更新项目失败');
  }
}

/**
 * 删除项目
 */
export async function deleteProject(id: string): Promise<void> {
  const response = await authFetch(`${API_BASE}/api/workspace/projects/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '删除项目失败');
  }
}

// ============================================
// 总结/笔记 API
// ============================================

export type CardType = 'source' | 'note' | 'ai_gen' | 'insight';

export interface WorkspaceCard {
  id: string;
  project_id: string;
  type: CardType;
  content: Record<string, unknown>;
  meta_data: Record<string, unknown>;
  position: number;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function getCards(
  projectId: string,
  options?: { limit?: number; offset?: number }
): Promise<{ cards: WorkspaceCard[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  params.set('project_id', projectId);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));

  const response = await authFetch(
    `${API_BASE}/api/workspace/cards?${params.toString()}`
  );
  if (!response.ok) {
    throw new Error('获取卡片失败');
  }

  const result = await response.json();
  return {
    cards: result.cards || [],
    hasMore: !!result.hasMore
  };
}

export async function createCard(data: {
  projectId: string;
  type: CardType;
  content?: Record<string, unknown>;
  metaData?: Record<string, unknown>;
  position?: number;
  parentId?: string | null;
}): Promise<WorkspaceCard> {
  const response = await authFetch(`${API_BASE}/api/workspace/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || '创建卡片失败');
  }

  return result.card as WorkspaceCard;
}

export async function getCardById(id: string): Promise<WorkspaceCard> {
  const response = await authFetch(`${API_BASE}/api/workspace/cards/${id}`);
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || '获取卡片失败');
  }

  return result.card as WorkspaceCard;
}

export async function updateCard(
  id: string,
  data: {
    type?: CardType;
    content?: Record<string, unknown>;
    metaData?: Record<string, unknown>;
    position?: number;
    parentId?: string | null;
  }
): Promise<WorkspaceCard> {
  const response = await authFetch(`${API_BASE}/api/workspace/cards/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || '更新卡片失败');
  }

  return result.card as WorkspaceCard;
}

export async function deleteCard(id: string): Promise<void> {
  const response = await authFetch(`${API_BASE}/api/workspace/cards/${id}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || '删除卡片失败');
  }
}

export async function reorderCards(data: {
  projectId: string;
  items: Array<{ id: string; position: number }>;
}): Promise<{ success: boolean; updated: number }> {
  const response = await authFetch(`${API_BASE}/api/workspace/cards/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || '重排卡片失败');
  }

  return {
    success: !!result.success,
    updated: Number(result.updated || 0)
  };
}

export type StudioDocumentStatus = 'draft' | 'published';

export type StudioDocumentContentType =
  | 'text'
  | 'slides'
  | 'infographic'
  | 'mindmap'
  | 'report'
  | 'quiz'
  | 'brief'
  | 'image';

export interface StudioDocument {
  id: string;
  project_id: string;
  title: string;
  content: Record<string, unknown>;
  content_type: StudioDocumentContentType;
  status: StudioDocumentStatus;
  created_at: string;
  updated_at: string;
}

export async function getStudioDocuments(
  projectId: string,
  options?: { limit?: number; offset?: number }
): Promise<{ documents: StudioDocument[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  params.set('project_id', projectId);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));

  const response = await authFetch(
    `${API_BASE}/api/workspace/studio-documents?${params.toString()}`
  );
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || result.details || '获取 Studio 文档失败');
  }

  const result = await response.json().catch(() => ({}));
  return {
    documents: result.documents || [],
    hasMore: !!result.hasMore
  };
}

export async function createStudioDocument(data: {
  projectId: string;
  title?: string;
  content?: Record<string, unknown>;
  content_type?: StudioDocumentContentType;
  status?: StudioDocumentStatus;
}): Promise<StudioDocument> {
  const response = await authFetch(
    `${API_BASE}/api/workspace/studio-documents`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || '创建 Studio 文档失败');
  }

  return result.document as StudioDocument;
}

export async function getStudioDocumentById(
  id: string
): Promise<StudioDocument> {
  const response = await authFetch(
    `${API_BASE}/api/workspace/studio-documents/${id}`
  );
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || '获取 Studio 文档失败');
  }

  return result.document as StudioDocument;
}

export async function updateStudioDocument(
  id: string,
  data: {
    title?: string;
    content?: Record<string, unknown>;
    status?: StudioDocumentStatus;
  }
): Promise<StudioDocument> {
  const response = await authFetch(
    `${API_BASE}/api/workspace/studio-documents/${id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || '更新 Studio 文档失败');
  }

  return result.document as StudioDocument;
}

export async function deleteStudioDocument(id: string): Promise<void> {
  const response = await authFetch(
    `${API_BASE}/api/workspace/studio-documents/${id}`,
    {
      method: 'DELETE'
    }
  );

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || '删除 Studio 文档失败');
  }
}

export async function runStudioAiAction(data: {
  action: 'weave' | 'humanizer' | 'expand';
  selectionText: string;
  projectId?: string | null;
  materialText?: string;
}): Promise<{ text: string; model: string }> {
  const response = await authFetch(`${API_BASE}/api/workspace/studio-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || 'Studio AI 执行失败');
  }

  return {
    text: result.text || '',
    model: result.model || ''
  };
}

export async function generateStudioChartImage(data: {
  instruction: string;
  dataText?: string;
}): Promise<{ imageUrl: string; model: string }> {
  const response = await authFetch(
    `${API_BASE}/api/workspace/studio-chart-image`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || '生成图表图片失败');
  }

  return {
    imageUrl: result.imageUrl || '',
    model: result.model || ''
  };
}

export interface StudioReadinessCheck {
  score: number;
  level: 'poor' | 'fair' | 'good' | 'ready';
  summary: string;
  checks: Array<{
    key: string;
    label: string;
    score: number;
    maxScore: number;
    passed: boolean;
    detail: string;
  }>;
  suggestions: string[];
  model: string;
}

export async function evaluateStudioReadiness(data: {
  title: string;
  content: Record<string, unknown>;
}): Promise<StudioReadinessCheck> {
  const response = await authFetch(
    `${API_BASE}/api/workspace/studio-readiness`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || '评估发布就绪度失败');
  }

  return {
    score: Number(result.score || 0),
    level: result.level || 'poor',
    summary: result.summary || '',
    checks: Array.isArray(result.checks) ? result.checks : [],
    suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
    model: result.model || ''
  };
}

/**
 * 获取所有总结
 * @param projectId 可选的项目 ID 过滤
 * @param options 分页选项
 */
export async function getAllSummaries(
  projectId?: string,
  options?: { limit?: number; offset?: number }
): Promise<{ summaries: SavedSummary[]; hasMore: boolean }> {
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'get_all_summaries',
      data: { projectId, limit, offset }
    });
    if (response.success) {
      return {
        summaries: response.data,
        hasMore: response.hasMore ?? false
      };
    }
    throw new Error(response.error || '获取总结失败');
  }

  // HTTP API
  const params = new URLSearchParams();
  if (projectId) params.set('project_id', projectId);
  params.set('limit', limit.toString());
  params.set('offset', offset.toString());

  const url = `${API_BASE}/api/workspace/summaries?${params.toString()}`;

  const response = await authFetch(url);
  if (!response.ok) {
    throw new Error('获取总结失败');
  }
  const result = await response.json();
  return {
    summaries: result.summaries,
    hasMore: result.hasMore ?? false
  };
}

/**
 * 保存总结
 */
export async function saveSummary(data: {
  title: string;
  url: string;
  markdown: string;
  tags?: string[];
  project_id?: string;
  content_type?: 'article' | 'image' | 'video';
  metadata?: Record<string, unknown>;
}): Promise<{ id: string }> {
  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'save_summary',
      data
    });
    if (response.success) {
      if (response.data?.id) {
        notifySummarySaved(
          buildSavedSummaryFromPayload(response.data.id, data)
        );
      }
      return response.data;
    }
    throw new Error(response.error || '保存失败');
  }

  // HTTP API
  const response = await authFetch(`${API_BASE}/api/workspace/summaries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    throw new Error('保存失败');
  }
  const result = await response.json();
  if (result?.id) {
    notifySummarySaved(buildSavedSummaryFromPayload(result.id, data));
  }
  return result;
}

/**
 * 更新总结
 */
export async function updateSummary(
  id: string,
  data: {
    title?: string;
    markdown?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'update_summary',
      data: { id, ...data }
    });
    if (!response.success) {
      throw new Error(response.error || '更新失败');
    }
    return;
  }

  // HTTP API
  const response = await authFetch(
    `${API_BASE}/api/workspace/summaries/${id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }
  );
  if (!response.ok) {
    throw new Error('更新失败');
  }
}

/**
 * 获取单条总结（用于获取原始数据，不经过缩略图压缩）
 */
export async function getSummaryById(id: string): Promise<SavedSummary | null> {
  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'get_summary_by_id',
      data: { id }
    });
    if (response.success) {
      return response.data;
    }
    throw new Error(response.error || '获取总结失败');
  }

  // HTTP API
  const response = await authFetch(`${API_BASE}/api/workspace/summaries/${id}`);
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error('获取总结失败');
  }
  const result = await response.json();
  return result.summary;
}

/**
 * 删除总结
 */
export async function deleteSummary(id: string): Promise<void> {
  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'delete_summary',
      data: { id }
    });
    if (!response.success) {
      throw new Error(response.error || '删除失败');
    }
    return;
  }

  // HTTP API
  log.info('[WorkspaceAPI] Deleting summary via HTTP:', id);
  const response = await authFetch(
    `${API_BASE}/api/workspace/summaries/${id}`,
    {
      method: 'DELETE'
    }
  );
  log.info('[WorkspaceAPI] Delete response:', response.status, response.ok);
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    log.error('[WorkspaceAPI] Delete failed:', response.status, errorText);
    throw new Error(`删除失败: ${response.status}`);
  }
  log.info('[WorkspaceAPI] Summary deleted successfully:', id);
}

export interface WeaveCardsResult {
  success: boolean;
  wovenText: string;
  card: Record<string, unknown> | null;
  model: {
    requestedModel: string;
    resolvedModel: string;
    fallbackUsed: boolean;
  };
  insertPosition: number;
  warning?: string;
}

export async function consumeWeavingQuota(): Promise<{
  success: boolean;
  isMember: boolean;
  used: number;
  max: number;
}> {
  const response = await authFetch(`${API_BASE}/api/credits/weaving-quota`, {
    method: 'POST'
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof payload?.error === 'string' ? payload.error : '编织配额校验失败';
    throw new Error(message);
  }

  return {
    success: !!payload.success,
    isMember: !!payload.isMember,
    used: Number(payload.used || 0),
    max: Number(payload.max || 0)
  };
}

export async function weaveCards(data: {
  projectId: string;
  cardIds: string[];
  saveCard?: boolean;
  consumeQuota?: boolean;
}): Promise<WeaveCardsResult> {
  const { consumeQuota = false, ...weavePayload } = data;

  if (consumeQuota) {
    await consumeWeavingQuota();
  }

  const response = await authFetch(`${API_BASE}/api/workspace/cards/weave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(weavePayload)
  });

  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    const message =
      typeof payload.error === 'string' ? payload.error : '编织失败';
    throw new Error(message);
  }

  return payload as unknown as WeaveCardsResult;
}

// ============================================
// 回收站 API
// ============================================

/**
 * 回收站项目
 */
export interface TrashItem {
  id: string;
  title: string;
  url: string;
  projectId?: string;
  deletedAt: number;
  createdAt: number;
}

/**
 * 获取回收站列表
 */
export async function getTrashItems(): Promise<TrashItem[]> {
  const response = await authFetch(`${API_BASE}/api/workspace/trash`);
  if (!response.ok) {
    throw new Error('获取回收站失败');
  }
  const result = await response.json();
  return result.items;
}

/**
 * 恢复回收站中的项目
 */
export async function restoreTrashItem(id: string): Promise<void> {
  const response = await authFetch(`${API_BASE}/api/workspace/trash/${id}`, {
    method: 'POST'
  });
  if (!response.ok) {
    throw new Error('恢复失败');
  }
}

/**
 * 永久删除回收站中的项目
 */
export async function permanentlyDeleteTrashItem(id: string): Promise<void> {
  const response = await authFetch(`${API_BASE}/api/workspace/trash/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    throw new Error('删除失败');
  }
}

// ============================================
// 快捷指令 API
// ============================================

/**
 * 获取所有快捷指令
 */
export async function getAllShortcuts(): Promise<Shortcut[]> {
  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'get_all_shortcuts'
    });
    if (response.success) {
      return response.data;
    }
    throw new Error(response.error || '获取快捷指令失败');
  }

  // HTTP API
  const response = await authFetch(`${API_BASE}/api/workspace/shortcuts`);
  if (!response.ok) {
    throw new Error('获取快捷指令失败');
  }
  const result = await response.json();
  return result.shortcuts;
}

/**
 * 保存快捷指令
 */
export async function saveShortcut(data: {
  name: string;
  prompt: string;
  description?: string;
  referenceIds?: string[];
}): Promise<{ id: string }> {
  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'save_shortcut',
      data
    });
    if (response.success) {
      return response.data;
    }
    throw new Error(response.error || '保存失败');
  }

  // HTTP API
  const response = await authFetch(`${API_BASE}/api/workspace/shortcuts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    let message = `保存失败 (${response.status})`;
    try {
      const error = await response.json();
      if (error && typeof error.error === 'string' && error.error.trim()) {
        message = error.error;
      }
    } catch {
      // ignore non-json response body
    }
    throw new Error(message);
  }
  return response.json();
}

/**
 * 更新快捷指令
 */
export async function updateShortcut(
  id: string,
  data: {
    name?: string;
    prompt?: string;
    description?: string;
    referenceIds?: string[];
    order?: number;
  }
): Promise<void> {
  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'update_shortcut',
      data: { id, ...data }
    });
    if (!response.success) {
      throw new Error(response.error || '更新失败');
    }
    return;
  }

  // HTTP API
  const response = await authFetch(
    `${API_BASE}/api/workspace/shortcuts/${id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }
  );
  if (!response.ok) {
    throw new Error('更新失败');
  }
}

/**
 * 删除快捷指令
 */
export async function deleteShortcut(id: string): Promise<void> {
  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'delete_shortcut',
      data: { id }
    });
    if (!response.success) {
      throw new Error(response.error || '删除失败');
    }
    return;
  }

  // HTTP API
  const response = await authFetch(
    `${API_BASE}/api/workspace/shortcuts/${id}`,
    {
      method: 'DELETE'
    }
  );
  if (!response.ok) {
    throw new Error('删除失败');
  }
}

// ============================================
// Skills API（快捷指令的迭代版本）
// ============================================

/**
 * Skill 定义
 */
export interface Skill {
  id: string;
  source?: 'user' | 'system' | 'market';
  name: string;
  displayName: string;
  description: string | null;
  icon: string;
  triggers: string[];
  coreInstructions: string;
  outputType: string | null;
  associatedTools: string[];
  defaultOptions: Record<string, unknown>;
  category: string;
  priority: number;
  sortOrder: number;
  isActive: boolean;
  useCount: number;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, string>;
}

/**
 * Skill 模板
 */
export interface SkillTemplate {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  icon: string;
  triggers: string[];
  coreInstructions: string;
  outputType: string | null;
  associatedTools: string[];
  defaultOptions: Record<string, unknown>;
  category: string;
}

/**
 * 获取所有 Skills
 */
export async function getAllSkills(): Promise<Skill[]> {
  const response = await authFetch(`${API_BASE}/api/workspace/skills`);
  if (!response.ok) {
    throw new Error('获取 Skills 失败');
  }
  const result = await response.json();
  return result.skills;
}

/**
 * 获取单个 Skill
 */
export async function getSkill(id: string): Promise<Skill> {
  const response = await authFetch(`${API_BASE}/api/workspace/skills/${id}`);
  if (!response.ok) {
    throw new Error('获取 Skill 失败');
  }
  const result = await response.json();
  return result.skill;
}

/**
 * 创建 Skill
 */
export async function createSkill(data: {
  name: string;
  displayName?: string;
  description?: string;
  icon?: string;
  triggers: string[];
  coreInstructions: string;
  outputType?: string;
  associatedTools?: string[];
  defaultOptions?: Record<string, unknown>;
  category?: string;
  priority?: number;
  metadata?: Record<string, string>;
}): Promise<{ id: string }> {
  const response = await authFetch(`${API_BASE}/api/workspace/skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '创建 Skill 失败');
  }
  return response.json();
}

/**
 * 更新 Skill
 */
export async function updateSkill(
  id: string,
  data: {
    name?: string;
    displayName?: string;
    description?: string;
    icon?: string;
    triggers?: string[];
    coreInstructions?: string;
    outputType?: string;
    associatedTools?: string[];
    defaultOptions?: Record<string, unknown>;
    category?: string;
    priority?: number;
    sortOrder?: number;
    isActive?: boolean;
    metadata?: Record<string, string>;
  }
): Promise<void> {
  const response = await authFetch(`${API_BASE}/api/workspace/skills/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    throw new Error('更新 Skill 失败');
  }
}

/**
 * 删除 Skill
 */
export async function deleteSkill(id: string): Promise<void> {
  const response = await authFetch(`${API_BASE}/api/workspace/skills/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    throw new Error('删除 Skill 失败');
  }
}

/**
 * 获取 Skill 模板列表
 */
export async function getSkillTemplates(): Promise<SkillTemplate[]> {
  const response = await authFetch(
    `${API_BASE}/api/workspace/skills/templates`
  );
  if (!response.ok) {
    throw new Error('获取模板失败');
  }
  const result = await response.json();
  return result.templates;
}

/**
 * 从模板创建 Skill
 */
export async function createSkillFromTemplate(
  template: SkillTemplate
): Promise<{ id: string }> {
  return createSkill({
    name: template.name,
    displayName: template.displayName,
    description: template.description || undefined,
    icon: template.icon,
    triggers: template.triggers,
    coreInstructions: template.coreInstructions,
    outputType: template.outputType || undefined,
    associatedTools: template.associatedTools,
    defaultOptions: template.defaultOptions,
    category: template.category
  });
}

// ============================================
// Skills Layer 3 API（参考文档和脚本）
// ============================================

/**
 * 参考文档定义
 */
export interface SkillReference {
  id: string;
  name: string;
  content?: string;
  description: string | null;
  wordCount: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 脚本定义
 */
export interface SkillScript {
  id: string;
  name: string;
  language: string;
  content?: string;
  description: string | null;
  parameters: Record<string, { type: string; description?: string }>;
  createdAt: string;
  updatedAt: string;
}

/**
 * 获取 Skill 的参考文档列表
 */
export async function getSkillReferences(
  skillId: string
): Promise<SkillReference[]> {
  const response = await authFetch(
    `${API_BASE}/api/workspace/skills/references?skill_id=${skillId}`
  );
  if (!response.ok) {
    throw new Error('获取参考文档失败');
  }
  const result = await response.json();
  return result.references;
}

/**
 * 获取单个参考文档内容
 */
export async function getSkillReference(
  skillId: string,
  name: string
): Promise<SkillReference> {
  const response = await authFetch(
    `${API_BASE}/api/workspace/skills/references/${encodeURIComponent(name)}?skill_id=${skillId}`
  );
  if (!response.ok) {
    throw new Error('获取参考文档失败');
  }
  const result = await response.json();
  return result.reference;
}

/**
 * 创建参考文档
 */
export async function createSkillReference(data: {
  skillId: string;
  name: string;
  content: string;
  description?: string;
}): Promise<SkillReference> {
  const response = await authFetch(
    `${API_BASE}/api/workspace/skills/references`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skill_id: data.skillId,
        name: data.name,
        content: data.content,
        description: data.description
      })
    }
  );
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '创建参考文档失败');
  }
  const result = await response.json();
  return result.reference;
}

/**
 * 更新参考文档
 */
export async function updateSkillReference(
  skillId: string,
  name: string,
  data: { content?: string; description?: string }
): Promise<SkillReference> {
  const response = await authFetch(
    `${API_BASE}/api/workspace/skills/references/${encodeURIComponent(name)}?skill_id=${skillId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }
  );
  if (!response.ok) {
    throw new Error('更新参考文档失败');
  }
  const result = await response.json();
  return result.reference;
}

/**
 * 删除参考文档
 */
export async function deleteSkillReference(
  skillId: string,
  name: string
): Promise<void> {
  const response = await authFetch(
    `${API_BASE}/api/workspace/skills/references/${encodeURIComponent(name)}?skill_id=${skillId}`,
    { method: 'DELETE' }
  );
  if (!response.ok) {
    throw new Error('删除参考文档失败');
  }
}

/**
 * 获取 Skill 的脚本列表
 */
export async function getSkillScripts(skillId: string): Promise<SkillScript[]> {
  const response = await authFetch(
    `${API_BASE}/api/workspace/skills/scripts?skill_id=${skillId}`
  );
  if (!response.ok) {
    throw new Error('获取脚本列表失败');
  }
  const result = await response.json();
  return result.scripts;
}

/**
 * 获取单个脚本内容
 */
export async function getSkillScript(
  skillId: string,
  name: string
): Promise<SkillScript> {
  const response = await authFetch(
    `${API_BASE}/api/workspace/skills/scripts/${encodeURIComponent(name)}?skill_id=${skillId}`
  );
  if (!response.ok) {
    throw new Error('获取脚本失败');
  }
  const result = await response.json();
  return result.script;
}

/**
 * 创建脚本
 */
export async function createSkillScript(data: {
  skillId: string;
  name: string;
  content: string;
  language?: string;
  description?: string;
  parameters?: Record<string, { type: string; description?: string }>;
}): Promise<SkillScript> {
  const response = await authFetch(`${API_BASE}/api/workspace/skills/scripts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skill_id: data.skillId,
      name: data.name,
      content: data.content,
      language: data.language,
      description: data.description,
      parameters: data.parameters
    })
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '创建脚本失败');
  }
  const result = await response.json();
  return result.script;
}

/**
 * 更新脚本
 */
export async function updateSkillScript(
  skillId: string,
  name: string,
  data: {
    content?: string;
    description?: string;
    parameters?: Record<string, { type: string; description?: string }>;
  }
): Promise<SkillScript> {
  const response = await authFetch(
    `${API_BASE}/api/workspace/skills/scripts/${encodeURIComponent(name)}?skill_id=${skillId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }
  );
  if (!response.ok) {
    throw new Error('更新脚本失败');
  }
  const result = await response.json();
  return result.script;
}

/**
 * 删除脚本
 */
export async function deleteSkillScript(
  skillId: string,
  name: string
): Promise<void> {
  const response = await authFetch(
    `${API_BASE}/api/workspace/skills/scripts/${encodeURIComponent(name)}?skill_id=${skillId}`,
    { method: 'DELETE' }
  );
  if (!response.ok) {
    throw new Error('删除脚本失败');
  }
}

// ============================================
// 对话历史 API
// ============================================

// Session ID 管理（用于匿名用户）
let _sessionId: string | null = null;

/**
 * 获取或创建 Session ID
 */
function getOrCreateSessionId(): string {
  if (_sessionId) return _sessionId;

  // 尝试从 localStorage 恢复
  try {
    const stored = localStorage.getItem('workspace_session_id');
    if (stored) {
      _sessionId = stored;
      return _sessionId;
    }
  } catch {
    // localStorage 不可用
  }

  // 创建新的 session ID
  _sessionId = crypto.randomUUID();

  // 保存到 localStorage
  try {
    localStorage.setItem('workspace_session_id', _sessionId);
  } catch {
    // localStorage 不可用
  }

  return _sessionId;
}

/**
 * 带认证和 Session 的 fetch 封装
 */
async function authFetchWithSession(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 12000
): Promise<Response> {
  const headers = new Headers(options.headers);

  // 添加认证头
  if (_accessToken) {
    headers.set('Authorization', `Bearer ${_accessToken}`);
  }

  // 添加 Session ID（用于匿名用户）
  headers.set('X-Session-ID', getOrCreateSessionId());

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  // 兼容外部传入 signal
  const externalSignal = options.signal;
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), {
        once: true
      });
    }
  }

  try {
    return await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/**
 * 对话列表项（不含消息内容）
 */
export interface ConversationListItem {
  id: string;
  title: string;
  messageCount: number;
  projectId?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 存储的消息格式
 */
export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  imageUrl?: string;
  blocks?: unknown[]; // 内容块数组（支持批量图片等复杂内容）
  references?: Array<{
    id: string;
    type: string;
    summaryId: string;
    summaryTitle?: string;
    preview?: string;
  }>;
  imageReferences?: Array<{
    id: string;
    preview: string;
    mimeType: string;
    thumbnailUrl?: string;
  }>;
  shortcut?: { id: string; name: string };
}

const INLINE_MEDIA_PREFIX = 'data:';
const INLINE_MEDIA_KEYS = new Set(['imageUrl', 'thumbnailUrl', 'url', 'src']);

function isInlineMediaUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(INLINE_MEDIA_PREFIX);
}

function sanitizeInlineMediaValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeInlineMediaValue(item))
      .filter((item) => item !== undefined && item !== null);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const source = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(source)) {
    if (INLINE_MEDIA_KEYS.has(key) && isInlineMediaUrl(nestedValue)) {
      continue;
    }

    const nextValue = sanitizeInlineMediaValue(nestedValue);
    if (nextValue === undefined || nextValue === null) {
      continue;
    }
    sanitized[key] = nextValue;
  }

  if (sanitized.type === 'image' && typeof sanitized.imageUrl !== 'string') {
    return undefined;
  }

  return sanitized;
}

function sanitizeStoredMessagesForRequest(
  messages?: StoredMessage[]
): StoredMessage[] | undefined {
  if (!messages) return undefined;

  return messages.map((message) => {
    const sanitizedImageReferences = message.imageReferences
      ?.map((imageRef) => {
        const sanitizedRef = {
          id: imageRef.id,
          preview: imageRef.preview,
          mimeType: imageRef.mimeType
        } as NonNullable<StoredMessage['imageReferences']>[number];

        if (!isInlineMediaUrl(imageRef.thumbnailUrl) && imageRef.thumbnailUrl) {
          sanitizedRef.thumbnailUrl = imageRef.thumbnailUrl;
        }

        return sanitizedRef;
      })
      .filter((imageRef) => imageRef.preview || imageRef.thumbnailUrl);

    return {
      ...message,
      imageUrl:
        !isInlineMediaUrl(message.imageUrl) && message.imageUrl
          ? message.imageUrl
          : undefined,
      blocks: Array.isArray(message.blocks)
        ? (sanitizeInlineMediaValue(message.blocks) as unknown[])
        : message.blocks,
      imageReferences:
        sanitizedImageReferences && sanitizedImageReferences.length > 0
          ? sanitizedImageReferences
          : undefined
    };
  });
}

function getPayloadByteLength(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

/**
 * 完整对话（含消息内容）
 */
export interface Conversation {
  id: string;
  title: string;
  messages: StoredMessage[];
  projectId?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 获取所有对话（列表）
 * @param projectId 可选的项目 ID 过滤
 */
export async function getAllConversations(
  projectId?: string
): Promise<ConversationListItem[]> {
  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'get_all_conversations',
      data: { projectId }
    });
    if (response.success) {
      return response.data;
    }
    throw new Error(response.error || '获取对话列表失败');
  }

  // HTTP API
  const url = projectId
    ? `${API_BASE}/api/workspace/conversations?project_id=${projectId}`
    : `${API_BASE}/api/workspace/conversations`;

  const response = await withRetry(
    async () => {
      const res = await authFetchWithSession(url, {}, 8000);
      if (!res.ok) {
        throw new Error(`获取对话列表失败 (${res.status})`);
      }
      return res;
    },
    {
      maxRetries: 2,
      baseDelay: 600,
      maxDelay: 2000,
      onRetry: (attempt, error, delay) => {
        log.warn(
          `[WorkspaceAPI] getAllConversations retry ${attempt}:`,
          error.message,
          `next in ${delay}ms`
        );
      }
    }
  );

  const result = await response.json();
  return result.conversations || [];
}

/**
 * 获取单个对话
 */
export async function getConversation(id: string): Promise<Conversation> {
  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'get_conversation',
      data: { id }
    });
    if (response.success) {
      return response.data;
    }
    throw new Error(response.error || '获取对话失败');
  }

  // HTTP API
  const response = await authFetchWithSession(
    `${API_BASE}/api/workspace/conversations/${id}`
  );
  if (!response.ok) {
    throw new Error('获取对话失败');
  }
  return response.json();
}

/**
 * 保存新对话
 */
export async function saveConversation(data: {
  title: string;
  messages: StoredMessage[];
  project_id?: string;
}): Promise<{ id: string }> {
  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'save_conversation',
      data
    });
    if (response.success) {
      return response.data;
    }
    throw new Error(response.error || '保存对话失败');
  }

  // HTTP API
  const requestData = {
    ...data,
    messages: sanitizeStoredMessagesForRequest(data.messages) || []
  };
  const originalBytes = getPayloadByteLength(data);
  const trimmedBytes = getPayloadByteLength(requestData);
  if (trimmedBytes < originalBytes) {
    log.info(
      `[WorkspaceAPI] Trimmed conversation save payload by ${originalBytes - trimmedBytes} bytes`
    );
  }

  const response = await authFetchWithSession(
    `${API_BASE}/api/workspace/conversations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    }
  );
  if (!response.ok) {
    throw new Error('保存对话失败');
  }
  return response.json();
}

/**
 * 更新对话
 */
export async function updateConversation(
  id: string,
  data: { title?: string; messages?: StoredMessage[] }
): Promise<void> {
  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'update_conversation',
      data: { id, ...data }
    });
    if (!response.success) {
      throw new Error(response.error || '更新对话失败');
    }
    return;
  }

  // HTTP API
  const requestData = {
    ...data,
    messages: sanitizeStoredMessagesForRequest(data.messages)
  };
  const originalBytes = getPayloadByteLength(data);
  const trimmedBytes = getPayloadByteLength(requestData);
  if (trimmedBytes < originalBytes) {
    log.info(
      `[WorkspaceAPI] Trimmed conversation update payload by ${originalBytes - trimmedBytes} bytes`
    );
  }

  const response = await authFetchWithSession(
    `${API_BASE}/api/workspace/conversations/${id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    }
  );
  if (!response.ok) {
    throw new Error('更新对话失败');
  }
}

/**
 * 删除对话
 */
export async function deleteConversation(id: string): Promise<void> {
  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'delete_conversation',
      data: { id }
    });
    if (!response.success) {
      throw new Error(response.error || '删除对话失败');
    }
    return;
  }

  // HTTP API
  const response = await authFetchWithSession(
    `${API_BASE}/api/workspace/conversations/${id}`,
    {
      method: 'DELETE'
    }
  );
  if (!response.ok) {
    throw new Error('删除对话失败');
  }
}

// ============================================
// 工具函数
// ============================================

/**
 * 获取工作台 URL
 * Chrome 扩展中返回内部 URL，Web 环境返回外部 URL
 */
export function getWorkspaceUrl(): string {
  if (isExtensionEnv()) {
    // 返回外部 Web 应用 URL，而不是扩展内部页面
    return API_BASE;
  }
  return window.location.href;
}

// ============================================
// 来源搜索与导入
// ============================================

export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;
  favicon?: string;
}

export interface SourceImportResult {
  url: string;
  title: string;
  success: boolean;
  summaryId?: string;
  error?: string;
}

/**
 * 全网搜索来源
 */
export async function searchWebSources(
  query: string,
  maxResults = 10
): Promise<WebSearchResult[]> {
  const response = await authFetch(`${API_BASE}/api/workspace/source-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, maxResults })
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error((result as { error?: string }).error || '搜索失败');
  }

  const data = (await response.json()) as { results: WebSearchResult[] };
  return data.results;
}

/**
 * 批量提取并导入来源为素材
 */
export async function extractAndImportSources(
  urls: string[],
  projectId: string
): Promise<{ results: SourceImportResult[]; imported: number }> {
  const response = await authFetch(`${API_BASE}/api/workspace/source-extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls, projectId })
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error((result as { error?: string }).error || '导入失败');
  }

  return response.json() as Promise<{
    results: SourceImportResult[];
    imported: number;
  }>;
}

/**
 * 打开工作台
 */
export function openWorkspace(): void {
  const url = API_BASE;

  if (isExtensionEnv()) {
    // 在新标签页中打开 Web 应用
    chrome.tabs.create({ url });
  } else {
    window.location.href = url;
  }
}
