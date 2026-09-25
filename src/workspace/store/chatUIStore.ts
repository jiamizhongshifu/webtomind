import { create } from 'zustand';
import {
  type ImageSettings,
  DEFAULT_IMAGE_SETTINGS
} from '../components/ImageSettingsPanel';
import {
  type SlideSettings,
  DEFAULT_SLIDE_SETTINGS
} from '../components/SlideSettingsPanel';
import type { Shortcut } from '@/services/database';
import type { SetStateAction, Dispatch } from 'react';

export interface ChatUIState {
  input: string;
  imageMode: boolean;
  imageSettings: ImageSettings;
  showImageSettings: boolean;
  slideSettings: SlideSettings;
  showSlideSettings: boolean;
  showModeMenu: boolean;
  showFeaturesMenu: boolean;
  selectedFeature: string | null;
  webSearchEnabled: boolean;
  thinkingModeEnabled: boolean;
  showSelector: boolean;
  showPlusMenu: boolean;
  selectedShortcut: Shortcut | null;
  isRetrying: boolean;
  isBatchGenerating: boolean;

  // Actions
  setInput: Dispatch<SetStateAction<string>>;
  setImageMode: Dispatch<SetStateAction<boolean>>;
  setImageSettings: Dispatch<SetStateAction<ImageSettings>>;
  setShowImageSettings: Dispatch<SetStateAction<boolean>>;
  setSlideSettings: Dispatch<SetStateAction<SlideSettings>>;
  setShowSlideSettings: Dispatch<SetStateAction<boolean>>;
  setShowModeMenu: Dispatch<SetStateAction<boolean>>;
  setShowFeaturesMenu: Dispatch<SetStateAction<boolean>>;
  setSelectedFeature: Dispatch<SetStateAction<string | null>>;
  setWebSearchEnabled: Dispatch<SetStateAction<boolean>>;
  setThinkingModeEnabled: Dispatch<SetStateAction<boolean>>;
  setShowSelector: Dispatch<SetStateAction<boolean>>;
  setShowPlusMenu: Dispatch<SetStateAction<boolean>>;
  setSelectedShortcut: Dispatch<SetStateAction<Shortcut | null>>;
  setIsRetrying: Dispatch<SetStateAction<boolean>>;
  setIsBatchGenerating: Dispatch<SetStateAction<boolean>>;
}

const resolveAction = <T>(action: SetStateAction<T>, prev: T): T => {
  if (typeof action === 'function') {
    return (action as (prev: T) => T)(prev);
  }
  return action;
};

export const useChatUIStore = create<ChatUIState>((set) => ({
  input: '',
  imageMode: false,
  imageSettings: DEFAULT_IMAGE_SETTINGS,
  showImageSettings: false,
  slideSettings: DEFAULT_SLIDE_SETTINGS,
  showSlideSettings: false,
  showModeMenu: false,
  showFeaturesMenu: false,
  selectedFeature: null,
  webSearchEnabled: false,
  thinkingModeEnabled: false,
  showSelector: false,
  showPlusMenu: false,
  selectedShortcut: null,
  isRetrying: false,
  isBatchGenerating: false,

  setInput: (action) => set((s) => ({ input: resolveAction(action, s.input) })),
  setImageMode: (action) =>
    set((s) => ({ imageMode: resolveAction(action, s.imageMode) })),
  setImageSettings: (action) =>
    set((s) => ({ imageSettings: resolveAction(action, s.imageSettings) })),
  setShowImageSettings: (action) =>
    set((s) => ({
      showImageSettings: resolveAction(action, s.showImageSettings)
    })),
  setSlideSettings: (action) =>
    set((s) => ({ slideSettings: resolveAction(action, s.slideSettings) })),
  setShowSlideSettings: (action) =>
    set((s) => ({
      showSlideSettings: resolveAction(action, s.showSlideSettings)
    })),
  setShowModeMenu: (action) =>
    set((s) => ({ showModeMenu: resolveAction(action, s.showModeMenu) })),
  setShowFeaturesMenu: (action) =>
    set((s) => ({
      showFeaturesMenu: resolveAction(action, s.showFeaturesMenu)
    })),
  setSelectedFeature: (action) =>
    set((s) => ({ selectedFeature: resolveAction(action, s.selectedFeature) })),
  setWebSearchEnabled: (action) =>
    set((s) => ({
      webSearchEnabled: resolveAction(action, s.webSearchEnabled)
    })),
  setThinkingModeEnabled: (action) =>
    set((s) => ({
      thinkingModeEnabled: resolveAction(action, s.thinkingModeEnabled)
    })),
  setShowSelector: (action) =>
    set((s) => ({ showSelector: resolveAction(action, s.showSelector) })),
  setShowPlusMenu: (action) =>
    set((s) => ({ showPlusMenu: resolveAction(action, s.showPlusMenu) })),
  setSelectedShortcut: (action) =>
    set((s) => ({
      selectedShortcut: resolveAction(action, s.selectedShortcut)
    })),
  setIsRetrying: (action) =>
    set((s) => ({ isRetrying: resolveAction(action, s.isRetrying) })),
  setIsBatchGenerating: (action) =>
    set((s) => ({
      isBatchGenerating: resolveAction(action, s.isBatchGenerating)
    }))
}));
