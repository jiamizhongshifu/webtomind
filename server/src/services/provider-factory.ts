/**
 * AI 提供商工厂
 * 统一管理不同 AI 服务的创建和切换
 */

import type { IAgentService } from '../types/api.js';
import { claudeAgent } from './claude-agent.js';
import { geminiAgent } from './gemini-agent.js';
import { openaiAgent } from './openai-agent.js';
import { isOpenAgentEnabled } from '../config/feature-flags.js';
import { openAgentService } from './open-agent-service.js';

export type ProviderType = 'claude' | 'gemini' | 'openai' | 'auto';

/**
 * PPT 请求检测关键词
 */
const PPT_KEYWORDS = [
  'ppt',
  'PPT',
  '幻灯片',
  '演示文稿',
  'slide',
  'slides',
  'presentation',
  '做个演示',
  '生成ppt',
  '生成PPT',
  '创建ppt',
  '创建PPT',
  '制作ppt',
  '制作PPT'
];

/**
 * AI 提供商工厂
 */
export class ProviderFactory {
  private providers: Map<string, IAgentService> = new Map();
  private defaultProvider: ProviderType = 'openai';

  constructor() {
    // 注册提供商
    if (isOpenAgentEnabled()) {
      // open-agent-sdk 模式：统一使用 OpenAgentService
      console.log('[ProviderFactory] AGENT_ENGINE=openagent — using open-agent-sdk');
      this.providers.set('claude', openAgentService);
      this.providers.set('gemini', openAgentService);
      this.providers.set('openai', openAgentService);
    } else {
      // legacy 模式：使用各自的原生 SDK
      this.providers.set('claude', claudeAgent);
      this.providers.set('gemini', geminiAgent);
      this.providers.set('openai', openaiAgent);
    }
  }

  /**
   * 检测是否是 PPT 请求
   */
  private isPPTRequest(prompt: string): boolean {
    const lowerPrompt = prompt.toLowerCase();
    return PPT_KEYWORDS.some((keyword) =>
      lowerPrompt.includes(keyword.toLowerCase())
    );
  }

  private isLikelyClaudeModel(model?: string): boolean {
    if (!model) {
      return true;
    }

    return model.toLowerCase().includes('claude');
  }

  /**
   * 获取指定提供商
   * @param type 提供商类型
   * @param prompt 用户输入，用于检测是否需要强制使用特定提供商
   */
  getProvider(type: ProviderType = 'auto', prompt?: string): IAgentService {
    // PPT 请求：openagent 模式下由 OpenAgentService 统一处理（GLM-5 支持 function calling）；
    // legacy 模式下仍强制使用 Gemini（需要 FunctionCallingMode.ANY）
    if (prompt && this.isPPTRequest(prompt)) {
      if (isOpenAgentEnabled()) {
        console.log(
          '[ProviderFactory] PPT request detected, using OpenAgentService (function calling supported)'
        );
        return openAgentService;
      }
      console.log(
        '[ProviderFactory] PPT request detected, forcing Gemini for tool calling'
      );
      return geminiAgent;
    }

    if (type === 'auto') {
      return this.getAutoProvider();
    }

    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`Unknown provider: ${type}`);
    }
    return provider;
  }

  /**
   * 自动选择可用的提供商
   */
  private getAutoProvider(): IAgentService {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const anthropicToken = process.env.ANTHROPIC_AUTH_TOKEN;
    const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
    const anthropicModel = process.env.ANTHROPIC_MODEL;
    const googleKey = process.env.GOOGLE_API_KEY;
    const deepseekKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;

    if (deepseekKey) {
      console.log('[ProviderFactory] Using DeepSeek Agent');
      return openaiAgent;
    }

    // 检查是否配置了第三方 Claude 代理（有 BASE_URL 和 AUTH_TOKEN）
    const hasThirdPartyProxy = anthropicBaseUrl && anthropicToken;

    // 检查原生 Claude API Key 是否有效（以 sk-ant- 开头）
    const isValidNativeKey = anthropicKey && anthropicKey.startsWith('sk-ant-');
    const hasClaudeCredentials = hasThirdPartyProxy || isValidNativeKey;
    const canUseClaude =
      hasClaudeCredentials && this.isLikelyClaudeModel(anthropicModel);

    // 优先使用 Claude（原生或第三方代理），但需要模型名与 Claude 兼容
    if (canUseClaude) {
      console.log(
        '[ProviderFactory] Using Claude Agent' +
          (hasThirdPartyProxy ? ' (via third-party proxy)' : '')
      );
      return claudeAgent;
    }

    // 回退到 Gemini
    if (googleKey) {
      if (hasClaudeCredentials && !this.isLikelyClaudeModel(anthropicModel)) {
        console.warn(
          `[ProviderFactory] Skip Claude auto selection because ANTHROPIC_MODEL is not Claude-compatible: ${anthropicModel}`
        );
      }
      console.log('[ProviderFactory] Using Gemini as default');
      return geminiAgent;
    }

    throw new Error(
      'No AI provider available. Please set DEEPSEEK_API_KEY, or configure Anthropic/Gemini credentials'
    );
  }

  /**
   * 获取所有可用的提供商
   */
  async getAvailableProviders(): Promise<
    Array<{ name: string; type: string; available: boolean }>
  > {
    const result = [];

    for (const [type, provider] of this.providers) {
      result.push({
        name: provider.getName(),
        type,
        available: await provider.isAvailable()
      });
    }

    return result;
  }

  /**
   * 设置默认提供商
   */
  setDefaultProvider(type: ProviderType): void {
    this.defaultProvider = type;
  }
}

// 导出单例
export const providerFactory = new ProviderFactory();
