import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HistoryAddToProjectModalHarnessPage } from '../HistoryAddToProjectModalHarnessPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'preview.addToProject': 'Add to project',
        'preview.addToProjectCardCount': `${options?.count ?? 0} cards`,
        'preview.addToProjectHint': 'Choose a project for this image.',
        'preview.addToProjectLoading': 'Loading projects',
        'preview.addToProjectNoProjects': 'No projects yet',
        'preview.addToProjectSaving': 'Saving...',
        'preview.close': 'Close',
        'preview.untitledProject': 'Untitled project'
      };

      return messages[key] || key;
    }
  })
}));

describe('HistoryAddToProjectModalHarnessPage', () => {
  it('renders the isolated add-to-project modal preview and updates status', () => {
    render(<HistoryAddToProjectModalHarnessPage />);

    expect(screen.getByText('ISOLATED PREVIEW HARNESS')).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Add to project' })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Summer launch campaign/ })
    );

    expect(screen.getByTestId('harness-status')).toHaveTextContent(
      'saving:project-campaign'
    );
  });
});
