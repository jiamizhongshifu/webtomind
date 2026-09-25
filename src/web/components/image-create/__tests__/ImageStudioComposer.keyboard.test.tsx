import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ImageStudioComposerHarnessPage } from '../../../pages/ImageStudioComposerHarnessPage';

describe('ImageStudioComposer keyboard shortcuts', () => {
  it('sends with Enter', () => {
    render(<ImageStudioComposerHarnessPage />);
    const textarea = screen.getByLabelText('图像提示词') as HTMLTextAreaElement;
    const output = screen.getByText(/characters/);

    fireEvent.keyDown(textarea, {
      key: 'Enter',
      shiftKey: false
    });
    expect(output.textContent).toContain('generate');
  });

  it('does not send on Shift+Enter', () => {
    render(<ImageStudioComposerHarnessPage />);
    const textarea = screen.getByLabelText('图像提示词') as HTMLTextAreaElement;
    const output = screen.getByText(/characters/);
    fireEvent.keyDown(textarea, {
      key: 'Enter',
      shiftKey: true
    });
    expect(output.textContent).not.toContain('generate');
  });
});
