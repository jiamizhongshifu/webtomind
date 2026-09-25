import { describe, expect, it } from 'vitest';
import type { VisualImageHistoryItem } from '@/services/agent-api';
import type { ReverseSessionDraft } from '../useAssetUpload';
import { splitFallbackPrompt } from '../useAssetUpload';
import {
  buildGeneratedImageSummaryMarkdown,
  buildReverseSessionAssets,
  escapeHtmlText,
  formatPromptForClipboard,
  getCreateEntrySourceFromSearch,
  getCreateLocalePrefix,
  getSharedPromptCaseId,
  getSummaryImageDimensions,
  inferPromptTitle,
  isWeakPromptTitle,
  parseImageRatioValue,
  pickPromptLocale,
  sanitizeCreateEntrySource
} from '../imageCreatePromptUtils';

function makeHistoryItem(
  patch: Partial<VisualImageHistoryItem> = {}
): VisualImageHistoryItem {
  return {
    id: 'history-1',
    imageUrl: 'https://example.com/image.png',
    prompt: '生成一张 16:9，赛博城市夜景，霓虹雨',
    negativePrompt: '',
    aspectRatio: '16:9',
    ...patch
  } as VisualImageHistoryItem;
}

describe('imageCreatePromptUtils', () => {
  it('parses ratio and size strings without accepting invalid values', () => {
    expect(parseImageRatioValue('16:9')).toEqual({ width: 16, height: 9 });
    expect(parseImageRatioValue('4 / 3')).toEqual({ width: 4, height: 3 });
    expect(parseImageRatioValue('1024×768')).toEqual({
      width: 1024,
      height: 768
    });
    expect(parseImageRatioValue('0:9')).toBeNull();
    expect(parseImageRatioValue('square')).toBeNull();
  });

  it('derives summary dimensions from explicit dimensions, ratios, or fallback', () => {
    expect(
      getSummaryImageDimensions(
        makeHistoryItem({ width: 1023.6, height: 768.2 })
      )
    ).toEqual({ width: 1024, height: 768 });
    expect(
      getSummaryImageDimensions(
        makeHistoryItem({ width: 0, height: 0, aspectRatio: '9:16' })
      )
    ).toEqual({ width: 900, height: 1600 });
    expect(
      getSummaryImageDimensions(
        makeHistoryItem({ width: 0, height: 0, aspectRatio: undefined })
      )
    ).toEqual({ width: 1200, height: 1200 });
  });

  it('escapes text and builds safe generated image summary markup', () => {
    expect(escapeHtmlText(`a&b<"c">'`)).toBe(
      'a&amp;b&lt;&quot;c&quot;&gt;&#39;'
    );

    const markdown = buildGeneratedImageSummaryMarkdown(
      makeHistoryItem({
        id: 'id-1"',
        imageUrl: 'https://example.com/a?x=<script>',
        prompt: '主体：猫咪 <hero>',
        negativePrompt: 'blur & noise',
        modelLabel: 'Model "A"'
      })
    );

    expect(markdown).toContain('猫咪 &lt;hero&gt;');
    expect(markdown).toContain('src="https://example.com/a?x=&lt;script&gt;"');
    expect(markdown).toContain('data-generation-id="id-1&quot;"');
    expect(markdown).toContain('Model &quot;A&quot;');
    expect(markdown).toContain('blur &amp; noise');
  });

  it('builds temporary reverse-session assets from non-empty prompt rows', () => {
    const draft: ReverseSessionDraft = {
      thumbnailUrl: '',
      source: 'prompt',
      fullPrompt: '',
      negativePrompt: '',
      rows: [
        {
          key: 'empty',
          selected: true,
          slot: 'style',
          title: '',
          subtitle: '',
          prompt: '   ',
          negativePrompt: '',
          tagsText: ''
        },
        {
          key: 'row-1',
          selected: true,
          slot: 'character',
          title: '  主角  ',
          subtitle: '',
          prompt: '  blue coat  ',
          negativePrompt: '  blur  ',
          tagsText: 'portrait, blue, '
        }
      ],
      ok: true
    };

    expect(buildReverseSessionAssets(draft, 'session-1')).toMatchObject([
      {
        id: 'reverse-session-1-character-0',
        slot: 'character',
        title: '主角',
        subtitle: '临时组合',
        prompt: 'blue coat',
        negativePrompt: 'blur',
        tags: ['portrait', 'blue']
      }
    ]);
  });

  it('splits pasted fallback prompts with Chinese negative prompt labels', () => {
    expect(
      splitFallbackPrompt('主体提示正文。\n\n负向 PROMPT: 文字、标志、水印')
    ).toEqual({
      prompt: '主体提示正文。',
      negative: '文字、标志、水印'
    });

    expect(
      splitFallbackPrompt('主体提示正文；负面提示：低清晰度，坏手')
    ).toEqual({
      prompt: '主体提示正文；',
      negative: '低清晰度，坏手'
    });
  });

  it('picks locale and extracts locale-aware route helpers', () => {
    expect(pickPromptLocale('en')).toBe('en-US');
    expect(pickPromptLocale('zh-CN')).toBe('zh-CN');
    expect(getCreateLocalePrefix('/zh-CN/create/image')).toBe('/zh-CN');
    expect(getCreateLocalePrefix('/create/image')).toBe('');
    expect(getSharedPromptCaseId('/en-US/create/prompts/share/case%201')).toBe(
      'case 1'
    );
    expect(getSharedPromptCaseId('/create/image')).toBeNull();
  });

  it('sanitizes create entry sources from direct values and search params', () => {
    expect(sanitizeCreateEntrySource(' hero cta!/测试 ')).toBe('hero_cta____');
    expect(sanitizeCreateEntrySource('   ')).toBeUndefined();
    expect(getCreateEntrySourceFromSearch('?cta_source=pricing card')).toBe(
      'pricing_card'
    );
    expect(getCreateEntrySourceFromSearch('?utm_campaign=spring-sale')).toBe(
      'spring-sale'
    );
  });

  it('formats prompt clipboard text and identifies weak prompt titles', () => {
    expect(formatPromptForClipboard(' prompt ', ' negative ')).toBe(
      'prompt\n\nNegative prompt: negative'
    );
    expect(formatPromptForClipboard(' prompt ', ' ')).toBe('prompt');
    expect(isWeakPromptTitle('16:9')).toBe(true);
    expect(isWeakPromptTitle('Portrait')).toBe(false);
    expect(inferPromptTitle('16:9，主体：银发旅人，雪山', 'Untitled')).toBe(
      '银发旅人'
    );
  });
});
