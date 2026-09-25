// @vitest-environment node
/**
 * /api/agent/skill-image-chat 纯逻辑单测：
 * - 请求校验（无 BYO Key，平台 Agent）
 * - 平台 DeepSeek 配置解析
 * - SDK 消息 → SSE 事件映射
 * - 官方技能路由
 */
import { describe, it, expect } from 'vitest';
import {
  validateRequest,
  buildSystemPrompt,
  buildSkillConfigPrompt,
  buildUserOutputParamsPrompt,
  buildReferenceContextPrompt,
  mapSdkMessageToEvents,
  extractImageUrl,
  resolvePlatformAgentConfig,
  sumCreditBalance
} from '../../api/agent/skill-image-chat';
import {
  extractSkillGenerationIds,
  extractSkillToolResult,
  extractSkillResultSummary
} from '../web/components/image-create/skill-image-chat/constants';

describe('validateRequest (platform agent, no BYO key)', () => {
  it('rejects missing prompt', () => {
    const result = validateRequest({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('accepts prompt without any API key (platform agent)', () => {
    const result = validateRequest({ prompt: '生成一张海报' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.skillId).toBe('image_creation');
      expect(result.value.prompt).toBe('生成一张海报');
    }
  });

  it('defaults to image_creation and rejects unknown skills', () => {
    const ok = validateRequest({ prompt: 'x' });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.skillId).toBe('image_creation');
    expect(validateRequest({ prompt: 'x', skillId: 'other' }).ok).toBe(false);
  });

  it('rejects unknown mode for image_creation', () => {
    const bad = validateRequest({ prompt: 'x', mode: 'nope' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('未知创作模式');
  });
});

describe('resolvePlatformAgentConfig', () => {
  it('sums platform credit balance across all buckets', () => {
    expect(
      sumCreditBalance({
        daily_credits: 100,
        subscription_credits: 500,
        bonus_credits: 20,
        referral_credits: 5,
        media_credits: 10,
        promo_media_credits: 2
      })
    ).toBe(637);
  });

  it('treats missing buckets as zero', () => {
    expect(sumCreditBalance({ bonus_credits: 7 })).toBe(7);
    expect(sumCreditBalance(null)).toBe(0);
  });

  it('returns null when no platform key configured', () => {
    expect(resolvePlatformAgentConfig({})).toBeNull();
    expect(
      resolvePlatformAgentConfig({ GOOGLE_API_KEY: 'sk-google' })
    ).toBeNull();
  });

  it('resolves DeepSeek config with normalized baseURL', () => {
    const config = resolvePlatformAgentConfig({
      DEEPSEEK_API_KEY: 'sk-platform',
      DEEPSEEK_MODEL: 'deepseek-v4-pro'
    });
    expect(config).toEqual({
      apiKey: 'sk-platform',
      baseURL: 'https://api.deepseek.com/v1',
      model: 'deepseek-v4-pro'
    });
  });

  it('keeps an already versioned baseURL and falls back to default model', () => {
    const config = resolvePlatformAgentConfig({
      OPENAI_API_KEY: 'sk-x',
      DEEPSEEK_BASE_URL: 'https://gateway.example.com/v1'
    });
    expect(config?.baseURL).toBe('https://gateway.example.com/v1');
    expect(config?.model).toBe('deepseek-v4-flash');
  });
});

describe('zhong_female_portrait_director skill in API', () => {
  it('accepts the official female-portrait skill with valid modes', () => {
    const ok = validateRequest({
      prompt: '给我做一张写真',
      skillId: 'zhong_female_portrait_director',
      mode: 'series'
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.skillId).toBe('zhong_female_portrait_director');
      expect(ok.value.mode).toBe('series');
    }
  });

  it('rejects unknown mode for the female-portrait skill', () => {
    const bad = validateRequest({
      prompt: '写真',
      skillId: 'zhong_female_portrait_director',
      mode: 'poster'
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('未知创作模式');
  });

  it('builds skill-specific system prompt', () => {
    const fp = buildSystemPrompt('zhong_female_portrait_director', 'free');
    expect(fp).toContain('[Skill] zhong_female_portrait_director (official)');
    expect(fp).toContain('女性写真视觉导演');
    expect(fp).toContain('【GPT Image2提示词】');
  });
});

describe('skillConfig（技能前置配置）', () => {
  it('injects selected config into the system prompt with strict guidance', () => {
    const section = buildSkillConfigPrompt({
      pose: 'look-back-over-shoulder',
      light: 'golden-hour-side',
      imageSize: '2k',
      imageCount: 1
    });
    expect(section).toContain('## 用户前置配置（严格遵循）');
    expect(section).toContain('- pose：look-back-over-shoulder');
    expect(section).toContain('- light：golden-hour-side');
    expect(section).toContain('- imageSize：2k');
    expect(section).toContain('严格按以上组合编译提示词');
  });

  it('skips empty/auto config and returns empty for no config', () => {
    expect(buildSkillConfigPrompt()).toBe('');
    expect(buildSkillConfigPrompt({})).toBe('');
    expect(
      buildSkillConfigPrompt({ pose: 'auto', camera: '', imageSize: '2k' })
    ).toContain('imageSize：2k');
    expect(buildSkillConfigPrompt({ pose: 'auto', camera: '' })).not.toContain(
      'pose'
    );
  });

  it('buildSystemPrompt appends the config section', () => {
    const prompt = buildSystemPrompt('zhong_female_portrait_director', 'free', {
      light: 'ccd-soft-flash',
      makeup: 'gloss-lip-flash'
    });
    expect(prompt).toContain(
      '[Skill] zhong_female_portrait_director (official)'
    );
    expect(prompt).toContain('## 用户前置配置（严格遵循）');
    expect(prompt).toContain('- light：ccd-soft-flash');
    expect(prompt).toContain('- makeup：gloss-lip-flash');
  });

  it('validateRequest sanitizes skillConfig to scalar values', () => {
    const ok = validateRequest({
      prompt: '写真',
      skillId: 'zhong_female_portrait_director',
      skillConfig: {
        pose: 'look-back-over-shoulder',
        light: 2,
        ignored: { nested: true }
      }
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.skillConfig).toEqual({
        pose: 'look-back-over-shoulder',
        light: 2
      });
    }
  });

  it('rejects skillConfig with too many entries', () => {
    const huge: Record<string, string> = {};
    for (let i = 0; i < 25; i++) huge[`k${i}`] = 'v';
    const result = validateRequest({ prompt: 'x', skillConfig: huge });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('truncates oversized skillConfig keys and values', () => {
    const ok = validateRequest({
      prompt: 'x',
      skillConfig: {
        [`k${'a'.repeat(60)}`]: 'drop-long-key',
        pose: 'v'.repeat(200)
      }
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(Object.keys(ok.value.skillConfig || {})).toEqual(['pose']);
      expect(ok.value.skillConfig?.pose).toHaveLength(120);
    }
  });

  it('rejects too many reference images', () => {
    const referenceImages = Array.from({ length: 5 }, () => ({
      data: 'data:image/png;base64,aaaa',
      mimeType: 'image/png'
    }));
    const result = validateRequest({
      prompt: 'x',
      context: { referenceImages }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('rejects oversized reference image data', () => {
    const result = validateRequest({
      prompt: 'x',
      context: {
        referenceImages: [
          {
            data: 'data:image/png;base64,' + 'a'.repeat(4_000_001),
            mimeType: 'image/png'
          }
        ]
      }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('accepts and normalizes user aspectRatio / imageSize', () => {
    const ok = validateRequest({
      prompt: '写真',
      skillId: 'zhong_female_portrait_director',
      aspectRatio: '9:16',
      imageSize: '1152x2048'
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.aspectRatio).toBe('9:16');
      expect(ok.value.imageSize).toBe('1152x2048');
    }
  });

  it('drops auto aspectRatio / imageSize to undefined', () => {
    const ok = validateRequest({
      prompt: 'x',
      aspectRatio: 'auto',
      imageSize: 'auto'
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.aspectRatio).toBeUndefined();
      expect(ok.value.imageSize).toBeUndefined();
    }
  });

  it('rejects invalid aspectRatio and imageSize', () => {
    expect(validateRequest({ prompt: 'x', aspectRatio: '99:1' }).ok).toBe(false);
    expect(validateRequest({ prompt: 'x', imageSize: '99999x1' }).ok).toBe(false);
  });

  it('accepts and caps reference images / character params', () => {
    const ok = validateRequest({
      prompt: '写真',
      skillId: 'zhong_female_portrait_director',
      referenceImageIds: ['a', 'b', 'c', 'd', 'e'],
      characterCardIds: ['card-1', 'card-1', 'card-2'],
      characterReferenceGroups: [
        { label: '主角', referenceImageIds: ['r1', 'r2', 'r3', 'r4'] }
      ],
      referenceMode: 'character_consistency'
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.referenceImageIds).toEqual(['a', 'b', 'c', 'd']);
      expect(ok.value.characterCardIds).toEqual(['card-1', 'card-2']);
      expect(ok.value.characterReferenceGroups?.[0].referenceImageIds).toEqual([
        'r1',
        'r2',
        'r3'
      ]);
      expect(ok.value.referenceMode).toBe('character_consistency');
    }
  });

  it('rejects too many character groups and invalid referenceMode', () => {
    const groups = Array.from({ length: 3 }, () => ({
      label: 'g',
      referenceImageIds: ['r1']
    }));
    expect(
      validateRequest({ prompt: 'x', characterReferenceGroups: groups }).ok
    ).toBe(false);
    expect(
      validateRequest({
        prompt: 'x',
        referenceMode: 'nope'
      }).ok
    ).toBe(false);
  });
});

describe('buildSystemPrompt', () => {
  it('prefixes skill marker and embeds mode guidance', () => {
    const prompt = buildSystemPrompt('image_creation', 'portrait');
    expect(prompt).toContain('[Skill] image_creation (official)');
    expect(prompt).toContain('当前创作模式：人像写真');
  });

  it('embeds user output params (aspectRatio / imageSize) when provided', () => {
    const prompt = buildSystemPrompt(
      'zhong_female_portrait_director',
      'free',
      undefined,
      { aspectRatio: '9:16', imageSize: '1152x2048' }
    );
    expect(prompt).toContain('## 用户出图参数（严格遵循）');
    expect(prompt).toContain('- 画幅比例：9:16');
    expect(prompt).toContain('- 出图尺寸：1152x2048');
  });
});

describe('buildUserOutputParamsPrompt', () => {
  it('returns empty when no params or only auto', () => {
    expect(buildUserOutputParamsPrompt(undefined)).toBe('');
    expect(buildUserOutputParamsPrompt({ aspectRatio: 'auto' })).toBe('');
  });

  it('lists chosen ratio and size', () => {
    const text = buildUserOutputParamsPrompt({
      aspectRatio: '3:4',
      imageSize: '2k'
    });
    expect(text).toContain('画幅比例：3:4');
    expect(text).toContain('出图尺寸：2k');
    expect(text).toContain('generate_image');
  });
});

describe('buildReferenceContextPrompt', () => {
  it('returns empty when no reference params', () => {
    expect(buildReferenceContextPrompt(undefined)).toBe('');
    expect(buildReferenceContextPrompt({})).toBe('');
  });

  it('mentions reference images and character consistency', () => {
    const text = buildReferenceContextPrompt({
      referenceImageIds: ['a', 'b'],
      characterReferenceGroups: [{ referenceImageIds: ['r1'] }]
    });
    expect(text).toContain('参考图 2 张');
    expect(text).toContain('角色一致：1 组');
    expect(text).toContain('generate_image');
  });
});

describe('mapSdkMessageToEvents', () => {
  it('maps partial_message to text', () => {
    const events = mapSdkMessageToEvents({
      type: 'partial_message',
      content: '正在生成'
    });
    expect(events).toEqual([{ event: 'text', data: { content: '正在生成' } }]);
  });

  it('maps assistant blocks to text + tool_call', () => {
    const events = mapSdkMessageToEvents({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: '我先做提示词' },
          {
            type: 'tool_use',
            id: 't1',
            name: 'generate_image',
            input: { prompt: 'x' }
          }
        ]
      }
    });
    expect(events[0]).toEqual({
      event: 'text',
      data: { content: '我先做提示词' }
    });
    expect(events[1]).toEqual({
      event: 'tool_call',
      data: {
        name: 'generate_image',
        input: { prompt: 'x' },
        status: 'running'
      }
    });
  });

  it('maps tool_result with imageUrl to tool_result + image', () => {
    const events = mapSdkMessageToEvents({
      type: 'tool_result',
      tool_name: 'generate_image',
      result: { imageUrl: 'data:image/png;base64,AAAA' },
      is_error: false
    });
    expect(events[0].event).toBe('tool_result');
    expect(events[1]).toEqual({
      event: 'image',
      data: { url: 'data:image/png;base64,AAAA' }
    });
  });

  it('maps result to done and error subtype to error', () => {
    expect(mapSdkMessageToEvents({ type: 'result' })).toEqual([
      { event: 'done', data: {} }
    ]);
    expect(
      mapSdkMessageToEvents({
        type: 'result',
        subtype: 'error:timeout',
        result: '超时'
      })
    ).toEqual([{ event: 'error', data: { message: '超时' } }]);
  });
});

describe('extractImageUrl', () => {
  it('handles raw data URL, JSON string, and nested object', () => {
    expect(extractImageUrl('data:image/png;base64,AA')).toBe(
      'data:image/png;base64,AA'
    );
    expect(extractImageUrl('{"imageUrl":"data:image/jpeg;base64,BB"}')).toBe(
      'data:image/jpeg;base64,BB'
    );
    expect(extractImageUrl({ data: { imageUrl: 'https://cdn/x.png' } })).toBe(
      'https://cdn/x.png'
    );
    expect(extractImageUrl({ foo: 1 })).toBeUndefined();
    expect(extractImageUrl('no url')).toBeUndefined();
  });
});

describe('extractSkillResultSummary', () => {
  it('extracts the final result sentence from verbose agent output', () => {
    const verbose = `**创作模式判断：日常写真** —— 用户要一张日常随拍感的人像，我按方法论抽取组合。

**故事契约**：周末下午，她刚把杯子里的咖啡喝到一半。

**七段提示卡**：主题/主体/人物·表情/服装·姿势…

现在调用图像通道出图：图片已生成 ✅`;
    expect(extractSkillResultSummary(verbose)).toBe('图片已生成 ✅');
  });

  it('falls back to the last non-empty line when no result marker exists', () => {
    expect(extractSkillResultSummary('过程说明第一行\n最终反馈')).toBe(
      '最终反馈'
    );
  });

  it('returns empty for empty input and keeps user messages intact', () => {
    expect(extractSkillResultSummary('')).toBe('');
    expect(extractSkillResultSummary('   ')).toBe('');
  });
});

describe('extractSkillGenerationIds', () => {
  it('extracts generationIds from tool result JSON string', () => {
    const ids = extractSkillGenerationIds(
      JSON.stringify({
        imageUrl: 'https://x/y.png',
        generationId: 'gen-1',
        images: [
          { imageUrl: 'https://x/1.png', generationId: 'gen-a' },
          { imageUrl: 'https://x/2.png', generationId: 'gen-b' }
        ]
      })
    );
    expect(ids).toEqual(['gen-a', 'gen-b']);
  });

  it('falls back to top-level generationId when images missing', () => {
    expect(
      extractSkillGenerationIds('{"generationId":"gen-top"}')
    ).toEqual(['gen-top']);
  });

  it('returns empty for non-JSON or empty input', () => {
    expect(extractSkillGenerationIds('not json')).toEqual([]);
    expect(extractSkillGenerationIds(undefined)).toEqual([]);
    expect(extractSkillGenerationIds('{}')).toEqual([]);
  });
});

describe('extractSkillToolResult', () => {
  it('extracts taskId and generationIds', () => {
    const result = extractSkillToolResult(
      JSON.stringify({
        taskId: 'task-1',
        generationId: 'gen-1',
        images: [{ imageUrl: 'x', generationId: 'gen-a' }]
      })
    );
    expect(result).toEqual({ taskId: 'task-1', generationIds: ['gen-a'] });
  });

  it('returns empty for non-JSON', () => {
    expect(extractSkillToolResult('nope')).toEqual({ generationIds: [] });
    expect(extractSkillToolResult(undefined)).toEqual({ generationIds: [] });
  });
});
