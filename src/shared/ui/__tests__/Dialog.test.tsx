import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from '../Dialog';

describe('Dialog', () => {
  it('keeps close controls disabled while closeDisabled is true', () => {
    const onClose = vi.fn();

    render(
      <Dialog
        open
        title="Edit"
        closeLabel="Close dialog"
        closeDisabled
        onClose={onClose}
      >
        <p>Body</p>
      </Dialog>
    );

    const closeButton = screen
      .getAllByRole('button', { name: 'Close dialog' })
      .find((button) => button.classList.contains('ui-icon-button')) as
      | HTMLButtonElement
      | undefined;
    const backdrop = document.body.querySelector('.ui-dialog-backdrop');

    expect(closeButton).toBeInstanceOf(HTMLButtonElement);
    expect(closeButton).toBeDisabled();
    expect(backdrop).toBeInstanceOf(HTMLButtonElement);
    expect(backdrop).toBeDisabled();

    fireEvent.click(closeButton as HTMLButtonElement);
    fireEvent.click(backdrop as HTMLButtonElement);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('wires accessible title and closes on Escape', () => {
    const onClose = vi.fn();

    render(
      <Dialog
        open
        title="Preview"
        description="Review generated image"
        onClose={onClose}
      >
        <button type="button">Download</button>
      </Dialog>
    );

    const dialog = screen.getByRole('dialog', { name: 'Preview' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-describedby');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
