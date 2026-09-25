import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreationFavoriteButton } from '../CreationFavoriteButton';

describe('CreationFavoriteButton', () => {
  it('uses the same pressed state and callback for every creation preview', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <CreationFavoriteButton favorite={false} onClick={onClick} />
    );

    const addButton = screen.getByRole('button', { name: '加入收藏' });
    expect(addButton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(addButton);
    expect(onClick).toHaveBeenCalledOnce();

    rerender(<CreationFavoriteButton favorite onClick={onClick} />);
    expect(screen.getByRole('button', { name: '取消收藏' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('shares the disabled loading feedback across image and video previews', () => {
    const { container } = render(
      <CreationFavoriteButton
        favorite={false}
        loading
        favoriteLabel="Add to favorites"
        onClick={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Add to favorites' })
    ).toBeDisabled();
    expect(container.querySelector('.creator-spin-icon')).not.toBeNull();
  });
});
