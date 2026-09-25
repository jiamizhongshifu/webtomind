import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  SkillAgentChat,
  type SkillAgentChatProps
} from './SkillAgentChat';

const baseProps: SkillAgentChatProps = {
  messages: [],
  streamingText: '',
  images: [],
  running: false
};

describe('SkillAgentChat', () => {
  it('returns null when there is nothing to show', () => {
    const { container } = render(<SkillAgentChat {...baseProps} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders result summary instead of verbose process text for assistant messages', async () => {
    render(
      <SkillAgentChat
        {...baseProps}
        messages={[
          { role: 'user', content: '秋叶原逛街' },
          {
            role: 'assistant',
            content:
              '**创作模式判断：日常写真** —— 我按方法论抽取组合。\n\n**故事契约**：周末下午。\n\n**七段提示卡**：主题/主体/表情…\n\n现在调用图像通道出图：图片已生成 ✅'
          }
        ]}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('你')).toBeInTheDocument();
    });
    expect(screen.getByText('秋叶原逛街')).toBeInTheDocument();
    expect(screen.getByText('图片已生成 ✅')).toBeInTheDocument();
    expect(screen.queryByText(/创作模式判断/)).not.toBeInTheDocument();
    expect(screen.queryByText(/故事契约/)).not.toBeInTheDocument();
    expect(screen.queryByText(/七段提示卡/)).not.toBeInTheDocument();
  });

  it('renders preview trigger and download button for each image', async () => {
    const onPreviewImage = vi.fn();
    const onDownloadImage = vi.fn();
    const images = [
      { url: 'https://cdn.example.com/a.png', prompt: '日常写真' },
      { url: 'https://cdn.example.com/b.png', prompt: '写真探索' }
    ];
    render(
      <SkillAgentChat
        {...baseProps}
        messages={[
          { role: 'user', content: '秋叶原逛街' },
          { role: 'assistant', content: '图片已生成 ✅' }
        ]}
        images={images}
        onPreviewImage={onPreviewImage}
        onDownloadImage={onDownloadImage}
      />
    );
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: /预览生成图片/ })
      ).toHaveLength(2);
    });
    const previewButtons = screen.getAllByRole('button', {
      name: /预览生成图片/
    });
    const downloadButtons = screen.getAllByRole('button', {
      name: /下载生成图片/
    });
    expect(downloadButtons).toHaveLength(2);

    fireEvent.click(previewButtons[0]);
    expect(onPreviewImage).toHaveBeenCalledWith(images[0], 0);
    fireEvent.click(downloadButtons[1]);
    expect(onDownloadImage).toHaveBeenCalledWith(images[1]);
  });

  it('renders error banner', async () => {
    render(
      <SkillAgentChat
        {...baseProps}
        messages={[{ role: 'user', content: '秋名山散步' }]}
        error="生成通道连续超时，未能出图"
      />
    );
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        '生成通道连续超时，未能出图'
      );
    });
  });

  it('shows streaming placeholder while running without text', async () => {
    render(
      <SkillAgentChat
        {...baseProps}
        messages={[{ role: 'user', content: '海边日落' }]}
        running
      />
    );
    await waitFor(() => {
      expect(screen.getByText('正在生成图片…')).toBeInTheDocument();
    });
  });
});
