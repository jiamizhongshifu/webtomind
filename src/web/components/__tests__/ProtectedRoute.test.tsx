import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from '../ProtectedRoute';

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState
}));

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="current location">{location.search}</output>;
}

function renderProtectedRoute(initialEntry = '/zh-CN/create/image?draft=one') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/zh-CN/create/image"
          element={
            <ProtectedRoute>
              <main>private image workspace</main>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
  });

  it('redirects an anonymous visitor to the login-modal route with return intent', () => {
    renderProtectedRoute();

    expect(screen.getByLabelText('current location')).toHaveTextContent(
      '?redirect=%2Fzh-CN%2Fcreate%2Fimage%3Fdraft%3Done'
    );
    expect(
      screen.queryByText('private image workspace')
    ).not.toBeInTheDocument();
  });

  it('renders the protected workspace after authentication', () => {
    authState.isAuthenticated = true;
    renderProtectedRoute();

    expect(screen.getByText('private image workspace')).toBeInTheDocument();
  });

  it('does not flash private content while auth is loading', () => {
    authState.isLoading = true;
    renderProtectedRoute();

    expect(
      screen.getByRole('status', { name: '页面内容正在加载' })
    ).toBeInTheDocument();
    expect(screen.queryByText('加载中...')).not.toBeInTheDocument();
    expect(
      screen.queryByText('private image workspace')
    ).not.toBeInTheDocument();
  });
});
