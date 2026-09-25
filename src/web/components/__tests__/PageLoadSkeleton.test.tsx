import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PageLoadSkeleton } from '../PageLoadSkeleton';

describe('PageLoadSkeleton', () => {
  it('shows the image workspace structure without a blocking spinner message', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/zh-CN/create/image?newSession=1']}>
        <PageLoadSkeleton />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('status', { name: '页面内容正在加载' })
    ).toHaveClass('page-load-skeleton--image');
    expect(container.querySelector('.page-load-skeleton-rail')).not.toBeNull();
    expect(
      container.querySelector('.page-load-skeleton-conversation')
    ).not.toBeNull();
    expect(
      container
        .querySelector('.page-load-skeleton-prompt')
        ?.contains(container.querySelector('.is-model-chip'))
    ).toBe(false);
    expect(
      container.querySelector('.page-load-skeleton-composer')
    ).not.toBeNull();
    expect(screen.queryByText('正在加载 WebToMind')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('renders an embedded pricing skeleton without duplicating the workspace rail', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/zh-CN/create/pricing']}>
        <PageLoadSkeleton variant="pricing" embedded />
      </MemoryRouter>
    );

    expect(container.querySelector('.page-load-skeleton-plans')).not.toBeNull();
    expect(container.querySelector('.page-load-skeleton-rail')).toBeNull();
  });
});
