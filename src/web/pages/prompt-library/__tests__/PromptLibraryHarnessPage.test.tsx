import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PromptLibraryHarnessPage } from '../PromptLibraryHarnessPage';

describe('PromptLibraryHarnessPage', () => {
  it('renders the isolated prompt library preview surface and updates debug state', () => {
    render(
      <MemoryRouter>
        <PromptLibraryHarnessPage />
      </MemoryRouter>
    );

    expect(screen.getByText('ISOLATED PREVIEW HARNESS')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Prompt Library Components' }))
      .toBeInTheDocument();

    const modelNav = screen.getByLabelText('Prompt 模型分类');
    expect(within(modelNav).getByRole('link', { name: 'ALL' }))
      .toBeInTheDocument();
    expect(within(modelNav).queryByText('1191')).not.toBeInTheDocument();
    const sortNav = screen.getByLabelText('Prompt 排序');
    expect(within(sortNav).getByRole('link', { name: '精选' })).toHaveClass(
      'active'
    );
    const tagNav = screen.getByLabelText('Prompt 标签');
    expect(
      within(tagNav).getByRole('link', { name: '人像摄影' })
    ).toHaveAttribute('href', '/zh-CN/prompts?label=portrait-photography');

    fireEvent.click(
      screen.getByRole('link', {
        name: '预览 Prompt 案例：Editorial portrait cover'
      })
    );
    expect(screen.getByText('preview:harness-editorial')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: '取消收藏案例：Product bundle key visual'
      })
    );
    expect(screen.getByText('favorite:harness-product')).toBeInTheDocument();

    expect(
      screen.getByRole('link', {
        name: '使用创意：Cinematic tracking shot'
      })
    ).toHaveAttribute(
      'href',
      '/zh-CN/video?caseId=harness-video'
    );
  });
});
