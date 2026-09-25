import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UserAvatar } from '../UserAvatar';

describe('UserAvatar', () => {
  it('treats the avatar as decorative unless a caller supplies alt text', () => {
    const { container } = render(
      <UserAvatar src="https://cdn.example.com/avatar.png" name="Zhong" />
    );

    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders cache-friendly eager avatar attributes', () => {
    const { container } = render(
      <UserAvatar
        src="https://cdn.example.com/avatar.png"
        alt="Creator avatar"
        loading="eager"
        fetchPriority="high"
        size={48}
        name="Zhong"
      />
    );

    const wrapper = container.querySelector('[data-avatar-loaded]');
    const image = screen.getByAltText('Creator avatar');

    expect(wrapper).toHaveAttribute('data-avatar-loaded', 'true');
    expect(wrapper).toHaveClass('user-avatar');
    expect(image).toHaveClass('user-avatar__image');
    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveAttribute('decoding', 'async');
    expect(image).toHaveAttribute('fetchpriority', 'high');
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(image).toHaveAttribute('draggable', 'false');
  });

  it('falls back to a stable initial when the image fails', () => {
    const { container } = render(
      <UserAvatar
        src="https://cdn.example.com/broken.png"
        alt="Broken avatar"
        loading="lazy"
        name="Zhong"
      />
    );

    fireEvent.error(screen.getByAltText('Broken avatar'));

    expect(screen.queryByAltText('Broken avatar')).toBeNull();
    expect(container.querySelector('[data-avatar-loaded]')).toHaveAttribute(
      'data-avatar-loaded',
      'false'
    );
    expect(screen.getByText('Z')).toBeInTheDocument();
    expect(screen.getByText('Z')).toHaveClass('user-avatar__fallback');
  });
});
