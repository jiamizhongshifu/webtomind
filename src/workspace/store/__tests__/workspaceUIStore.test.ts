import { afterEach, describe, expect, it } from 'vitest';
import {
  getInitialViewMode,
  shouldResetProjectWorkspaceViewMode
} from '../workspaceUIStore';

describe('getInitialViewMode', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    window.localStorage.clear();
  });

  it('boots /boards/:id into the project workspace even when view=boards is present', () => {
    window.localStorage.setItem('workspace:view-mode', 'boards');
    window.history.replaceState({}, '', '/boards/project-123?view=boards');

    expect(getInitialViewMode()).toBe('list');
  });

  it('boots /boards/:id into the project workspace even on localized routes', () => {
    window.localStorage.setItem('workspace:view-mode', 'boards');
    window.history.replaceState(
      {},
      '',
      '/zh-CN/boards/project-123?view=boards'
    );

    expect(getInitialViewMode()).toBe('list');
  });

  it('keeps /boards as the project overview', () => {
    window.history.replaceState({}, '', '/boards');

    expect(getInitialViewMode()).toBe('boards');
  });
});

describe('shouldResetProjectWorkspaceViewMode', () => {
  it('preserves detail mode when a project source card is selected', () => {
    expect(
      shouldResetProjectWorkspaceViewMode({
        hasProjectId: true,
        isStandaloneBoardsPath: true,
        hasSelectedSummary: true,
        viewMode: 'detail'
      })
    ).toBe(false);
  });

  it('resets non-list project workspace modes only when no source card is selected', () => {
    expect(
      shouldResetProjectWorkspaceViewMode({
        hasProjectId: true,
        isStandaloneBoardsPath: true,
        hasSelectedSummary: false,
        viewMode: 'detail'
      })
    ).toBe(true);
  });
});
