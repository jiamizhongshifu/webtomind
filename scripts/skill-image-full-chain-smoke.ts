/**
 * Skill 图像创作全链路 smoke（真实 API）
 *
 * 链路：DeepSeek v4 flash Agent → generate_image 工具（平台 /api/image/generate）
 *       → Tuzi/超机土豆/Krill 多渠道出图 → imageUrl 返回 → SSE 消息形状
 *
 * 做法（与 scripts/smoke-production-image-provider.mjs 一致的项目惯例）：
 *   1. 用 service_role 创建一次性 smoke 用户（email_confirm）
 *   2. 登录拿 access_token
 *   3. 给 user_credits 加测试积分
 *   4. 用真实 token 驱动 Agent 出图，下载生成的图片到本地
 *   5. finally 删除 smoke 用户（image_generation 等记录保留，符合项目惯例）
 *
 * 用法：
 *   DEEPSEEK_API_KEY=sk-xxx \
 *   ./server/node_modules/.bin/tsx scripts/skill-image-full-chain-smoke.ts
 *   （SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY / TUZI_CHANNEL_CONNECTION 从 .env.local 读取）
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  createAgent,
  type OpenAgentToolDefinition
} from '../server/src/agent/openai-agents-sdk.js';
import {
  buildImageCreationSystemPrompt,
  resolveImageCreationMode
} from '../server/src/skills/image-creation-skill.js';
import {
  buildFemalePortraitSystemPrompt,
  resolveFemalePortraitMode
} from '../server/src/skills/zhong-female-portrait-director-skill.js';
import { handleImageGenerateRequest } from '../api/image/generate.js';

dotenv.config({ path: '.env.local' });

// worker 里 withRuntimeEnv 直接注入同名绑定；本地脚本从 VITE_ 前缀补齐同名 key
if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
if (!process.env.SUPABASE_ANON_KEY) {
  process.env.SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
}

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

for (const [name, value] of [
  ['DEEPSEEK_API_KEY', DEEPSEEK_API_KEY],
  ['SUPABASE_URL', SUPABASE_URL],
  ['SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY],
  ['SUPABASE_ANON_KEY', ANON_KEY]
]) {
  if (!value) {
    console.error(`缺少 ${name}`);
    process.exit(1);
  }
}
if (!process.env.TUZI_CHANNEL_CONNECTION) {
  console.warn('[warn] .env.local 缺少 TUZI_CHANNEL_CONNECTION，Tuzi 渠道可能不可用');
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ---------------------------------------------------------------------------
// generate_image 工具（与 api/agent/skill-image-chat 同构：走平台通道）
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
      const imageCount = Math.min(
        Math.max(Number(input.imageCount) || 1, 1),
        2
      );
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
            imageCount,
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
        model: body.model || '',
        credits: body.credits ?? undefined
      });
    }
  };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const SUPPORTED_SKILLS = new Set(['image', 'portrait']);

async function main() {
  const skillArg = (process.argv[2] || 'image').toLowerCase();
  if (!SUPPORTED_SKILLS.has(skillArg)) {
    console.error(`未知 skill: ${skillArg}（支持 image / portrait）`);
    process.exit(1);
  }
  const email = `skill-image-chain-smoke-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
  const password = `Smoke-${randomUUID().replaceAll('-', '').slice(0, 32)}`;
  const grantCredits = Number(process.env.SMOKE_CREDIT_GRANT) || 300;
  let userId = '';
  const evidence: Record<string, unknown> = { email, grantCredits };

  try {
    // 1) 建号
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { source: 'skill-image-chain-smoke' }
    });
    if (created.error) throw created.error;
    userId = created.data.user.id;
    console.log(`[setup] created smoke user ${userId}`);

    // 2) 登录拿 token
    const signedIn = await anon.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    const token = signedIn.data.session?.access_token;
    if (!token) throw new Error('smoke user sign-in returned no access_token');
    console.log('[setup] signed in, got access_token');

    // 3) 加积分
    const wallet = await admin
      .from('user_credits')
      .select('bonus_credits,total_earned')
      .eq('user_id', userId)
      .single();
    if (wallet.error) throw wallet.error;
    const walletWrite = await admin
      .from('user_credits')
      .update({
        bonus_credits: Number(wallet.data?.bonus_credits || 0) + grantCredits,
        total_earned: Number(wallet.data?.total_earned || 0) + grantCredits
      })
      .eq('user_id', userId);
    if (walletWrite.error) throw walletWrite.error;
    console.log(`[setup] granted ${grantCredits} bonus credits`);

    // 4) 驱动 DeepSeek Agent 出图
    const isPortrait = skillArg === 'portrait';
    const prompt = process.env.SMOKE_PROMPT
      ? process.env.SMOKE_PROMPT
      : isPortrait
        ? '写真探索：一个成年女孩的夏日街头随拍写真，清透自然，帮我出一张探索样张。'
        : '请帮我生成一张简单的测试图片：蓝色圆猫头像，纯白背景，1k 尺寸。';
    const mode = isPortrait
      ? resolveFemalePortraitMode(prompt)?.id
      : resolveImageCreationMode(prompt)?.id;
    const systemPrompt = isPortrait
      ? buildFemalePortraitSystemPrompt(mode)
      : buildImageCreationSystemPrompt(mode);
    console.log(`[chain] skill=${skillArg} mode=${mode || 'auto'} (系统提示 ${systemPrompt.length} 字符)`);
    const agent = createAgent({
      model: MODEL,
      apiKey: DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
      systemPrompt,
      tools: [createPlatformImageTool(token)],
      maxTurns: 6
    });

    console.log(`\n[chain] DeepSeek Agent 开始 (model=${MODEL})`);
    console.log(`[chain] prompt: ${prompt}\n`);

    const events: string[] = [];
    let imageUrl = '';
    let generationId = '';
    let provider = '';
    let model = '';
    let toolCalled = false;
    let done = false;

    for await (const raw of agent.query(prompt)) {
      const msg = raw as {
        type: string;
        content?: string;
        message?: { content?: Array<{ type: string; text?: string; name?: string }> };
        tool_name?: string;
        result?: unknown;
        subtype?: string;
      };
      if (msg.type === 'partial_message' && msg.content) {
        events.push(`[text] ${msg.content}`);
      } else if (msg.type === 'assistant') {
        for (const block of msg.message?.content || []) {
          if (block.type === 'tool_use') {
            toolCalled = true;
            const input = (block as { input?: Record<string, unknown> }).input || {};
            events.push(
              `[tool_call] ${block.name || ''} imageCount=${String(input.imageCount ?? '?')} prompt=${String(input.prompt || '').slice(0, 400)}`
            );
            evidence.lastToolInput = input;
          }
        }
      } else if (msg.type === 'tool_result') {
        const result = msg.result;
        if (typeof result === 'string') {
          try {
            const parsed = JSON.parse(result);
            imageUrl = parsed?.imageUrl || '';
            generationId = parsed?.generationId || '';
            provider = parsed?.provider || '';
            model = parsed?.model || '';
            const imageCount = Array.isArray(parsed?.images) ? parsed.images.length : 1;
            events.push(
              `[tool_result] images=${imageCount} imageUrl=${imageUrl.slice(0, 90)}... (provider=${provider}, model=${model})`
            );
          } catch {
            events.push(`[tool_result] text=${String(result).slice(0, 200)}`);
          }
        }
      } else if (msg.type === 'result') {
        done = msg.subtype === 'success';
        events.push(`[result] subtype=${msg.subtype || ''}`);
      }
    }

    // 精简输出：只显示关键事件
    const keyEvents = events.filter((e) => !e.startsWith('[text]'));
    const textChunks = events.filter((e) => e.startsWith('[text]')).length;
    console.log(keyEvents.join('\n'));
    console.log(`\n[chain] textChunks=${textChunks} toolCalled=${toolCalled} done=${done}`);

    if (!toolCalled || !imageUrl) {
      throw new Error('全链路失败：Agent 未调用出图工具或未返回 imageUrl');
    }

    evidence.imageUrl = imageUrl;
    evidence.generationId = generationId;
    evidence.provider = provider;
    evidence.model = model;
    evidence.textChunks = textChunks;
    evidence.done = done;

    // 5) 下载图片到本地（交付可视化证据）
    const imageResponse = await fetch(imageUrl, {
      signal: AbortSignal.timeout(60_000)
    });
    if (!imageResponse.ok) {
      throw new Error(`下载生成的图片失败 HTTP ${imageResponse.status}`);
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    mkdirSync('scripts/.smoke', { recursive: true });
    const localPath = `scripts/.smoke/skill-image-chain-${Date.now()}.png`;
    writeFileSync(localPath, imageBuffer);
    evidence.localPath = localPath;
    evidence.bytes = imageBuffer.length;
    console.log(`\n[chain] 图片已保存: ${localPath} (${imageBuffer.length} bytes)`);
    console.log(`[chain] 原图 URL: ${imageUrl}`);

    console.log('\n===== 全链路验证 PASS =====');
  } finally {
    if (userId) {
      const deleted = await admin.auth.admin.deleteUser(userId);
      console.log(
        `[cleanup] delete smoke user: ${deleted.error ? 'FAILED ' + deleted.error.message : 'OK'}`
      );
    }
  }
}

main().catch((error) => {
  console.error('\n===== 全链路验证 FAIL =====');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
