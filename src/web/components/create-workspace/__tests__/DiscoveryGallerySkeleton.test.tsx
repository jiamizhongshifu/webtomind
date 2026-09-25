import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiscoveryGallerySkeleton } from '../DiscoveryGallery';

describe('DiscoveryGallerySkeleton', () => {
  it('renders a varied masonry placeholder without loading real images', () => {
    const { container } = render(
      <DiscoveryGallerySkeleton kind="images" isEnglish={false} />
    );

    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      '正在加载图像灵感'
    );
    expect(
      container.querySelectorAll('.discovery-image-skeleton-tile')
    ).toHaveLength(15);
    expect(
      container
        .querySelector('.discovery-image-skeleton-tile')
        ?.getAttribute('style')
    ).toContain('--discovery-image-tone');
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  it('uses moodboard collage placeholders for the moodboard tab', () => {
    const { container } = render(
      <DiscoveryGallerySkeleton kind="moodboards" isEnglish />
    );

    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Loading moodboards'
    );
    expect(
      container.querySelectorAll('.discovery-moodboard-skeleton-tile')
    ).toHaveLength(6);
    expect(
      container.querySelectorAll('.discovery-moodboard-skeleton-collage span')
    ).toHaveLength(24);
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });
});
