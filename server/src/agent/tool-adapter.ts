/**
 * Tool Adapter for @codeany/open-agent-sdk
 * 将项目现有的 15 个工具适配为新 SDK 的 defineTool() 格式
 */

import { defineTool } from './open-agent-sdk.js';
import { getToolDefinitions, executeTool, type ToolContext } from '../tools/index.js';

export interface AdapterContext {
  userId?: string;
  projectId?: string;
  sessionId?: string;
}

/**
 * 构建适配新 SDK 的工具数组
 * 通过闭包捕获 userId/projectId 上下文
 */
export function buildAgentTools(ctx: AdapterContext): ReturnType<typeof defineTool>[] {
  const defs = getToolDefinitions();
  const toolCtx: ToolContext = {
    userId: ctx.userId,
    projectId: ctx.projectId
  };

  return defs.map((def) =>
    defineTool({
      name: def.name,
      description: def.description,
      inputSchema: {
        type: 'object' as const,
        properties: (def.input_schema as { properties?: Record<string, unknown> })?.properties || {},
        required: (def.input_schema as { required?: string[] })?.required
      },
      async call(input: Record<string, unknown>): Promise<string> {
        const result = await executeTool(def.name, input, toolCtx);
        if (!result.success) {
          throw new Error(result.error || `Tool ${def.name} execution failed`);
        }
        return typeof result.data === 'string'
          ? result.data
          : JSON.stringify(result.data ?? { success: true });
      }
    })
  );
}
