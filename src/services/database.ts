/**
 * IndexedDB 数据库服务
 * 用于存储用户保存的总结内容和对话历史
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { loggers } from '@/utils/logger';

const log = loggers.database;

// 从统一类型定义导入
import type {
  ContentBlock,
  ContentBlockType,
  TextBlock,
  StatusBlock,
  ImageBlock,
  SearchBlock,
  ThinkingBlock,
  SuggestionsBlock,
  ToolCallBlock,
  MessageReference,
  ImageReference,
  ShortcutInfo
} from '@/types/content-blocks';

// 重新导出类型，保持向后兼容
export type {
  ContentBlock,
  ContentBlockType,
  TextBlock,
  StatusBlock,
  ImageBlock,
  SearchBlock,
  ThinkingBlock,
  SuggestionsBlock,
  ToolCallBlock,
  MessageReference,
  ImageReference,
  ShortcutInfo
};

// 兼容性别名（旧代码可能使用这些名称）
export type ThinkingContentBlock = ThinkingBlock;
export type SuggestionsContentBlock = SuggestionsBlock;
export type ToolCallContentBlock = ToolCallBlock;

// ==================== 消息类型定义 ====================

/**
 * 对话消息
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  imageUrl?: string; // 原图 URL
  thumbnailUrl?: string; // 缩略图 URL（用于列表显示）
  blocks?: ContentBlock[]; // 内容块列表
  references?: MessageReference[]; // 用户消息使用的引用
  imageReferences?: ImageReference[]; // 用户消息粘贴的参考图片
  shortcut?: { id: string; name: string }; // 用户消息使用的快捷指令
}

/**
 * 对话记录
 */
export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  messageCount?: number; // 消息数量（从API获取时使用，避免加载完整消息）
  createdAt: number;
  updatedAt: number;
  projectId?: string; // 关联的项目ID
}

// ==================== 快捷指令类型定义 ====================

/**
 * 快捷指令中的引用内容
 */
export interface ShortcutReference {
  id: string;
  summaryId: string;
  summaryTitle: string;
  preview: string;
}

/**
 * 快捷指令
 */
export interface Shortcut {
  id: string;
  name: string; // 名称
  prompt: string; // 指令内容(提示词)
  description?: string; // 描述(给用户自己看)
  references?: ShortcutReference[]; // 引用的收藏内容
  createdAt: number;
  updatedAt: number;
  order: number; // 排序顺序
}

/**
 * 工作台缓存数据
 */
export interface WorkspaceCacheEntry {
  key: string; // 缓存键 (userId + projectId)
  data: SavedSummary[]; // 缓存的总结数据
  timestamp: number; // 缓存时间戳
  version: number; // 缓存版本
}

/**
 * 快捷指令缓存数据
 */
export interface ShortcutsCacheEntry {
  key: string; // 缓存键 (userId)
  data: Shortcut[]; // 缓存的快捷指令数据
  timestamp: number; // 缓存时间戳
  version: number; // 缓存版本
}

/**
 * 数据库Schema定义
 */
interface MindMapDB extends DBSchema {
  'saved-summaries': {
    key: string;
    value: SavedSummary;
    indexes: {
      'by-created': number;
      'by-url': string;
    };
  };
  'chat-conversations': {
    key: string;
    value: ChatConversation;
    indexes: {
      'by-updated': number;
    };
  };
  shortcuts: {
    key: string;
    value: Shortcut;
    indexes: {
      'by-created': number;
      'by-order': number;
    };
  };
  'workspace-cache': {
    key: string;
    value: WorkspaceCacheEntry;
    indexes: {
      'by-timestamp': number;
    };
  };
  'shortcuts-cache': {
    key: string;
    value: ShortcutsCacheEntry;
    indexes: {
      'by-timestamp': number;
    };
  };
}

/**
 * 保存的总结记录
 */
export interface SavedSummary {
  id: string;
  title: string;
  url: string;
  markdown: string;
  createdAt: number;
  tags?: string[];
  starred?: boolean;
  projectId?: string; // 关联的项目ID
  isSaving?: boolean; // 标记是否正在保存中（用于骨架卡片显示）
  contentType?: 'article' | 'image' | 'video'; // 内容类型：文章、图片、视频
  metadata?: Record<string, unknown>;
}

/**
 * IndexedDB数据库服务类
 * 单例模式,统一管理数据库连接
 */
export class DatabaseService {
  private db: IDBPDatabase<MindMapDB> | null = null;
  private static instance: DatabaseService;

  private constructor() {}

  static getInstance(): DatabaseService {
    if (!this.instance) {
      this.instance = new DatabaseService();
    }
    return this.instance;
  }

  /**
   * 初始化数据库
   * 创建object stores和索引
   */
  async init(): Promise<void> {
    // 防止重复初始化
    if (this.db) {
      return;
    }

    log.info('[DatabaseService] Initializing database...');

    this.db = await openDB<MindMapDB>('mindmap-db', 4, {
      upgrade(db, oldVersion) {
        log.info(
          '[DatabaseService] Upgrading database from version',
          oldVersion
        );

        // 版本1: 创建saved-summaries表
        if (oldVersion < 1) {
          log.info('[DatabaseService] Creating saved-summaries store...');
          const summaryStore = db.createObjectStore('saved-summaries', {
            keyPath: 'id'
          });
          summaryStore.createIndex('by-created', 'createdAt');
          summaryStore.createIndex('by-url', 'url');
        }

        // 版本2: 创建chat-conversations表
        if (oldVersion < 2) {
          log.info('[DatabaseService] Creating chat-conversations store...');
          const conversationStore = db.createObjectStore('chat-conversations', {
            keyPath: 'id'
          });
          conversationStore.createIndex('by-updated', 'updatedAt');
        }

        // 版本3: 创建shortcuts表
        if (oldVersion < 3) {
          log.info('[DatabaseService] Creating shortcuts store...');
          const shortcutStore = db.createObjectStore('shortcuts', {
            keyPath: 'id'
          });
          shortcutStore.createIndex('by-created', 'createdAt');
          shortcutStore.createIndex('by-order', 'order');
        }

        // 版本4: 创建workspace-cache和shortcuts-cache表（大容量缓存）
        if (oldVersion < 4) {
          log.info('[DatabaseService] Creating workspace-cache store...');
          const workspaceCacheStore = db.createObjectStore('workspace-cache', {
            keyPath: 'key'
          });
          workspaceCacheStore.createIndex('by-timestamp', 'timestamp');

          log.info('[DatabaseService] Creating shortcuts-cache store...');
          const shortcutsCacheStore = db.createObjectStore('shortcuts-cache', {
            keyPath: 'key'
          });
          shortcutsCacheStore.createIndex('by-timestamp', 'timestamp');
        }

        log.info('[DatabaseService] Database upgrade completed');
      }
    });

    log.info('[DatabaseService] Database initialized');
  }

  /**
   * 保存总结
   * @param summary - 总结内容(不包含id和createdAt,自动生成)
   * @returns 生成的ID
   */
  async saveSummary(
    summary: Omit<SavedSummary, 'id' | 'createdAt'>
  ): Promise<string> {
    if (!this.db) await this.init();

    const id = crypto.randomUUID();
    const savedSummary: SavedSummary = {
      id,
      ...summary,
      createdAt: Date.now()
    };

    log.info('[DatabaseService] Saving summary:', id);
    await this.db!.add('saved-summaries', savedSummary);

    return id;
  }

  /**
   * 获取所有总结
   * @returns 总结列表,按创建时间倒序
   */
  async getAllSummaries(): Promise<SavedSummary[]> {
    if (!this.db) await this.init();

    const summaries = await this.db!.getAllFromIndex(
      'saved-summaries',
      'by-created'
    );

    // 最新的在前
    return summaries.reverse();
  }

  /**
   * 根据ID获取总结
   * @param id - 总结ID
   * @returns 总结记录或undefined
   */
  async getSummary(id: string): Promise<SavedSummary | undefined> {
    if (!this.db) await this.init();
    return await this.db!.get('saved-summaries', id);
  }

  /**
   * 删除总结
   * @param id - 总结ID
   */
  async deleteSummary(id: string): Promise<void> {
    if (!this.db) await this.init();

    log.info('[DatabaseService] Deleting summary:', id);
    await this.db!.delete('saved-summaries', id);
  }

  /**
   * 更新总结
   * @param id - 总结ID
   * @param updates - 要更新的字段
   */
  async updateSummary(
    id: string,
    updates: Partial<SavedSummary>
  ): Promise<void> {
    if (!this.db) await this.init();

    const summary = await this.getSummary(id);
    if (!summary) {
      throw new Error(`Summary not found: ${id}`);
    }

    const updated = { ...summary, ...updates };
    log.info('[DatabaseService] Updating summary:', id);
    await this.db!.put('saved-summaries', updated);
  }

  /**
   * 根据URL查询总结
   * @param url - 页面URL
   * @returns 匹配的总结列表
   */
  async getSummariesByUrl(url: string): Promise<SavedSummary[]> {
    if (!this.db) await this.init();

    return await this.db!.getAllFromIndex('saved-summaries', 'by-url', url);
  }

  /**
   * 统计信息
   * @returns 总结总数
   */
  async getCount(): Promise<number> {
    if (!this.db) await this.init();

    return await this.db!.count('saved-summaries');
  }

  /**
   * 导出所有数据(用于备份)
   * @returns 所有总结的JSON字符串
   */
  async exportData(): Promise<string> {
    const summaries = await this.getAllSummaries();
    return JSON.stringify(summaries, null, 2);
  }

  /**
   * 导入数据(用于恢复)
   * @param jsonData - JSON字符串
   */
  async importData(jsonData: string): Promise<void> {
    if (!this.db) await this.init();

    const summaries: SavedSummary[] = JSON.parse(jsonData);

    log.info(`[DatabaseService] Importing ${summaries.length} summaries...`);

    for (const summary of summaries) {
      await this.db!.put('saved-summaries', summary);
    }

    log.info('[DatabaseService] Import completed');
  }

  // ==================== 对话历史相关方法 ====================

  /**
   * 保存对话
   * @param conversation - 对话内容
   * @returns 对话ID
   */
  async saveConversation(
    conversation: Omit<ChatConversation, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    if (!this.db) await this.init();

    const id = crypto.randomUUID();
    const now = Date.now();
    const saved: ChatConversation = {
      id,
      ...conversation,
      createdAt: now,
      updatedAt: now
    };

    log.info('[DatabaseService] Saving conversation:', id);
    await this.db!.add('chat-conversations', saved);

    return id;
  }

  /**
   * 获取所有对话
   * @returns 对话列表，按更新时间倒序
   */
  async getAllConversations(): Promise<ChatConversation[]> {
    if (!this.db) await this.init();

    const conversations = await this.db!.getAllFromIndex(
      'chat-conversations',
      'by-updated'
    );

    // 最新更新的在前
    return conversations.reverse();
  }

  /**
   * 根据ID获取对话
   * @param id - 对话ID
   * @returns 对话记录或undefined
   */
  async getConversation(id: string): Promise<ChatConversation | undefined> {
    if (!this.db) await this.init();
    return await this.db!.get('chat-conversations', id);
  }

  /**
   * 删除对话
   * @param id - 对话ID
   */
  async deleteConversation(id: string): Promise<void> {
    if (!this.db) await this.init();

    log.info('[DatabaseService] Deleting conversation:', id);
    await this.db!.delete('chat-conversations', id);
  }

  /**
   * 更新对话（更新消息列表和时间戳）
   * @param id - 对话ID
   * @param messages - 新的消息列表
   */
  async updateConversation(id: string, messages: ChatMessage[]): Promise<void> {
    if (!this.db) await this.init();

    const conversation = await this.getConversation(id);
    if (!conversation) {
      throw new Error(`Conversation not found: ${id}`);
    }

    // 更新标题（如果有新的用户消息且当前标题为空或默认）
    let title = conversation.title;
    if (messages.length > 0 && (!title || title === '新对话')) {
      const firstUserMsg = messages.find((m) => m.role === 'user');
      if (firstUserMsg) {
        title =
          firstUserMsg.content.slice(0, 20) +
          (firstUserMsg.content.length > 20 ? '...' : '');
      }
    }

    const updated: ChatConversation = {
      ...conversation,
      title,
      messages,
      updatedAt: Date.now()
    };

    log.info('[DatabaseService] Updating conversation:', id);
    await this.db!.put('chat-conversations', updated);
  }

  /**
   * 获取对话总数
   * @returns 对话数量
   */
  async getConversationCount(): Promise<number> {
    if (!this.db) await this.init();
    return await this.db!.count('chat-conversations');
  }

  // ==================== 快捷指令相关方法 ====================

  /**
   * 保存快捷指令
   * @param shortcut - 快捷指令内容
   * @returns 快捷指令ID
   */
  async saveShortcut(
    shortcut: Omit<Shortcut, 'id' | 'createdAt' | 'updatedAt' | 'order'>
  ): Promise<string> {
    if (!this.db) await this.init();

    // 获取当前最大 order 值
    const all = await this.getAllShortcuts();
    const maxOrder = all.length > 0 ? Math.max(...all.map((s) => s.order)) : -1;

    const id = crypto.randomUUID();
    const now = Date.now();
    const saved: Shortcut = {
      id,
      ...shortcut,
      createdAt: now,
      updatedAt: now,
      order: maxOrder + 1
    };

    log.info('[DatabaseService] Saving shortcut:', id);
    await this.db!.add('shortcuts', saved);

    return id;
  }

  /**
   * 获取所有快捷指令
   * @returns 快捷指令列表，按 order 排序
   */
  async getAllShortcuts(): Promise<Shortcut[]> {
    if (!this.db) await this.init();

    const shortcuts = await this.db!.getAllFromIndex('shortcuts', 'by-order');
    return shortcuts;
  }

  /**
   * 根据ID获取快捷指令
   * @param id - 快捷指令ID
   * @returns 快捷指令或undefined
   */
  async getShortcut(id: string): Promise<Shortcut | undefined> {
    if (!this.db) await this.init();
    return await this.db!.get('shortcuts', id);
  }

  /**
   * 更新快捷指令
   * @param id - 快捷指令ID
   * @param updates - 要更新的字段
   */
  async updateShortcut(
    id: string,
    updates: Partial<Omit<Shortcut, 'id' | 'createdAt'>>
  ): Promise<void> {
    if (!this.db) await this.init();

    const shortcut = await this.getShortcut(id);
    if (!shortcut) {
      throw new Error(`Shortcut not found: ${id}`);
    }

    const updated: Shortcut = {
      ...shortcut,
      ...updates,
      updatedAt: Date.now()
    };

    log.info('[DatabaseService] Updating shortcut:', id);
    await this.db!.put('shortcuts', updated);
  }

  /**
   * 删除快捷指令
   * @param id - 快捷指令ID
   */
  async deleteShortcut(id: string): Promise<void> {
    if (!this.db) await this.init();

    log.info('[DatabaseService] Deleting shortcut:', id);
    await this.db!.delete('shortcuts', id);
  }

  /**
   * 重新排序快捷指令
   * @param ids - 按新顺序排列的ID数组
   */
  async reorderShortcuts(ids: string[]): Promise<void> {
    if (!this.db) await this.init();

    log.info('[DatabaseService] Reordering shortcuts:', ids);

    for (let i = 0; i < ids.length; i++) {
      const shortcut = await this.getShortcut(ids[i]);
      if (shortcut) {
        await this.db!.put('shortcuts', {
          ...shortcut,
          order: i,
          updatedAt: Date.now()
        });
      }
    }
  }

  /**
   * 获取快捷指令总数
   * @returns 快捷指令数量
   */
  async getShortcutCount(): Promise<number> {
    if (!this.db) await this.init();
    return await this.db!.count('shortcuts');
  }

  // ==================== 工作台缓存相关方法 ====================

  /**
   * 获取工作台缓存
   * @param key - 缓存键 (userId + projectId)
   * @returns 缓存数据或 undefined
   */
  async getWorkspaceCache(
    key: string
  ): Promise<WorkspaceCacheEntry | undefined> {
    if (!this.db) await this.init();
    return await this.db!.get('workspace-cache', key);
  }

  /**
   * 设置工作台缓存
   * @param entry - 缓存数据
   */
  async setWorkspaceCache(entry: WorkspaceCacheEntry): Promise<void> {
    if (!this.db) await this.init();
    log.info(
      '[DatabaseService] Setting workspace cache:',
      entry.key,
      'items:',
      entry.data.length
    );
    await this.db!.put('workspace-cache', entry);
  }

  /**
   * 删除工作台缓存
   * @param key - 缓存键
   */
  async deleteWorkspaceCache(key: string): Promise<void> {
    if (!this.db) await this.init();
    log.info('[DatabaseService] Deleting workspace cache:', key);
    await this.db!.delete('workspace-cache', key);
  }

  /**
   * 获取所有工作台缓存键
   * @returns 缓存键列表
   */
  async getAllWorkspaceCacheKeys(): Promise<string[]> {
    if (!this.db) await this.init();
    return await this.db!.getAllKeys('workspace-cache');
  }

  /**
   * 清理旧的工作台缓存
   * 保留最近的 N 个缓存
   * @param maxCaches - 最多保留的缓存数量
   */
  async cleanupWorkspaceCache(maxCaches: number = 10): Promise<void> {
    if (!this.db) await this.init();

    const allCaches = await this.db!.getAllFromIndex(
      'workspace-cache',
      'by-timestamp'
    );
    if (allCaches.length <= maxCaches) return;

    // 按时间戳从旧到新排序（by-timestamp 索引已经排序了）
    const toRemove = allCaches.slice(0, allCaches.length - maxCaches);

    for (const cache of toRemove) {
      await this.db!.delete('workspace-cache', cache.key);
      log.info('[DatabaseService] Cleaned up old workspace cache:', cache.key);
    }
  }

  /**
   * 清除所有工作台缓存
   */
  async clearAllWorkspaceCache(): Promise<void> {
    if (!this.db) await this.init();
    log.info('[DatabaseService] Clearing all workspace cache...');
    await this.db!.clear('workspace-cache');
  }

  // ==================== 快捷指令缓存相关方法 ====================

  /**
   * 获取快捷指令缓存
   * @param key - 缓存键 (userId)
   * @returns 缓存数据或 undefined
   */
  async getShortcutsCache(
    key: string
  ): Promise<ShortcutsCacheEntry | undefined> {
    if (!this.db) await this.init();
    return await this.db!.get('shortcuts-cache', key);
  }

  /**
   * 设置快捷指令缓存
   * @param entry - 缓存数据
   */
  async setShortcutsCache(entry: ShortcutsCacheEntry): Promise<void> {
    if (!this.db) await this.init();
    log.info(
      '[DatabaseService] Setting shortcuts cache:',
      entry.key,
      'items:',
      entry.data.length
    );
    await this.db!.put('shortcuts-cache', entry);
  }

  /**
   * 删除快捷指令缓存
   * @param key - 缓存键
   */
  async deleteShortcutsCache(key: string): Promise<void> {
    if (!this.db) await this.init();
    log.info('[DatabaseService] Deleting shortcuts cache:', key);
    await this.db!.delete('shortcuts-cache', key);
  }

  /**
   * 清除所有快捷指令缓存
   */
  async clearAllShortcutsCache(): Promise<void> {
    if (!this.db) await this.init();
    log.info('[DatabaseService] Clearing all shortcuts cache...');
    await this.db!.clear('shortcuts-cache');
  }
}
