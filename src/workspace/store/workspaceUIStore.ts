import { create } from 'zustand';
import type { SetStateAction, Dispatch } from 'react';

const XL_BREAKPOINT = 1200;

export type WorkspaceViewMode =
  | 'list'
  | 'detail'
  | 'boards'
  | 'skills'
  | 'trash';

export function shouldResetProjectWorkspaceViewMode({
  hasProjectId,
  isStandaloneBoardsPath,
  hasSelectedSummary,
  viewMode
}: {
  hasProjectId: boolean;
  isStandaloneBoardsPath: boolean;
  hasSelectedSummary: boolean;
  viewMode: WorkspaceViewMode;
}): boolean {
  return (
    hasProjectId &&
    isStandaloneBoardsPath &&
    !hasSelectedSummary &&
    viewMode !== 'list'
  );
}

export function getInitialViewMode(): 'list' | 'boards' | 'skills' | 'trash' {
  if (typeof window === 'undefined') return 'boards';
  const path = window.location.pathname;
  const view = new URLSearchParams(window.location.search).get('view');

  // Project detail routes must always boot into the project workspace shell.
  // The internal name is still "list" because that branch renders sources +
  // canvas + agent, not the project overview.
  if (/\/boards\/[a-zA-Z0-9_-]+/.test(path)) return 'list';

  if (view === 'skills') return 'skills';
  if (view === 'trash') return 'trash';
  if (view === 'boards') return 'boards';

  if (path.includes('/boards')) return 'boards';
  if (path.includes('/skills')) return 'skills';
  if (path.includes('/trash')) return 'trash';

  try {
    const saved = localStorage.getItem('workspace:view-mode');
    if (
      saved === 'list' ||
      saved === 'boards' ||
      saved === 'skills' ||
      saved === 'trash'
    ) {
      if (document.body.clientWidth < XL_BREAKPOINT) {
        return 'boards';
      }
      return saved;
    }
  } catch {
    // ignore
  }
  return 'boards';
}

function getInitialSummaryDisplayMode(): 'cards' | 'list' {
  try {
    const saved = localStorage.getItem('workspace:summary-display-mode');
    return saved === 'list' ? 'list' : 'cards';
  } catch {
    return 'cards';
  }
}

export interface WorkspaceUIState {
  viewMode: WorkspaceViewMode;
  skillsPlazaTab: 'explore' | 'mine';
  showAddMenu: boolean;
  showAddSourceModal: boolean;
  showSearch: boolean;
  searchTerm: string;
  showPricing: boolean;
  showSettings: boolean;
  showSidebarSearch: boolean;
  summaryDisplayMode: 'cards' | 'list';
  showTypeFilter: boolean;
  selectedTypes: string[];
  workspaceToast: { type: 'success' | 'error'; message: string } | null;
  pricingReturnTo: 'settings' | null;
  setViewMode: Dispatch<SetStateAction<WorkspaceViewMode>>;
  setSkillsPlazaTab: Dispatch<SetStateAction<'explore' | 'mine'>>;
  setShowAddMenu: Dispatch<SetStateAction<boolean>>;
  setShowAddSourceModal: Dispatch<SetStateAction<boolean>>;
  setShowSearch: Dispatch<SetStateAction<boolean>>;
  setSearchTerm: Dispatch<SetStateAction<string>>;
  setShowPricing: Dispatch<SetStateAction<boolean>>;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  setShowSidebarSearch: Dispatch<SetStateAction<boolean>>;
  setSummaryDisplayMode: Dispatch<SetStateAction<'cards' | 'list'>>;
  setShowTypeFilter: Dispatch<SetStateAction<boolean>>;
  setSelectedTypes: Dispatch<SetStateAction<string[]>>;
  setWorkspaceToast: Dispatch<
    SetStateAction<{ type: 'success' | 'error'; message: string } | null>
  >;
  setPricingReturnTo: Dispatch<SetStateAction<'settings' | null>>;
}

const resolveAction = <T>(action: SetStateAction<T>, prev: T): T => {
  if (typeof action === 'function') {
    return (action as (prev: T) => T)(prev);
  }
  return action;
};

export const useWorkspaceUIStore = create<WorkspaceUIState>((set) => ({
  viewMode: getInitialViewMode(),
  skillsPlazaTab: 'explore',
  showAddMenu: false,
  showAddSourceModal: false,
  showSearch: false,
  searchTerm: '',
  showPricing: false,
  showSettings: false,
  showSidebarSearch: false,
  summaryDisplayMode: getInitialSummaryDisplayMode(),
  showTypeFilter: false,
  selectedTypes: [],
  workspaceToast: null,
  pricingReturnTo: null,
  setViewMode: (action) =>
    set((s) => ({ viewMode: resolveAction(action, s.viewMode) })),
  setSkillsPlazaTab: (action) =>
    set((s) => ({ skillsPlazaTab: resolveAction(action, s.skillsPlazaTab) })),
  setShowAddMenu: (action) =>
    set((s) => ({ showAddMenu: resolveAction(action, s.showAddMenu) })),
  setShowAddSourceModal: (action) =>
    set((s) => ({
      showAddSourceModal: resolveAction(action, s.showAddSourceModal)
    })),
  setShowSearch: (action) =>
    set((s) => ({ showSearch: resolveAction(action, s.showSearch) })),
  setSearchTerm: (action) =>
    set((s) => ({ searchTerm: resolveAction(action, s.searchTerm) })),
  setShowPricing: (action) =>
    set((s) => ({ showPricing: resolveAction(action, s.showPricing) })),
  setShowSettings: (action) =>
    set((s) => ({ showSettings: resolveAction(action, s.showSettings) })),
  setShowSidebarSearch: (action) =>
    set((s) => ({
      showSidebarSearch: resolveAction(action, s.showSidebarSearch)
    })),
  setSummaryDisplayMode: (action) => {
    const nextMode = resolveAction(
      action,
      useWorkspaceUIStore.getState().summaryDisplayMode
    );
    try {
      localStorage.setItem('workspace:summary-display-mode', nextMode);
    } catch {
      // ignore
    }
    set({ summaryDisplayMode: nextMode });
  },
  setShowTypeFilter: (action) =>
    set((s) => ({ showTypeFilter: resolveAction(action, s.showTypeFilter) })),
  setSelectedTypes: (action) =>
    set((s) => ({ selectedTypes: resolveAction(action, s.selectedTypes) })),
  setWorkspaceToast: (action) =>
    set((s) => ({ workspaceToast: resolveAction(action, s.workspaceToast) })),
  setPricingReturnTo: (action) =>
    set((s) => ({ pricingReturnTo: resolveAction(action, s.pricingReturnTo) }))
}));
