import {
  normalizeOpenAICompatibleBaseUrl,
  parseTuziChannelConnectionConfig
} from '../utils/tuzi-connection.js';
import { isOfficialGeminiEnabled } from '../utils/model-provider-routing.js';

const ANALYSIS_TIMEOUT_MS = 36_000;

export type DiscoveryVisualSearchDescriptor = {
  description: string;
  keywords: string[];
  searchQuery: string;
};

type AnalysisInput = {
  base64: string;
  mimeType: string;
  locale: 'zh-CN' | 'en-US';
  signal?: AbortSignal;
};

type OpenAICompatibleVisionConnection = {
  apiKey: string;
  baseUrl: string;
  model: string;
  providerLabel: string;
};

function compactText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/gu, ' ').slice(0, maxLength)
    : '';
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  return fenced?.[1]?.trim() || trimmed;
}

export function parseDiscoveryVisualSearchResponse(
  raw: string
): DiscoveryVisualSearchDescriptor {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripJsonFence(raw)) as Record<string, unknown>;
  } catch {
    throw new Error('视觉模型返回的数据格式无效');
  }

  const description = compactText(parsed.description, 1200);
  const keywords = Array.from(
    new Set(
      (Array.isArray(parsed.keywords) ? parsed.keywords : [])
        .map((value) => compactText(value, 48))
        .filter(Boolean)
    )
  ).slice(0, 8);
  if (!description || keywords.length < 2) {
    throw new Error('视觉模型没有返回足够的搜索信息');
  }
  return {
    description,
    keywords,
    searchQuery: keywords.join(' ').slice(0, 320)
  };
}

function buildAnalysisPrompt(locale: 'zh-CN' | 'en-US'): string {
  if (locale === 'en-US') {
    return `Analyze this image for visual inspiration search. Identify only visible subject matter, scene, visual style, color, lighting, composition, material, and commercial use. Do not infer sensitive identity. Return JSON only:\n{"description":"one concise visual description","keywords":["4-8 independent search terms"]}`;
  }
  return `请分析这张图片，用于视觉灵感搜索。只识别画面中可见的主体、场景、视觉风格、色彩、光线、构图、材质与商业用途，不推断敏感身份。仅返回 JSON：\n{"description":"一段精炼的画面描述","keywords":["4-8 个可独立搜索的关键词"]}`;
}

function linkedAbortController(signal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, ANALYSIS_TIMEOUT_MS);
  return {
    controller,
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  };
}

async function analyzeWithOfficialGemini(
  input: AnalysisInput,
  apiKey: string
): Promise<DiscoveryVisualSearchDescriptor> {
  const model =
    process.env.DISCOVERY_IMAGE_ANALYSIS_MODEL ||
    process.env.MOODBOARD_ANALYSIS_MODEL ||
    'gemini-3.5-flash';
  const linked = linkedAbortController(input.signal);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        signal: linked.controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: buildAnalysisPrompt(input.locale) },
                {
                  inlineData: {
                    mimeType: input.mimeType,
                    data: input.base64
                  }
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            maxOutputTokens: 800,
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      }
    );
    const payload = (await response.json().catch(() => ({}))) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(
        payload.error?.message || `Gemini 图片解析失败（${response.status}）`
      );
    }
    const raw = (payload.candidates?.[0]?.content?.parts || [])
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('')
      .trim();
    return parseDiscoveryVisualSearchResponse(raw);
  } finally {
    linked.cleanup();
  }
}

async function analyzeWithOpenAICompatibleVision(
  input: AnalysisInput,
  connection: OpenAICompatibleVisionConnection
): Promise<DiscoveryVisualSearchDescriptor> {
  const baseUrl = normalizeOpenAICompatibleBaseUrl(connection.baseUrl);
  const linked = linkedAbortController(input.signal);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: linked.controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${connection.apiKey}`
      },
      body: JSON.stringify({
        model: connection.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: buildAnalysisPrompt(input.locale) },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${input.mimeType};base64,${input.base64}`
                }
              }
            ]
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 800,
        stream: false
      })
    });
    const payload = (await response.json().catch(() => ({}))) as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ text?: string }>;
        };
      }>;
      error?: { message?: string } | string;
      message?: string;
    };
    if (!response.ok) {
      const providerMessage =
        typeof payload.error === 'string'
          ? payload.error
          : payload.error?.message || payload.message || '';
      throw new Error(
        `${connection.providerLabel} 图片解析失败（${response.status}）${providerMessage ? `：${providerMessage.slice(0, 240)}` : ''}`
      );
    }
    const content = payload.choices?.[0]?.message?.content;
    const raw = Array.isArray(content)
      ? content
          .map((part) => (typeof part.text === 'string' ? part.text : ''))
          .join('')
      : typeof content === 'string'
        ? content
        : '';
    return parseDiscoveryVisualSearchResponse(raw);
  } finally {
    linked.cleanup();
  }
}

export async function analyzeDiscoveryImageForSearch(
  input: AnalysisInput
): Promise<DiscoveryVisualSearchDescriptor> {
  const officialApiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY;
  const tuziConnection = parseTuziChannelConnectionConfig(
    process.env.TUZI_TEXT_CHANNEL_CONNECTION ||
      process.env.TUZI_CHANNEL_CONNECTION ||
      process.env.TUZI_NEWAPI_CHANNEL_CONNECTION ||
      process.env.TUZI_TEXT_API_KEY ||
      process.env.TUZI_API_KEY
  );
  const chaojitudouApiKey =
    process.env.DISCOVERY_IMAGE_ANALYSIS_CHAOJITUDOU_API_KEY ||
    process.env.CHAOJITUDOU_API_KEY ||
    process.env.OPENAI_IMAGE_API_KEY ||
    '';
  const chaojitudouBaseUrl =
    process.env.DISCOVERY_IMAGE_ANALYSIS_CHAOJITUDOU_BASE_URL ||
    process.env.CHAOJITUDOU_API_BASE_URL ||
    process.env.OPENAI_IMAGE_API_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://api.chaojitudou.com/v1';
  const chaojitudouModel =
    process.env.DISCOVERY_IMAGE_ANALYSIS_CHAOJITUDOU_MODEL ||
    process.env.CHAOJITUDOU_VLM_MODEL ||
    'gpt-5.6';
  const providerPreference = String(
    process.env.DISCOVERY_IMAGE_ANALYSIS_PROVIDER ||
      process.env.MOODBOARD_ANALYSIS_PROVIDER ||
      ''
  )
    .trim()
    .toLowerCase();
  const attempts: Array<{
    name: string;
    run: () => Promise<DiscoveryVisualSearchDescriptor>;
  }> = [];
  const addOfficial = () => {
    if (officialApiKey && isOfficialGeminiEnabled()) {
      attempts.push({
        name: 'gemini_official',
        run: () => analyzeWithOfficialGemini(input, officialApiKey)
      });
    }
  };
  const addTuzi = () => {
    if (tuziConnection.apiKey) {
      attempts.push({
        name: 'tuzi',
        run: () =>
          analyzeWithOpenAICompatibleVision(input, {
            apiKey: tuziConnection.apiKey,
            baseUrl:
              process.env.TUZI_TEXT_BASE_URL ||
              process.env.TUZI_API_BASE_URL ||
              tuziConnection.apiBaseUrl ||
              'https://api.tu-zi.com',
            model:
              process.env.DISCOVERY_IMAGE_ANALYSIS_TUZI_MODEL ||
              process.env.MOODBOARD_ANALYSIS_TUZI_MODEL ||
              process.env.TUZI_VLM_MODEL ||
              process.env.OPENAI_VLM_MODEL ||
              'gpt-5.5',
            providerLabel: 'Tuzi'
          })
      });
    }
  };
  const addChaojitudou = () => {
    if (chaojitudouApiKey) {
      attempts.push({
        name: 'chaojitudou',
        run: () =>
          analyzeWithOpenAICompatibleVision(input, {
            apiKey: chaojitudouApiKey,
            baseUrl: chaojitudouBaseUrl,
            model: chaojitudouModel,
            providerLabel: 'Chaojitudou'
          })
      });
    }
  };
  const isChaojitudouPreference =
    providerPreference === 'chaojitudou' ||
    providerPreference === 'chaojitudi';
  const hasChaojitudouHost = (() => {
    try {
      return new URL(
        normalizeOpenAICompatibleBaseUrl(chaojitudouBaseUrl)
      ).hostname.endsWith('chaojitudou.com');
    } catch {
      return false;
    }
  })();
  if (isChaojitudouPreference) {
    addChaojitudou();
    addTuzi();
    addOfficial();
  } else if (providerPreference === 'tuzi') {
    addTuzi();
    if (hasChaojitudouHost) addChaojitudou();
    addOfficial();
  } else {
    if (hasChaojitudouHost) addChaojitudou();
    addOfficial();
    addTuzi();
  }
  if (!attempts.length) {
    throw new Error('图片解析服务未配置');
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      return await attempt.run();
    } catch (error) {
      if (input.signal?.aborted) throw error;
      const message = error instanceof Error ? error.message : '未知错误';
      errors.push(`${attempt.name}: ${message}`);
      console.warn('[DiscoveryVisualSearch] provider failed', {
        provider: attempt.name,
        error: message.slice(0, 300)
      });
    }
  }
  throw new Error(`图片解析服务暂不可用：${errors.join(' | ')}`.slice(0, 1000));
}
