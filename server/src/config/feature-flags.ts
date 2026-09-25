/**
 * Feature Flags 配置模块
 * 控制新旧 Agent 引擎切换
 */

export type AgentEngine = 'legacy' | 'openagent';

/**
 * 当前 Agent 引擎模式
 * - legacy: 使用原有的 ClaudeAgentService / GeminiAgentService
 * - openagent: 使用 open-agent-sdk 驱动的 OpenAgentService
 *
 * 通过环境变量 AGENT_ENGINE 控制，默认 legacy
 */
export const AGENT_ENGINE: AgentEngine =
  (process.env.AGENT_ENGINE as AgentEngine) || 'legacy';

/**
 * 是否启用 open-agent-sdk 引擎
 */
export function isOpenAgentEnabled(): boolean {
  return AGENT_ENGINE === 'openagent';
}

/**
 * 获取 open-agent-sdk 应使用的 provider 类型
 *
 * 判断逻辑（与 legacy ProviderFactory 对齐）：
 * 1. 如果有 OPENAGENT_PROVIDER 环境变量，直接使用
 * 2. 如果配置了 ANTHROPIC_BASE_URL（第三方中转站），统一走 anthropic provider
 *    — 中转站兼容 Anthropic API 协议，即使模型名是 gpt-5.4 也用 AnthropicProvider
 * 3. 如果有 OPENAI_API_KEY 且模型名包含 gpt/o1/o3，走 openai
 * 4. 如果有 GOOGLE_API_KEY 且模型名包含 gemini，走 google
 * 5. 默认 anthropic
 */
export function getOpenAgentProvider(): 'openai' | 'google' | 'anthropic' {
  // 显式指定
  const explicit = process.env.OPENAGENT_PROVIDER;
  if (explicit === 'openai' || explicit === 'google' || explicit === 'anthropic') {
    return explicit;
  }

  // 有第三方中转站 → 走 Anthropic 协议（中转站负责模型路由）
  const hasThirdPartyProxy = process.env.ANTHROPIC_BASE_URL &&
    (process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY);
  if (hasThirdPartyProxy) {
    return 'anthropic';
  }

  // 根据模型名推断
  const model = (process.env.ANTHROPIC_MODEL || '').toLowerCase();
  if (model.includes('gemini') && process.env.GOOGLE_API_KEY) return 'google';
  if ((model.includes('gpt') || model.includes('o1') || model.includes('o3')) && process.env.OPENAI_API_KEY) return 'openai';

  return 'anthropic';
}
