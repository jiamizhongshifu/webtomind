import { describe, expect, it, vi } from 'vitest';
import {
  defaultStudioImageSettings,
  normalizePromptEditorDraft
} from '../ImageCreatePage';

describe('ImageCreatePage studio default settings', () => {
  it('defaults new image sessions to Auto ratio and Auto size', () => {
    expect(defaultStudioImageSettings.aspectRatio).toBe('auto');
    expect(defaultStudioImageSettings.imageSize).toBe('auto');
    expect(defaultStudioImageSettings.imageCount).toBe(1);
  });
});

describe('ImageCreatePage prompt draft privacy', () => {
  it('keeps a signed-in user draft isolated from other users', () => {
    const draft = {
      ownerId: 'user-a',
      promptMode: 'custom',
      customPromptText: 'private campaign prompt',
      customNegativePromptText: '',
      savedAt: Date.now()
    };

    expect(normalizePromptEditorDraft(draft, 'user-a')?.customPromptText).toBe(
      'private campaign prompt'
    );
    expect(normalizePromptEditorDraft(draft, 'user-b')).toBeNull();
    expect(normalizePromptEditorDraft(draft, 'anonymous')).toBeNull();
  });

  it('allows a signed-in user to adopt the anonymous draft from the same tab', () => {
    const draft = {
      ownerId: 'anonymous',
      promptMode: 'custom',
      customPromptText: 'continue after login',
      customNegativePromptText: '',
      savedAt: Date.now()
    };

    expect(normalizePromptEditorDraft(draft, 'user-a')?.ownerId).toBe('user-a');
  });

  it('expires stale drafts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T00:00:00Z'));
    const draft = {
      ownerId: 'user-a',
      promptMode: 'custom',
      customPromptText: 'stale prompt',
      customNegativePromptText: '',
      savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000
    };

    expect(normalizePromptEditorDraft(draft, 'user-a')).toBeNull();
    vi.useRealTimers();
  });
});
