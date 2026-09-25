import { render, screen } from '@testing-library/react';
import { ExternalLink } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { IconLink } from '../IconLink';

describe('IconLink', () => {
  it('shares the labelled icon-control contract', () => {
    render(
      <IconLink
        href="https://example.com"
        label="Open example"
        icon={<ExternalLink />}
        size="sm"
        variant="ghost"
      />
    );

    const link = screen.getByRole('link', { name: 'Open example' });
    expect(link).toHaveAttribute('title', 'Open example');
    expect(link).toHaveClass(
      'ui-icon-button',
      'ui-icon-link',
      'ui-icon-button--sm',
      'ui-icon-button--ghost'
    );
    expect(link.querySelector('.ui-icon-button__icon')).not.toBeNull();
  });
});
