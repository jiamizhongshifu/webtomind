import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Project } from '@/services/workspace-api';
import { HistoryAddToProjectModal } from '../HistoryAddToProjectModal';

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

const project: Project = {
  id: 'project-1',
  name: 'Campaign board',
  description: null,
  icon: '',
  color: '#ffffff',
  isDefault: false,
  sortOrder: 1,
  summaryCount: 7,
  conversationCount: 0,
  createdAt: 1,
  updatedAt: 1,
  archivedAt: null,
  favoritedAt: null
};

describe('HistoryAddToProjectModal', () => {
  it('renders project choices through the dialog and saves the selected project', () => {
    const onSave = vi.fn();

    render(
      <HistoryAddToProjectModal
        open
        projects={[project]}
        loading={false}
        savingId={null}
        error=""
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    expect(
      screen.getByRole('dialog', { name: 'Add to project' })
    ).toBeInTheDocument();
    expect(screen.getByText('Choose a project for this image.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Campaign board/ }));

    expect(onSave).toHaveBeenCalledWith(project);
  });

  it('keeps the dialog open while saving and blocks close interactions', () => {
    const onClose = vi.fn();

    render(
      <HistoryAddToProjectModal
        open
        projects={[project]}
        loading={false}
        savingId={project.id}
        error=""
        onClose={onClose}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText('Saving...')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders loading, empty, and error states', () => {
    const { rerender } = render(
      <HistoryAddToProjectModal
        open
        projects={[]}
        loading
        savingId={null}
        error=""
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText('Loading projects')).toBeInTheDocument();

    rerender(
      <HistoryAddToProjectModal
        open
        projects={[]}
        loading={false}
        savingId={null}
        error="Could not load projects"
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText('No projects yet')).toBeInTheDocument();
    expect(screen.getByText('Could not load projects')).toBeInTheDocument();
  });
});
