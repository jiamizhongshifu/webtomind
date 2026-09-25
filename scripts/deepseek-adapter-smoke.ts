/**
 * DeepSeek 适配器真实联调 smoke（OpenAI Agents SDK 迁移后）
 *
 * 验证链路（真实 API）：
 *   DeepSeek v4 flash agent 循环 → 工具调用 → 工具结果 → SSE 消息形状
 *   image 场景出图走平台 /api/image/generate 通道（Tuzi/超机土豆等，需真实用户 token）
 *
 * 用法（Key/token 全部走环境变量，不落盘不提交）：
 *   DEEPSEEK_API_KEY=sk-xxx [SMOKE_TOKEN=用户JWT] [SMOKE_PROXY=http://127.0.0.1:7890] \
 *     ./server/node_modules/.bin/tsx scripts/deepseek-adapter-smoke.ts [image|text|tool|all]
 *
 * 场景：
 *   text  - 纯文本流式：验证 output_text_delta → partial_message
 *   tool  - 工具调用完整循环（get_current_time，不依赖外部通道）
 *   image - 出图全链路：Agent 调用 generate_image → 平台通道出图 → imageUrl（需 SMOKE_TOKEN + 平台环境）
 */

import {
  createAgent,
  type OpenAgentToolDefinition
} from '../server/src/agent/openai-agents-sdk.js';
import {
  buildImageCreationSystemPrompt,
  resolveImageCreationMode
} from '../server/src/skills/image-creation-skill.js';
import { handleImageGenerateRequest } from '../api/image/generate.js';

// 可选代理：本机访问 Google/DeepSeek 可能需要代理（如 Clash 7890）。
import { setGlobalDispatcher, ProxyAgent } from 'undici';
const SMOKE_PROXY = process.env.SMOKE_PROXY || '';
if (SMOKE_PROXY) {
  setGlobalDispatcher(new ProxyAgent(SMOKE_PROXY));
  console.log(`[proxy] global fetch -> ${SMOKE_PROXY}`);
}

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

if (!DEEPSEEK_API_KEY) {
  console.error('缺少 DEEPSEEK_API_KEY');
  process.exit(1);
}

/** 简单确定性工具：验证工具调用→结果→终稿的完整循环（不依赖外部出图通道） */
const timeTool: OpenAgentToolDefinition = {
  name: 'get_current_time',
  description: '获取当前时间（返回 HH:MM）。',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },
  call: async () => '23:59'
};

// ---------------------------------------------------------------------------
// generate_image：走平台 /api/image/generate 通道（Tuzi/超机土豆/Krill + 平台计费）
// ---------------------------------------------------------------------------

const SKILL_IMAGE_SIZE_TO_PLATFORM: Record<string, string> = {
  '1k': '1024x1024',
  '2k': '2048x2048',
  '4k': '2880x2880'
};

function createPlatformImageTool(token: string): OpenAgentToolDefinition {
  return {
    name: 'generate_image',
    description:
      '使用平台图像创作通道生成图片（Tuzi/超机土豆等渠道，按平台实时定价扣积分）。' +
      'prompt 必填（英文效果更好），imageSize 支持 1k/2k/4k（默认 2k）。',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '图片生成提示词（英文效果更好）' },
        imageSize: {
          type: 'string',
          enum: ['1k', '2k', '4k'],
          description: '图片尺寸档位：1k/2k/4k，默认 2k'
        }
      },
      required: ['prompt']
    },
    async call(input: Record<string, unknown>): Promise<string> {
      const sizeKey = String(input.imageSize || '2k');
      const dimensions =
        SKILL_IMAGE_SIZE_TO_PLATFORM[sizeKey] ||
        SKILL_IMAGE_SIZE_TO_PLATFORM['2k'];
      const internalRequest = new Request(
        'https://webtomind.com/api/image/generate',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            prompt: String(input.prompt || ''),
            imageSize: dimensions,
            async: false
          })
        }
      );
      const response = await handleImageGenerateRequest(internalRequest);
      const body = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (!response.ok || !body || body.success !== true) {
        throw new Error(
          String(
            body?.error ||
              body?.message ||
              `图片生成失败（HTTP ${response.status}）`
          )
        );
      }
      if (typeof body.imageUrl !== 'string' || !body.imageUrl) {
        throw new Error('图片生成失败：平台未返回图片地址');
      }
      return JSON.stringify({
        imageUrl: body.imageUrl,
        generationId: body.generationId || '',
        provider: body.provider || '',
        model: body.model || ''
      });
    }
  };
}

/** 有 SMOKE_TOKEN 走平台通道，否则返回必然失败的占位工具（image 场景 SKIP） */
function createPlatformImageTools(): OpenAgentToolDefinition[] {
  const token = process.env.SMOKE_TOKEN || '';
  if (token) return [createPlatformImageTool(token)];
  return [
    {
      name: 'generate_image',
      description: '使用平台图像创作通道生成图片。',
      inputSchema: {
        type: 'object',
        properties: { prompt: { type: 'string' } },
        required: ['prompt']
      },
      call: async () => {
        throw new Error('本地联调未配置 SMOKE_TOKEN，无法调用平台出图通道');
      }
    }
  ];
}

// ---------------------------------------------------------------------------
// 场景执行
// ---------------------------------------------------------------------------

async function runScenario(
  label: string,
  prompt: string,
  opts: {
    expectImage?: boolean;
    expectTool?: boolean;
    tools?: OpenAgentToolDefinition[];
  } = {}
): Promise<{ ok: boolean; events: string[] }> {
  console.log(`\n===== ${label} =====`);
  console.log(`prompt: ${prompt}\n`);

  const mode = resolveImageCreationMode(prompt)?.id;
  const systemPrompt = buildImageCreationSystemPrompt(mode);
  const agent = createAgent({
    model: MODEL,
    apiKey: DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    systemPrompt,
    tools: opts.tools || createPlatformImageTools(),
    maxTurns: 6
  });

  const events: string[] = [];
  let imageUrl: string | undefined;
  let toolCalled = false;
  let toolResultOk = false;
  let textChunks = 0;

  for await (const raw of agent.query(prompt)) {
    const msg = raw as {
      type: string;
      content?: string;
      message?: {
        content?: Array<{ type: string; text?: string; name?: string }>;
      };
      tool_name?: string;
      result?: unknown;
      subtype?: string;
    };
    if (msg.type === 'partial_message' && msg.content) {
      textChunks++;
      events.push(`[text] ${msg.content}`);
    } else if (msg.type === 'assistant') {
      for (const block of msg.message?.content || []) {
        if (block.type === 'tool_use') {
          toolCalled = true;
          events.push(`[tool_call] ${block.name || ''}`);
        }
      }
    } else if (msg.type === 'tool_result') {
      const result = msg.result;
      if (typeof result === 'string' && result) {
        toolResultOk = true; // 任意非空结果都算工具成功（图片需 imageUrl）
        try {
          const parsed = JSON.parse(result);
          imageUrl = parsed?.imageUrl || parsed?.data?.imageUrl;
          events.push(
            `[tool_result] ok=true imageUrl=${String(imageUrl || '').slice(0, 60)}...`
          );
        } catch {
          events.push(`[tool_result] text=${String(result).slice(0, 120)}`);
        }
      } else if (typeof result === 'string') {
        events.push(`[tool_result] (empty)`);
      } else {
        events.push(`[tool_result] ${String(result).slice(0, 120)}`);
      }
    } else if (msg.type === 'result') {
      const errorMsg = msg.subtype?.startsWith('error')
        ? ` message=${String(msg.result || '').slice(0, 300)}`
        : '';
      events.push(`[result] subtype=${msg.subtype || ''}${errorMsg}`);
      if (msg.subtype?.startsWith('error')) {
        console.log(events.join('\n'));
        return { ok: false, events };
      }
    }
  }

  console.log(events.join('\n'));

  const ok =
    textChunks > 0 &&
    (opts.expectImage
      ? toolCalled && toolResultOk && Boolean(imageUrl)
      : opts.expectTool
        ? toolCalled && toolResultOk
        : !toolCalled);

  console.log(
    `\n=> ${ok ? 'PASS' : 'FAIL'} (textChunks=${textChunks} toolCalled=${toolCalled} toolResultOk=${toolResultOk} image=${Boolean(imageUrl)})`
  );
  if (imageUrl && !imageUrl.startsWith('data:')) {
    console.log(`imageUrl: ${imageUrl.slice(0, 160)}`);
  }
  return { ok, events };
}

async function main() {
  const scenario = process.argv[2] || 'image';
  const results: Array<{ ok: boolean; label: string }> = [];

  if (scenario === 'text') {
    const r = await runScenario(
      '纯文本流式（无工具调用）',
      '你好，请用一句话介绍你自己，不要调用任何工具。'
    );
    results.push({ ok: r.ok, label: 'text' });
  } else if (scenario === 'tool') {
    const r = await runScenario(
      '工具调用完整循环（get_current_time）',
      '现在几点了？请调用 get_current_time 工具获取时间并告诉我。',
      { expectTool: true, tools: [timeTool] }
    );
    results.push({ ok: r.ok, label: 'tool' });
  } else if (scenario === 'image') {
    const token = process.env.SMOKE_TOKEN || '';
    if (!token) {
      console.log('\n===== 出图全链路（工具调用） =====');
      console.log(
        '=> SKIP：image 场景需要真实用户 token（SMOKE_TOKEN）与平台环境\n' +
          '  （SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / TUZI_CHANNEL_CONNECTION 等）。'
      );
      results.push({ ok: true, label: 'image (SKIP)' });
    } else {
      const r = await runScenario(
        '出图全链路（工具调用）',
        '请帮我生成一张赛博朋克风格的猫咪海报，英文提示词，1k 尺寸。',
        { expectImage: true }
      );
      results.push({ ok: r.ok, label: 'image' });
    }
  } else if (scenario === 'all') {
    results.push({
      ok: (
        await runScenario(
          '纯文本流式（无工具调用）',
          '你好，请用一句话介绍你自己，不要调用任何工具。'
        )
      ).ok,
      label: 'text'
    });
    results.push({
      ok: (
        await runScenario(
          '工具调用完整循环（get_current_time）',
          '现在几点了？请调用 get_current_time 工具获取时间并告诉我。',
          { expectTool: true, tools: [timeTool] }
        )
      ).ok,
      label: 'tool'
    });
    const token = process.env.SMOKE_TOKEN || '';
    if (!token) {
      results.push({ ok: true, label: 'image (SKIP)' });
    } else {
      results.push({
        ok: (
          await runScenario(
            '出图全链路（工具调用）',
            '请帮我生成一张赛博朋克风格的猫咪海报，英文提示词，1k 尺寸。',
            { expectImage: true }
          )
        ).ok,
        label: 'image'
      });
    }
  } else {
    console.error(`未知场景: ${scenario}（支持 image / text / tool / all）`);
    process.exit(1);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== 汇总 =====`);
  for (const r of results) {
    console.log(`  ${r.label}: ${r.ok ? 'PASS' : 'FAIL'}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error('smoke 异常:', error);
  process.exit(1);
});
