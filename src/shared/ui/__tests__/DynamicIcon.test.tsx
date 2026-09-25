import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ButtonLink, DynamicIcon, type DynamicIconName } from '..';
import { MemoryRouter } from 'react-router-dom';

describe('DynamicIcon', () => {
  it('renders motion icons through the shared primitive boundary', () => {
    const sidebarIcons: DynamicIconName[] = [
      'home',
      'inspiration',
      'prompt-library',
      'image-create',
      'video-create',
      'gallery',
      'characters',
      'apps',
      'tasks',
      'workspace'
    ];
    const { container } = render(
      <div>
        <DynamicIcon name="copy" data-testid="copy-icon" />
        <DynamicIcon name="external-link" data-testid="external-icon" />
        {sidebarIcons.map((name) => (
          <DynamicIcon key={name} name={name} data-testid={`icon-${name}`} />
        ))}
      </div>
    );

    expect(screen.getByTestId('copy-icon')).toHaveClass('ui-dynamic-icon');
    expect(screen.getByTestId('external-icon')).toHaveClass('ui-dynamic-icon');
    expect(screen.getByTestId('icon-inspiration')).toHaveAttribute(
      'data-icon-name',
      'inspiration'
    );
    expect(container.querySelectorAll('svg')).toHaveLength(
      sidebarIcons.length + 2
    );
  });

  it('keeps accessible naming on the owning button/link component', () => {
    render(
      <MemoryRouter>
        <ButtonLink
          to="/"
          leadingIcon={<DynamicIcon name="external-link" size={16} />}
        >
          Go to WebToMind
        </ButtonLink>
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Go to WebToMind' })).toBeVisible();
  });
});
