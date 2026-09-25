import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiscoveryImage } from '@/services/create-workspace-v2-api';
import { DiscoveryImagePreview } from '../DiscoveryGallery';

const baseImage: DiscoveryImage = {
  id: 'prompt-case-1',
  kind: 'prompt_case',
  title: '雾中白马',
  imageUrl: '/prompt-cases/horse.webp',
  prompt: '',
  promptPreview: '一匹白马站在清晨薄雾的草地上…',
  promptLocked: true,
  model: 'GPT Image 2',
  href: '/prompts/prompt-case-1'
};

function renderPreview(image: DiscoveryImage) {
  return render(
    <MemoryRouter>
      <DiscoveryImagePreview
        image={image}
        related={[]}
        prefix="/zh-CN"
        isEnglish={false}
      />
    </MemoryRouter>
  );
}

describe('DiscoveryImagePreview prompt access', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('shows only the public preview and an unlock action while locked', () => {
    renderPreview(baseImage);

    expect(screen.queryByText(baseImage.title)).toBeNull();
    expect(screen.getByText(baseImage.promptPreview!)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '登录查看完整提示词' })
    ).toHaveAttribute('href', expect.stringContaining('/zh-CN/login?'));
    expect(screen.queryByRole('button', { name: '复制提示词' })).toBeNull();
    expect(screen.queryByRole('button', { name: '带入创作台' })).toBeNull();
    expect(screen.queryByRole('link', { name: '生成视频' })).toBeNull();
  });

  it('opens a cost-confirmed new studio session in a new tab after unlock', () => {
    const fullPrompt = '一匹白马站在清晨薄雾的草地上，写实自然光摄影。';
    renderPreview({
      ...baseImage,
      prompt: fullPrompt,
      promptLocked: false
    });

    expect(screen.getByText(fullPrompt)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '复制提示词' })
    ).toBeInTheDocument();
    const recreateLink = screen.getByRole('link', { name: '带入创作台' });
    expect(recreateLink).toHaveAttribute('target', '_blank');
    expect(recreateLink).toHaveAttribute('rel', 'noopener noreferrer');
    recreateLink.click();
    expect(recreateLink).toHaveAttribute(
      'href',
      expect.stringContaining('/zh-CN/image?')
    );
    expect(recreateLink).toHaveAttribute(
      'href',
      expect.stringContaining('newSession=1')
    );
    expect(recreateLink.getAttribute('href')).not.toContain('autoGenerate=1');
    expect(recreateLink).toHaveAttribute(
      'href',
      expect.stringContaining('recreateKey=')
    );
    expect(screen.getByRole('link', { name: '生成视频' })).toBeInTheDocument();
    expect(screen.queryByText('登录查看完整提示词')).toBeNull();
  });
});
