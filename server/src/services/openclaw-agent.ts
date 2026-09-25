/**
 * OpenClaw Agent 服务
 * 作为 Agent 运行时环境 + 模型路由层
 *
 * 职责：
 * 1. Agent 运行环境：管理 Agent-Reach 等 CLI 工具的执行环境和生命周期
 * 2. 模型路由：根据 skill 复杂度路由到不同模型（GPT-5.4/Claude/Gemini）
 * 3. 沙箱隔离：为工具执行提供安全边界
 *
 * 当前阶段：框架搭建，具体能力后续迭代
 */

import type { ProviderType } from './provider-factory.js';

// ============================================
// 类型定义
// ============================================

export type SkillComplexity = 'simple' | 'moderate' | 'complex';

export interface ModelRoutingConfig {
  simple: ProviderType;    // 简单 skill（如文本处理）
  moderate: ProviderType;  // 中等 skill（如搜索 + 总结）
  complex: ProviderType;   // 复杂 skill（如多步骤 Agent 任务）
}

export interface OpenClawConfig {
  /** 模型路由配置 */
  routing: ModelRoutingConfig;
  /** 工具执行超时（毫秒） */
  toolTimeoutMs: number;
  /** 最大并行工具数 */
  maxParallelTools: number;
  /** 是否启用沙箱模式 */
  sandboxEnabled: boolean;
}

export interface ToolEnvironment {
  /** Agent-Reach CLI 是否可用 */
  agentReachAvailable: boolean;
  /** mcporter 是否可用 */
  mcporterAvailable: boolean;
  /** 可用的搜索渠道 */
  searchChannels: string[];
}

// ============================================
// 默认配置
// ============================================

const DEFAULT_CONFIG: OpenClawConfig = {
  routing: {
    simple: 'gemini',     // 简单任务用 Gemini（快速、低成本）
    moderate: 'openai',   // 中等任务用 GPT-5.4
    complex: 'openai'     // 复杂任务也用 GPT-5.4（后续可切换为专用 Agent）
  },
  toolTimeoutMs: 60000,
  maxParallelTools: 5,
  sandboxEnabled: false
};

// Skill 复杂度判断规则
const COMPLEXITY_RULES: Array<{
  pattern: RegExp;
  complexity: SkillComplexity;
}> = [
  // 简单：单工具调用
  { pattern: /^(extract_url|save_note|summary_get)$/, complexity: 'simple' },
  // 中等：搜索 + 处理
  { pattern: /^(web_search|grok_x_search|web_search_discovery)$/, complexity: 'moderate' },
  // 复杂：多步骤、异步
  { pattern: /^(notebooklm_|e2b_|slide_deck)/, complexity: 'complex' }
];

// ============================================
// OpenClaw 服务
// ============================================

export class OpenClawService {
  private config: OpenClawConfig;

  constructor(config?: Partial<OpenClawConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 如果有环境变量覆盖
    if (process.env.OPENCLAW_SIMPLE_PROVIDER) {
      this.config.routing.simple = process.env.OPENCLAW_SIMPLE_PROVIDER as ProviderType;
    }
    if (process.env.OPENCLAW_MODERATE_PROVIDER) {
      this.config.routing.moderate = process.env.OPENCLAW_MODERATE_PROVIDER as ProviderType;
    }
    if (process.env.OPENCLAW_COMPLEX_PROVIDER) {
      this.config.routing.complex = process.env.OPENCLAW_COMPLEX_PROVIDER as ProviderType;
    }

    console.log('[OpenClaw] Initialized with routing:', this.config.routing);
  }

  /**
   * 判断 skill 的复杂度
   */
  getSkillComplexity(skillName: string): SkillComplexity {
    for (const rule of COMPLEXITY_RULES) {
      if (rule.pattern.test(skillName)) {
        return rule.complexity;
      }
    }
    return 'moderate'; // 默认中等复杂度
  }

  /**
   * 根据 skill 名称路由到合适的 AI provider
   */
  routeProvider(skillName: string): ProviderType {
    const complexity = this.getSkillComplexity(skillName);
    return this.config.routing[complexity];
  }

  /**
   * 检查工具执行环境
   */
  async checkEnvironment(): Promise<ToolEnvironment> {
    const env: ToolEnvironment = {
      agentReachAvailable: false,
      mcporterAvailable: false,
      searchChannels: []
    };

    // 检查 Agent-Reach
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      try {
        await execAsync('agent-reach --version', { timeout: 5000 });
        env.agentReachAvailable = true;
      } catch {
        // not installed
      }

      try {
        await execAsync('mcporter --version', { timeout: 5000 });
        env.mcporterAvailable = true;
      } catch {
        // not installed
      }
    } catch {
      // child_process not available (edge runtime)
    }

    // 基于可用工具确定搜索渠道
    if (env.mcporterAvailable) {
      env.searchChannels.push('exa', 'web');
    }
    env.searchChannels.push('jina', 'gemini-grounding');

    return env;
  }

  /**
   * 获取当前配置
   */
  getConfig(): OpenClawConfig {
    return { ...this.config };
  }

  /**
   * 更新路由配置
   */
  updateRouting(routing: Partial<ModelRoutingConfig>): void {
    Object.assign(this.config.routing, routing);
    console.log('[OpenClaw] Routing updated:', this.config.routing);
  }
}

// 导出单例
export const openClawService = new OpenClawService();
