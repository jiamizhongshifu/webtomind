import { useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  ImageCreatorRecipe,
  UserPromptAsset,
  VisualImageHistoryItem,
  VisualVideoGenerationItem
} from '@/services/agent-api';
import { AssetPicker } from '../components/image-create/AssetPicker';
import { CharacterReferencePickerModal } from '../components/image-create/CharacterReferencePickerModal';
import { CreatorCanvas } from '../components/image-create/CreatorCanvas';
import { CreatorLibrary } from '../components/image-create/CreatorLibrary';
import { CreatorResult } from '../components/image-create/CreatorResult';
import { DeepFeaturePaywallModal } from '../components/image-create/DeepFeaturePaywallModal';
import {
  GenerationProgressPanel,
  type ProgressTask
} from '../components/image-create/GenerationProgressPanel';
import { HistoryGalleryModal } from '../components/image-create/HistoryGalleryModal';
import { HistoryPreviewModal } from '../components/image-create/HistoryPreviewModal';
import { ImageCreateCharacterWorkflowModal } from '../components/image-create/ImageCreateCharacterWorkflowModal';
import { PhotoSwipeViewer } from '../components/image-create/PhotoSwipeViewer';
import { CreatorAccountMenu } from '../components/image-create/CreatorAccountMenu';
import { RecentGenerationsPanel } from '../components/image-create/RecentGenerationsPanel';
import { UpgradePromptModal } from '../components/image-create/UpgradePromptModal';
import { VideoHistoryPreviewDialog } from '../components/image-create/VideoHistoryPreviewDialog';
import type { UseAssetLibraryResult } from '../components/image-create/useAssetLibrary';
import type { UseThumbnailQueueResult } from '../components/image-create/useThumbnailQueue';
import {
  defaultImagePromptSelection,
  getAssetById,
  getSelectedAssetIds,
  imagePromptSlots,
  slotVisualDefaults,
  type ImagePromptAsset,
  type ImagePromptSelection,
  type ImagePromptSlot
} from '../data/image-prompt-core';
import '../styles/image-create.css';
import '../styles/image-create-mobile.css';
import {
  GalleryActionSheet,
  GalleryCardActionControls
} from '../components/image-create/GalleryActionControls';

type HarnessMode =
  | 'progress-library'
  | 'asset-picker'
  | 'character-picker'
  | 'history-preview'
  | 'image-lightbox'
  | 'video-preview'
  | 'history-gallery'
  | 'result-recent'
  | 'creator-canvas'
  | 'upgrade-modal'
  | 'deep-paywall'
  | 'character-workflow-modal'
  | 'account-menu'
  | 'gallery-actions';

const MOCK_IMAGE_URL =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200"%3E%3Cdefs%3E%3ClinearGradient id="g" x1="0" y1="0" x2="1" y2="1"%3E%3Cstop stop-color="%23f7e2c9"/%3E%3Cstop offset="0.52" stop-color="%23d7ecf5"/%3E%3Cstop offset="1" stop-color="%2323191c"/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width="900" height="1200" fill="url(%23g)"/%3E%3Ccircle cx="450" cy="390" r="170" fill="%23fff8ef" opacity=".78"/%3E%3Crect x="250" y="610" width="400" height="390" rx="70" fill="%23ffffff" opacity=".64"/%3E%3Ctext x="450" y="1120" text-anchor="middle" font-family="Arial" font-size="56" font-weight="700" fill="%23ffffff"%3EPreview%3C/text%3E%3C/svg%3E';

const MOCK_ASSETS: ImagePromptAsset[] = [
  {
    id: 'character-soft-elf',
    slot: 'character',
    title: 'Soft Elf Girl',
    subtitle: 'Fantasy character portrait',
    prompt: 'soft elf girl, editorial portrait, gentle studio light',
    tags: ['日常人像', '二次元幻想'],
    thumbnailEmoji: 'A',
    visual: slotVisualDefaults.character
  },
  {
    id: 'character-runway-curator',
    slot: 'character',
    title: 'Runway Curator',
    subtitle: 'Commercial fashion reference',
    prompt: 'confident fashion curator, clean catalog portrait',
    tags: ['商业写实', '职业设定'],
    thumbnailEmoji: 'B',
    visual: slotVisualDefaults.character
  },
  {
    id: 'pose-relaxed-walk',
    slot: 'pose',
    title: 'Relaxed Walk',
    subtitle: 'Full-body motion pose',
    prompt: 'relaxed walking pose, fashion croquis',
    tags: ['动态', '站姿'],
    thumbnailEmoji: 'P',
    visual: slotVisualDefaults.pose
  },
  {
    id: 'lighting-softbox',
    slot: 'lighting',
    title: 'Large Softbox',
    subtitle: 'Soft commercial studio light',
    prompt: 'large softbox, clean studio highlights',
    tags: ['影棚', '柔光'],
    thumbnailEmoji: 'L',
    visual: slotVisualDefaults.lighting
  }
];

function getModeFromLocation(): HarnessMode {
  if (typeof window === 'undefined') return 'progress-library';
  const mode = new URLSearchParams(window.location.search).get('mode');
  return mode === 'asset-picker' ||
    mode === 'character-picker' ||
    mode === 'history-preview' ||
    mode === 'image-lightbox' ||
    mode === 'video-preview' ||
    mode === 'history-gallery' ||
    mode === 'result-recent' ||
    mode === 'creator-canvas' ||
    mode === 'upgrade-modal' ||
    mode === 'deep-paywall' ||
    mode === 'character-workflow-modal' ||
    mode === 'account-menu' ||
    mode === 'gallery-actions'
    ? mode
    : 'progress-library';
}

function getSlotLabel(slot: ImagePromptSlot) {
  return imagePromptSlots.find((item) => item.id === slot)?.label || slot;
}

function filterAssets(options: {
  assets: ImagePromptAsset[];
  slot: ImagePromptSlot;
  query: string;
  tag: string | null;
}) {
  const normalizedQuery = options.query.trim().toLowerCase();
  return options.assets.filter((asset) => {
    if (asset.slot !== options.slot) return false;
    if (options.tag && !asset.tags.includes(options.tag)) return false;
    if (!normalizedQuery) return true;
    return [asset.title, asset.subtitle, asset.prompt, ...asset.tags]
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

function createNoopDispatch<T>(
  setLastAction: (value: string) => void,
  label: string
): Dispatch<SetStateAction<T>> {
  return () => setLastAction(label);
}

export function CreativeWorkspaceControlsHarnessPage() {
  const mode = getModeFromLocation();
  const [librarySource, setLibrarySource] = useState<'public' | 'mine'>(
    'public'
  );
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<ImagePromptSlot>('character');
  const [selection, setSelection] = useState<ImagePromptSelection>({
    ...defaultImagePromptSelection,
    character: 'character-soft-elf'
  });
  const [lastAction, setLastAction] = useState('ready');
  const [galleryActionWidth, setGalleryActionWidth] = useState<number | null>(
    null
  );
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const upgradeModalRef = useRef<HTMLElement>(null);
  const characterWorkflowModalRef = useRef<HTMLElement>(null);

  const slotAssets = useMemo(
    () =>
      filterAssets({
        assets: MOCK_ASSETS,
        slot: activeSlot,
        query,
        tag: activeTag
      }),
    [activeSlot, activeTag, query]
  );
  const slotTags = useMemo(
    () =>
      Array.from(
        new Set(
          MOCK_ASSETS.filter((asset) => asset.slot === activeSlot).flatMap(
            (asset) => asset.tags
          )
        )
      ),
    [activeSlot]
  );

  const library: UseAssetLibraryResult = {
    assetSource: 'remote',
    assetLoadError: '',
    userAssets: [],
    setUserAssets: createNoopDispatch<UserPromptAsset[]>(
      setLastAction,
      'set user assets'
    ),
    userAssetsLoaded: true,
    setUserAssetsLoaded: createNoopDispatch<boolean>(
      setLastAction,
      'set user assets loaded'
    ),
    userAssetsAsPromptAssets: MOCK_ASSETS,
    mergedAssets: MOCK_ASSETS,
    browsableAssets: MOCK_ASSETS,
    filteredAssets: slotAssets,
    slotTags,
    librarySource,
    setLibrarySource,
    query,
    setQuery,
    activeTag,
    setActiveTag,
    prefetchPublicSlot: () => false,
    handleDeleteUserAsset: async (id) => setLastAction(`delete ${id}`)
  };

  const queue: UseThumbnailQueueResult = {
    batchQueue: {
      'character-soft-elf': { status: 'done' },
      'character-runway-curator': {
        status: 'failed',
        error: 'Provider timeout'
      },
      'pose-relaxed-walk': { status: 'processing' }
    },
    batchRunning: false,
    batchStats: {
      total: 3,
      queued: 0,
      processing: 0,
      done: 2,
      failed: 1
    },
    pendingThumbAssets: [MOCK_ASSETS[2]],
    currentProcessingAsset: null,
    handleBatchRegenerate: () => setLastAction('batch regenerate'),
    handleRetryFailed: () => setLastAction('retry failed'),
    handleCancelBatch: () => setLastAction('cancel batch'),
    handleRegenerateThumbnail: (asset) =>
      setLastAction(`regenerate ${asset.id}`)
  };

  const tasks: ProgressTask[] = [
    {
      key: 'image-running',
      label: 'Generating image set',
      status: 'processing',
      progress: { current: 1, total: 4 },
      imageProgress: { current: 1, total: 2 },
      detail: 'Prompt compiler and image channel are both active.',
      onEdit: () => setLastAction('view prompt'),
      onCancel: () => setLastAction('cancel running')
    },
    {
      key: 'thumb-failed',
      label: 'Thumbnail refresh failed',
      status: 'failed',
      detail: 'Provider timeout',
      retryLabel: 'Retry thumbnail',
      feedbackOptions: [
        { id: 'timeout', label: 'Timeout' },
        { id: 'quality', label: 'Quality drift' }
      ],
      onRetry: () => setLastAction('retry task'),
      onDelete: () => setLastAction('delete failed task'),
      onFeedback: (reason) => setLastAction(`feedback ${reason}`)
    },
    {
      key: 'image-success',
      label: 'Batch returned',
      status: 'succeeded',
      imageProgress: { current: 2, total: 2 },
      notices: [{ tone: 'success', text: 'All images returned.' }],
      onAcknowledge: () => setLastAction('acknowledge')
    }
  ];

  const historyItem: VisualImageHistoryItem = {
    id: 'harness-history-preview',
    imageUrl: MOCK_IMAGE_URL,
    previewUrl: MOCK_IMAGE_URL,
    thumbnailUrl: MOCK_IMAGE_URL,
    width: 900,
    height: 1200,
    prompt:
      'Editorial portrait of a confident creator in a soft studio, balanced product-grade lighting.',
    negativePrompt: 'watermark, unreadable text, extra hands',
    provider: 'openai',
    model: 'gpt-image-2',
    modelLabel: 'GPT Image 2',
    aspectRatio: '3:4',
    actualImageSize: '900x1200',
    requestedImageSize: '1024x1365',
    quality: 'auto',
    outputFormat: 'png',
    assetIds: [],
    createdAt: '2026-07-06T04:00:00.000Z'
  };
  const historyItems: VisualImageHistoryItem[] = [
    historyItem,
    {
      ...historyItem,
      id: 'harness-history-preview-2',
      prompt:
        'A product-grade variation with confident posture and clean catalog shadows.',
      createdAt: '2026-07-06T04:12:00.000Z'
    },
    {
      ...historyItem,
      id: 'harness-history-preview-3',
      prompt:
        'A close crop creative portrait with warm bounce light and precise facial detail.',
      createdAt: '2026-07-06T04:24:00.000Z'
    }
  ];
  const videoItem: VisualVideoGenerationItem = {
    generationId: 'harness-video-preview',
    videoUrl: 'https://example.com/harness-video.mp4',
    posterUrl: MOCK_IMAGE_URL,
    prompt:
      'A slow product reveal with soft studio light, controlled camera movement, and a quiet premium finish.',
    provider: 'webtomind',
    model: 'doubao-seedance-2-0-260128',
    modelLabel: 'Seedance',
    aspectRatio: '16:9',
    duration: 5,
    byteSize: 3200000,
    createdAt: '2026-07-06T04:36:00.000Z'
  };

  const selectedActiveAsset =
    slotAssets.find((asset) => selection[asset.slot] === asset.id) ||
    MOCK_ASSETS[0];
  const compiled = useMemo(() => {
    const selectedAssets = imagePromptSlots
      .flatMap((slot) =>
        getSelectedAssetIds(selection, slot.id)
          .map((assetId) => getAssetById(assetId, MOCK_ASSETS))
          .filter((asset): asset is ImagePromptAsset => Boolean(asset))
      )
      .filter(Boolean);

    return {
      prompt: selectedAssets.map((asset) => asset.prompt).join(', '),
      negativePrompt: 'watermark, unreadable text',
      selectedAssets,
      warnings: selectedAssets.length === 0 ? ['No assets selected'] : []
    };
  }, [selection]);

  const handleSelectAsset = (asset: ImagePromptAsset) => {
    setSelection((current) => ({
      ...current,
      [asset.slot]: current[asset.slot] === asset.id ? null : asset.id
    }));
    setLastAction(`select ${asset.id}`);
  };

  return (
    <main
      data-harness="creative-workspace-controls"
      style={{
        minHeight: '100vh',
        padding: 24,
        background: 'var(--product-canvas, #f4f1ea)',
        color: 'var(--product-text-primary, #17110d)'
      }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800 }}>
          ISOLATED PREVIEW HARNESS
        </p>
        <h1 style={{ margin: '8px 0 16px', fontSize: 22 }}>
          Creative Workspace Controls
        </h1>
        <nav
          aria-label="Harness modes"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 16
          }}
        >
          <a href="?mode=progress-library">Progress and library</a>
          <a href="?mode=asset-picker">Asset picker</a>
          <a href="?mode=character-picker">Character picker</a>
          <a href="?mode=history-preview">History preview</a>
          <a href="?mode=image-lightbox">Image lightbox</a>
          <a href="?mode=video-preview">Video preview</a>
          <a href="?mode=history-gallery">History gallery</a>
          <a href="?mode=result-recent">Result and recent</a>
          <a href="?mode=creator-canvas">Creator canvas</a>
          <a href="?mode=upgrade-modal">Upgrade modal</a>
          <a href="?mode=deep-paywall">Deep paywall</a>
          <a href="?mode=character-workflow-modal">Character workflow</a>
          <a href="?mode=account-menu">Account menu</a>
          <a href="?mode=gallery-actions">Gallery actions</a>
        </nav>

        {mode === 'progress-library' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
              gap: 18,
              alignItems: 'start'
            }}
          >
            <CreatorLibrary
              library={library}
              queue={queue}
              uploadStage="idle"
              uploadError=""
              onPickUploadFile={() => setLastAction('pick upload file')}
              onOpenPromptImport={() => setLastAction('open prompt import')}
              uploadInputRef={uploadInputRef}
              activeSlot={activeSlot}
              onActiveSlotChange={(slot) => {
                setActiveSlot(slot);
                setActiveTag(null);
              }}
              getSlotLabel={getSlotLabel}
              selection={selection}
              selectedActiveAsset={selectedActiveAsset}
              onSelectAsset={handleSelectAsset}
              isAuthenticated
              onRequireLogin={() => setLastAction('require login')}
              onOpenEdit={(asset) => setLastAction(`edit ${asset.id}`)}
            />
            <GenerationProgressPanel embedded tasks={tasks} />
          </div>
        )}

        {mode === 'asset-picker' && (
          <AssetPicker
            librarySource={librarySource}
            onLibrarySourceChange={setLibrarySource}
            assetSource="remote"
            assetLoadError=""
            isAuthenticated
            onRequireLogin={() => setLastAction('require login')}
            uploadStage="idle"
            onOpenPromptImport={() => setLastAction('open prompt import')}
            activeSlot={activeSlot}
            onActiveSlotChange={setActiveSlot}
            getSlotLabel={getSlotLabel}
            query={query}
            onQueryChange={setQuery}
            activeTag={activeTag}
            onActiveTagChange={setActiveTag}
            slotTags={slotTags}
            filteredAssets={slotAssets}
            selection={selection}
            onSelectAsset={handleSelectAsset}
            onClose={() => setLastAction('close asset picker')}
          />
        )}

        {mode === 'character-picker' && (
          <CharacterReferencePickerModal
            isAuthenticated={false}
            selectedCharacterIds={[]}
            onSelectedCharacterIdsChange={(ids) =>
              setLastAction(`selected ${ids.length} characters`)
            }
            onSelectedCharactersChange={() =>
              setLastAction('selected character cards')
            }
            onSelectedReferenceIdsChange={(ids) =>
              setLastAction(`selected ${ids.length} references`)
            }
            onRequireLogin={() => setLastAction('require login')}
            setError={(message) => setLastAction(`error ${message}`)}
            setStatusText={(message) => setLastAction(`status ${message}`)}
            onClose={() => setLastAction('close character picker')}
          />
        )}

        {mode === 'history-preview' && (
          <HistoryPreviewModal
            item={historyItem}
            dateLocale="en-US"
            onClose={() => setLastAction('close history preview')}
            onReedit={() => setLastAction('reedit history item')}
            onDelete={async () => setLastAction('delete history item')}
            onCopyPrompt={async () => {
              setLastAction('copy history prompt');
              return true;
            }}
            onFavorite={() => setLastAction('favorite history item')}
            onOpenImage={() => setLastAction('open history image')}
            onDownloadOriginal={() =>
              setLastAction('download original history image')
            }
            onLocalEdit={() => setLastAction('local edit history image')}
            canNavigate
            onPrevious={() => setLastAction('previous history image')}
            onNext={() => setLastAction('next history image')}
            recipeAssets={MOCK_ASSETS.slice(0, 4).map((asset) => ({
              slot: asset.slot,
              asset
            }))}
            getRecipeSlotLabel={getSlotLabel}
            onCreateFromRecipe={() =>
              setLastAction('create from history recipe')
            }
          />
        )}

        {mode === 'image-lightbox' && (
          <PhotoSwipeViewer
            items={[{ src: MOCK_IMAGE_URL, alt: 'Image lightbox harness' }]}
            index={0}
            onClose={() => setLastAction('close lightbox')}
            onDownload={() => setLastAction('download lightbox image')}
          />
        )}

        {mode === 'video-preview' && (
          <VideoHistoryPreviewDialog
            item={videoItem}
            dateLocale="en-US"
            onReuse={() => setLastAction('reedit video item')}
            onFavorite={() => setLastAction('favorite video item')}
            onClose={() => setLastAction('close video preview')}
          />
        )}

        {mode === 'history-gallery' && (
          <HistoryGalleryModal
            mode="reference-picker"
            title="History gallery harness"
            items={historyItems}
            total={5}
            loading={false}
            loadingMore={false}
            error=""
            dateLocale="en-US"
            selectedIds={['harness-history-preview-2']}
            onClose={() => setLastAction('close history gallery')}
            onSelect={(item) => setLastAction(`select ${item.id}`)}
            onToggleReference={(id) => setLastAction(`toggle ${id}`)}
            onConfirmReferences={() => setLastAction('confirm references')}
            onLoadMore={() => setLastAction('load more history')}
          />
        )}

        {mode === 'result-recent' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
              gap: 18,
              alignItems: 'start'
            }}
          >
            <CreatorResult
              statusText="Image set returned"
              isGenerating={false}
              resultImageUrl={MOCK_IMAGE_URL}
              resultImageUrls={[MOCK_IMAGE_URL, MOCK_IMAGE_URL]}
              error=""
              generationHistory={historyItems}
              generationHistoryTotal={12}
              activeGenerationId="harness-history-preview"
              canCheckConsistency
              consistencyChecking={false}
              consistencyResult={{
                score: 0.86,
                verdict: 'needs_repair',
                matchedTraits: ['hair color', 'outfit silhouette'],
                driftedTraits: ['eye shape', 'background prop'],
                repairPrompt:
                  'Keep the same eye shape and remove the extra background prop.'
              }}
              onCheckConsistency={() => setLastAction('check consistency')}
              onUseRepairPrompt={() => setLastAction('use repair prompt')}
              onSelectHistory={(item) =>
                setLastAction(`select result history ${item.id}`)
              }
              onViewMoreHistory={() => setLastAction('view more result')}
              onCloseResult={() => setLastAction('close result')}
            />
            <RecentGenerationsPanel
              statusText="Latest generations"
              error=""
              generationHistory={historyItems}
              generationHistoryTotal={12}
              activeGenerationId="harness-history-preview"
              onSelectHistory={(item) =>
                setLastAction(`select recent ${item.id}`)
              }
              onViewMoreHistory={() => setLastAction('view more recent')}
            />
          </div>
        )}

        {mode === 'creator-canvas' && (
          <CreatorCanvas
            compiled={compiled}
            selection={selection}
            mergedAssets={MOCK_ASSETS}
            activeSlot={activeSlot}
            onActiveSlotChange={setActiveSlot}
            getSlotLabel={getSlotLabel}
            onClearSlot={(slot) => {
              setSelection((current) => ({ ...current, [slot]: null }));
              setLastAction(`clear ${slot}`);
            }}
            onClearSelection={() => {
              setSelection(defaultImagePromptSelection);
              setLastAction('clear combo');
            }}
            onOpenPicker={(slot) => setLastAction(`open picker ${slot || ''}`)}
            onApplySelectionToPrompt={() => setLastAction('apply to prompt')}
            onImportAsset={(asset) => setLastAction(`import ${asset.id}`)}
            importingAssetIds={new Set(['reverse-sample'])}
          />
        )}

        {mode === 'upgrade-modal' && (
          <UpgradePromptModal
            ref={upgradeModalRef}
            open
            message="This generation needs a few more credits. Upgrade to continue the creative run without losing context."
            estimatedCost={12}
            creditsBalance={4}
            onClose={() => setLastAction('close upgrade modal')}
            onUpgrade={() => setLastAction('open pricing from upgrade modal')}
          />
        )}

        {mode === 'deep-paywall' && (
          <DeepFeaturePaywallModal
            open
            kind="workflow"
            localePrefix="/en-US"
            isAuthenticated
            source="creative_controls_harness"
            onClose={() => setLastAction('close deep paywall')}
            onContinue={() => setLastAction('continue deep paywall preview')}
          />
        )}

        {mode === 'character-workflow-modal' && (
          <ImageCreateCharacterWorkflowModal
            modalRef={characterWorkflowModalRef}
            ariaLabel="Character workflow harness"
            title="Character workflow"
            hint="Manage references, recipes, and consistency checks."
            closeLabel="Close character workflow"
            isAuthenticated={false}
            selectedReferenceIds={[]}
            selectedCharacterIds={[]}
            onSelectedReferenceIdsChange={(ids) =>
              setLastAction(`workflow references ${ids.length}`)
            }
            onSelectedCharacterIdsChange={(ids) =>
              setLastAction(`workflow characters ${ids.length}`)
            }
            onSelectedCharactersChange={(characters) =>
              setLastAction(`workflow character cards ${characters.length}`)
            }
            onRequireLogin={() => setLastAction('workflow require login')}
            setError={(message) => setLastAction(`workflow error ${message}`)}
            setStatusText={(message) =>
              setLastAction(`workflow status ${message}`)
            }
            onClose={() => setLastAction('close character workflow')}
            onCharacterCreated={() => setLastAction('character created')}
            canCheckConsistency={false}
            consistencyChecking={false}
            consistencyResult={null}
            onCheckConsistency={() => setLastAction('check workflow')}
            onUseRepairPrompt={(prompt) =>
              setLastAction(`use workflow repair ${prompt.length}`)
            }
            settings={{}}
            selection={{}}
            currentCharacterReferenceGroups={[]}
            currentPrompt="Editorial character study in a clean studio."
            currentNegativePrompt=""
            onApplyRecipe={(recipe: ImageCreatorRecipe) =>
              setLastAction(`apply recipe ${recipe.id}`)
            }
            onRunRecipe={(recipe: ImageCreatorRecipe) =>
              setLastAction(`run recipe ${recipe.id}`)
            }
          />
        )}

        {mode === 'account-menu' && (
          <section
            className="image-create-page"
            aria-label="Account menu harness"
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
              gap: 24,
              alignItems: 'end',
              minHeight: 560,
              padding: 24
            }}
          >
            <div className="create-side-nav-bottom" style={{ width: 160 }}>
              <CreatorAccountMenu
                placement="sidebar"
                user={{
                  id: 'harness-sidebar-user',
                  email: 'a-very-long-creator-email@webtomind.example',
                  user_metadata: {
                    name: '一位名字很长的创作者账户',
                    picture: MOCK_IMAGE_URL
                  }
                }}
                userName="一位名字很长的创作者账户"
                memberNumber="000128"
                accountStatusLabel="15.6万 积分"
                creditsTrailingLabel="充值"
                rechargeHref="/zh-CN/recharge?source=creator_account_menu"
                pricingHref="/zh-CN/create/pricing?source=controls_harness"
                workspaceHref="/boards"
                settingsHref="/zh-CN/settings"
                copy={{
                  profileFallback: '个人资料',
                  founderMember: '创始成员',
                  personalSpace: '个人空间',
                  pricing: '升级',
                  workspace: '工作台',
                  settings: '个人设置',
                  trash: '回收站',
                  installExtension: '安装插件',
                  contact: '联系我们',
                  signOut: '退出登录',
                  language: '语言',
                  languageChinese: '简体中文',
                  languageEnglish: 'English',
                  theme: '主题',
                  themeLight: '浅色',
                  themeDark: '深色',
                  themeSystem: '跟随系统'
                }}
                onSignOut={() => setLastAction('sidebar sign out')}
              />
            </div>
            <div className="image-create-mininav-actions">
              <CreatorAccountMenu
                placement="topbar"
                user={{
                  id: 'harness-topbar-user',
                  email: 'topbar@webtomind.example',
                  user_metadata: {
                    name: 'Topbar Creator',
                    picture: MOCK_IMAGE_URL
                  }
                }}
                userName="Topbar Creator"
                pricingHref="/zh-CN/pricing?source=controls_harness"
                workspaceHref="/boards"
                settingsHref="/zh-CN/settings"
                copy={{
                  profileFallback: '个人资料',
                  founderMember: '创始成员',
                  personalSpace: '个人空间',
                  pricing: '升级',
                  workspace: '工作台',
                  settings: '个人设置',
                  trash: '回收站',
                  installExtension: '安装插件',
                  contact: '联系我们',
                  signOut: '退出登录',
                  language: '语言',
                  languageChinese: '简体中文',
                  languageEnglish: 'English',
                  theme: '主题',
                  themeLight: '浅色',
                  themeDark: '深色',
                  themeSystem: '跟随系统'
                }}
                onSignOut={() => setLastAction('topbar sign out')}
              />
            </div>
          </section>
        )}

        {mode === 'gallery-actions' && (
          <section
            className="image-create-page create-gallery-route"
            aria-label="Gallery actions harness"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 18, padding: 24 }}
          >
            {[168, 220].map((width) => (
              <article
                className="create-gallery-card"
                key={width}
                style={{ width, maxWidth: '100%' }}
              >
                <div className="create-gallery-image-wrap">
                  <img
                    src={MOCK_IMAGE_URL}
                    alt={`${width}px gallery card`}
                    width={900}
                    height={1200}
                  />
                  <div className="create-gallery-hover-panel">
                    <GalleryCardActionControls
                      favorite={false}
                      onReference={() => setLastAction(`reference ${width}`)}
                      onEdit={() => setLastAction(`edit ${width}`)}
                      onFavorite={() => setLastAction(`favorite ${width}`)}
                      onMore={() => setGalleryActionWidth(width)}
                    />
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}

        <GalleryActionSheet
          open={galleryActionWidth !== null}
          favorite={false}
          onClose={() => setGalleryActionWidth(null)}
          onReference={() =>
            setLastAction(`reference ${galleryActionWidth ?? 'unknown'}`)
          }
          onEdit={() =>
            setLastAction(`edit ${galleryActionWidth ?? 'unknown'}`)
          }
          onFavorite={() =>
            setLastAction(`favorite ${galleryActionWidth ?? 'unknown'}`)
          }
        />

        <pre
          data-testid="creative-controls-last-action"
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 8,
            background: 'rgba(255, 255, 255, 0.65)',
            fontSize: 12
          }}
        >
          {lastAction}
        </pre>
      </div>
    </main>
  );
}
