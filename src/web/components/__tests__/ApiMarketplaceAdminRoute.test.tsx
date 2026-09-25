import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiMarketplaceAdminRoute } from '../ApiMarketplaceAdminRoute';

const authState = vi.hoisted(() => ({
  user: null as { email: string } | null,
  isAuthenticated: false,
  isLoading: false
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState
}));

vi.mock('@/utils/env', () => ({
  isE2EAuthBypassEnabled: () => false
}));

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/zh-CN/models?tab=all']}>
      <Routes>
        <Route
          path="/zh-CN/models"
          element={
            <ApiMarketplaceAdminRoute>
              <main>admin marketplace</main>
            </ApiMarketplaceAdminRoute>
          }
        />
        <Route path="/zh-CN/create" element={<main>creator home</main>} />
        <Route path="/login" element={<main>login</main>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ApiMarketplaceAdminRoute', () => {
  beforeEach(() => {
    authState.user = null;
    authState.isAuthenticated = false;
    authState.isLoading = false;
  });

  it('redirects anonymous visitors to login with return intent', () => {
    renderRoute();

    expect(screen.getByText('login')).toBeInTheDocument();
    expect(screen.queryByText('admin marketplace')).not.toBeInTheDocument();
  });

  it('renders the marketplace for any authenticated user (full launch)', () => {
    authState.user = { email: 'user@example.com' };
    authState.isAuthenticated = true;

    renderRoute();

    expect(screen.getByText('admin marketplace')).toBeInTheDocument();
  });

  it('renders the marketplace for the original admin email as well', () => {
    authState.user = { email: 'admin@example.com' };
    authState.isAuthenticated = true;

    renderRoute();

    expect(screen.getByText('admin marketplace')).toBeInTheDocument();
  });
});
