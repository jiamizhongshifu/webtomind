import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en-US/workspace.json';
const mocks = vi.hoisted(() => ({ get: vi.fn(), cancel: vi.fn() }));
vi.mock('@/services/payment-api', () => ({
  getCancellationSubscriptions: mocks.get,
  cancelSubscriptionAtPeriodEnd: mocks.cancel,
  SubscriptionCancellationError: class extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
}));
vi.mock('@/i18n/hooks/useLanguage', () => ({
  useLanguage: () => ({ language: 'en-US' })
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const value = key
        .split('.')
        .reduce<unknown>(
          (obj, key) => (obj as Record<string, unknown>)[key],
          en
        );
      return String(value).replace('{{date}}', options?.date || '');
    }
  })
}));
import { SubscriptionManagement } from '../SubscriptionManagement';
import { SubscriptionCancellationError } from '@/services/payment-api';
const subscription = {
  id: 'own',
  planName: 'pro',
  status: 'active',
  currentPeriodEnd: '2026-10-30T12:00:00.000Z',
  cancelAtPeriodEnd: false,
  canCancel: true,
  prepaid: false
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({ subscriptions: [subscription] });
  mocks.cancel.mockResolvedValue({
    subscription: {
      ...subscription,
      cancelAtPeriodEnd: true,
      canCancel: false
    },
    syncPending: false
  });
});
afterEach(cleanup);
describe('SubscriptionManagement', () => {
  it('requires confirmation, displays the date, and lets the user keep their plan', async () => {
    render(<SubscriptionManagement />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancel subscription' })
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('October 30, 2026');
    expect(mocks.cancel).not.toHaveBeenCalled();
    const buttons = screen.getAllByRole('button', {
      name: 'Keep subscription'
    });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it('blocks repeat clicks while pending and shows the authoritative success state', async () => {
    let resolve!: (value: unknown) => void;
    mocks.cancel.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    render(<SubscriptionManagement />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancel subscription' })
    );
    const confirm = screen.getByRole('button', {
      name: 'Confirm cancellation'
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(mocks.cancel).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Stopping renewal…' })
    ).toBeDisabled();
    resolve({
      subscription: {
        ...subscription,
        cancelAtPeriodEnd: true,
        canCancel: false
      }
    });
    await screen.findByText(/Your remaining paid benefits are available until/);
    expect(
      screen.queryByRole('button', { name: 'Cancel subscription' })
    ).not.toBeInTheDocument();
  });
  it('keeps a failed confirmation open and permits a safe retry', async () => {
    mocks.cancel.mockRejectedValueOnce(new Error('offline'));
    render(<SubscriptionManagement />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancel subscription' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm cancellation' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not confirm cancellation'
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm cancellation' })
    );
    await screen.findByText(/Your remaining paid benefits are available until/);
    expect(mocks.cancel).toHaveBeenCalledTimes(2);
  });
  it('provides a retry for loading errors', async () => {
    mocks.get.mockRejectedValueOnce(new Error('offline'));
    render(<SubscriptionManagement />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByRole('button', { name: 'Cancel subscription' });
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
  it.each([
    { subscriptions: [] },
    { subscriptions: [{ ...subscription, prepaid: true, canCancel: false }] },
    {
      subscriptions: [
        { ...subscription, cancelAtPeriodEnd: true, canCancel: false }
      ]
    }
  ])(
    'does not offer cancellation for nonrenewing or absent plans',
    async (response) => {
      mocks.get.mockResolvedValue(response);
      render(<SubscriptionManagement />);
      await waitFor(() =>
        expect(
          screen.queryByText('Loading billing details…')
        ).not.toBeInTheDocument()
      );
      expect(
        screen.queryByRole('button', { name: 'Cancel subscription' })
      ).not.toBeInTheDocument();
    }
  );
  it('reloads and requires new confirmation when the billing period changes', async () => {
    mocks.cancel.mockRejectedValueOnce(
      new SubscriptionCancellationError('BILLING_PERIOD_CHANGED')
    );
    mocks.get
      .mockResolvedValueOnce({ subscriptions: [subscription] })
      .mockResolvedValue({
        subscriptions: [
          { ...subscription, currentPeriodEnd: '2026-11-30T12:00:00.000Z' }
        ]
      });
    render(<SubscriptionManagement />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancel subscription' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm cancellation' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your billing period changed'
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel subscription' })
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('November 30, 2026');
    expect(mocks.cancel).toHaveBeenCalledTimes(1);
  });
  it('asks the user to sign in again when the session expires during confirmation', async () => {
    mocks.cancel.mockRejectedValueOnce(
      new SubscriptionCancellationError('AUTH_REQUIRED')
    );
    render(<SubscriptionManagement />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancel subscription' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm cancellation' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session expired'
    );
  });
});
