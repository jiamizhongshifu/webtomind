import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionSheetHarnessPage } from '../ActionSheetHarnessPage';

describe('ActionSheetHarnessPage', () => {
  it('renders a reopenable isolated action sheet state', () => {
    vi.useFakeTimers();
    render(<ActionSheetHarnessPage />);

    expect(
      screen.getByRole('dialog', { name: 'Project actions' })
    ).toBeInTheDocument();
    const closeButton = screen
      .getAllByRole('button', { name: 'Close sheet' })
      .find((button) => button.classList.contains('ui-icon-button'));
    fireEvent.click(closeButton as HTMLButtonElement);
    act(() => vi.advanceTimersByTime(160));
    expect(screen.getByTestId('harness-status')).toHaveTextContent('closed');
    vi.useRealTimers();
  });
});
