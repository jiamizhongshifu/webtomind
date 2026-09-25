import {
  createAgent as createSdkAgent,
  defineTool as defineSdkTool
} from '@codeany/open-agent-sdk';

export interface OpenAgentToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  call(input: Record<string, unknown>): Promise<string>;
}

export interface OpenAgentInstance {
  query(prompt: string): AsyncIterable<unknown>;
  close(): Promise<void>;
}

export interface OpenAgentCreateConfig {
  model: string;
  apiKey: string;
  baseURL?: string;
  /** 兼容层透传：默认由 SDK 按模型名自动识别（deepseek 等 → openai-completions） */
  apiType?: 'openai-completions' | 'anthropic-messages';
  /** 兼容层透传：是否持久化会话到磁盘（Cloudflare Worker 无持久磁盘，应设为 false） */
  persistSession?: boolean;
  tools: OpenAgentToolDefinition[];
  maxTurns: number;
  systemPrompt: string;
}

export const defineTool = defineSdkTool as <T extends OpenAgentToolDefinition>(
  tool: T
) => T;
export const createAgent = createSdkAgent as unknown as (
  config: OpenAgentCreateConfig
) => OpenAgentInstance;
