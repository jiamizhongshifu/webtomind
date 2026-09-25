import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageLightbox } from '../ImageLightbox';

vi.mock('@/shared/useVisualImageCache', () => ({
  useVisualImageCache: ({ sourceUrl }: { sourceUrl: string }) => sourceUrl
}));

function renderLightbox(overrides = {}) {
  const props = {
    imageUrl: 'https://example.com/image.png',
    ariaLabel: '图片预览',
    downloadLabel: '下载',
    closeLabel: '关闭',
    onClose: vi.fn(),
    ...overrides
  };

  return {
    ...render(<ImageLightbox {...props} />),
    props
  };
}

describe('ImageLightbox', () => {
  it('uses shared overlay behavior for Escape, focus target, and scroll lock', () => {
    const { props, unmount } = renderLightbox();

    const dialog = screen.getByRole('dialog', { name: '图片预览' });
    expect(dialog).toHaveAttribute('tabindex', '-1');
    expect(dialog.closest('.creator-prompt-case-lightbox')?.parentElement).toBe(
      document.body
    );
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(props.onClose).toHaveBeenCalledTimes(1);

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps arrow navigation domain-owned', () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const onClose = vi.fn();
    renderLightbox({
      canNavigate: true,
      previousLabel: '上一张',
      nextLabel: '下一张',
      onPrevious,
      onNext,
      onClose
    });

    fireEvent.keyDown(document, { key: 'ArrowLeft', code: 'ArrowLeft' });
    fireEvent.keyDown(document, { key: 'ArrowRight', code: 'ArrowRight' });

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
