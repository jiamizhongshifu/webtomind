import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/image/prompt-optimize';

const authMockState = vi.hoisted(() => ({
  userId: 'user-1' as string | null,
  supabaseAdmin: null as unknown
}));

vi.mock('../../api/utils/auth', () => ({
  getCorsHeadersForRequest: () => ({ 'Access-Control-Allow-Origin': '*' }),
  getUserIdFromRequest: async () => authMockState.userId,
  getSupabaseAdmin: () => authMockState.supabaseAdmin
}));

function request(overrides: Record<string, unknown> = {}) {
  return new Request('https://webtomind.test/api/image/prompt-optimize', {
    method: 'POST',
    body: JSON.stringify({
      prompt: '生成一张高级感电影感海报',
      negativePrompt: '水印，乱码',
      locale: 'zh-CN',
      promptMode: 'custom',
      aiTasteScore: 80,
      aiTasteLevel: 'high',
      diagnostics: [],
      ...overrides
    })
  });
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe('prompt optimize API provider fallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authMockState.userId = 'user-1';
    authMockState.supabaseAdmin = {
      rpc: vi.fn(async (name: string) =>
        name === 'consume_model_rate_limit'
          ? {
              data: { allowed: true, remaining: 11, retry_after: 60 },
              error: null
            }
          : { data: null, error: null }
      ),
      from: vi.fn(() => ({ insert: vi.fn(async () => ({ error: null })) }))
    };
    process.env.GEMINI_API_KEY = 'gemini-key';
    process.env.TUZI_API_KEY = 'tuzi-key';
    process.env.TUZI_API_BASE_URL = 'https://api.tu-zi.test';
    process.env.TUZI_PROMPT_OPTIMIZE_MODEL = 'gemini-2.5-flash';
    process.env.GEMINI_OFFICIAL_ENABLED = 'true';
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_BASE_URL;
    delete process.env.DEEPSEEK_PROMPT_OPTIMIZE_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.PROMPT_OPTIMIZER_PROVIDER_TIMEOUT_MS;
    delete process.env.PROMPT_OPTIMIZER_DEEPSEEK_TIMEOUT_MS;
    delete process.env.PROMPT_OPTIMIZER_GEMINI_TIMEOUT_MS;
    delete process.env.PROMPT_OPTIMIZER_TUZI_TIMEOUT_MS;
  });

  it('requires authentication', async () => {
    authMockState.userId = null;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(request());
    const body = await readJson(response);

    expect(response.status).toBe(401);
    expect(body.error).toBe('请先登录');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects empty prompts before provider calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(request({ prompt: '   ' }));
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('提示词不能为空');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('applies the shared universal writing core to image prompt optimization', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      optimizedPrompt: '可直接提交的商业海报提示词',
                      optimizedNegativePrompt: '水印，乱码',
                      summary: '远处山坡，一灯如豆',
                      changes: ['把抽象氛围转成可观察的画面结构']
                    })
                  }
                ]
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(request());
    const providerPrompt = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit)?.body)
    ).contents[0].parts[0].text;

    expect(response.status).toBe(200);
    expect(providerPrompt).toContain('你是专业的通用提示词撰写Agent');
    expect(providerPrompt).toContain('先砍到骨头，再补血肉');
    expect(providerPrompt).toContain('先写剧本，再写小说');
    expect(providerPrompt).toContain('当前任务类型：图像提示词');
    expect(providerPrompt).toContain(
      'summary：只写一行最短、最核心的「核心意图」'
    );
    expect(providerPrompt).toContain(
      'optimizedPrompt：写完整、可直接复制提交的图像提示词'
    );
  });

  it('uses the video direction contract for video prompt optimization', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      optimizedPrompt: '按五秒时间轴组织的产品镜头',
                      optimizedNegativePrompt: '闪烁，水印',
                      summary: '已优化视频提示词',
                      changes: ['补齐时间轴']
                    })
                  }
                ]
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(
      request({
        mediaType: 'video',
        videoSettings: {
          model: 'Doubao Seedance 2.0',
          aspectRatio: '16:9',
          duration: 5,
          resolution: '720p',
          generateAudio: true,
          referenceImageCount: 1,
          referenceVideoCount: 2,
          referenceAudioCount: 1,
          hasFirstFrame: false,
          hasLastFrame: false
        }
      })
    );
    const body = await readJson(response);
    const providerPrompt = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit)?.body)
    ).contents[0].parts[0].text;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      optimizedPrompt: '按五秒时间轴组织的产品镜头'
    });
    expect(providerPrompt).toContain('你是专业的通用提示词撰写Agent');
    expect(providerPrompt).toContain('先砍到骨头，再补血肉');
    expect(providerPrompt).toContain('先写剧本，再写小说');
    expect(providerPrompt).toContain('当前任务类型：视频提示词');
    expect(providerPrompt).toContain('Seedance 视频提示词导演');
    expect(providerPrompt).toContain(
      'summary：只写一行最短、最核心的「核心意图」'
    );
    expect(providerPrompt).toContain(
      'optimizedPrompt：写完整、可直接复制提交的视频提示词'
    );
    expect(providerPrompt).toContain('"referenceImageCount": 1');
    expect(providerPrompt).toContain('"referenceVideoCount": 2');
    expect(providerPrompt).toContain('"referenceAudioCount": 1');
    expect(providerPrompt).toContain('"hasFirstFrame": false');
    expect(providerPrompt).toContain('"hasLastFrame": false');
  });

  it('falls back from official Gemini to Tuzi when Gemini fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('quota exhausted', {
          status: 429
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    optimizedPrompt: '商业海报完整提示词',
                    optimizedNegativePrompt: '水印，乱码，畸形肢体',
                    summary: '已通过 Tuzi 兜底优化',
                    changes: ['补齐商业落点']
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(request());
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      optimizedPrompt: '商业海报完整提示词',
      provider: 'tuzi',
      model: 'gemini-2.5-flash'
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      'https://api.tu-zi.test/v1/chat/completions'
    );
  });

  it('times out a stalled provider and continues with the next provider', async () => {
    process.env.PROMPT_OPTIMIZER_PROVIDER_TIMEOUT_MS = '100';
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    optimizedPrompt: '超时后由备用服务完成',
                    optimizedNegativePrompt: '',
                    summary: '已切换备用服务',
                    changes: []
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    try {
      const responsePromise = handler(request());
      await vi.advanceTimersByTimeAsync(100);
      const response = await responsePromise;
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        optimizedPrompt: '超时后由备用服务完成',
        provider: 'tuzi'
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives DeepSeek a longer provider timeout than the fallback providers', async () => {
    process.env.DEEPSEEK_API_KEY = 'deepseek-key';
    process.env.DEEPSEEK_BASE_URL = 'https://deepseek.test';
    vi.useFakeTimers();
    const stall = (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(stall)
      .mockResolvedValueOnce(new Response('quota exhausted', { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    optimizedPrompt: 'DeepSeek 超时后由 Tuzi 完成',
                    optimizedNegativePrompt: '',
                    summary: '已切换备用服务',
                    changes: []
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    try {
      const responsePromise = handler(request());
      await vi.advanceTimersByTimeAsync(12_000);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(33_000);
      const response = await responsePromise;
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        optimizedPrompt: 'DeepSeek 超时后由 Tuzi 完成',
        provider: 'tuzi'
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('honors the DeepSeek-specific provider timeout override', async () => {
    process.env.DEEPSEEK_API_KEY = 'deepseek-key';
    process.env.DEEPSEEK_BASE_URL = 'https://deepseek.test';
    process.env.PROMPT_OPTIMIZER_DEEPSEEK_TIMEOUT_MS = '5000';
    vi.useFakeTimers();
    const stall = (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(stall)
      .mockResolvedValueOnce(new Response('quota exhausted', { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    optimizedPrompt: '5 秒超时后由 Tuzi 完成',
                    optimizedNegativePrompt: '',
                    summary: '已切换备用服务',
                    changes: []
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    try {
      const responsePromise = handler(request());
      await vi.advanceTimersByTimeAsync(5_000);
      const response = await responsePromise;
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        optimizedPrompt: '5 秒超时后由 Tuzi 完成',
        provider: 'tuzi'
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('prefers DeepSeek V4 Flash when it is configured', async () => {
    process.env.DEEPSEEK_API_KEY = 'deepseek-key';
    process.env.DEEPSEEK_BASE_URL = 'https://deepseek.test';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  optimizedPrompt: 'DeepSeek 完整提示词',
                  optimizedNegativePrompt: '水印，乱码，畸形肢体',
                  summary: '已通过 DeepSeek 兜底优化',
                  changes: []
                })
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(request());
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      optimizedPrompt: 'DeepSeek 完整提示词',
      provider: 'deepseek',
      model: 'deepseek-v4-flash'
    });
    const providerBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit)?.body)
    );
    expect(providerBody.model).toBe('deepseek-v4-flash');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://deepseek.test/v1/chat/completions'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the authenticated Cloudflare AI Gateway header for gateway DeepSeek URLs', async () => {
    process.env.DEEPSEEK_API_KEY = 'deepseek-key';
    process.env.DEEPSEEK_BASE_URL =
      'https://gateway.ai.cloudflare.com/v1/account/gateway/custom-deepseek';
    process.env.CLOUDFLARE_AI_GATEWAY_RUN_TOKEN = 'gateway-run-token';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  optimizedPrompt: 'Gateway DeepSeek 完整提示词',
                  optimizedNegativePrompt: '水印，乱码，畸形肢体',
                  summary: '已通过 Gateway DeepSeek 兜底优化',
                  changes: []
                })
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(request());
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      optimizedPrompt: 'Gateway DeepSeek 完整提示词',
      provider: 'deepseek'
    });
    const headers = new Headers(
      (fetchMock.mock.calls[0]?.[1] as RequestInit)?.headers
    );
    expect(headers.get('cf-aig-authorization')).toBe(
      'Bearer gateway-run-token'
    );
    expect(headers.get('Authorization')).toBe('Bearer deepseek-key');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://gateway.ai.cloudflare.com/v1/account/gateway/custom-deepseek/v1/chat/completions'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('omits the Cloudflare AI Gateway header for non-gateway provider URLs', async () => {
    process.env.DEEPSEEK_API_KEY = 'deepseek-key';
    process.env.DEEPSEEK_BASE_URL = 'https://deepseek.test';
    process.env.CLOUDFLARE_AI_GATEWAY_RUN_TOKEN = 'gateway-run-token';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  optimizedPrompt: '非网关 DeepSeek 完整提示词',
                  optimizedNegativePrompt: '水印，乱码，畸形肢体',
                  summary: '已优化',
                  changes: []
                })
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(request());
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      optimizedPrompt: '非网关 DeepSeek 完整提示词',
      provider: 'deepseek'
    });
    const headers = new Headers(
      (fetchMock.mock.calls[0]?.[1] as RequestInit)?.headers
    );
    expect(headers.get('cf-aig-authorization')).toBeNull();
    expect(headers.get('Authorization')).toBe('Bearer deepseek-key');
  });

  it('returns every provider failure as actionable 503 details', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('User location is not supported', { status: 400 })
      )
      .mockResolvedValueOnce(
        new Response('upstream connection failed', { status: 525 })
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(request());
    const body = await readJson(response);

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      error: '提示词优化服务暂时不可用',
      errorCode: 'PROMPT_OPTIMIZER_UNAVAILABLE',
      retryable: true
    });
    expect(String(body.details)).toContain(
      'gemini_official: Gemini request failed: 400 User location is not supported'
    );
    expect(String(body.details)).toContain(
      'tuzi: tuzi request failed: 525 upstream connection failed'
    );
  });

  it('does not block successful optimization when usage recording fails', async () => {
    authMockState.supabaseAdmin = {
      rpc: vi.fn(async () => ({
        data: { allowed: true, remaining: 11, retry_after: 60 },
        error: null
      })),
      from: vi.fn(() => ({
        insert: vi.fn(async () => {
          throw new Error('usage table unavailable');
        })
      }))
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      optimizedPrompt: 'Gemini 完整商业提示词',
                      optimizedNegativePrompt: '水印，乱码',
                      summary: '已优化',
                      changes: ['补齐版式']
                    })
                  }
                ]
              }
            }
          ],
          usageMetadata: {
            promptTokenCount: 120,
            candidatesTokenCount: 60,
            totalTokenCount: 180
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(request());
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      optimizedPrompt: 'Gemini 完整商业提示词',
      provider: 'gemini_official'
    });
    expect(warnSpy).toHaveBeenCalledWith(
      '[AIProviderUsage] record failed:',
      'usage table unavailable'
    );
  });
});
