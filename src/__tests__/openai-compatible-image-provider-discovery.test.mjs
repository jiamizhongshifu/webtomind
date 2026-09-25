import { describe, expect, it, vi } from 'vitest';
import {
  buildModelsUrl,
  discoverOpenAICompatibleImageProvider,
  maskSecret,
  validateOpenAIModelsDiscoveryPayload
} from '../../scripts/validate-openai-compatible-image-provider.mjs';

describe('OpenAI-compatible image provider discovery validation', () => {
  it('builds the /models URL from the configured base URL', () => {
    expect(buildModelsUrl('https://proxy.test/v1/')).toBe(
      'https://proxy.test/v1/models'
    );
  });

  it('accepts the configured image model and records non-user models', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          object: 'list',
          data: [
            { id: 'gpt-image-2', object: 'model' },
            { id: 'gpt-5-chat-latest', object: 'model' },
            { id: 'gpt-5-mini', object: 'model' }
          ]
        }),
        { status: 200, statusText: 'OK' }
      )
    );
    const logger = { log: vi.fn() };

    const result = await discoverOpenAICompatibleImageProvider({
      env: {
        OPENAI_IMAGE_API_BASE_URL: 'https://proxy.test/v1',
        OPENAI_IMAGE_API_KEY: 'sk-test-secret-value',
        OPENAI_IMAGE_MODEL: 'gpt-image-2'
      },
      fetchImpl,
      logger
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://proxy.test/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test-secret-value',
          Accept: 'application/json'
        })
      })
    );
    expect(result.modelIds).toEqual([
      'gpt-image-2',
      'gpt-5-chat-latest',
      'gpt-5-mini'
    ]);
    expect(result.nonUserModels).toEqual(['gpt-5-chat-latest', 'gpt-5-mini']);
    expect(result.config.maskedApiKey).toBe(maskSecret('sk-test-secret-value'));

    const logOutput = logger.log.mock.calls.flat().join('\n');
    expect(logOutput).toContain(
      'Non-user models returned (not failing): gpt-5-chat-latest, gpt-5-mini'
    );
    expect(logOutput).not.toContain('sk-test-secret-value');
  });

  it('cleans pasted newline markers from production env values', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          object: 'list',
          data: [{ id: 'gpt-image-2', object: 'model' }]
        }),
        { status: 200, statusText: 'OK' }
      )
    );

    const result = await discoverOpenAICompatibleImageProvider({
      env: {
        OPENAI_IMAGE_API_BASE_URL: 'https://proxy.test/v1\\n',
        OPENAI_IMAGE_API_KEY: 'sk-test-secret-value\\n',
        OPENAI_IMAGE_MODEL: 'gpt-image-2\\n'
      },
      fetchImpl,
      logger: { log: vi.fn() }
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://proxy.test/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test-secret-value'
        })
      })
    );
    expect(result.config.model).toBe('gpt-image-2');
  });

  it('fails when the configured model is missing from /models', () => {
    expect(() =>
      validateOpenAIModelsDiscoveryPayload(
        {
          object: 'list',
          data: [{ id: 'gpt-5-chat-latest', object: 'model' }]
        },
        'gpt-image-2'
      )
    ).toThrow(/Configured OPENAI_IMAGE_MODEL/);
  });

  it('fails on non-200 /models responses without logging the key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        statusText: 'Unauthorized'
      })
    );
    const logger = { log: vi.fn() };

    await expect(
      discoverOpenAICompatibleImageProvider({
        env: {
          OPENAI_BASE_URL: 'https://proxy.test/v1',
          OPENAI_API_KEY: 'sk-prod-secret',
          OPENAI_IMAGE_MODEL: 'gpt-image-2'
        },
        fetchImpl,
        logger
      })
    ).rejects.toThrow(/HTTP 200/);

    const logOutput = logger.log.mock.calls.flat().join('\n');
    expect(logOutput).not.toContain('sk-prod-secret');
  });
});
