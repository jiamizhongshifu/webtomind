/**
 * 用户粘贴成品提示词 → 模型拆解为多条个人素材草稿（不入库）。
 *
 * POST /api/prompt-assets/user/import-prompt
 * Body: { prompt: string }
 *
 * 入库仍由前端确认后调用 /api/prompt-assets/user 的 POST。
 */

import type { VercelRequest, VercelResponse } from '../../utils/vercel-types';
import { getUserIdFromRequest } from '../../utils/auth.js';
import { sendWebResponse, toWebRequest } from '../../utils/edge-adapter.js';
import { reversePromptTextToPromptAsset } from '../../utils/prompt-asset-reverse.js';
import {
  createJsonResponder,
  MAX_PROMPT_IMPORT_CHARS
} from './worker-compat.js';

export const config = { runtime: 'nodejs', maxDuration: 180 };

export async function handlePromptImportRequest(
  request: Request
): Promise<Response> {
  const { corsHeaders, jsonResponse } = createJsonResponder(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse({ error: '请先登录' }, 401);
  }

  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string;
  };
  const prompt = (body.prompt || '').trim();
  if (!prompt) {
    return jsonResponse({ error: '提示词不能为空' }, 400);
  }
  if (prompt.length > MAX_PROMPT_IMPORT_CHARS) {
    return jsonResponse(
      { error: `提示词超过 ${MAX_PROMPT_IMPORT_CHARS} 字符限制` },
      413
    );
  }

  let reverse;
  try {
    reverse = await reversePromptTextToPromptAsset(prompt);
  } catch (error) {
    console.error('[PromptAssetImport] analyze failed:', error);
    reverse = {
      items: [],
      ok: false,
      sourceType: 'prompt',
      fullPrompt: prompt,
      negativePrompt: ''
    };
  }

  return jsonResponse({
    success: true,
    reverse
  });
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
): Promise<void> {
  const webResponse = await handlePromptImportRequest(
    toWebRequest(request, '/api/prompt-assets/user/import-prompt')
  );
  await sendWebResponse(webResponse, response);
}
