import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MoodboardAnalysisError,
  analyzePreparedMoodboardImages,
  isBlockedMoodboardImageHostname,
  parseMoodboardAnalysisResponse,
  selectMoodboardAnalysisItems,
  validateTrustedMoodboardImageUrl,
  type PreparedMoodboardImage
} from '../../api/moodboards/visual-analysis';

const ORIGINAL_ENV = { ...process.env };
const liveTuziMoodboardSmoke =
  process.env.REAL_TUZI_MOODBOARD_SMOKE === '1' ? it : it.skip;

function makePreparedImages(count = 4): PreparedMoodboardImage[] {
  return Array.from({ length: count }, (_, index) => ({
    item: {
      id: `item-${index + 1}`,
      moodboard_id: 'board-1',
      source: 'upload',
      image_url: `https://images.example.com/${index + 1}.png`
    },
    imageReferenceId: `reference-${index + 1}`,
    mimeType: 'image/png',
    bytes: new Uint8Array([137, 80, 78, 71]),
    base64: 'iVBORw0KGgo='
  }));
}

function validAnalysisPayload() {
  return JSON.stringify({
    tasteProfile:
      '低饱和自然光结合克制的环境构图，以柔和层次、轻微颗粒和安静留白维持统一的编辑叙事感。',
    keywords: ['低饱和', '自然光', '环境叙事', '轻微颗粒'],
    avoids: ['高饱和霓虹', '过度锐化', '杂乱文字'],
    guidelines: ['使用柔和侧光', '保留环境留白', '控制画面对比度'],
    representativeIndexes: [1, 3]
  });
}

beforeEach(() => {
  for (const key of [
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_GEMINI_API_KEY',
    'TUZI_TEXT_CHANNEL_CONNECTION',
    'TUZI_CHANNEL_CONNECTION',
    'TUZI_NEWAPI_CHANNEL_CONNECTION',
    'TUZI_TEXT_API_KEY',
    'TUZI_API_KEY',
    'TUZI_TEXT_BASE_URL',
    'TUZI_API_BASE_URL',
    'MOODBOARD_ANALYSIS_PROVIDER',
    'MOODBOARD_ANALYSIS_TUZI_MODEL'
  ]) {
    delete process.env[key];
  }
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('moodboard visual analysis contract', () => {
  it('maps model-selected images to owned reference assets', () => {
    const result = parseMoodboardAnalysisResponse(
      JSON.stringify({
        tasteProfile:
          '低饱和胶片色彩配合自然漫射光，构图保留较多环境信息，并用浅景深维持安静、克制的叙事感。',
        keywords: ['低饱和', '胶片颗粒', '自然漫射光', '环境叙事'],
        avoids: ['高饱和霓虹', '过度锐化', '杂乱文字'],
        guidelines: ['使用柔和侧光', '保留环境留白', '维持轻微胶片颗粒'],
        representativeIndexes: [3, 1, 3, 99]
      }),
      [
        { imageReferenceId: 'reference-1' },
        { imageReferenceId: 'reference-2' },
        { imageReferenceId: 'reference-3' },
        { imageReferenceId: 'reference-4' }
      ]
    );

    expect(result.representativeAssetIds).toEqual([
      'reference-3',
      'reference-1'
    ]);
    expect(result.keywords).toContain('胶片颗粒');
  });

  it('rejects incomplete output instead of inventing a generic profile', () => {
    expect(() =>
      parseMoodboardAnalysisResponse(
        JSON.stringify({ tasteProfile: '通用风格', keywords: ['自然'] }),
        [{ imageReferenceId: 'reference-1' }]
      )
    ).toThrow(MoodboardAnalysisError);
  });

  it('accepts fenced JSON while keeping a deterministic representative fallback', () => {
    const result = parseMoodboardAnalysisResponse(
      `\`\`\`json
      {"tasteProfile":"自然光下的低饱和纪实画面，以环境留白和轻颗粒建立安静的编辑感。","keywords":["自然光","低饱和","纪实","留白"],"avoids":["霓虹灯","过度锐化"],"guidelines":["保留环境信息","使用柔和光线"]}
      \`\`\``,
      Array.from({ length: 6 }, (_, index) => ({
        imageReferenceId: `reference-${index + 1}`
      }))
    );

    expect(result.representativeAssetIds).toEqual([
      'reference-1',
      'reference-2',
      'reference-3',
      'reference-4'
    ]);
  });

  it('rejects local, private and insecure image sources', () => {
    for (const hostname of [
      'localhost',
      '127.0.0.1',
      '10.1.2.3',
      '100.64.0.1',
      '172.20.1.1',
      '192.168.1.1',
      '169.254.169.254',
      '::1',
      'fd00::1',
      '::ffff:172.16.2.3',
      '::ffff:100.64.2.3'
    ]) {
      expect(isBlockedMoodboardImageHostname(hostname)).toBe(true);
    }
    expect(isBlockedMoodboardImageHostname('fcdn.example.com')).toBe(false);
    expect(() =>
      validateTrustedMoodboardImageUrl('http://images.example.com/a.jpg')
    ).toThrow(MoodboardAnalysisError);
    expect(
      validateTrustedMoodboardImageUrl('https://images.example.com/a.jpg').href
    ).toBe('https://images.example.com/a.jpg');
  });

  it('prioritizes representative items and caps analysis at eight images', () => {
    const selected = selectMoodboardAnalysisItems(
      Array.from({ length: 12 }, (_, index) => ({
        id: `item-${index}`,
        moodboard_id: 'board-1',
        source: 'upload',
        image_url: `https://images.example.com/${index}.jpg`,
        sort_order: index,
        is_representative: index === 9
      }))
    );

    expect(selected).toHaveLength(8);
    expect(selected[0].id).toBe('item-9');
  });

  it('uses a Tuzi NewAPI channel connection for multimodal analysis', async () => {
    process.env.TUZI_API_KEY = JSON.stringify({
      _type: 'newapi_channel_conn',
      key: 'test-tuzi-key',
      url: 'https://tuzi.example.test'
    });
    process.env.MOODBOARD_ANALYSIS_PROVIDER = 'tuzi';
    process.env.MOODBOARD_ANALYSIS_TUZI_MODEL = 'gpt-vision-test';
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as {
        model?: string;
        messages?: Array<{ content?: Array<{ type?: string }> }>;
      };
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer test-tuzi-key'
      });
      expect(body.model).toBe('gpt-vision-test');
      expect(
        body.messages?.[0]?.content?.filter((part) => part.type === 'image_url')
      ).toHaveLength(4);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: validAnalysisPayload() } }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const analysis = await analyzePreparedMoodboardImages(
      makePreparedImages()
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuzi.example.test/v1/chat/completions',
      expect.any(Object)
    );
    expect(analysis.representativeAssetIds).toEqual([
      'reference-1',
      'reference-3'
    ]);
  });

  it('falls back to Tuzi when the official Gemini request fails', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.TUZI_TEXT_API_KEY = 'test-tuzi-key';
    process.env.TUZI_TEXT_BASE_URL = 'https://tuzi.example.test/v1';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'offline' } }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: validAnalysisPayload() } }]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const analysis = await analyzePreparedMoodboardImages(
      makePreparedImages()
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      'https://tuzi.example.test/v1/chat/completions'
    );
    expect(analysis.keywords).toContain('自然光');
  });

  it('fails clearly when neither Gemini nor Tuzi is configured', async () => {
    await expect(
      analyzePreparedMoodboardImages(makePreparedImages())
    ).rejects.toMatchObject({ status: 503 });
  });

  liveTuziMoodboardSmoke(
    'analyzes four real images through the configured Tuzi channel',
    async () => {
      const liveConnection =
        ORIGINAL_ENV.TUZI_TEXT_CHANNEL_CONNECTION ||
        ORIGINAL_ENV.TUZI_CHANNEL_CONNECTION ||
        ORIGINAL_ENV.TUZI_NEWAPI_CHANNEL_CONNECTION ||
        ORIGINAL_ENV.TUZI_API_KEY;
      expect(liveConnection).toBeTruthy();
      process.env.TUZI_CHANNEL_CONNECTION = liveConnection;
      process.env.MOODBOARD_ANALYSIS_PROVIDER = 'tuzi';
      process.env.MOODBOARD_ANALYSIS_TUZI_MODEL =
        ORIGINAL_ENV.MOODBOARD_ANALYSIS_TUZI_MODEL || 'gpt-5.5';
      const files = [
        'src/web/assets/home/neon-collage-workflow.webp',
        'src/web/assets/home/hero-atelier.webp',
        'src/web/assets/home/capture-wall.webp',
        'src/web/assets/home/cta-landscape.webp'
      ];
      const prepared = files.map((file, index) => {
        const bytes = new Uint8Array(readFileSync(file));
        return {
          item: {
            id: `live-item-${index + 1}`,
            moodboard_id: 'live-board',
            source: 'upload',
            image_url: file
          },
          imageReferenceId: `live-reference-${index + 1}`,
          mimeType: 'image/webp',
          bytes,
          base64: Buffer.from(bytes).toString('base64')
        } satisfies PreparedMoodboardImage;
      });

      const result = await analyzePreparedMoodboardImages(prepared);

      expect(result.tasteProfile.length).toBeGreaterThan(30);
      expect(result.keywords.length).toBeGreaterThanOrEqual(3);
      expect(result.avoids.length).toBeGreaterThanOrEqual(2);
      expect(result.guidelines.length).toBeGreaterThanOrEqual(2);
      expect(result.representativeAssetIds.length).toBeGreaterThan(0);
      expect(result.representativeAssetIds.length).toBeLessThanOrEqual(4);
    },
    60_000
  );
});
