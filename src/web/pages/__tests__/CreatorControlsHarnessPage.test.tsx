import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreatorControlsHarnessPage } from '../CreatorControlsHarnessPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        'controls.model': 'Model',
        'controls.outputFormat.label': 'Format',
        'controls.outputFormat.jpeg': 'JPEG',
        'controls.outputFormat.png': 'PNG',
        'controls.outputFormat.webp': 'WebP',
        'controls.quality.help.auto': 'Auto balances quality and cost.',
        'controls.quality.help.high': 'High quality.',
        'controls.quality.label': 'Quality',
        'controls.quality.auto': 'Auto',
        'controls.quality.high': 'High',
        'controls.quality.low': 'Low',
        'controls.quality.medium': 'Medium',
        'controls.size': 'Size',
        'controls.sizeOptions.square1k.detail': '1:1 square',
        'controls.sizeOptions.square1k.label': 'Square',
        'controls.title': 'Controls'
      };

      return messages[key] || key;
    }
  })
}));

describe('CreatorControlsHarnessPage', () => {
  it('renders the isolated controls preview and updates segmented settings', () => {
    render(<CreatorControlsHarnessPage />);

    expect(screen.getByText('ISOLATED PREVIEW HARNESS')).toBeInTheDocument();
    expect(screen.getByText('Creator Controls')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'High' }));

    expect(screen.getByTestId('creator-controls-state')).toHaveTextContent(
      '"quality": "high"'
    );
  });
});
