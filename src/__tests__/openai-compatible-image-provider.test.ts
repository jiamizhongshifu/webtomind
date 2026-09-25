import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OpenAICompatibleImageProviderError,
  OpenAICompatibleImageProviderPendingError,
  assertOpenAICompatibleImageConfig,
  classifyOpenAICompatibleImageHttpError,
  editOpenAICompatibleImage,
  generateOpenAICompatibleImage,
  resolveOpenAICompatibleImageConfig
} from '../../api/image/providers/openai-compatible-image';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe('openai-compatible image provider', () => {
  it('stays disabled unless explicitly enabled by env', () => {
    delete process.env.OPENAI_COMPAT_IMAGE_ENABLED;
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://proxy.test/v1/';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'sk-test';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';

    const config = resolveOpenAICompatibleImageConfig();

    expect(config.enabled).toBe(false);
    expect(config.apiBaseUrl).toBe('https://proxy.test/v1');
    expect(() => assertOpenAICompatibleImageConfig(config)).toThrow(
      OpenAICompatibleImageProviderError
    );
  });

  it('cleans pasted newline markers from provider env values', () => {
    process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true\\n';
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://proxy.test/v1/\\n';
    process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'sk-test\\n';
    process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2\\n';
    process.env.OPENAI_COMPAT_IMAGE_SUPPORTS_EDITS = 'true\\n';
    process.env.OPENAI_COMPAT_IMAGE_SUPPORTS_MULTI = 'false\\n';
    process.env.OPENAI_COMPAT_IMAGE_STREAMING_ENABLED = 'true\\n';
    process.env.OPENAI_COMPAT_IMAGE_PARTIAL_IMAGES = '2\\n';

    const config = resolveOpenAICompatibleImageConfig();

    expect(config.enabled).toBe(true);
    expect(config.apiBaseUrl).toBe('https://proxy.test/v1');
    expect(config.apiKey).toBe('sk-test');
    expect(config.model).toBe('gpt-image-2');
    expect(config.supportsEdits).toBe(true);
    expect(config.supportsMulti).toBe(false);
    expect(config.supportsStreaming).toBe(true);
    expect(config.partialImages).toBe(2);
  });

  it('builds a /images/generations request and maps b64_json output', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ b64_json: Buffer.from('fake-image').toString('base64') }]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const images = await generateOpenAICompatibleImage(
      {
        prompt: 'test prompt',
        imageCount: 2,
        size: '1024x1536',
        quality: 'high',
        outputFormat: 'png'
      },
      {
        enabled: true,
        apiBaseUrl: 'https://proxy.test/v1',
        apiKey: 'sk-test',
        model: 'gpt-image-2',
        timeoutMs: 30000,
        supportsEdits: true,
        supportsMulti: true
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit
    ];
    expect(url).toBe('https://proxy.test/v1/images/generations');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer sk-test',
      'Content-Type': 'application/json'
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'gpt-image-2',
      prompt: 'test prompt',
      size: '1024x1536',
      quality: 'high',
      output_format: 'png',
      response_format: 'b64_json',
      n: 2
    });
    expect(images).toEqual([
      {
        dataUrl: `data:image/png;base64,${Buffer.from('fake-image').toString(
          'base64'
        )}`,
        mimeType: 'image/png',
        provider: 'openai-compatible',
        model: 'gpt-image-2',
        providerApiBaseUrl: 'https://proxy.test/v1',
        source: 'b64_json'
      }
    ]);
  });

  it('downloads url output and preserves content type', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ url: 'https://cdn.test/image.webp' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/webp' }
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const images = await generateOpenAICompatibleImage(
      {
        prompt: 'test prompt',
        imageCount: 1,
        outputFormat: 'webp'
      },
      {
        enabled: true,
        apiBaseUrl: 'https://proxy.test/v1',
        apiKey: 'sk-test',
        model: 'gpt-image-2',
        timeoutMs: 30000,
        supportsEdits: false,
        supportsMulti: true
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://cdn.test/image.webp');
    expect(images[0]).toMatchObject({
      dataUrl: `data:image/webp;base64,${Buffer.from([1, 2, 3]).toString(
        'base64'
      )}`,
      mimeType: 'image/webp',
      source: 'url'
    });
  });

  it('times out when url output download stalls', async () => {
    vi.useFakeTimers();
    try {
      let resolveSecondFetchStarted: (() => void) | undefined;
      const secondFetchStarted = new Promise<void>((resolve) => {
        resolveSecondFetchStarted = resolve;
      });
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ data: [{ url: 'https://cdn.test/stall.png' }] }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        )
        .mockImplementationOnce(
          (_url: string, init?: RequestInit) =>
            new Promise((_resolve, reject) => {
              resolveSecondFetchStarted?.();
              const signal = init?.signal;
              if (signal instanceof AbortSignal) {
                signal.addEventListener('abort', () => {
                  reject(new DOMException('Aborted', 'AbortError'));
                });
              }
            })
        );
      vi.stubGlobal('fetch', fetchMock);

      const promise = generateOpenAICompatibleImage(
        {
          prompt: 'test prompt',
          imageCount: 1,
          outputFormat: 'png'
        },
        {
          enabled: true,
          apiBaseUrl: 'https://proxy.test/v1',
          apiKey: 'sk-test',
          model: 'gpt-image-2',
          timeoutMs: 30000,
          supportsEdits: false,
          supportsMulti: true
        }
      );

      await secondFetchStarted;
      expect(fetchMock).toHaveBeenCalledTimes(2);

      const rejection = expect(promise).rejects.toMatchObject({
        category: 'timeout'
      });
      await vi.advanceTimersByTimeAsync(30000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('can request and parse streaming GPT image output', async () => {
    const finalImage = Buffer.from('streamed-final').toString('base64');
    const fetchMock = vi.fn(
      async () =>
        new Response(
          [
            'event: image_generation.partial_image',
            `data: ${JSON.stringify({
              type: 'image_generation.partial_image',
              b64_json: Buffer.from('partial').toString('base64')
            })}`,
            '',
            'event: image_generation.completed',
            `data: ${JSON.stringify({
              type: 'image_generation.completed',
              b64_json: finalImage
            })}`,
            '',
            'data: [DONE]',
            ''
          ].join('\n'),
          { status: 200, headers: { 'content-type': 'text/event-stream' } }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const images = await generateOpenAICompatibleImage(
      {
        prompt: 'test prompt',
        imageCount: 1,
        outputFormat: 'png'
      },
      {
        enabled: true,
        apiBaseUrl: 'https://proxy.test/v1',
        apiKey: 'sk-test',
        model: 'gpt-image-2',
        timeoutMs: 30000,
        supportsEdits: false,
        supportsMulti: false,
        supportsStreaming: true
      }
    );

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit
    ];
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'gpt-image-2',
      prompt: 'test prompt',
      output_format: 'png',
      stream: true,
      partial_images: 2,
      n: 1
    });
    expect(JSON.parse(String(init.body))).not.toHaveProperty('response_format');
    expect(images[0]).toMatchObject({
      dataUrl: `data:image/png;base64,${finalImage}`,
      mimeType: 'image/png',
      source: 'b64_json'
    });
  });

  it('uses chaojitudou async image task APIs instead of the sync image endpoint', async () => {
    const image = Buffer.from('chao-image').toString('base64');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'task-123',
            status: 'queued',
            mode: 'generate',
            model: 'gpt-image-2'
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'task-123',
                status: 'success',
                data: [{ b64_json: image }]
              }
            ],
            missing_ids: []
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const images = await generateOpenAICompatibleImage(
      {
        prompt: 'test prompt',
        imageCount: 1,
        size: '1152x2048',
        quality: 'standard',
        outputFormat: 'png',
        clientTaskId: 'task-123'
      },
      {
        enabled: true,
        apiBaseUrl: 'https://api.chaojitudou.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-image-2',
        timeoutMs: 30000,
        supportsEdits: false,
        supportsMulti: true,
        supportsStreaming: true,
        partialImages: 2
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [submitUrl, submitInit] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit
    ];
    expect(submitUrl).toBe(
      'https://api.chaojitudou.com/api/image-tasks/generations'
    );
    expect(JSON.parse(String(submitInit.body))).toMatchObject({
      client_task_id: 'task-123',
      model: 'gpt-image-2',
      prompt: 'test prompt',
      size: '1152x2048',
      quality: 'standard'
    });
    expect(JSON.parse(String(submitInit.body))).not.toHaveProperty('n');
    expect(JSON.parse(String(submitInit.body))).not.toHaveProperty('stream');
    expect(JSON.parse(String(submitInit.body))).not.toHaveProperty(
      'response_format'
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.chaojitudou.com/api/image-tasks?ids=task-123'
    );
    expect(images[0]).toMatchObject({
      dataUrl: `data:image/png;base64,${image}`,
      mimeType: 'image/png',
      source: 'b64_json'
    });
  });

  it('keeps chaojitudou on async tasks even when legacy streaming env is enabled', async () => {
    process.env.OPENAI_COMPAT_IMAGE_STREAMING_ALLOW_CHAO = 'true';
    const image = Buffer.from('chao-async-final').toString('base64');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'task-stream-env', status: 'queued' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'task-stream-env',
                status: 'success',
                data: [{ b64_json: image }]
              }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const images = await generateOpenAICompatibleImage(
      {
        prompt: 'test prompt',
        imageCount: 1,
        size: '1152x2048',
        quality: 'standard',
        outputFormat: 'png',
        clientTaskId: 'task-stream-env'
      },
      {
        enabled: true,
        apiBaseUrl: 'https://api.chaojitudou.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-image-2',
        timeoutMs: 30000,
        supportsEdits: false,
        supportsMulti: true,
        supportsStreaming: true,
        partialImages: 2
      }
    );

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit
    ];
    expect(url).toBe(
      'https://api.chaojitudou.com/api/image-tasks/generations'
    );
    expect(JSON.parse(String(init.body))).toMatchObject({
      client_task_id: 'task-stream-env',
      model: 'gpt-image-2',
      prompt: 'test prompt',
      size: '1152x2048',
      quality: 'standard'
    });
    expect(JSON.parse(String(init.body))).not.toHaveProperty('response_format');
    expect(JSON.parse(String(init.body))).not.toHaveProperty('stream');
    expect(images[0]).toMatchObject({
      dataUrl: `data:image/png;base64,${image}`,
      mimeType: 'image/png',
      source: 'b64_json'
    });
  });

  it('resumes chaojitudou async polling after a timeout task error', async () => {
    process.env.CHAOJITUDOU_IMAGE_TASK_POLL_MS = '1';
    process.env.CHAOJITUDOU_IMAGE_TASK_RESUME_EXTRA_SECS = '30';
    const image = Buffer.from('resumed-chao-image').toString('base64');
    const taskId = 'wtm:task:with:colon';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: taskId, status: 'queued' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: taskId,
                status: 'error',
                error: '内部轮询超时',
                conversation_id: 'conversation-1'
              }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: taskId, status: 'running' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: taskId,
                status: 'success',
                data: [{ b64_json: image }]
              }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const images = await generateOpenAICompatibleImage(
      {
        prompt: 'test prompt',
        imageCount: 1,
        outputFormat: 'png',
        clientTaskId: taskId
      },
      {
        enabled: true,
        apiBaseUrl: 'https://api.chaojitudou.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-image-2',
        timeoutMs: 30000,
        supportsEdits: false,
        supportsMulti: true,
        supportsStreaming: true
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1][0]).toBe(
      `https://api.chaojitudou.com/api/image-tasks?ids=${encodeURIComponent(
        taskId
      )}`
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      `https://api.chaojitudou.com/api/image-tasks/${encodeURIComponent(
        taskId
      )}/resume-poll`
    );
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      extra_timeout_secs: 30
    });
    expect(images[0]).toMatchObject({
      dataUrl: `data:image/png;base64,${image}`,
      source: 'b64_json'
    });
  });

  it('defers chaojitudou polling before a worker invocation can run too long', async () => {
    vi.useFakeTimers();
    process.env.CHAOJITUDOU_IMAGE_TASK_POLL_MS = '15000';
    process.env.CHAOJITUDOU_IMAGE_TASK_ACTIVE_POLL_BUDGET_MS = '30000';
    process.env.CHAOJITUDOU_IMAGE_TASK_DEFERRED_POLL_DELAY_MS = '7000';
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'slow-task', status: 'queued' }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        )
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              items: [{ id: 'slow-task', status: 'running' }],
              missing_ids: []
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        );
      vi.stubGlobal('fetch', fetchMock);

      const promise = generateOpenAICompatibleImage(
        {
          prompt: 'test prompt',
          imageCount: 1,
          outputFormat: 'png',
          clientTaskId: 'slow-task'
        },
        {
          enabled: true,
          apiBaseUrl: 'https://api.chaojitudou.com/v1',
          apiKey: 'sk-test',
          model: 'gpt-image-2',
          timeoutMs: 300000,
          supportsEdits: false,
          supportsMulti: true
        }
      );
      const caughtPromise = promise.catch((caught) => caught);

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(30000);

      const error = await caughtPromise;
      expect(error).toMatchObject({
        name: 'OpenAICompatibleImageProviderPendingError',
        providerTaskId: 'slow-task',
        retryAfterMs: 7000,
        failureCode: 'OPENAI_COMPAT_PROVIDER_PENDING'
      });
      expect(error).toBeInstanceOf(OpenAICompatibleImageProviderPendingError);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        'https://api.chaojitudou.com/api/image-tasks/generations'
      );
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses a short per-request timeout for chaojitudou async task calls', async () => {
    vi.useFakeTimers();
    process.env.CHAOJITUDOU_IMAGE_TASK_REQUEST_TIMEOUT_MS = '5000';
    try {
      let resolveFetchStarted: (() => void) | undefined;
      const fetchStarted = new Promise<void>((resolve) => {
        resolveFetchStarted = resolve;
      });
      const fetchMock = vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            resolveFetchStarted?.();
            const signal = init?.signal;
            if (signal instanceof AbortSignal) {
              signal.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'));
              });
            }
          })
      );
      vi.stubGlobal('fetch', fetchMock);

      const promise = generateOpenAICompatibleImage(
        {
          prompt: 'test prompt',
          imageCount: 1,
          outputFormat: 'png',
          clientTaskId: 'task-short-timeout'
        },
        {
          enabled: true,
          apiBaseUrl: 'https://api.chaojitudou.com/v1',
          apiKey: 'sk-test',
          model: 'gpt-image-2',
          timeoutMs: 300000,
          supportsEdits: false,
          supportsMulti: true
        }
      );

      await fetchStarted;
      const rejection = expect(promise).rejects.toMatchObject({
        name: 'OpenAICompatibleImageProviderPendingError',
        category: 'provider_unavailable',
        failureCode: 'OPENAI_COMPAT_PROVIDER_PENDING',
        message: expect.stringContaining('5s')
      });
      await vi.advanceTimersByTimeAsync(5000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('times out when a streaming image response stalls without an image', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(new ReadableStream<Uint8Array>(), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' }
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateOpenAICompatibleImage(
        {
          prompt: 'test prompt',
          imageCount: 1,
          outputFormat: 'png'
        },
        {
          enabled: true,
          apiBaseUrl: 'https://proxy.test/v1',
          apiKey: 'sk-test',
          model: 'gpt-image-2',
          timeoutMs: 5,
          supportsEdits: false,
          supportsMulti: true,
          supportsStreaming: true,
          partialImages: 2
        }
      )
    ).rejects.toMatchObject({
      category: 'timeout'
    });
  });

  it('keeps the latest partial image when a provider stream ends with an error', async () => {
    const partialImage = Buffer.from('partial-before-error').toString('base64');
    const fetchMock = vi.fn(
      async () =>
        new Response(
          [
            'event: image_generation.partial_image',
            `data: ${JSON.stringify({
              type: 'image_generation.partial_image',
              b64_json: partialImage
            })}`,
            '',
            'event: error',
            `data: ${JSON.stringify({
              type: 'error',
              error: { message: 'error code: 524' }
            })}`,
            ''
          ].join('\n'),
          { status: 200, headers: { 'content-type': 'text/event-stream' } }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const images = await generateOpenAICompatibleImage(
      {
        prompt: 'test prompt',
        imageCount: 1,
        outputFormat: 'png'
      },
      {
        enabled: true,
        apiBaseUrl: 'https://proxy.test/v1',
        apiKey: 'sk-test',
        model: 'gpt-image-2',
        timeoutMs: 30000,
        supportsEdits: false,
        supportsMulti: false,
        supportsStreaming: true
      }
    );

    expect(images[0]).toMatchObject({
      dataUrl: `data:image/png;base64,${partialImage}`,
      mimeType: 'image/png',
      source: 'b64_json'
    });
  });

  it('accepts provider stream events that omit the OpenAI type field', async () => {
    const finalImage = Buffer.from('provider-final').toString('base64');
    const fetchMock = vi.fn(
      async () =>
        new Response(`data: ${JSON.stringify({ b64_json: finalImage })}\n\n`, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' }
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const images = await generateOpenAICompatibleImage(
      {
        prompt: 'test prompt',
        imageCount: 1,
        outputFormat: 'png'
      },
      {
        enabled: true,
        apiBaseUrl: 'https://proxy.test/v1',
        apiKey: 'sk-test',
        model: 'gpt-image-2',
        timeoutMs: 30000,
        supportsEdits: false,
        supportsMulti: false,
        supportsStreaming: true
      }
    );

    expect(images[0]).toMatchObject({
      dataUrl: `data:image/png;base64,${finalImage}`,
      source: 'b64_json'
    });
  });

  it('accepts provider stream events with nested data.b64_json output', async () => {
    const finalImage = Buffer.from('nested-provider-final').toString('base64');
    const fetchMock = vi.fn(
      async () =>
        new Response(
          `data: ${JSON.stringify({
            object: 'image.generation.chunk',
            data: { b64_json: finalImage }
          })}\n\n`,
          {
            status: 200,
            headers: { 'content-type': 'text/event-stream' }
          }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const images = await generateOpenAICompatibleImage(
      {
        prompt: 'test prompt',
        imageCount: 1,
        outputFormat: 'png'
      },
      {
        enabled: true,
        apiBaseUrl: 'https://proxy.test/v1',
        apiKey: 'sk-test',
        model: 'gpt-image-2',
        timeoutMs: 30000,
        supportsEdits: false,
        supportsMulti: false,
        supportsStreaming: true
      }
    );

    expect(images[0]).toMatchObject({
      dataUrl: `data:image/png;base64,${finalImage}`,
      source: 'b64_json'
    });
  });

  it('builds a /images/edits multipart request when edits are enabled', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ b64_json: Buffer.from('edited').toString('base64') }]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    await editOpenAICompatibleImage(
      {
        prompt: 'edit prompt',
        imageCount: 1,
        outputFormat: 'jpeg',
        references: [
          {
            data: new Uint8Array([1, 2, 3]),
            mimeType: 'image/png',
            fileName: 'source.png'
          }
        ]
      },
      {
        enabled: true,
        apiBaseUrl: 'https://proxy.test/v1',
        apiKey: 'sk-test',
        model: 'gpt-image-2',
        timeoutMs: 30000,
        supportsEdits: true,
        supportsMulti: true
      }
    );

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit
    ];
    expect(url).toBe('https://proxy.test/v1/images/edits');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer sk-test'
    });
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('response_format')).toBe('b64_json');
  });

  it('classifies provider errors for routing and health scoring', () => {
    expect(classifyOpenAICompatibleImageHttpError(401)).toBe('auth');
    expect(classifyOpenAICompatibleImageHttpError(429)).toBe('rate_limit');
    expect(classifyOpenAICompatibleImageHttpError(503)).toBe(
      'provider_unavailable'
    );
    expect(classifyOpenAICompatibleImageHttpError(524)).toBe(
      'provider_unavailable'
    );
    expect(classifyOpenAICompatibleImageHttpError(400, 'safety blocked')).toBe(
      'policy'
    );
    expect(classifyOpenAICompatibleImageHttpError(500)).toBe(
      'provider_unavailable'
    );
    expect(
      classifyOpenAICompatibleImageHttpError(400, 'resource exhausted')
    ).toBe('provider_unavailable');
  });

  it('keeps usable images when one url output fails to download', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { b64_json: Buffer.from('kept').toString('base64') },
              { url: 'https://cdn.test/missing.png' }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(new Response('missing', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const images = await generateOpenAICompatibleImage(
      {
        prompt: 'test prompt',
        imageCount: 2,
        outputFormat: 'png'
      },
      {
        enabled: true,
        apiBaseUrl: 'https://proxy.test/v1',
        apiKey: 'sk-test',
        model: 'gpt-image-2',
        timeoutMs: 30000,
        supportsEdits: false,
        supportsMulti: true
      }
    );

    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      dataUrl: `data:image/png;base64,${Buffer.from('kept').toString('base64')}`,
      source: 'b64_json'
    });
  });
});
