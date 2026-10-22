import { describe, expect, it } from 'vitest';
import type { PromptCase } from '@/services/agent-api';
import {
  getPromptCaseOriginalPrompt,
  getPromptCaseFullPromptForLocale,
  getPromptCasePromptForLocale
} from '../promptLibraryDisplay';

const example = { id: 'original', locale: 'zh-CN' } as PromptCase;

describe('original prompt display', () => {
  it.each([
    'An original image prompt',
    '这是可核实的中文原文',
    'アップロードした写真を保持する',
    '업로드한 사진의 특징을 유지하세요'
  ])(
    'preserves the complete shared source without assuming its language: %s',
    (prefix) => {
      const original =
        `${prefix}\n\n${'Complete original instructions. '.repeat(30)}`.trim();
      const item = {
        ...example,
        prompt: original,
        promptZh: original,
        promptEn: original,
        promptPreview: 'Truncated preview',
        promptPreviewZh: 'Truncated preview',
        promptPreviewEn: 'Truncated preview'
      };
      expect(getPromptCaseOriginalPrompt(item)).toBe(original);
      for (const locale of ['zh-CN', 'en-US'] as const) {
        expect(getPromptCasePromptForLocale(item, locale)).toBe(original);
        expect(getPromptCaseFullPromptForLocale(item, locale)).toBe(original);
      }
    }
  );

  it('ignores whitespace differences for identity but retains original formatting', () => {
    const item = {
      ...example,
      promptZh: 'Draw a room.\nKeep its layout.',
      promptEn: 'Draw a room. Keep its layout.'
    };
    expect(getPromptCaseOriginalPrompt(item)).toBe(
      'Draw a room.\nKeep its layout.'
    );
  });

  it('keeps distinct translations and rejects a different contaminated English field', () => {
    const item = { ...example, promptZh: '绘制房间', promptEn: 'Draw a room' };
    expect(getPromptCaseOriginalPrompt(item)).toBe('');
    expect(getPromptCasePromptForLocale(item, 'zh-CN')).toBe('绘制房间');
    expect(getPromptCasePromptForLocale(item, 'en-US')).toBe('Draw a room');
    expect(
      getPromptCasePromptForLocale(
        { ...item, promptEn: '完全不同的错误中文' },
        'en-US'
      )
    ).toBe('');
  });
});
