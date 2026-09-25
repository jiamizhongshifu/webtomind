import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Check,
  BookImage,
  ChevronDown,
  EyeOff,
  Heart,
  MoreHorizontal,
  Plus,
  Share2,
  Trash2,
  Wand2
} from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  FeedbackMessage,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SearchField
} from '@/shared/ui';
import {
  addMoodboardItems,
  copyMoodboardToLibrary,
  deleteMoodboard,
  listMoodboards,
  shareMoodboard
} from '@/services/create-workspace-v2-api';
import type { DiscoveryImage } from '@/services/create-workspace-v2-api';
import type { VisualMoodboard } from '@/shared/create-workspace-v2';
import { CreateWorkspaceShell } from '../components/create-workspace/CreateWorkspaceShell';
import { useAuthModal } from '../components/AuthModal';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmDialog } from '@/workspace/components/ConfirmDialog';
import {
  withCreateWorkspaceMoodboardFallback
} from '../data/create-workspace-demo';
import {
  readMoodboardLibraryPreferences,
  togglePreferenceId,
  writeMoodboardLibraryPreferences,
  type MoodboardLibraryPreferences
} from '../lib/moodboard-library-preferences';

function getPrefix(pathname: string): '' | '/zh-CN' | '/en-US' {
  return pathname.startsWith('/en-US')
    ? '/en-US'
    : pathname.startsWith('/zh-CN')
      ? '/zh-CN'
      : '';
}

type MoodboardSortKey = 'modified' | 'created' | 'alphabetical' | 'imageCount';
type MoodboardSortDirection = 'newest' | 'oldest';

const MOODBOARD_SORT_KEYS: MoodboardSortKey[] = [
  'modified',
  'created',
  'alphabetical',
  'imageCount'
];

const SORT_LABELS = {
  modified: { zh: '最近修改', en: 'Date modified' },
  created: { zh: '创建时间', en: 'Date created' },
  alphabetical: { zh: '按名称', en: 'Alphabetical' },
  imageCount: { zh: '图片数量', en: 'Image count' }
} as const;

export function CreateMoodboardsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const prefix = getPrefix(location.pathname);
  const isEnglish = prefix === '/en-US';
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const preferenceOwnerId = user?.id || 'anonymous';
  const [boards, setBoards] = useState<VisualMoodboard[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isPreviewFallback, setIsPreviewFallback] = useState(false);
  const [sortKey, setSortKey] = useState<MoodboardSortKey>('modified');
  const [sortDirection, setSortDirection] =
    useState<MoodboardSortDirection>('newest');
  const [savingBoardId, setSavingBoardId] = useState('');
  const [deletingBoardId, setDeletingBoardId] = useState('');
  const [deleteCandidate, setDeleteCandidate] =
    useState<VisualMoodboard | null>(null);
  const [savedBoardId, setSavedBoardId] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [preferences, setPreferences] = useState<MoodboardLibraryPreferences>(
    () => readMoodboardLibraryPreferences(preferenceOwnerId)
  );
  const preferencesRef = useRef(preferences);
  const presetCopyInFlightRef = useRef(new Set<string>());
  const pendingImage = (
    location.state as { pendingImage?: DiscoveryImage } | null
  )?.pendingImage;

  useEffect(() => {
    listMoodboards()
      .then((nextBoards) => {
        const fallbackBoards = withCreateWorkspaceMoodboardFallback(nextBoards);
        setBoards(fallbackBoards);
        setIsPreviewFallback(nextBoards.length === 0);
      })
      .catch(() => {
        setBoards(withCreateWorkspaceMoodboardFallback([]));
        setIsPreviewFallback(true);
        setError(
          isEnglish
            ? 'Unable to load personal Moodboards. Showing presets instead.'
            : '个人情绪板加载失败，当前展示预设情绪板。'
        );
      })
      .finally(() => setLoading(false));
  }, [isEnglish]);

  useEffect(() => {
    const next = readMoodboardLibraryPreferences(preferenceOwnerId);
    preferencesRef.current = next;
    setPreferences(next);
  }, [preferenceOwnerId]);

  const updatePreferences = (
    updater: (
      current: MoodboardLibraryPreferences
    ) => MoodboardLibraryPreferences
  ) => {
    const next = updater(preferencesRef.current);
    try {
      writeMoodboardLibraryPreferences(next, preferenceOwnerId);
    } catch {
      setError(
        isEnglish
          ? 'This preference could not be saved in the browser.'
          : '当前偏好无法保存到浏览器。'
      );
    }
    preferencesRef.current = next;
    setPreferences(next);
  };

  const personal = useMemo(
    () =>
      boards
        .filter((board) => !board.isOfficial)
        .filter((board) =>
          board.name.toLowerCase().includes(query.toLowerCase())
        )
        .filter((board) =>
          showHidden
            ? preferences.hiddenPersonalIds.includes(board.id)
            : !preferences.hiddenPersonalIds.includes(board.id)
        )
        .sort((left, right) => {
          const comparison =
            sortKey === 'alphabetical'
              ? left.name.localeCompare(right.name)
              : sortKey === 'imageCount'
                ? left.itemCount - right.itemCount
                : new Date(
                    sortKey === 'created' ? left.createdAt : left.updatedAt
                  ).getTime() -
                  new Date(
                    sortKey === 'created' ? right.createdAt : right.updatedAt
                  ).getTime();
          return sortDirection === 'newest' ? -comparison : comparison;
        }),
    [
      boards,
      preferences.hiddenPersonalIds,
      query,
      showHidden,
      sortDirection,
      sortKey
    ]
  );
  const presets = useMemo(
    () =>
      boards
        .filter(
          (board) =>
            board.isOfficial &&
            board.name.toLowerCase().includes(query.toLowerCase())
        )
        .sort((left, right) => {
          const leftFavorite = preferences.favoritePresetIds.includes(left.id);
          const rightFavorite = preferences.favoritePresetIds.includes(
            right.id
          );
          if (leftFavorite !== rightFavorite) return leftFavorite ? -1 : 1;
          return left.name.localeCompare(right.name);
        }),
    [boards, preferences.favoritePresetIds, query]
  );
  const heroImages = useMemo(
    () =>
      presets
        .flatMap((board) => {
          const itemImages = (board.items || [])
            .map((item) => item.imageUrl)
            .filter(Boolean);
          return itemImages.length
            ? itemImages
            : board.coverImageUrl
              ? [board.coverImageUrl]
              : [];
        })
        .slice(0, 4),
    [presets]
  );

  const savePendingImage = async (board: VisualMoodboard) => {
    if (!pendingImage || board.isOfficial) return;
    setSavingBoardId(board.id);
    setError('');
    try {
      const updated = await addMoodboardItems(board.id, [
        {
          source: pendingImage.kind,
          imageUrl: pendingImage.imageUrl,
          title: pendingImage.title,
          prompt: pendingImage.prompt,
          promptCaseId:
            pendingImage.kind === 'prompt_case' ? pendingImage.id : undefined,
          imageGenerationId:
            pendingImage.kind === 'gallery' ? pendingImage.id : undefined
        }
      ]);
      setBoards((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      setSavedBoardId(board.id);
    } catch (saveError) {
      setError(
        board.id.startsWith('demo-')
          ? isEnglish
            ? 'Preview examples are read-only. Start the local API to save this image.'
            : '预览案例为只读内容，请启动本地 API 后再保存图片。'
          : saveError instanceof Error
            ? saveError.message
            : '保存失败'
      );
    } finally {
      setSavingBoardId('');
    }
  };

  const openPreset = async (board: VisualMoodboard) => {
    if (!user) {
      openAuthModal({
        redirectTo: `${prefix}/moodboards`,
        source: 'moodboard_preset_copy'
      });
      return;
    }
    if (presetCopyInFlightRef.current.has(board.id)) return;
    presetCopyInFlightRef.current.add(board.id);
    setSavingBoardId(board.id);
    setError('');
    try {
      const existingCopyId = preferencesRef.current.copiedPresetIds[board.id];
      const existingCopy = boards.find(
        (item) =>
          item.isOwner &&
          !item.isOfficial &&
          (board.id.startsWith('demo-')
            ? item.sourcePresetKey === board.id
            : item.sourceMoodboardId === board.id)
      );
      if (existingCopy) {
        updatePreferences((current) => ({
          ...current,
          copiedPresetIds: {
            ...current.copiedPresetIds,
            [board.id]: existingCopy.id
          }
        }));
        navigate(`${prefix}/moodboards/${existingCopy.id}`);
        return;
      }
      if (existingCopyId) {
        updatePreferences((current) => {
          const copiedPresetIds = { ...current.copiedPresetIds };
          delete copiedPresetIds[board.id];
          return { ...current, copiedPresetIds };
        });
      }

      const copy = await copyMoodboardToLibrary(board);
      setBoards((current) =>
        current.some((item) => item.id === copy.id)
          ? current
          : [copy, ...current]
      );
      updatePreferences((current) => ({
        ...current,
        copiedPresetIds: { ...current.copiedPresetIds, [board.id]: copy.id }
      }));
      navigate(`${prefix}/moodboards/${copy.id}`);
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? copyError.message
          : isEnglish
            ? 'Unable to add this preset to your moodboards.'
            : '暂时无法把这个预设添加到你的情绪板。'
      );
    } finally {
      presetCopyInFlightRef.current.delete(board.id);
      setSavingBoardId('');
    }
  };

  const togglePresetFavorite = (boardId: string) => {
    updatePreferences((current) => ({
      ...current,
      favoritePresetIds: togglePreferenceId(current.favoritePresetIds, boardId)
    }));
  };

  const hidePersonalBoard = (boardId: string) => {
    updatePreferences((current) => ({
      ...current,
      hiddenPersonalIds: togglePreferenceId(current.hiddenPersonalIds, boardId)
    }));
  };

  const sharePersonalBoard = async (board: VisualMoodboard) => {
    setSavingBoardId(board.id);
    try {
      const href = board.isOwner
        ? `${window.location.origin}${prefix}/moodboards/s/${await shareMoodboard(board.id)}`
        : `${window.location.origin}${prefix}/moodboards/${board.id}`;
      await navigator.clipboard.writeText(href);
      setSavedBoardId(board.id);
      window.setTimeout(() => setSavedBoardId(''), 1800);
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : '分享失败');
    } finally {
      setSavingBoardId('');
    }
  };

  const deletePersonalBoard = async () => {
    const board = deleteCandidate;
    if (!board || board.isOfficial || !board.isOwner || deletingBoardId) return;
    setDeletingBoardId(board.id);
    setError('');
    setNotice('');
    try {
      await deleteMoodboard(board.id);
      setBoards((current) => current.filter((item) => item.id !== board.id));
      updatePreferences((current) => ({
        ...current,
        hiddenPersonalIds: current.hiddenPersonalIds.filter(
          (id) => id !== board.id
        ),
        copiedPresetIds: Object.fromEntries(
          Object.entries(current.copiedPresetIds).filter(
            ([, copiedBoardId]) => copiedBoardId !== board.id
          )
        )
      }));
      setDeleteCandidate(null);
      setNotice(
        isEnglish
          ? `“${board.name}” was deleted.`
          : `已删除情绪板“${board.name}”。`
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : isEnglish
            ? 'Unable to delete this moodboard.'
            : '情绪板删除失败'
      );
    } finally {
      setDeletingBoardId('');
    }
  };

  const renderBoard = (
    board: VisualMoodboard,
    context: 'personal' | 'preset'
  ) => {
    const boardImages = (board.items || [])
      .map((item) => item.imageUrl)
      .filter(Boolean);
    if (!boardImages.length && board.coverImageUrl) {
      boardImages.push(board.coverImageUrl);
    }
    return (
      <Card
        key={`${context}:${board.id}`}
        as="article"
        className={`moodboard-library-card is-${context}`}
      >
        {context === 'preset' ? (
          <button
            type="button"
            className="moodboard-library-card-primary"
            aria-label={isEnglish ? `Open ${board.name}` : `打开 ${board.name}`}
            disabled={savingBoardId === board.id}
            onClick={() => void openPreset(board)}
          >
            <div className="moodboard-library-cover">
              {renderCoverStack(board, boardImages)}
            </div>
            <div className="moodboard-library-meta">
              <strong>{board.name}</strong>
            </div>
          </button>
        ) : (
          <Link
            to={`${prefix}/moodboards/${board.id}`}
            className="moodboard-library-card-primary"
          >
            <div className="moodboard-library-cover">
              {renderCoverStack(board, boardImages)}
            </div>
            <div className="moodboard-library-meta">
              <strong>{board.name}</strong>
            </div>
          </Link>
        )}

        {context === 'preset' ? (
          <button
            type="button"
            className={`moodboard-library-favorite${
              preferences.favoritePresetIds.includes(board.id)
                ? ' is-favorite'
                : ''
            }`}
            aria-label={
              preferences.favoritePresetIds.includes(board.id)
                ? isEnglish
                  ? 'Remove preset from favorites'
                  : '取消收藏预设情绪板'
                : isEnglish
                  ? 'Favorite and pin preset'
                  : '收藏并置顶预设情绪板'
            }
            aria-pressed={preferences.favoritePresetIds.includes(board.id)}
            onClick={() => togglePresetFavorite(board.id)}
          >
            <Heart aria-hidden="true" />
          </button>
        ) : (
          <div className="moodboard-library-personal-actions">
            {pendingImage ? (
              <Button
                variant="primary"
                size="sm"
                leadingIcon={savedBoardId === board.id ? <Check /> : <Plus />}
                disabled={
                  savingBoardId === board.id || savedBoardId === board.id
                }
                onClick={() => void savePendingImage(board)}
              >
                {savedBoardId === board.id
                  ? isEnglish
                    ? 'Saved'
                    : '已保存'
                  : isEnglish
                    ? 'Save here'
                    : '保存到这里'}
              </Button>
            ) : null}
            <PopoverRoot>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="moodboard-library-more-trigger"
                  aria-label={isEnglish ? 'More actions' : '更多操作'}
                >
                  <MoreHorizontal aria-hidden="true" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={7}
                className="moodboard-library-card-menu"
              >
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `${prefix}/image?moodboardId=${encodeURIComponent(board.id)}`
                    )
                  }
                >
                  <Wand2 aria-hidden="true" />
                  {isEnglish ? 'Create with moodboard' : '前往创作'}
                </button>
                <button
                  type="button"
                  onClick={() => hidePersonalBoard(board.id)}
                >
                  <EyeOff aria-hidden="true" />
                  {preferences.hiddenPersonalIds.includes(board.id)
                    ? isEnglish
                      ? 'Unhide'
                      : '取消隐藏'
                    : isEnglish
                      ? 'Hide'
                      : '隐藏'}
                </button>
                <button
                  type="button"
                  disabled={savingBoardId === board.id}
                  onClick={() => void sharePersonalBoard(board)}
                >
                  {savedBoardId === board.id ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <Share2 aria-hidden="true" />
                  )}
                  {savedBoardId === board.id
                    ? isEnglish
                      ? 'Link copied'
                      : '链接已复制'
                    : isEnglish
                      ? 'Share'
                      : '分享'}
                </button>
                {board.isOwner ? (
                  <button
                    type="button"
                    className="moodboard-library-menu-danger"
                    disabled={deletingBoardId === board.id}
                    onClick={() => setDeleteCandidate(board)}
                  >
                    <Trash2 aria-hidden="true" />
                    {isEnglish ? 'Delete moodboard' : '删除情绪板'}
                  </button>
                ) : null}
              </PopoverContent>
            </PopoverRoot>
          </div>
        )}
      </Card>
    );
  };

  function renderCoverStack(board: VisualMoodboard, boardImages: string[]) {
    return boardImages.length ? (
      <div className="moodboard-library-cover-stack">
        {boardImages.slice(0, 5).map((imageUrl, index) => (
          <img
            key={`${board.id}-${imageUrl}-${index}`}
            src={imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ))}
      </div>
    ) : (
      <BookImage />
    );
  }

  return (
    <CreateWorkspaceShell className="moodboard-library-page">
      <div className="create-v2-page-container">
        <section className="moodboard-library-hero">
          <div className="moodboard-library-hero-copy">
            <div className="moodboard-library-title">
              <BookImage />
              <h1>{isEnglish ? 'Moodboards' : '情绪板'}</h1>
            </div>
            <p>
              {isEnglish
                ? 'Upload references, analyze their shared visual style, and reuse that context in image creation.'
                : '上传参考图并分析它们共同的视觉风格，再把这套色彩、光线与构图语境用于图像创作。'}
            </p>
            <Button
              variant="secondary"
              size="md"
              leadingIcon={<Plus />}
              onClick={() => navigate(`${prefix}/moodboards/new`)}
            >
              {isEnglish ? 'Create moodboard' : '创建情绪板'}
            </Button>
          </div>
          <button
            type="button"
            className="moodboard-library-hero-upload"
            onClick={() => navigate(`${prefix}/moodboards/new`)}
          >
            <Plus />
            <span>{isEnglish ? 'Upload a file' : '上传参考图'}</span>
          </button>
          <div className="moodboard-library-hero-art" aria-hidden="true">
            {heroImages.map((imageUrl, index) => (
              <img key={`${imageUrl}-${index}`} src={imageUrl} alt="" />
            ))}
          </div>
        </section>

        <div className="moodboard-library-toolbar">
          <div className="moodboard-library-filters">
            <PopoverRoot>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="moodboard-library-sort-trigger"
                  aria-label={
                    isEnglish ? 'Sort personal moodboards' : '排序个人情绪板'
                  }
                >
                  {SORT_LABELS[sortKey][isEnglish ? 'en' : 'zh']}
                  <ChevronDown aria-hidden="true" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={8}
                className="moodboard-library-sort-menu"
              >
                <span>{isEnglish ? 'Sort by' : '排序维度'}</span>
                <div role="radiogroup" aria-label="Sort by">
                  {MOODBOARD_SORT_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={sortKey === key}
                      onClick={() => setSortKey(key)}
                    >
                      {SORT_LABELS[key][isEnglish ? 'en' : 'zh']}
                      {sortKey === key ? <Check aria-hidden="true" /> : null}
                    </button>
                  ))}
                </div>
                <hr />
                <span>{isEnglish ? 'Order by' : '排序顺序'}</span>
                <div role="radiogroup" aria-label="Order by">
                  {(['newest', 'oldest'] as const).map((direction) => (
                    <button
                      key={direction}
                      type="button"
                      role="radio"
                      aria-checked={sortDirection === direction}
                      onClick={() => setSortDirection(direction)}
                    >
                      {direction === 'newest'
                        ? isEnglish
                          ? 'Newest first'
                          : '最新优先'
                        : isEnglish
                          ? 'Oldest first'
                          : '最早优先'}
                      {sortDirection === direction ? (
                        <Check aria-hidden="true" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </PopoverRoot>
            <button
              type="button"
              className={`moodboard-library-hidden-trigger${
                showHidden ? ' is-active' : ''
              }`}
              aria-pressed={showHidden}
              onClick={() => setShowHidden((current) => !current)}
            >
              <EyeOff aria-hidden="true" />
              {showHidden
                ? isEnglish
                  ? 'Showing hidden'
                  : '正在显示隐藏项'
                : isEnglish
                  ? 'Hiding hidden'
                  : '隐藏项不显示'}
            </button>
          </div>
          <SearchField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery('')}
            placeholder={isEnglish ? 'Search moodboards' : '搜索情绪板'}
            aria-label={isEnglish ? 'Search moodboards' : '搜索情绪板'}
          />
        </div>

        {pendingImage ? (
          <section className="moodboard-save-intent" role="status">
            <img src={pendingImage.imageUrl} alt="" />
            <div>
              <strong>
                {isEnglish
                  ? 'Choose a personal moodboard'
                  : '选择一个个人情绪板'}
              </strong>
              <span>
                {isEnglish
                  ? `Save “${pendingImage.title}” into a reusable visual context.`
                  : `把“${pendingImage.title}”保存进可复用的视觉语境。`}
              </span>
            </div>
          </section>
        ) : null}

        {error ? (
          <FeedbackMessage
            className="moodboard-library-notice"
            tone={isPreviewFallback ? 'warning' : 'error'}
          >
            {error}
          </FeedbackMessage>
        ) : null}
        {notice ? (
          <FeedbackMessage className="moodboard-library-notice" tone="success">
            {notice}
          </FeedbackMessage>
        ) : null}

        <section className="moodboard-library-section" aria-busy={loading}>
          <div className="moodboard-library-grid">
            <Card
              as="button"
              type="button"
              variant="interactive"
              className="moodboard-library-card moodboard-library-new-card"
              onClick={() => navigate(`${prefix}/moodboards/new`)}
            >
              <div className="moodboard-library-cover">
                <span className="moodboard-library-new-icon">
                  <Plus />
                </span>
              </div>
              <div className="moodboard-library-meta">
                <strong>{isEnglish ? 'New moodboard' : '新建情绪板'}</strong>
              </div>
            </Card>
            {personal.map((board) => renderBoard(board, 'personal'))}
          </div>
          {!loading && personal.length === 0 && boards.length === 0 ? (
            <EmptyState
              icon={<BookImage />}
              title={isEnglish ? 'No moodboards yet' : '还没有情绪板'}
              description={
                isEnglish
                  ? 'Start with 4–8 references that belong to the same visual direction.'
                  : '从属于同一视觉方向的 4–8 张参考图开始。'
              }
              action={
                <Button
                  variant="primary"
                  onClick={() => navigate(`${prefix}/moodboards/new`)}
                >
                  {isEnglish ? 'Create your first' : '创建第一个情绪板'}
                </Button>
              }
            />
          ) : null}
        </section>

        {presets.length > 0 ? (
          <section className="moodboard-library-section">
            <div className="create-v2-section-head">
              <h2>{isEnglish ? 'Preset moodboards' : '预设情绪板'}</h2>
            </div>
            <div className="moodboard-library-grid">
              {presets.map((board) => renderBoard(board, 'preset'))}
            </div>
          </section>
        ) : null}
      </div>
      <ConfirmDialog
        isOpen={Boolean(deleteCandidate)}
        title={isEnglish ? 'Delete moodboard?' : '删除这个情绪板？'}
        description={
          isEnglish
            ? `“${deleteCandidate?.name || ''}” and its saved references will be permanently deleted. This cannot be undone.`
            : `“${deleteCandidate?.name || ''}”及其中保存的参考图将被永久删除，此操作无法撤销。`
        }
        confirmText={
          deletingBoardId
            ? isEnglish
              ? 'Deleting…'
              : '正在删除…'
            : isEnglish
              ? 'Delete'
              : '确认删除'
        }
        cancelText={isEnglish ? 'Cancel' : '取消'}
        danger
        loading={Boolean(deletingBoardId)}
        onConfirm={() => void deletePersonalBoard()}
        onCancel={() => setDeleteCandidate(null)}
      />
    </CreateWorkspaceShell>
  );
}

export default CreateMoodboardsPage;
