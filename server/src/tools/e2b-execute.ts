/**
 * E2B 脚本执行工具
 *
 * 使用 E2B 云端沙箱安全执行 Python/Node.js 脚本
 * 文档: https://e2b.dev/docs
 */

import type { ToolResult } from '../types/api.js';

// ============================================
// 类型定义
// ============================================

interface E2BExecuteParams {
  runtime: 'python' | 'nodejs';
  code: string;
  timeout?: number; // 超时时间（秒），默认 60
  env?: Record<string, string>; // 环境变量
}

interface E2BExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number; // 执行耗时（毫秒）
}

interface E2BSandboxResponse {
  id: string;
  status: 'running' | 'stopped' | 'error';
  result?: {
    stdout: string;
    stderr: string;
    exit_code: number;
  };
}

// ============================================
// 核心函数
// ============================================

/**
 * 获取 E2B API 密钥
 */
function getE2BApiKey(): string | null {
  return process.env.E2B_API_KEY || null;
}

/**
 * 使用 E2B 执行脚本
 */
export async function e2bExecute(params: E2BExecuteParams): Promise<ToolResult> {
  const { runtime, code, timeout = 60, env = {} } = params;

  const apiKey = getE2BApiKey();
  if (!apiKey) {
    return {
      success: false,
      error: '未配置 E2B_API_KEY 环境变量',
    };
  }

  console.log(`[E2BExecute] Executing ${runtime} code, timeout: ${timeout}s`);
  const startTime = Date.now();

  try {
    // 确定模板 ID
    const templateId = runtime === 'python' ? 'python3' : 'nodejs';

    // 1. 创建沙箱
    console.log('[E2BExecute] Creating sandbox...');
    const createResponse = await fetch('https://api.e2b.dev/sandboxes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        template: templateId,
        timeout: timeout * 1000, // 转换为毫秒
        env_vars: env,
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('[E2BExecute] Failed to create sandbox:', errorText);
      return {
        success: false,
        error: `创建沙箱失败: ${createResponse.status} - ${errorText}`,
      };
    }

    const sandbox = await createResponse.json() as E2BSandboxResponse;
    const sandboxId = sandbox.id;
    console.log(`[E2BExecute] Sandbox created: ${sandboxId}`);

    try {
      // 2. 执行代码
      console.log('[E2BExecute] Executing code...');
      const execResponse = await fetch(
        `https://api.e2b.dev/sandboxes/${sandboxId}/exec`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          body: JSON.stringify({
            cmd: runtime === 'python' ? 'python' : 'node',
            args: ['-c', code],
          }),
        }
      );

      if (!execResponse.ok) {
        const errorText = await execResponse.text();
        console.error('[E2BExecute] Execution failed:', errorText);
        return {
          success: false,
          error: `脚本执行失败: ${execResponse.status} - ${errorText}`,
        };
      }

      const execResult = await execResponse.json() as E2BSandboxResponse;
      const executionTime = Date.now() - startTime;

      console.log(`[E2BExecute] Execution completed in ${executionTime}ms`);

      const result: E2BExecutionResult = {
        stdout: execResult.result?.stdout || '',
        stderr: execResult.result?.stderr || '',
        exitCode: execResult.result?.exit_code || 0,
        executionTime,
      };

      return {
        success: result.exitCode === 0,
        data: result,
        error: result.exitCode !== 0 ? result.stderr : undefined,
      };
    } finally {
      // 3. 清理沙箱
      try {
        await fetch(`https://api.e2b.dev/sandboxes/${sandboxId}`, {
          method: 'DELETE',
          headers: {
            'X-API-Key': apiKey,
          },
        });
        console.log(`[E2BExecute] Sandbox ${sandboxId} deleted`);
      } catch (error) {
        console.error('[E2BExecute] Failed to delete sandbox:', error);
      }
    }
  } catch (error) {
    console.error('[E2BExecute] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '脚本执行失败',
    };
  }
}

/**
 * 执行 Python 脚本
 */
export async function executePythonScript(
  code: string,
  timeout?: number,
  env?: Record<string, string>
): Promise<ToolResult> {
  return e2bExecute({ runtime: 'python', code, timeout, env });
}

/**
 * 执行 Node.js 脚本
 */
export async function executeNodeScript(
  code: string,
  timeout?: number,
  env?: Record<string, string>
): Promise<ToolResult> {
  return e2bExecute({ runtime: 'nodejs', code, timeout, env });
}

// ============================================
// 工具定义
// ============================================

export const e2bExecuteDefinition = {
  name: 'e2b_execute',
  description: '在安全的云端沙箱中执行 Python 或 Node.js 脚本。适用于数据处理、API 调用、文件操作等需要脚本支持的场景。',
  input_schema: {
    type: 'object' as const,
    properties: {
      runtime: {
        type: 'string',
        enum: ['python', 'nodejs'],
        description: '运行时环境：python（Python 3）或 nodejs（Node.js）',
      },
      code: {
        type: 'string',
        description: '要执行的代码',
      },
      timeout: {
        type: 'number',
        description: '超时时间（秒），默认 60',
      },
      env: {
        type: 'object',
        description: '环境变量（可选）',
      },
    },
    required: ['runtime', 'code'],
  },
};

export type { E2BExecuteParams, E2BExecutionResult };
