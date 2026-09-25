import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PromptLibrarySeoContent } from '../PromptLibrarySeoContent';

const zhText = (zh: string, en = zh) => ({ zh, en });

describe('PromptLibrarySeoContent', () => {
  it('renders rich SEO sections, related links, style CTA, and FAQ', () => {
    render(
      <MemoryRouter>
        <PromptLibrarySeoContent
          isZh
          showSrefReferences={false}
          hasRichSeoContent
          richBadge="模型专题"
          richIntent="面向想复用 Prompt 案例的创作者。"
          richKeywords={['GPT Image 2 prompt', 'AI 写真']}
          shouldShowStyleGridCta
          relatedSeoLinks={[{ href: '/zh-CN/prompts', label: 'Prompt 案例库' }]}
          richWorkflow={[zhText('先固定主体和光影。')]}
          richExamples={[zhText('电商商品图。')]}
          richSections={[
            {
              title: zhText('结构拆解'),
              body: zhText('把 prompt 拆成稳定 slot。'),
              items: [zhText('主体'), zhText('镜头')]
            }
          ]}
          richFaq={[
            {
              question: zhText('提示词要写很长吗？'),
              answer: zhText('不一定，结构清楚更重要。')
            }
          ]}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('模型专题')).toBeInTheDocument();
    expect(screen.getByLabelText('SEO keywords')).toHaveTextContent(
      'GPT Image 2 prompt'
    );
    expect(screen.getByRole('link', { name: /Open Theme Cards/ }))
      .toHaveAttribute('href', '/ai-image-style-grid');
    expect(screen.getByRole('link', { name: 'Prompt 案例库' }))
      .toHaveAttribute('href', '/zh-CN/prompts');
    expect(screen.getByRole('heading', { name: '推荐工作流' }))
      .toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '结构拆解' }))
      .toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '提示词要写很长吗？' }))
      .toBeInTheDocument();
  });

  it('renders SREF references separately from rich SEO content', () => {
    render(
      <MemoryRouter>
        <PromptLibrarySeoContent
          isZh={false}
          showSrefReferences
          hasRichSeoContent={false}
          richBadge=""
          richIntent=""
          richKeywords={[]}
          shouldShowStyleGridCta={false}
          relatedSeoLinks={[]}
          richWorkflow={[]}
          richExamples={[]}
          richSections={[]}
          richFaq={[]}
        />
      </MemoryRouter>
    );

    const section = screen.getByRole('heading', {
      name: 'External SREF references'
    }).closest('section');
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getAllByRole('link').length)
      .toBeGreaterThan(0);
  });
});
