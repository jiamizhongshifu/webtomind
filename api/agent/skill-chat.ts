/**
 * DeepSeek Agent Skill Chat API
 * 使用 DeepSeek + Skills 系统处理用户请求
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_TEXT_AGENT_MODEL } from '../utils/model-registry';
import { getRuntimeStore } from '../../server/src/skills/runtime-store.js';
import type {
  PromptBuildRuntimeEventPayload,
  ResolutionRuntimeEventPayload,
  SkillRun,
  SkillRunStep,
  ToolRuntimeEventPayload
} from '../../server/src/skills/runtime-types.js';
import type { ToolBus } from '../../server/src/skills/tool-bus.js';
import type {
  ToolDefinition as ServerToolDefinition,
  ToolExecutor
} from '../../server/src/skills/tool-executor.js';

// CORS - 动态获取允许的域名
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  'https://webtomind.com,https://www.webtomind.com'
)
  .split(',')
  .map((s) => s.trim());

function getCorsOrigin(origin: string | undefined): string {
  if (!origin) return ALLOWED_ORIGINS[0] || 'https://webtomind.com';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (
    process.env.NODE_ENV !== 'production' &&
    (origin.includes('localhost') || origin.includes('127.0.0.1'))
  ) {
    return origin;
  }
  return ALLOWED_ORIGINS[0] || 'https://webtomind.com';
}

function getCorsHeadersForNodeRequest(
  origin: string | undefined
): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(origin),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-ID',
    'Access-Control-Allow-Credentials': 'true'
  };
}

export const config = {
  // Keep this route on the legacy Node runtime until the skills runtime is split:
  // it uses the Anthropic SDK, dynamic imports from server/dist, and the
  // in-memory skill run store/tool bus that currently expose a Vercel-style
  // req/res SSE handler rather than a Fetch-native Worker handler.
  runtime: 'nodejs',
  maxDuration: 120
};

const MODEL = DEFAULT_TEXT_AGENT_MODEL;
const MAX_TOKENS = 8192;

// 积分消耗配置
const CREDIT_COSTS = {
  skill_chat: 1, // 基础对话消耗
  execute_script: 2, // 脚本执行消耗
  notebooklm_process: 5, // NotebookLM 处理消耗
  slide_deck_generate: 3 // PPT 生成消耗
};

interface ChatRequestBody {
  prompt: string;
  skillId?: string;
  skillHint?: {
    id: string;
    name: string;
    source?: 'user' | 'system' | 'market';
    explicit?: boolean;
    matchedTriggers?: string[];
  };
  context?: ContextInfo;
  sessionId?: string;
  projectId?: string; // 当前项目 ID（用于卡片工具的项目隔离）
}

type UserSkillData = {
  id: string;
  source?: 'user' | 'system' | 'market';
  name?: string;
  displayName: string;
  icon?: string;
  associatedTools?: string[];
  coreInstructions?: string;
  [key: string]: unknown;
};

type ToolDefinition = ServerToolDefinition;

type ToolCall = {
  name: string;
  input: Record<string, unknown>;
};

type ContextInfo = {
  references?: string;
  pageInfo?: { url: string; title: string };
  history?: string;
  referenceImages?: Array<{ data: string; mimeType: string }>;
  [key: string]: unknown;
};

type SkillModuleBundle = {
  createEnhancedSkillManager: () => {
    loadUserSkills: (userId: string) => Promise<void>;
    getSkillById: (skillId: string) => UserSkillData | undefined;
    matchSkillsData: (prompt: string) => UserSkillData[];
  };
  resolveSkillSelection: (params: {
    prompt: string;
    explicitSkillId?: string;
    skillManager: {
      getSkillById: (skillId: string) => UserSkillData | undefined;
      matchSkillsData: (prompt: string) => UserSkillData[];
    };
  }) => {
    explicitSkillId?: string;
    selectedPrimarySkillId?: string;
    selectedSkills: Array<{
      id: string;
      name: string;
      displayName: string;
      source: 'user' | 'system' | 'market';
      associatedTools: string[];
      coreInstructions?: string;
      explicit: boolean;
    }>;
    candidates: Array<{
      id: string;
      name: string;
      displayName: string;
      source: 'user' | 'system' | 'market';
      associatedTools: string[];
      coreInstructions?: string;
      explicit: boolean;
    }>;
  };
  createToolExecutor: (
    userId: string,
    sendEvent: (event: string, data: unknown) => void,
    options?: Record<string, unknown>,
    projectId?: string
  ) => ToolExecutor;
  createToolBus: (executor: ToolExecutor) => ToolBus;
  createPromptBuilder: () => {
    buildSystemPromptWithSkills: (
      skills: UserSkillData[],
      context?: ContextInfo,
      layer3Metadata?: Map<string, unknown>,
      resolutionContext?: {
        explicitSkillId?: string;
        selectedToolNames?: string[];
        localHint?: ChatRequestBody['skillHint'] | null;
      }
    ) => string;
  };
};

let skillModulesPromise: Promise<SkillModuleBundle> | null = null;

async function loadSkillModules(): Promise<SkillModuleBundle> {
  if (!skillModulesPromise) {
    const enhancedUrl = new URL(
      '../../server/dist/src/skills/enhanced-skill-manager.js',
      import.meta.url
    );
    const resolverUrl = new URL(
      '../../server/dist/src/skills/resolver.js',
      import.meta.url
    );
    const toolExecutorUrl = new URL(
      '../../server/dist/src/skills/tool-executor.js',
      import.meta.url
    );
    const toolBusUrl = new URL(
      '../../server/dist/src/skills/tool-bus.js',
      import.meta.url
    );
    const promptBuilderUrl = new URL(
      '../../server/dist/src/skills/prompt-builder.js',
      import.meta.url
    );

    skillModulesPromise = Promise.all([
      import(enhancedUrl.href),
      import(resolverUrl.href),
      import(toolExecutorUrl.href),
      import(toolBusUrl.href),
      import(promptBuilderUrl.href)
    ]).then(([enhanced, resolver, toolExecutor, toolBus, promptBuilder]) => ({
      createEnhancedSkillManager:
        enhanced.createEnhancedSkillManager as SkillModuleBundle['createEnhancedSkillManager'],
      resolveSkillSelection:
        resolver.resolveSkillSelection as SkillModuleBundle['resolveSkillSelection'],
      createToolExecutor:
        toolExecutor.createToolExecutor as SkillModuleBundle['createToolExecutor'],
      createToolBus:
        toolBus.createToolBus as SkillModuleBundle['createToolBus'],
      createPromptBuilder:
        promptBuilder.createPromptBuilder as SkillModuleBundle['createPromptBuilder']
    }));
  }
  return skillModulesPromise;
}

type AnthropicCompatibleMessage = Anthropic.MessageParam;

function mapResolutionToPromptSkills(
  skills: Array<{
    id: string;
    source: 'user' | 'system' | 'market';
    name: string;
    displayName: string;
    associatedTools: string[];
    coreInstructions?: string;
  }>
): UserSkillData[] {
  return skills.map((skill) => ({
    id: skill.id,
    source: skill.source,
    name: skill.name,
    displayName: skill.displayName,
    associatedTools: skill.associatedTools,
    coreInstructions: skill.coreInstructions,
    icon: '🔧'
  }));
}

let supabase: SupabaseClient | null = null;
let supabaseAuth: SupabaseClient | null = null;
let deepseekAnthropicClient: Anthropic | null = null;

function getSupabase(): SupabaseClient | null {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    supabase = createClient(url, key);
  }
  return supabase;
}

function getSupabaseAuth(): SupabaseClient | null {
  if (!supabaseAuth) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    supabaseAuth = createClient(url, key);
  }
  return supabaseAuth;
}

function getDeepSeekAnthropicClient(): Anthropic | null {
  if (!deepseekAnthropicClient) {
    const apiKey =
      process.env.DEEPSEEK_API_KEY ||
      process.env.ANTHROPIC_AUTH_TOKEN ||
      process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    const rawBaseURL =
      process.env.DEEPSEEK_ANTHROPIC_BASE_URL ||
      process.env.ANTHROPIC_BASE_URL ||
      `${(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')}/anthropic`;
    const baseURL = rawBaseURL.replace(/\/+$/, '').replace(/\/v1$/, '');
    const config: { apiKey: string; baseURL?: string } = { apiKey };
    if (baseURL) {
      config.baseURL = baseURL;
    }
    deepseekAnthropicClient = new Anthropic(config);
  }
  return deepseekAnthropicClient;
}

/**
 * 检查用户积分余额
 */
async function checkUserCredits(
  userId: string
): Promise<{ hasCredits: boolean; balance: number; error?: string }> {
  const sb = getSupabase();
  if (!sb) {
    console.error('[SkillChat] Supabase not available for credit check');
    return { hasCredits: false, balance: 0, error: 'SERVICE_UNAVAILABLE' };
  }

  try {
    const { data, error } = await sb
      .from('user_credits')
      .select('balance')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      // 新用户或查询失败，给予默认额度
      return { hasCredits: true, balance: 10 };
    }

    return { hasCredits: data.balance > 0, balance: data.balance };
  } catch (err) {
    console.error('[SkillChat] Credit check failed:', err);
    return { hasCredits: false, balance: 0, error: 'CHECK_FAILED' };
  }
}

/**
 * 消耗用户积分
 */
async function consumeCredits(
  userId: string,
  amount: number,
  reason: string
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return true;

  try {
    // 使用 RPC 函数安全地扣减积分
    const { error } = await sb.rpc('consume_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_reason: reason
    });

    return !error;
  } catch {
    return true; // 失败时不阻塞用户
  }
}

/**
 * 原子递增技能使用计数 (使用 RPC 函数)
 */
async function incrementSkillUseCount(skillId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb || skillId.startsWith('builtin-')) return;

  try {
    // 使用 RPC 函数进行原子递增
    const { error } = await sb.rpc('increment_skill_use_count', {
      p_skill_id: skillId
    });

    if (error) {
      console.error('[SkillChat] Failed to increment use count:', error);
    }
  } catch (error) {
    console.error('[SkillChat] Failed to increment use count:', error);
  }
}

/**
 * 调用 DeepSeek Anthropic-compatible API
 */
async function callDeepSeekAnthropicAPI(
  systemPrompt: string,
  messages: AnthropicCompatibleMessage[],
  tools: ToolDefinition[],
  options?: { forceToolUse?: boolean }
): Promise<Anthropic.Message> {
  const client = getDeepSeekAnthropicClient();
  if (!client) {
    throw new Error('DeepSeek API 未配置');
  }

  const toolChoice = options?.forceToolUse
    ? { type: 'any' as const }
    : undefined;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: messages as Anthropic.MessageParam[],
      tools: tools as Anthropic.Tool[],
      tool_choice: toolChoice
    });

    return response as Anthropic.Message;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`DeepSeek API error: ${message}`);
  }
}

function extractToolCallsFromInstructions(instructions?: string): ToolCall[] {
  if (!instructions) return [];

  const matches = instructions.match(/```json([\s\S]*?)```/g) || [];
  const toolCalls: ToolCall[] = [];

  const extractJsonObjects = (input: string): string[] => {
    const objects: string[] = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < input.length; i += 1) {
      const char = input[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        if (inString) {
          escapeNext = true;
        }
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '{') {
        if (depth === 0) {
          start = i;
        }
        depth += 1;
        continue;
      }

      if (char === '}') {
        if (depth > 0) {
          depth -= 1;
          if (depth === 0 && start >= 0) {
            objects.push(input.slice(start, i + 1));
            start = -1;
          }
        }
      }
    }

    return objects;
  };

  for (const block of matches) {
    const raw = block
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    const cleaned = raw
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
      .trim();

    if (!cleaned) continue;

    const jsonObjects = extractJsonObjects(cleaned);
    for (const jsonObject of jsonObjects) {
      try {
        const parsed = JSON.parse(jsonObject) as {
          name?: string;
          input?: unknown;
        };
        if (parsed.name && typeof parsed.input === 'object' && parsed.input) {
          toolCalls.push({
            name: parsed.name,
            input: parsed.input as Record<string, unknown>
          });
        }
      } catch {
        continue;
      }
    }
  }

  return toolCalls;
}

async function synthesizeWithDeepSeek(
  prompt: string,
  instructions: string,
  toolResults: Array<{ name: string; input: unknown; result: unknown }>
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('DeepSeek API 未配置');
  }

  const baseUrl = (
    process.env.DEEPSEEK_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://api.deepseek.com'
  ).replace(/\/+$/, '');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: 'system',
          content: '你是选题决策中心执行器。请严格按技能说明输出结果，不要解释工具可用性或限制。'
        },
        {
          role: 'user',
          content: `用户请求: ${prompt}\n\n技能说明:\n${instructions}\n\n工具执行结果(JSON):\n${JSON.stringify(toolResults)}\n\n请直接输出最终结果。`
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content || '';
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeFallbackCall(call: ToolCall): ToolCall {
  if (call.name === 'grok_x_search') {
    const input = { ...call.input } as Record<string, unknown>;
    if (!input.fromDate || !input.toDate) {
      const now = new Date();
      const from = new Date(now);
      from.setDate(now.getDate() - 7);
      if (!input.fromDate) input.fromDate = formatDate(from);
      if (!input.toDate) input.toDate = formatDate(now);
    }
    return { ...call, input };
  }

  if (call.name === 'web_search') {
    const input = { ...call.input } as Record<string, unknown>;
    const query = String(input.query || '').trim();
    if (query && !/最新|最近|today|this week|this month|202\d/.test(query)) {
      input.query = `${query} 最新`;
    }
    return { ...call, input };
  }

  return call;
}

function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

async function verifyTokenAndGetUserId(token: string): Promise<string | null> {
  if (!token) return null;
  const sb = getSupabaseAuth();
  if (!sb) return null;
  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

export default async function handler(
  req: {
    method?: string;
    headers: { authorization?: string; origin?: string };
    body: ChatRequestBody;
  },
  res: {
    setHeader: (name: string, value: string) => void;
    status: (code: number) => {
      json: (data: unknown) => void;
      end: () => void;
    };
    write: (data: string) => void;
    end: () => void;
  }
) {
  // CORS - 动态获取
  const corsHeaders = getCorsHeadersForNodeRequest(req.headers.origin);
  for (const [key, value] of Object.entries(corsHeaders)) {
    res.setHeader(key, value);
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 检查 DeepSeek API 配置
  const apiKey =
    process.env.DEEPSEEK_API_KEY ||
    process.env.ANTHROPIC_AUTH_TOKEN ||
    process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'DeepSeek API 未配置' });
  }

  // 验证用户
  const token = extractBearerToken(req.headers.authorization);
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) {
    return res.status(401).json({ error: '请先登录' });
  }

  // 检查用户积分
  const { hasCredits } = await checkUserCredits(userId);
  if (!hasCredits) {
    return res
      .status(402)
      .json({ error: '积分不足，请充值后继续使用', balance: 0 });
  }

  // 解析请求
  const body = req.body as ChatRequestBody;
  const { prompt, skillId, skillHint, context, projectId, sessionId } = body;

  if (!prompt) {
    return res.status(400).json({ error: '缺少 prompt' });
  }

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const runtimeStore = getRuntimeStore();
  const traceId = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  let currentRun: SkillRun | null = null;
  let currentStep: SkillRunStep | null = null;

  const startStep = (
    kind: SkillRunStep['kind'],
    title: string,
    payload?: unknown,
    toolName?: string,
    status?: SkillRunStep['status']
  ) => {
    if (!currentRun) return null;
    const step = runtimeStore.createStep({
      runId: currentRun.id,
      kind,
      title,
      payload,
      toolName,
      status
    });
    sendEvent('step_started', {
      runId: currentRun.id,
      stepId: step.id,
      kind: step.kind,
      title: step.title,
      status: step.status,
      toolName: step.toolName,
      payload: step.payload
    });
    currentStep = step;
    return step;
  };

  const completeStep = (step: SkillRunStep | null, payload?: unknown) => {
    if (!step) return;
    const updated = runtimeStore.completeStep(step.id, payload);
    if (!updated || !currentRun) return;
    sendEvent('step_completed', {
      runId: currentRun.id,
      stepId: updated.id,
      kind: updated.kind,
      title: updated.title,
      status: updated.status,
      toolName: updated.toolName,
      payload: updated.payload
    });
  };

  const failStep = (
    step: SkillRunStep | null,
    errorMessage: string,
    payload?: unknown
  ) => {
    if (!step) return;
    const updated = runtimeStore.failStep(step.id, errorMessage, payload);
    if (!updated || !currentRun) return;
    sendEvent('step_completed', {
      runId: currentRun.id,
      stepId: updated.id,
      kind: updated.kind,
      title: updated.title,
      status: updated.status,
      toolName: updated.toolName,
      payload: updated.payload,
      errorMessage: updated.errorMessage
    });
  };

  try {
    currentRun = runtimeStore.createRun({
      userId,
      skillId,
      mode: 'sync',
      traceId
    });
    sendEvent('run_started', {
      runId: currentRun.id,
      skillId,
      traceId,
      mode: currentRun.mode,
      status: currentRun.status
    });

    const resolutionStep = startStep('resolution', '解析技能与上下文', {
      requestedSkillId: skillId,
      hasContext: Boolean(context)
    });

    const {
      createEnhancedSkillManager,
      resolveSkillSelection,
      createToolExecutor,
      createToolBus,
      createPromptBuilder
    } = await loadSkillModules();

    // 创建增强型技能管理器并加载用户技能
    const skillManager = createEnhancedSkillManager();
    await skillManager.loadUserSkills(userId);

    // 服务端统一 resolver
    const resolution = resolveSkillSelection({
      prompt,
      explicitSkillId: skillId,
      skillManager
    });
    const promptSkills = mapResolutionToPromptSkills(resolution.selectedSkills);
    const resolvedToolNames = Array.from(
      new Set(
        resolution.selectedSkills.flatMap((skill) => skill.associatedTools || [])
      )
    );
    const primaryResolvedSkill = resolution.selectedSkills[0];

    sendEvent('resolver_result', {
      explicitSkillId: resolution.explicitSkillId,
      selectedPrimarySkillId: resolution.selectedPrimarySkillId,
      localHint: skillHint || null,
      matchedSkills: resolution.candidates.map((skill) => ({
        id: skill.id,
        name: skill.displayName,
        source: skill.source,
        associatedTools: skill.associatedTools || []
      }))
    });

    // 发送激活的 Skills 信息
    if (promptSkills.length > 0) {
      sendEvent('skills', {
        skills: promptSkills.map((s) => ({
          id: s.id,
          name: s.displayName,
          icon: s.icon
        }))
      });
    }

    const resolutionPayload: ResolutionRuntimeEventPayload = {
      eventType: 'resolution',
      explicitSkillId: resolution.explicitSkillId,
      selectedSkillIds: resolution.selectedSkills.map((s) => s.id),
      selectedSkillNames: resolution.selectedSkills.map((s) => s.displayName),
      selectedPrimarySkillId: resolution.selectedPrimarySkillId,
      candidateCount: resolution.candidates.length,
      selectedToolNames: resolvedToolNames,
      resolutionContext: {
        explicitSkillId: resolution.explicitSkillId,
        selectedToolNames: resolvedToolNames,
        localHint: skillHint || null
      }
    };

    completeStep(resolutionStep, resolutionPayload);

    sendEvent('status', { status: 'analyzing', message: '正在分析请求...' });

    // 创建工具执行器（传递 projectId 用于卡片工具的项目隔离）
    const toolExecutor = createToolExecutor(userId, sendEvent, {}, projectId);
    const toolBus = createToolBus(toolExecutor);
    const toolDefinitions = toolExecutor.getToolDefinitions();
    const shouldForceToolUse = resolvedToolNames.length > 0;
    const activeInstructions = promptSkills
      .map((skill) => String(skill.coreInstructions || ''))
      .filter(Boolean)
      .join('\n\n');
    console.log(
      '[SkillChat] Active instructions length:',
      activeInstructions.length
    );
    if (shouldForceToolUse) {
      console.log(
        '[SkillChat] Forcing tool use. Tools:',
        toolDefinitions.map((tool) => tool.name)
      );
    }

    const promptBuildStep = startStep('prompt_build', '构建系统提示');

    // 使用 PromptBuilder 构建系统提示
    const promptBuilder = createPromptBuilder();
    const systemPrompt = promptBuilder.buildSystemPromptWithSkills(
      promptSkills,
      context,
      undefined,
      {
        explicitSkillId: resolution.explicitSkillId,
        selectedToolNames: resolvedToolNames,
        localHint: skillHint || null
      }
    );
    const promptPayload: PromptBuildRuntimeEventPayload = {
      eventType: 'prompt_build',
      activeSkillCount: promptSkills.length,
      systemPromptLength: systemPrompt.length,
      selectedToolNames: resolvedToolNames,
      explicitSkillId: resolution.explicitSkillId
    };
    completeStep(promptBuildStep, promptPayload);

    // Agent 循环
    const messages: AnthropicCompatibleMessage[] = [{ role: 'user', content: prompt }];
    let continueLoop = true;
    let loopCount = 0;
    const maxLoops = 10;

    while (continueLoop && loopCount < maxLoops) {
      loopCount++;

      const modelInvokeStep = startStep('model_invoke', `调用模型（第 ${loopCount} 轮）`, {
        loopCount,
        toolCount: toolDefinitions.length,
        forceToolUse: shouldForceToolUse
      });

      const response = await callDeepSeekAnthropicAPI(
        systemPrompt,
        messages,
        toolDefinitions,
        {
          forceToolUse: shouldForceToolUse
        }
      );
      completeStep(modelInvokeStep, {
        stopReason: response.stop_reason,
        blockCount: response.content.length
      });

      let hasToolUse = false;
      const toolResults: Array<{
        type: 'tool_result';
        tool_use_id: string;
        content: string;
      }> = [];

      for (const block of response.content) {
        if (block.type === 'text' && block.text) {
          sendEvent('text', { content: block.text });
        } else if (block.type === 'tool_use' && block.id && block.name) {
          hasToolUse = true;

          const toolCallStep = startStep('tool_call', `执行工具 ${block.name}`, block.input, block.name);

          sendEvent('tool_call', {
            id: block.id,
            name: block.name,
            input: block.input,
            runId: currentRun?.id,
            stepId: toolCallStep?.id,
            status: 'pending'
          });
          sendEvent('status', {
            status: 'executing',
            message: `正在执行 ${block.name}...`
          });

          // 检查是否需要额外消耗积分
          const toolName = block.name;
          if (toolName in CREDIT_COSTS && toolName !== 'skill_chat') {
            await consumeCredits(
              userId,
              CREDIT_COSTS[toolName as keyof typeof CREDIT_COSTS],
              toolName
            );
          }

          const allowedTools = resolvedToolNames;
          const envelope = await toolBus.execute(
            block.name,
            block.input as Record<string, unknown>,
            {
              userId,
              sessionId,
              toolCallId: block.id,
              runId: currentRun?.id,
              skillName: primaryResolvedSkill?.displayName,
              resolutionContext: {
                explicitSkillId: resolution.explicitSkillId,
                resolvedSkillNames: resolution.selectedSkills.map((skill) => skill.displayName),
                selectedToolNames: resolvedToolNames,
                localHintName: skillHint?.name
              },
              allowedTools,
              onConfirmationRequired: ({ toolName, toolCallId, runId }) => {
                sendEvent('tool_call', {
                  id: toolCallId,
                  name: toolName,
                  input: block.input,
                  runId,
                  stepId: toolCallStep?.id,
                  status: 'pending_confirmation'
                });
              }
            }
          );
          const result = {
            success: envelope.success,
            data: envelope.result,
            error: envelope.error
          };

          if (envelope.status === 'blocked') {
            failStep(toolCallStep, envelope.error || 'Tool blocked', {
              confirmationState: envelope.confirmationState,
              auditTrail: envelope.auditTrail
            });
          }

          if (
            block.name === 'notebooklm_process' &&
            result.success &&
            result.data &&
            typeof result.data === 'object' &&
            'taskId' in (result.data as Record<string, unknown>)
          ) {
            const notebookTaskId = String(
              (result.data as Record<string, unknown>).taskId || ''
            );
            if (currentRun && notebookTaskId) {
              runtimeStore.updateRunStatus(currentRun.id, 'waiting_async');
              sendEvent('run_waiting_async', {
                runId: currentRun.id,
                status: 'waiting_async',
                message: 'NotebookLM 任务已提交，正在后台处理中。',
                taskId: notebookTaskId
              });
            }
          }

          const toolPayload: ToolRuntimeEventPayload = {
            eventType: 'tool',
            success: result.success,
            result: result.data,
            error: result.error,
            confirmationState: envelope.confirmationState,
            policyReason: envelope.policyReason,
            policySource: envelope.policySource,
            auditTrail: envelope.auditTrail,
            resolutionContext: {
              explicitSkillId: resolution.explicitSkillId,
              selectedToolNames: resolvedToolNames,
              localHintName: skillHint?.name,
              resolvedSkillNames: resolution.selectedSkills.map((skill) => skill.displayName)
            }
          };

          completeStep(toolCallStep, toolPayload);

          sendEvent('tool_result', {
            id: block.id,
            name: block.name,
            result: result.data,
            success: result.success,
            runId: currentRun?.id,
            stepId: toolCallStep?.id,
            errorMessage: result.error,
            statusDetail: envelope.status,
            cancelled: envelope.status === 'blocked',
            policyReason: envelope.policyReason,
            policySource: envelope.policySource,
            requiresConfirmation: envelope.requiresConfirmation,
            confirmationState: envelope.confirmationState,
            auditTrail: envelope.auditTrail
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result)
          });
        }
      }

      if (shouldForceToolUse && !hasToolUse) {
        console.error(
          '[SkillChat] Tool use required but no tool_use returned. stop_reason:',
          response.stop_reason
        );

        const fallbackCalls =
          extractToolCallsFromInstructions(activeInstructions);
        console.log(
          '[SkillChat] Fallback tool calls extracted:',
          fallbackCalls.length
        );
        const isTopicDecision = resolution.selectedSkills.some(
          (skill) =>
            skill.name === 'topic_decision' ||
            skill.displayName?.includes('选题')
        );

        const effectiveFallbackCalls =
          fallbackCalls.length > 0
            ? fallbackCalls
            : isTopicDecision
              ? [
                  {
                    name: 'grok_x_search',
                    input: {
                      query:
                        'AI tools LLM Claude GPT Cursor coding assistant trending',
                      category: 'ai',
                      maxResults: 10
                    }
                  },
                  {
                    name: 'grok_x_search',
                    input: {
                      query:
                        'side hustle indie hacker solopreneur making money online',
                      category: 'money',
                      maxResults: 10
                    }
                  },
                  {
                    name: 'web_search',
                    input: { query: 'AI工具 最新 热点 2025', maxResults: 5 }
                  },
                  {
                    name: 'web_search',
                    input: {
                      query: '产品设计 效率工具 趋势 2025',
                      maxResults: 5
                    }
                  },
                  {
                    name: 'web_search',
                    input: {
                      query: '副业 自媒体 变现 方法 2025',
                      maxResults: 5
                    }
                  }
                ]
              : [];

        if (effectiveFallbackCalls.length === 0) {
          if (currentRun) {
            runtimeStore.updateRunStatus(currentRun.id, 'failed', '缺少工具调用');
            sendEvent('run_failed', {
              runId: currentRun.id,
              status: 'failed',
              errorMessage: '上游 DeepSeek 未返回工具调用结果，且无法从技能说明提取工具调用。'
            });
          }
          sendEvent('error', {
            message:
              '上游 DeepSeek 未返回工具调用结果，且无法从技能说明提取工具调用。请检查代理能力或技能配置。'
          });
          sendEvent('done', {});
          res.end();
          return;
        }

        const asyncStep = startStep('async_handoff', '执行降级工具流程', {
          fallbackToolCount: effectiveFallbackCalls.length
        });

        sendEvent('status', {
          status: 'executing',
          message: '正在执行工具（降级模式）...'
        });

        const fallbackResults = await Promise.all(
          effectiveFallbackCalls.map(async (call) => {
            const normalized = normalizeFallbackCall(call);
            const envelope = await toolBus.execute(
              normalized.name,
              normalized.input,
              {
                userId,
                sessionId,
                toolCallId: `${normalized.name}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                runId: currentRun?.id,
                skillName: primaryResolvedSkill?.displayName,
                resolutionContext: {
                  explicitSkillId: resolution.explicitSkillId,
                  resolvedSkillNames: resolution.selectedSkills.map((skill) => skill.displayName),
                  selectedToolNames: resolvedToolNames,
                  localHintName: skillHint?.name
                },
                allowedTools: resolvedToolNames
              }
            );
            const result = {
              success: envelope.success,
              data: envelope.result,
              error: envelope.error
            };
            return {
              name: normalized.name,
              input: normalized.input,
              result
            };
          })
        );

        const synthesized = await synthesizeWithDeepSeek(
          prompt,
          activeInstructions,
          fallbackResults
        );

        if (synthesized) {
          const artifact = currentRun
            ? runtimeStore.createArtifact({
                runId: currentRun.id,
                stepId: asyncStep?.id,
                type: 'text',
                title: '降级模式生成结果',
                preview: synthesized.slice(0, 200),
                data: { content: synthesized }
              })
            : null;
          if (artifact && currentRun) {
            sendEvent('artifact_created', {
              runId: currentRun.id,
              artifactId: artifact.id,
              type: artifact.type,
              title: artifact.title,
              preview: artifact.preview
            });
          }
          sendEvent('text', { content: synthesized });
        }
        completeStep(asyncStep, {
          synthesized: Boolean(synthesized),
          toolCount: fallbackResults.length
        });
        if (currentRun) {
          runtimeStore.updateRunStatus(currentRun.id, 'completed');
          sendEvent('run_completed', {
            runId: currentRun.id,
            status: 'completed'
          });
        }
        sendEvent('done', {});
        res.end();
        return;
      }

      messages.push({
        role: 'assistant',
        content: response.content as AnthropicCompatibleMessage['content']
      });

      if (hasToolUse && toolResults.length > 0) {
        messages.push({
          role: 'user',
          content: toolResults as unknown as AnthropicCompatibleMessage['content']
        });
        continueLoop = true;
      } else {
        continueLoop = false;
      }
    }

    // 更新技能使用统计
    if (promptSkills.length > 0) {
      for (const skill of promptSkills) {
        await incrementSkillUseCount(skill.id);
      }
    }

    // 消耗基础积分
    await consumeCredits(userId, CREDIT_COSTS.skill_chat, 'skill_chat');

    if (currentRun) {
      const completionStep = startStep('completion', '技能执行完成', {
        activeSkillIds: promptSkills.map((skill) => skill.id)
      });
      completeStep(completionStep, {
        activeSkillIds: promptSkills.map((skill) => skill.id)
      });
      runtimeStore.updateRunStatus(currentRun.id, 'completed');
      sendEvent('run_completed', {
        runId: currentRun.id,
        status: 'completed'
      });
    }

    sendEvent('done', {});
    res.end();
  } catch (error) {
    console.error('[SkillChat] Error:', error);
    if (currentRun) {
      if (currentStep) {
        failStep(
          currentStep,
          error instanceof Error ? error.message : '未知错误'
        );
      }
      runtimeStore.updateRunStatus(
        currentRun.id,
        'failed',
        error instanceof Error ? error.message : '未知错误'
      );
      sendEvent('run_failed', {
        runId: currentRun.id,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : '未知错误'
      });
    }
    sendEvent('error', {
      message: error instanceof Error ? error.message : '未知错误'
    });
    sendEvent('done', {});
    res.end();
  }
}
