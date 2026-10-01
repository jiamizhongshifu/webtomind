import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleOneTapLoginPrompt } from '../GoogleOneTapLoginPrompt';

const props = {
  enabled: true,
  redirectPath: '/zh-CN/prompts',
  onCredentialLogin: vi.fn().mockResolvedValue({ error: null }),
  onFallbackLogin: vi.fn().mockResolvedValue({ error: null })
};

function mockGoogle() {
  const id = { initialize: vi.fn(), prompt: vi.fn(), cancel: vi.fn() };
  window.google = { accounts: { id } };
  return id;
}

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  delete window.google;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Google login suggestion', () => {
  it('allows first-visit login without stealing focus or locking scrolling', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const { unmount } = render(
      <GoogleOneTapLoginPrompt {...props} preferInlineCard />
    );
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).not.toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: '使用 Google 继续' }));
    await waitFor(() => expect(props.onFallbackLogin).toHaveBeenCalledOnce());
    expect(sessionStorage.getItem('webtomind:post-login-redirect')).toBe(
      '/zh-CN/prompts'
    );
    unmount();
    trigger.remove();
  });

  it('keeps a dismissed suggestion closed across route changes and remounts', async () => {
    const view = render(
      <GoogleOneTapLoginPrompt {...props} preferInlineCard />
    );
    fireEvent.click(screen.getByRole('button', { name: '关闭登录提示' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    view.rerender(
      <GoogleOneTapLoginPrompt
        {...props}
        redirectPath="/en-US/prompts"
        preferInlineCard
      />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    view.unmount();
    render(<GoogleOneTapLoginPrompt {...props} preferInlineCard />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancels native One Tap and ignores late moment and credential callbacks when disabled', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client');
    const id = mockGoogle();
    const view = render(<GoogleOneTapLoginPrompt {...props} />);
    await waitFor(() => expect(id.prompt).toHaveBeenCalledOnce());
    const moment = id.prompt.mock.calls[0][0];
    const credential = id.initialize.mock.calls[0][0].callback;
    view.rerender(<GoogleOneTapLoginPrompt {...props} enabled={false} />);
    expect(id.cancel).toHaveBeenCalled();
    act(() => {
      moment({ isNotDisplayed: () => true });
      credential({ credential: 'late-token' });
    });
    expect(props.onCredentialLogin).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not restart native One Tap after session dismissal', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client');
    sessionStorage.setItem('webtomind:google-login-fallback-dismissed', '1');
    const id = mockGoogle();
    render(<GoogleOneTapLoginPrompt {...props} />);
    expect(id.initialize).not.toHaveBeenCalled();
    expect(id.prompt).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ignores a failed in-flight credential login after cancellation', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client');
    const id = mockGoogle();
    let complete!: (result: { error: Error | null }) => void;
    const login = vi.fn(
      () =>
        new Promise<{ error: Error | null }>((resolve) => {
          complete = resolve;
        })
    );
    const view = render(
      <GoogleOneTapLoginPrompt {...props} onCredentialLogin={login} />
    );
    await waitFor(() => expect(id.prompt).toHaveBeenCalledOnce());
    act(() =>
      id.initialize.mock.calls[0][0].callback({ credential: 'test-token' })
    );
    view.rerender(
      <GoogleOneTapLoginPrompt
        {...props}
        onCredentialLogin={login}
        enabled={false}
      />
    );
    await act(async () => complete({ error: new Error('late failure') }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('still dismisses when session storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const view = render(
      <GoogleOneTapLoginPrompt {...props} preferInlineCard />
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    view.rerender(
      <GoogleOneTapLoginPrompt
        {...props}
        redirectPath="/en-US/prompts"
        preferInlineCard
      />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
