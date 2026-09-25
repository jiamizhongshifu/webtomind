/**
 * Agent 璇婃柇绔偣
 * 鐢ㄤ簬鎺掓煡 Claude Agent + NotebookLM 鍔熻兘闂
 *
 * 鈿狅笍 瀹夊叏璀﹀憡锛氭绔偣浠呭湪寮€鍙戠幆澧冨惎鐢?
 */

import { Hono } from 'hono';
import Anthropic from '@anthropic-ai/sdk';
import { getNotebookLMConfig } from '../services/notebooklm/config.js';
import { getWorkerClient } from '../services/notebooklm/worker-client.js';
import { getToolDefinitions, executeTool } from '../tools/index.js';

export const debugAgentRoutes = new Hono();

// 鐜妫€鏌ヤ腑闂翠欢 - 浠呭湪寮€鍙戠幆澧冨厑璁歌闂?
debugAgentRoutes.use('*', async (c, next) => {
  const isDev = process.env.NODE_ENV !== 'production';
  const debugSecret = process.env.DEBUG_SECRET;
  const providedSecret = c.req.header('X-Debug-Secret');

  // 鐢熶骇鐜蹇呴』鎻愪緵姝ｇ‘鐨?DEBUG_SECRET
  if (!isDev) {
    if (!debugSecret) {
      return c.json({
        error: '璋冭瘯绔偣鍦ㄧ敓浜х幆澧冨凡绂佺敤',
        hint: 'Set DEBUG_SECRET to enable this endpoint in production'
      }, 403);
    }
    if (providedSecret !== debugSecret) {
      return c.json({
        error: 'unauthorized',
        hint: '璇峰湪璇锋眰澶翠腑鎻愪緵姝ｇ‘鐨?X-Debug-Secret'
      }, 401);
    }
  }

  await next();
});

interface DiagnosticCheck {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  details?: unknown;
}

interface DiagnosticResult {
  timestamp: string;
  checks: DiagnosticCheck[];
  recommendations: string[];
  overallStatus: 'ok' | 'warning' | 'error';
}

/**
 * GET /api/debug/agent
 * 璇婃柇 Agent 閰嶇疆鍜岃繛鎺ョ姸鎬?
 */
debugAgentRoutes.get('/', async (c) => {
  const checks: DiagnosticCheck[] = [];
  const recommendations: string[] = [];

  // 1. 妫€鏌?Claude API 閰嶇疆
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const anthropicToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;

  if (anthropicToken && anthropicBaseUrl) {
    checks.push({
      name: 'Claude API (绗笁鏂逛唬鐞?',
      status: 'ok',
      message: `浣跨敤绗笁鏂逛唬鐞? ${anthropicBaseUrl}`,
      details: {
        baseUrl: anthropicBaseUrl,
      },
    });
  } else if (anthropicKey?.startsWith('sk-ant-')) {
    checks.push({
      name: 'Claude API (鍘熺敓)',
      status: 'ok',
      message: '浣跨敤 Anthropic 鍘熺敓 API',
    });
  } else {
    checks.push({
      name: 'Claude API',
      status: 'error',
      message: '鏈厤缃湁鏁堢殑 Claude API 鍑瘉',
    });
    recommendations.push(
      '璁剧疆 ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL (绗笁鏂逛唬鐞? 鎴?ANTHROPIC_API_KEY (鍘熺敓)'
    );
  }

  // 2. 娴嬭瘯 Claude API 杩炴帴锛堜粎閰嶇疆妫€鏌ワ紝涓嶅疄闄呰皟鐢ㄤ互鑺傜渷璐圭敤锛?
  if (anthropicToken || anthropicKey) {
    checks.push({
      name: 'Claude API 鍑瘉',
      status: 'ok',
      message: '鍑瘉宸查厤缃紝鍙€氳繃 /test-connection 娴嬭瘯瀹為檯杩炴帴',
    });
  }

  // 3. 妫€鏌?NotebookLM 閰嶇疆
  try {
    const nlmConfig = await getNotebookLMConfig();
    checks.push({
      name: 'NotebookLM 閰嶇疆',
      status: 'ok',
      message: `閰嶇疆鏉ユ簮: ${nlmConfig.config_source}`,
      details: {
        workerUrl: nlmConfig.worker_url,
        maxRetries: nlmConfig.max_retries,
        configSource: nlmConfig.config_source,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    checks.push({
      name: 'NotebookLM 閰嶇疆',
      status: 'warning',
      message: `閰嶇疆鍔犺浇澶辫触锛屼娇鐢ㄩ粯璁ゅ€? ${errorMsg}`,
    });
  }

  // 4. 妫€鏌?Python Worker 杩炴帴
  try {
    const workerClient = getWorkerClient();
    const health = await workerClient.healthCheck();

    if (health.status === 'ok' && health.accounts_available > 0) {
      checks.push({
        name: 'Python Worker',
        status: 'ok',
        message: 'Worker healthy: ' + health.accounts_available + ' accounts available',
        details: health,
      });
    } else if (health.status === 'ok') {
      checks.push({
        name: 'Python Worker',
        status: 'warning',
        message: 'Worker is running, but no accounts are available',
        details: health,
      });
      recommendations.push('璇锋坊鍔?NotebookLM Cookie 璐﹀彿');
    } else {
      checks.push({
        name: 'Python Worker',
        status: 'error',
        message: `鏈嶅姟鐘舵€佸紓甯? ${health.status}`,
        details: health,
      });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    checks.push({
      name: 'Python Worker',
      status: 'error',
      message: `鏃犳硶杩炴帴: ${errorMsg}`,
    });
    recommendations.push(
      '璇风‘璁?Python Worker 宸插惎鍔紝骞堕厤缃纭殑 NLM_WORKER_URL'
    );
  }

  // 5. 妫€鏌?Gemini 澶囬€?
  const googleKey = process.env.GOOGLE_API_KEY;
  if (googleKey) {
    checks.push({
      name: 'Gemini API (澶囬€?',
      status: 'ok',
      message: 'Gemini API configured',
    });
  } else {
    checks.push({
      name: 'Gemini API (澶囬€?',
      status: 'warning',
      message: 'Gemini API not configured, fallback unavailable',
    });
  }

  // 6. 妫€鏌ュ伐鍏峰畾涔?
  const toolDefs = getToolDefinitions();
  const notebookLMTools = toolDefs.filter((t) =>
    t.name.startsWith('notebooklm')
  );

  checks.push({
    name: '宸ュ叿瀹氫箟',
    status: 'ok',
    message: `宸叉敞鍐?${toolDefs.length} 涓伐鍏凤紝鍏朵腑 ${notebookLMTools.length} 涓?NotebookLM 宸ュ叿`,
    details: {
      allTools: toolDefs.map((t) => t.name),
      notebookLMTools: notebookLMTools.map((t) => t.name),
    },
  });

  // 璁＄畻鎬讳綋鐘舵€?
  const hasError = checks.some((c) => c.status === 'error');
  const hasWarning = checks.some((c) => c.status === 'warning');

  const result: DiagnosticResult = {
    timestamp: new Date().toISOString(),
    checks,
    recommendations,
    overallStatus: hasError ? 'error' : hasWarning ? 'warning' : 'ok',
  };

  return c.json(result);
});

/**
 * POST /api/debug/agent/test-connection
 * 娴嬭瘯 Claude API 瀹為檯杩炴帴锛堜細娑堣€楀皯閲?token锛?
 */
debugAgentRoutes.post('/test-connection', async (c) => {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const anthropicToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;

  if (!anthropicToken && !anthropicKey) {
    return c.json({ success: false, error: '鏈厤缃?Claude API 鍑瘉' }, 400);
  }

  try {
    const client = new Anthropic({
      apiKey: anthropicToken || anthropicKey,
      baseURL: anthropicBaseUrl,
    });

    // 绠€鍗曟祴璇曡姹?
    const testResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }],
    });

    return c.json({
      success: true,
      message: '杩炴帴鎴愬姛',
      details: {
        model: testResponse.model,
        stopReason: testResponse.stop_reason,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return c.json({
      success: false,
      error: errorMsg,
      recommendation: errorMsg.includes('model')
        ? '绗笁鏂?API 鍙兘涓嶆敮鎸佽妯″瀷锛岃妫€鏌ユ敮鎸佺殑妯″瀷鍒楄〃'
        : 'Please check API credentials and network connectivity',
    }, 500);
  }
});

/**
 * POST /api/debug/agent/test-tools
 * 娴嬭瘯 Claude API Tools 鏀寔
 */
debugAgentRoutes.post('/test-tools', async (c) => {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const anthropicToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;

  if (!anthropicToken && !anthropicKey) {
    return c.json({ success: false, error: '鏈厤缃?Claude API 鍑瘉' }, 400);
  }

  try {
    const client = new Anthropic({
      apiKey: anthropicToken || anthropicKey,
      baseURL: anthropicBaseUrl,
    });

    const toolDefinitions = getToolDefinitions();

    const testResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Check NotebookLM worker status' }],
      tools: toolDefinitions,
    });

    const hasToolUse = testResponse.content.some(
      (block) => block.type === 'tool_use'
    );

    return c.json({
      success: true,
      message: hasToolUse ? 'Tool call works' : 'Response works but no tool call',
      details: {
        toolsCount: toolDefinitions.length,
        responseType: testResponse.content.map((b) => b.type),
        content: testResponse.content,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return c.json({
      success: false,
      error: errorMsg,
      recommendation: errorMsg.includes('tool')
        ? '绗笁鏂?API 鍙兘涓嶆敮鎸?tools 鍙傛暟'
        : '璇锋鏌?API 閰嶇疆',
    }, 500);
  }
});

/**
 * POST /api/debug/agent/test-tool
 * 娴嬭瘯鍗曚釜宸ュ叿鎵ц
 */
debugAgentRoutes.post('/test-tool', async (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json({ error: 'forbidden in production' }, 403);
  }
  const body = await c.req.json();
  const { toolName, params } = body;

  if (!toolName) {
    return c.json({ error: 'toolName is required' }, 400);
  }

  try {
    const result = await executeTool(toolName, params || {}, {
      userId: 'debug-test-user',
    });

    return c.json({
      success: true,
      toolName,
      params,
      result,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return c.json({
      success: false,
      toolName,
      params,
      error: errorMsg,
    }, 500);
  }
});

