import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionSheet } from '../ActionSheet';

describe('ActionSheet', () => {
  it('renders in a global fixed layer with accessible naming', () => {
    const onClose = vi.fn();

    render(
      <div className="media-card">
        <ActionSheet
          open
          title="More actions"
          description="Choose an action"
          onClose={onClose}
        >
          <button type="button">Download</button>
          <button type="button">Add to board</button>
        </ActionSheet>
      </div>
    );

    const sheet = screen.getByRole('dialog', { name: 'More actions' });
    const layer = document.body.querySelector('.ui-action-sheet-layer');

    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(sheet).toHaveAttribute('aria-describedby');
    expect(layer).toBeInstanceOf(HTMLDivElement);
    expect(layer?.closest('.media-card')).toBeNull();
  });

  it('coalesces backdrop and Escape into one animated close', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();

    render(
      <ActionSheet
        open
        ariaLabel="More actions"
        closeLabel="Close actions"
        onClose={onClose}
      >
        <button type="button">Download</button>
      </ActionSheet>
    );

    fireEvent.click(
      document.body.querySelector(
        '.ui-action-sheet-backdrop'
      ) as HTMLButtonElement
    );
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('resets the close lifecycle when the same sheet is reopened', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { rerender } = render(
      <ActionSheet open ariaLabel="Actions" onClose={onClose}>
        <button type="button">Download</button>
      </ActionSheet>
    );

    fireEvent.click(
      document.body.querySelector(
        '.ui-action-sheet-backdrop'
      ) as HTMLButtonElement
    );
    act(() => vi.advanceTimersByTime(160));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <ActionSheet open={false} ariaLabel="Actions" onClose={onClose}>
        <button type="button">Download</button>
      </ActionSheet>
    );
    rerender(
      <ActionSheet open ariaLabel="Actions" onClose={onClose}>
        <button type="button">Download</button>
      </ActionSheet>
    );
    fireEvent.click(
      document.body.querySelector(
        '.ui-action-sheet-backdrop'
      ) as HTMLButtonElement
    );
    act(() => vi.advanceTimersByTime(160));
    expect(onClose).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

});
