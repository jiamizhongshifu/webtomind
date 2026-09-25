import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Navigation, NavigationLink, NavigationList } from '../navigation';

describe('Navigation', () => {
  it('renders accessible navigation links with active page semantics', () => {
    render(
      <Navigation aria-label="Primary" variant="marketing" density="compact">
        <NavigationList>
          <NavigationLink href="/create">Create</NavigationLink>
          <NavigationLink href="/pricing" isActive>
            Pricing
          </NavigationLink>
        </NavigationList>
      </Navigation>
    );

    expect(screen.getByRole('navigation', { name: 'Primary' })).toHaveClass(
      'ui-navigation--marketing',
      'ui-navigation--compact'
    );
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveClass(
      'active',
      'ui-navigation-link--active'
    );
  });
});
