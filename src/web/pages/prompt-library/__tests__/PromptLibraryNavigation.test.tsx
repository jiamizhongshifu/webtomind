import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  PromptLibraryNavigation,
  PromptLibrarySortTabs
} from '../PromptLibraryNavigation';

const marketingCss = readFileSync(
  join(process.cwd(), 'src/web/styles/marketing-pages.css'),
  'utf8'
);

describe('PromptLibraryNavigation', () => {
  it('does not auto-scroll active filters again when only children rerender', () => {
    vi.useFakeTimers();
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView
    });

    const renderNavigation = (extraLabel = '人像摄影') => (
      <MemoryRouter>
        <PromptLibraryNavigation
          isZh
          modelItems={[]}
          tagItems={[
            {
              key: 'all',
              label: 'ALL',
              href: '/zh-CN/prompts',
              active: true
            },
            {
              key: 'tag:portrait',
              label: extraLabel,
              href: '/zh-CN/prompts?label=portrait-photography',
              active: false
            }
          ]}
          sortItems={[
            {
              key: 'featured',
              label: '精选',
              href: '/zh-CN/prompts',
              active: true
            }
          ]}
        />
      </MemoryRouter>
    );

    try {
      const { rerender } = render(renderNavigation());
      act(() => {
        vi.runAllTimers();
      });
      expect(scrollIntoView).toHaveBeenCalledTimes(1);

      rerender(renderNavigation('人像摄影 2'));
      act(() => {
        vi.runAllTimers();
      });
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
          configurable: true,
          value: originalScrollIntoView
        });
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
      }
    }
  });

  it('renders mobile model filters and prompt tag links without count badges', () => {
    render(
      <MemoryRouter>
        <PromptLibraryNavigation
          isZh
          modelItems={[
            {
              key: 'all',
              label: 'ALL',
              count: 1191,
              href: '/zh-CN/prompts',
              active: true
            },
            {
              key: 'model:gpt-image-2',
              label: 'GPT Image 2',
              count: 1158,
              href: '/zh-CN/prompts/model/gpt-image-2',
              active: false
            }
          ]}
          tagItems={[
            {
              key: 'all',
              label: 'ALL',
              href: '/zh-CN/prompts',
              active: true
            },
            {
              key: 'tag:portrait',
              label: '人像摄影',
              href: '/zh-CN/prompts?label=portrait-photography',
              active: false
            }
          ]}
          sortItems={[
            {
              key: 'featured',
              label: '精选',
              href: '/zh-CN/prompts',
              active: true
            }
          ]}
        />
      </MemoryRouter>
    );

    const modelNav = screen.getByLabelText('Prompt 模型分类');
    expect(within(modelNav).getByRole('link', { name: 'ALL' })).toHaveClass(
      'active'
    );
    expect(within(modelNav).queryByText('1191')).not.toBeInTheDocument();
    expect(
      within(modelNav).getByRole('link', { name: /GPT Image 2/ })
    ).toHaveAttribute('href', '/zh-CN/prompts/model/gpt-image-2');

    const tagNav = screen.getByLabelText('Prompt 标签');
    expect(within(tagNav).getByRole('link', { name: 'ALL' })).toHaveClass(
      'active'
    );
    expect(
      within(tagNav).getByRole('link', { name: '人像摄影' })
    ).toHaveAttribute('href', '/zh-CN/prompts?label=portrait-photography');
    const toolbarSortNav = screen.getByLabelText('Prompt 排序（标签行）');
    expect(
      within(toolbarSortNav).getByRole('link', { name: '精选' })
    ).toHaveClass('active');
  });

  it('renders independent sort tabs', () => {
    render(
      <MemoryRouter>
        <PromptLibrarySortTabs
          isZh
          items={[
            {
              key: 'featured',
              label: '精选',
              href: '/zh-CN/prompts',
              active: true
            },
            {
              key: 'latest',
              label: '最新',
              href: '/zh-CN/prompts?sort=latest',
              active: false
            },
            {
              key: 'hot',
              label: '最热',
              href: '/zh-CN/prompts?sort=hot',
              active: false
            }
          ]}
        />
      </MemoryRouter>
    );

    const sortNav = screen.getByLabelText('Prompt 排序');
    expect(within(sortNav).getByRole('link', { name: '精选' })).toHaveClass(
      'active'
    );
    expect(within(sortNav).getByRole('link', { name: '最新' })).toHaveAttribute(
      'href',
      '/zh-CN/prompts?sort=latest'
    );
    expect(within(sortNav).getByRole('link', { name: '最热' })).toHaveAttribute(
      'href',
      '/zh-CN/prompts?sort=hot'
    );
  });

  it('keeps sort tabs scrollable on narrow screens', () => {
    expect(marketingCss).toMatch(
      /\.prompt-browser-sort-tabs\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?overflow-x:\s*auto;[\s\S]*?\}/
    );
    expect(marketingCss).toMatch(
      /\.prompt-browser-tag-toolbar\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;[\s\S]*?\}/
    );
    expect(marketingCss).toMatch(
      /\.prompt-browser-sort-tabs-mobile\s*\{[\s\S]*?display:\s*none;[\s\S]*?\}/
    );
    expect(marketingCss).toMatch(
      /@media\s*\(max-width:\s*980px\)\s*\{[\s\S]*?\.prompt-browser-sort-tabs-mobile\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?\}/
    );
    expect(marketingCss).toMatch(
      /@media\s*\(max-width:\s*980px\)\s*\{[\s\S]*?\.prompt-browser-sort-tabs-desktop\s*\{[\s\S]*?display:\s*none;[\s\S]*?\}/
    );
    expect(marketingCss).toMatch(
      /@media\s*\(max-width:\s*820px\)\s*\{[\s\S]*?\.prompt-browser-sort-tabs\s*\{[\s\S]*?justify-self:\s*end;[\s\S]*?width:\s*max-content;[\s\S]*?\}/
    );
  });
});
