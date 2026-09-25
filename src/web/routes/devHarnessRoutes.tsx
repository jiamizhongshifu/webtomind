import { lazy, type ReactNode } from 'react';
import { Route } from 'react-router-dom';

type HarnessRoute = {
  path: string;
  element: ReactNode;
};

const harnessRoutes: HarnessRoute[] = [
  {
    path: '/__dev/agent-image-chat-harness',
    element: lazyPage(
      () => import('../pages/AgentImageChatHarnessPage'),
      'AgentImageChatHarnessPage'
    )
  },
  {
    path: '/__dev/auth-state-harness',
    element: lazyPage(
      () => import('../pages/AuthStateHarnessPage'),
      'AuthStateHarnessPage'
    )
  },
  {
    path: '/__dev/action-sheet-harness',
    element: lazyPage(
      () => import('../pages/ActionSheetHarnessPage'),
      'ActionSheetHarnessPage'
    )
  },
  {
    path: '/__dev/prompt-library-harness',
    element: lazyPage(
      () => import('../pages/prompt-library/PromptLibraryHarnessPage'),
      'PromptLibraryHarnessPage'
    )
  },
  {
    path: '/__dev/upload-reverse-modal-harness',
    element: lazyPage(
      () => import('../pages/UploadReverseModalHarnessPage'),
      'UploadReverseModalHarnessPage'
    )
  },
  {
    path: '/__dev/add-source-modal-harness',
    element: lazyPage(
      () => import('../pages/AddSourceModalHarnessPage'),
      'AddSourceModalHarnessPage'
    )
  },
  {
    path: '/__dev/skill-create-confirm-dialog-harness',
    element: lazyPage(
      () => import('../pages/SkillCreateConfirmDialogHarnessPage'),
      'SkillCreateConfirmDialogHarnessPage'
    )
  },
  {
    path: '/__dev/skill-config-dialog-harness',
    element: lazyPage(
      () => import('../pages/SkillConfigDialogHarnessPage'),
      'SkillConfigDialogHarnessPage'
    )
  },
  {
    path: '/__dev/project-edit-modal-harness',
    element: lazyPage(
      () => import('../pages/ProjectEditModalHarnessPage'),
      'ProjectEditModalHarnessPage'
    )
  },
  {
    path: '/__dev/boards-overview-harness',
    element: lazyPage(
      () => import('../pages/BoardsOverviewHarnessPage'),
      'BoardsOverviewHarnessPage'
    )
  },
  {
    path: '/__dev/workspace-dialog-migration-harness',
    element: lazyPage(
      () => import('../pages/WorkspaceDialogMigrationHarnessPage'),
      'WorkspaceDialogMigrationHarnessPage'
    )
  },
  {
    path: '/__dev/workspace-modal-batch-harness',
    element: lazyPage(
      () => import('../pages/WorkspaceModalBatchHarnessPage'),
      'WorkspaceModalBatchHarnessPage'
    )
  },
  {
    path: '/__dev/workspace-settings-topbar-harness',
    element: lazyPage(
      () => import('../pages/WorkspaceSettingsTopbarHarnessPage'),
      'WorkspaceSettingsTopbarHarnessPage'
    )
  },
  {
    path: '/__dev/shortcut-editor-harness',
    element: lazyPage(
      () => import('../pages/ShortcutEditorHarnessPage'),
      'ShortcutEditorHarnessPage'
    )
  },
  {
    path: '/__dev/skill-editor-harness',
    element: lazyPage(
      () => import('../pages/SkillEditorHarnessPage'),
      'SkillEditorHarnessPage'
    )
  },
  {
    path: '/__dev/shortcut-list-harness',
    element: lazyPage(
      () => import('../pages/ShortcutListHarnessPage'),
      'ShortcutListHarnessPage'
    )
  },
  {
    path: '/__dev/history-add-to-project-modal-harness',
    element: lazyPage(
      () => import('../pages/HistoryAddToProjectModalHarnessPage'),
      'HistoryAddToProjectModalHarnessPage'
    )
  },
  {
    path: '/__dev/daily-login-reward-modal-harness',
    element: lazyPage(
      () => import('../pages/DailyLoginRewardModalHarnessPage'),
      'DailyLoginRewardModalHarnessPage'
    )
  },
  {
    path: '/__dev/create-onboarding-modal-harness',
    element: lazyPage(
      () => import('../pages/CreateOnboardingModalHarnessPage'),
      'CreateOnboardingModalHarnessPage'
    )
  },
  {
    path: '/__dev/referral-invite-dialog-harness',
    element: lazyPage(
      () => import('../pages/ReferralInviteDialogHarnessPage'),
      'ReferralInviteDialogHarnessPage'
    )
  },
  {
    path: '/__dev/creator-controls-harness',
    element: lazyPage(
      () => import('../pages/CreatorControlsHarnessPage'),
      'CreatorControlsHarnessPage'
    )
  },
  {
    path: '/__dev/creative-workspace-controls-harness',
    element: lazyPage(
      () => import('../pages/CreativeWorkspaceControlsHarnessPage'),
      'CreativeWorkspaceControlsHarnessPage'
    )
  },
  {
    path: '/__dev/recipe-preset-gallery-harness',
    element: lazyPage(
      () => import('../pages/RecipePresetGalleryHarnessPage'),
      'RecipePresetGalleryHarnessPage'
    )
  },
  {
    path: '/__dev/moodboard-analysis-harness',
    element: lazyPage(
      () => import('../pages/MoodboardAnalysisHarnessPage'),
      'MoodboardAnalysisHarnessPage'
    )
  },
  {
    path: '/__dev/generation-records-rail-harness',
    element: lazyPage(
      () => import('../pages/GenerationRecordsRailHarnessPage'),
      'GenerationRecordsRailHarnessPage'
    )
  },
  {
    path: '/__dev/image-session-conversation-harness',
    element: lazyPage(
      () => import('../pages/ImageSessionConversationHarnessPage'),
      'ImageSessionConversationHarnessPage'
    )
  },
  {
    path: '/__dev/page-load-skeleton-harness',
    element: lazyPage(
      () => import('../pages/PageLoadSkeletonHarnessPage'),
      'PageLoadSkeletonHarnessPage'
    )
  },
  {
    path: '/__dev/image-studio-composer-harness',
    element: lazyPage(
      () => import('../pages/ImageStudioComposerHarnessPage'),
      'ImageStudioComposerHarnessPage'
    )
  },
  {
    path: '/__dev/video-studio-composer-harness',
    element: lazyPage(
      () => import('../pages/VideoStudioComposerHarnessPage'),
      'VideoStudioComposerHarnessPage'
    )
  },
  {
    path: '/__dev/reference-character-panels-harness',
    element: lazyPage(
      () => import('../pages/ReferenceCharacterPanelsHarnessPage'),
      'ReferenceCharacterPanelsHarnessPage'
    )
  },
  {
    path: '/__dev/prompt-ops-surfaces-harness',
    element: lazyPage(
      () => import('../pages/PromptOpsSurfacesHarnessPage'),
      'PromptOpsSurfacesHarnessPage'
    )
  },
  {
    path: '/__dev/prompt-cases-admin-harness',
    element: lazyPage(
      () => import('../pages/PromptCasesAdminHarnessPage'),
      'PromptCasesAdminHarnessPage'
    )
  },
  {
    path: '/__dev/image-comparison-harness',
    element: lazyPage(
      () => import('../pages/ImageComparisonHarnessPage'),
      'ImageComparisonHarnessPage'
    )
  }
];

function lazyPage(
  loader: () => Promise<Record<string, unknown>>,
  exportName: string
): ReactNode {
  const Component = lazy(async () => {
    const module = await loader();
    const exportedComponent = module[exportName];

    if (!exportedComponent) {
      throw new Error(`Missing harness component export: ${exportName}`);
    }

    return { default: exportedComponent as React.ComponentType };
  });
  return <Component />;
}

export function getDevHarnessRoutes(): ReactNode[] {
  return harnessRoutes.map(({ path, element }) => (
    <Route key={path} path={path} element={element} />
  ));
}
