import type { SavedSummary } from './database';

export const WORKSPACE_SUMMARY_SAVED_EVENT = 'workspace:summary-saved';

export interface WorkspaceSummarySavedDetail {
  summary: SavedSummary;
  projectId?: string | null;
}

export function dispatchWorkspaceSummarySaved(summary: SavedSummary): void {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<WorkspaceSummarySavedDetail>(WORKSPACE_SUMMARY_SAVED_EVENT, {
      detail: {
        summary,
        projectId: summary.projectId || null
      }
    })
  );
}
