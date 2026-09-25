import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeDiscoveryImageForSearch,
  parseDiscoveryVisualSearchResponse
} from '../../api/discovery/visual-search-analysis';

const ORIGINAL_ENV = { ...process.env };

describe('/api/discovery/describe-image descriptor', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it('parses the compact JSON returned by the visual search model', () => {
    expect(
      parseDiscoveryVisualSearchResponse(
        '```json\n{"description":"雾中草地上的白马","keywords":["白马","晨雾","草地","自然光"]}\n```'
      )
    ).toEqual({
      description: '雾中草地上的白马',
      keywords: ['白马', '晨雾', '草地', '自然光'],
      searchQuery: '白马 晨雾 草地 自然光'
    });
  });

  it('uses the configured Tuzi channel connection before Gemini', async () => {
    delete process.env.TUZI_TEXT_CHANNEL_CONNECTION;
    delete process.env.TUZI_TEXT_BASE_URL;
    delete process.env.TUZI_API_BASE_URL;
    process.env.MOODBOARD_ANALYSIS_PROVIDER = 'tuzi';
    process.env.TUZI_CHANNEL_CONNECTION = JSON.stringify({
      key: 'test-key',
      url: 'https://vision.example.com'
    });
    process.env.GOOGLE_API_KEY = 'google-fallback-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                '{"description":"蓝色产品摄影","keywords":["产品摄影","蓝色","极简构图"]}'
            }
          }
        ]
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      analyzeDiscoveryImageForSearch({
        base64: 'AAAA',
        mimeType: 'image/png',
        locale: 'zh-CN'
      })
    ).resolves.toMatchObject({
      keywords: ['产品摄影', '蓝色', '极简构图']
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://vision.example.com/v1/chat/completions'
    );
  });

  it('uses Chaojitudou gpt-5.6 for visual search analysis', async () => {
    process.env.DISCOVERY_IMAGE_ANALYSIS_PROVIDER = 'chaojitudi';
    process.env.OPENAI_IMAGE_API_KEY = 'chaojitudou-test-key';
    process.env.OPENAI_IMAGE_API_BASE_URL =
      'https://api.chaojitudou.com/v1';
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as {
        model?: string;
        messages?: Array<{
          content?: Array<{ type?: string; image_url?: { url?: string } }>;
        }>;
      };
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer chaojitudou-test-key'
      });
      expect(body.model).toBe('gpt-5.6');
      expect(body.messages?.[0]?.content?.[1]?.image_url?.url).toBe(
        'data:image/png;base64,AAAA'
      );
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"description":"暗色图片搜索界面","keywords":["图片搜索","暗色界面","上传图片"]}'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      analyzeDiscoveryImageForSearch({
        base64: 'AAAA',
        mimeType: 'image/png',
        locale: 'zh-CN'
      })
    ).resolves.toMatchObject({
      keywords: ['图片搜索', '暗色界面', '上传图片']
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api.chaojitudou.com/v1/chat/completions'
    );
  });
});
