import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from '../AppErrorBoundary';

function StaleChunkFailure(): ReactNode {
  throw new Error(
    'Failed to fetch dynamically imported module: /assets/Page.old.js'
  );
}

function WrappedChunkFailure(): ReactNode {
  throw new TypeError(
    "Cannot read properties of undefined (reading 'CreateCharactersPage')"
  );
}

describe('AppErrorBoundary stale asset recovery', () => {
  const suppressExpectedError = (event: ErrorEvent) => {
    event.preventDefault();
  };

  afterEach(() => {
    window.removeEventListener('error', suppressExpectedError);
    vi.restoreAllMocks();
  });

  it('shows a neutral update state while a stale asset reload is scheduled', () => {
    window.addEventListener('error', suppressExpectedError);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const recoverStaleAsset = vi.fn(() => 'scheduled' as const);

    render(
      <AppErrorBoundary recoverStaleAsset={recoverStaleAsset}>
        <StaleChunkFailure />
      </AppErrorBoundary>
    );

    expect(recoverStaleAsset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent(
      '正在更新 WebToMind'
    );
    expect(screen.queryByText('页面发生错误')).not.toBeInTheDocument();
  });

  it('offers a manual reload when same-version recovery is blocked', async () => {
    window.addEventListener('error', suppressExpectedError);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const recoverStaleAsset = vi.fn(() => 'blocked' as const);

    render(
      <AppErrorBoundary recoverStaleAsset={recoverStaleAsset}>
        <StaleChunkFailure />
      </AppErrorBoundary>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('页面更新已暂停');
    });
    expect(screen.getByRole('button', { name: '重新加载页面' })).toBeVisible();
  });

  it('keeps the neutral state when Vite already scheduled recovery', () => {
    window.addEventListener('error', suppressExpectedError);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const recoverStaleAsset = vi.fn(() => 'not-stale' as const);

    render(
      <AppErrorBoundary
        recoverStaleAsset={recoverStaleAsset}
        isStaleRecoveryPending={() => true}
      >
        <WrappedChunkFailure />
      </AppErrorBoundary>
    );

    expect(recoverStaleAsset).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(
      '正在更新 WebToMind'
    );
    expect(console.error).not.toHaveBeenCalled();
  });
});
