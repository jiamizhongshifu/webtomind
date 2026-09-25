import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreativeWorkspaceControlsHarnessPage } from '../CreativeWorkspaceControlsHarnessPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, options?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'canvas.applyToPrompt': 'Apply to prompt',
        'canvas.applyToPromptHint': 'Append selected assets to prompt',
        'canvas.clearSlot': `Clear ${options?.slot || ''}`,
        'canvas.clearAll': 'Clear combo',
        'canvas.clearAllHint': 'Clear every selected asset',
        'canvas.emptySlotHint': 'Choose an asset',
        'canvas.optionalSlot': 'Optional',
        'canvas.emptySlot': `Add ${options?.slot || ''}`,
        'canvas.openPicker': 'Open picker',
        'canvas.selectedSlot': `Selected ${options?.slot || ''}`,
        'canvas.slotCount': `${options?.count || 0} selected`,
        'canvas.title': 'Creator canvas',
        'historyRail.status.cancelled': 'Cancelled',
        'historyRail.status.failed': 'Failed',
        'historyRail.status.processing': 'Processing',
        'historyRail.status.queued': 'Queued',
        'historyRail.status.succeeded': 'Done',
        'library.allTags': 'All',
        'library.local': 'Local library',
        'library.remote': 'Remote library',
        'library.searchPlaceholder': `Search ${options?.slot || ''}`,
        'library.tabs.mine': 'My assets',
        'library.tabs.public': 'Public library',
        'library.title': 'Prompt assets',
        'mine.batchPending': `${options?.count || 0} pending`,
        'mine.batchRetryFailed': `Retry ${options?.count || 0}`,
        'mine.batchRegenerate': `Generate ${options?.count || 0}`,
        'mine.empty': 'No personal assets',
        'mine.loginRequired': 'Sign in required',
        'mine.queueStatusDone': 'Done',
        'mine.queueStatusFailed': 'Failed',
        'mine.queueStatusProcessing': 'Processing',
        'mine.queueStatusQueued': 'Queued',
        'mine.regenerate': 'Regenerate',
        'picker.collapseSlots': 'Collapse categories',
        'picker.collapseTags': 'Collapse tags',
        'picker.empty': 'No assets',
        'picker.expandSlots': 'Expand categories',
        'picker.expandTags': 'Expand tags',
        'picker.selected': 'Selected',
        'picker.subtitle': 'Pick an asset',
        'picker.title': `${options?.slot || ''} picker`,
        'preview.close': 'Close',
        'preview.copyPrompt': 'Copy prompt',
        'preview.delete': 'Delete',
        'preview.downloadOriginal': 'Download original',
        'preview.localEdit': 'Local edit',
        'preview.meta.aspectRatio': 'Aspect ratio',
        'preview.meta.imageSize': 'Image size',
        'preview.meta.model': 'Model',
        'preview.meta.outputFormat': 'Output format',
        'preview.meta.quality': 'Quality',
        'preview.meta.requestedImageSize': `Requested ${options?.size || ''}`,
        'preview.meta.time': 'Time',
        'preview.negativeLabel': 'Negative prompt',
        'preview.openFullscreen': 'Open fullscreen',
        'preview.promptLabel': 'Prompt',
        'preview.reedit': 'Re-edit',
        'preview.title': 'Generation preview',
        'promptCases.nextImage': 'Next image',
        'promptCases.previousImage': 'Previous image',
        'progress.acknowledgeDone': 'Confirm',
        'progress.cancelQueued': 'Cancel queued task',
        'progress.cancelRunning': 'Stop running task',
        'progress.collapse': 'Collapse',
        'progress.deleteFailed': 'Delete failed task',
        'progress.dismissTask': 'Dismiss',
        'progress.editTask': 'Edit task prompt',
        'progress.empty': 'No tasks',
        'progress.expand': 'Expand',
        'progress.feedback.thanks': 'Feedback received',
        'progress.feedback.title': 'What hurt this failed run most?',
        'progress.imageProgress': '1 / 2 images returned',
        'progress.imageTarget': 'Target 2 images',
        'progress.retryFailed': 'Retry failed task',
        'progress.title': 'AI tasks',
        'progress.viewTaskPrompt': 'View task prompt',
        'references.character.discover': 'Discover',
        'references.character.empty': 'No characters',
        'references.character.liked': 'Liked',
        'references.character.likedEmpty': 'No liked characters',
        'references.character.loading': 'Loading characters',
        'references.character.mine': 'Mine',
        'references.character.officialEmpty': 'No official presets',
        'references.character.search': 'Search characters',
        'references.character.subtitle': 'Select character references',
        'references.character.title': 'Character references',
        'result.altGenerated': 'Generated image',
        'result.close': 'Close result',
        'result.empty': 'No result',
        'result.overlayHint': 'Generating',
        'result.title': 'Result',
        'result.waiting': 'Waiting',
        'upgrade.close': 'Close upgrade',
        'upgrade.cta': 'Upgrade',
        'upgrade.current': `Current ${options?.credits || 0}`,
        'upgrade.description': 'Upgrade required',
        'upgrade.later': 'Later',
        'upgrade.required': `Required ${options?.credits || 0}`,
        'upgrade.title': 'Upgrade prompt',
        'upload.promptImportAnalyzing': 'Analyzing',
        'upload.promptImportButton': 'Import prompt'
      };
      return messages[key] || key;
    }
  })
}));

beforeEach(() => {
  window.history.replaceState(
    {},
    '',
    '/__dev/creative-workspace-controls-harness'
  );
});

describe('CreativeWorkspaceControlsHarnessPage', () => {
  it('renders the progress and library harness by default', () => {
    render(<CreativeWorkspaceControlsHarnessPage />);

    expect(
      screen.getByRole('heading', { name: 'Creative Workspace Controls' })
    ).toBeInTheDocument();
    expect(screen.getByText('Prompt assets')).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'AI tasks' })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('creative-controls-last-action')
    ).toHaveTextContent('ready');
  });

  it('renders isolated sidebar and topbar account menus', () => {
    window.history.replaceState(
      {},
      '',
      '/__dev/creative-workspace-controls-harness?mode=account-menu'
    );

    const { container } = render(
      <MemoryRouter>
        <CreativeWorkspaceControlsHarnessPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('region', { name: 'Account menu harness' })
    ).toBeInTheDocument();
    expect(container.querySelector('.create-side-nav-profile')).not.toBeNull();
    expect(
      container.querySelector('.image-create-mininav-profile')
    ).not.toBeNull();
  });

  it('renders compact gallery action groups at multiple card widths', () => {
    window.history.replaceState(
      {},
      '',
      '/__dev/creative-workspace-controls-harness?mode=gallery-actions'
    );

    render(<CreativeWorkspaceControlsHarnessPage />);

    expect(
      screen.getByRole('region', { name: 'Gallery actions harness' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '作为参考图' })).toHaveLength(
      2
    );
    expect(screen.getAllByRole('button', { name: '继续编辑' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '加入收藏' })).toHaveLength(2);
    const moreButtons = screen.getAllByRole('button', { name: '更多操作' });
    expect(moreButtons).toHaveLength(2);

    fireEvent.click(moreButtons[0]);
    const actionSheet = screen.getByRole('dialog', { name: '图片资产操作' });
    expect(actionSheet).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '作为参考图' })).toHaveLength(
      3
    );
  });

  it('renders the character picker harness mode', () => {
    window.history.replaceState(
      {},
      '',
      '/__dev/creative-workspace-controls-harness?mode=character-picker'
    );

    render(<CreativeWorkspaceControlsHarnessPage />);

    expect(
      screen.getByRole('dialog', { name: 'Character references' })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Discover' })).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Search characters')
    ).toBeInTheDocument();
  });

  it('renders the history preview harness mode', () => {
    window.history.replaceState(
      {},
      '',
      '/__dev/creative-workspace-controls-harness?mode=history-preview'
    );

    render(<CreativeWorkspaceControlsHarnessPage />);

    expect(
      screen.getByRole('dialog', { name: 'Generation preview' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-edit' })).not.toBeInTheDocument();
    const prompt = vi.spyOn(window, 'prompt');
    fireEvent.click(screen.getByRole('button', { name: 'Local edit' }));
    expect(screen.getByTestId('creative-controls-last-action')).toHaveTextContent('local edit history image');
    expect(prompt).not.toHaveBeenCalled();
    prompt.mockRestore();
    expect(
      screen.getByRole('button', { name: 'Copy prompt' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'preview.createFromRecipe' })
    ).toBeInTheDocument();
  });

  it('renders the video preview harness mode', () => {
    window.history.replaceState(
      {},
      '',
      '/__dev/creative-workspace-controls-harness?mode=video-preview'
    );

    render(<CreativeWorkspaceControlsHarnessPage />);

    expect(
      screen.getByRole('dialog', { name: 'Video detail' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy prompt' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-edit' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open video' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Download video' })
    ).toBeInTheDocument();
  });

  it('renders the history gallery harness mode', () => {
    window.history.replaceState(
      {},
      '',
      '/__dev/creative-workspace-controls-harness?mode=history-gallery'
    );

    render(<CreativeWorkspaceControlsHarnessPage />);

    expect(
      screen.getByRole('dialog', { name: 'History gallery harness' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /使用 1 张/ })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /GPT Image 2/ })).toHaveLength(
      3
    );
  });

  it('renders the result and recent-generation harness mode', () => {
    window.history.replaceState(
      {},
      '',
      '/__dev/creative-workspace-controls-harness?mode=result-recent'
    );

    render(<CreativeWorkspaceControlsHarnessPage />);

    expect(screen.getByText('Result')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Close result' })
    ).toBeInTheDocument();
    expect(screen.getByText('角色一致性检查')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'history.viewMore' })
    ).toHaveLength(2);
  });

  it('renders the creator canvas harness mode', () => {
    window.history.replaceState(
      {},
      '',
      '/__dev/creative-workspace-controls-harness?mode=creator-canvas'
    );

    render(<CreativeWorkspaceControlsHarnessPage />);

    expect(screen.getAllByText('Creator canvas')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'Apply to prompt' })
    ).toBeInTheDocument();
    const clearButton = screen.getByRole('button', { name: 'Clear combo' });
    expect(clearButton).toBeEnabled();
    fireEvent.click(clearButton);
    expect(screen.getByText('clear combo')).toBeInTheDocument();
    expect(clearButton).toBeDisabled();
    expect(screen.queryByText('Choose an asset')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '打开大图选择器' })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /人设/ }).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText('标题区')).not.toBeInTheDocument();
    expect(screen.queryByText('台面环境')).not.toBeInTheDocument();
    expect(screen.queryByText('产品主体')).not.toBeInTheDocument();
    expect(screen.queryByText('版式设计')).not.toBeInTheDocument();
  });

  it('renders the upgrade modal harness mode', () => {
    window.history.replaceState(
      {},
      '',
      '/__dev/creative-workspace-controls-harness?mode=upgrade-modal'
    );

    render(<CreativeWorkspaceControlsHarnessPage />);

    expect(
      screen.getByRole('dialog', { name: 'Upgrade prompt' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upgrade' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Close upgrade' })
    ).toBeInTheDocument();
  });
});
