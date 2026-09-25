import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Copy,
  Images,
  Share2,
  Trash2,
  Upload,
  Wand2
} from 'lucide-react';
import {
  Button,
  FeedbackMessage,
  IconButton,
  Input,
  Select
} from '@/shared/ui';
import { PhotoSwipeViewer } from '../components/image-create/PhotoSwipeViewer';
import {
  addMoodboardItems,
  analyzeMoodboard,
  copyMoodboardToLibrary,
  deleteMoodboard,
  getMoodboard,
  isPersistedMoodboardId,
  materializeMoodboardForUse,
  removeMoodboardItem,
  revokeMoodboardShare,
  searchVisualDiscovery,
  shareMoodboard,
  updateMoodboard,
  type DiscoveryImage
} from '@/services/create-workspace-v2-api';
import {
  MOODBOARD_MAX_ITEMS,
  type MoodboardVisibility,
  type VisualMoodboard
} from '@/shared/create-workspace-v2';
import { CreateWorkspaceShell } from '../components/create-workspace/CreateWorkspaceShell';
import { useAuthModal } from '../components/AuthModal';
import { useAuth } from '../contexts/AuthContext';
import { MoodboardDetailSummary } from '../components/create-workspace/MoodboardDetailSummary';
import { MoodboardSourcePicker } from '../components/create-workspace/MoodboardSourcePicker';
import { MoodboardSuggestions } from '../components/create-workspace/MoodboardSuggestions';
import { VisualMasonry } from '../components/create-workspace/VisualMasonry';
import {
  getCreateWorkspaceMoodboardFallback,
  isCreateWorkspaceDemoEnabled,
  withCreateWorkspaceDiscoveryFallback
} from '../data/create-workspace-demo';
import {
  prepareDiscoveryMoodboardItem,
  prepareUploadedMoodboardItems
} from '../lib/moodboard-item-input';

function getPrefix(pathname: string): '' | '/zh-CN' | '/en-US' {
  return pathname.startsWith('/en-US')
    ? '/en-US'
    : pathname.startsWith('/zh-CN')
      ? '/zh-CN'
      : '';
}

export function CreateMoodboardDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const prefix = getPrefix(location.pathname);
  const isEnglish = prefix === '/en-US';
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const uploadRef = useRef<HTMLInputElement>(null);
  const headerActionsRef = useRef<HTMLDivElement>(null);
  const [board, setBoard] = useState<VisualMoodboard | null>(null);
  const [name, setName] = useState('');
  const [guidelinesDraft, setGuidelinesDraft] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [showCompactHeader, setShowCompactHeader] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceImages, setSourceImages] = useState<DiscoveryImage[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [suggestionsInitialized, setSuggestionsInitialized] = useState(false);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const boardItems = board?.items || [];
  const availableSourceImages = sourceImages.filter(
    (image) => !boardItems.some((item) => item.imageUrl === image.imageUrl)
  );

  const replaceBoard = (next: VisualMoodboard) => {
    setBoard(next);
    setName(next.name);
    setGuidelinesDraft(next.guidelines.join('\n'));
  };

  useEffect(() => {
    setBusy('loading');
    const fallback = getCreateWorkspaceMoodboardFallback(id);
    if (fallback) {
      replaceBoard(fallback);
      setNotice(
        isEnglish
          ? 'Official preset · add it to your moodboards to edit'
          : '官方预设 · 添加到你的情绪板后即可编辑'
      );
      setBusy('');
      return;
    }
    if (!isPersistedMoodboardId(id)) {
      setBoard(null);
      setError(
        isEnglish
          ? 'This moodboard link is invalid. Please select it again from Moodboards.'
          : '情绪板链接无效，请返回情绪板页重新选择。'
      );
      setBusy('');
      return;
    }
    getMoodboard(id)
      .then(replaceBoard)
      .catch((loadError) => {
        setError(
          loadError instanceof Error ? loadError.message : '情绪板加载失败'
        );
      })
      .finally(() => setBusy(''));
  }, [id, isEnglish]);

  useEffect(() => {
    const target = headerActionsRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowCompactHeader(!entry.isIntersecting),
      { threshold: 0.05 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [board?.id]);

  const saveName = async () => {
    if (!board?.isOwner || !name.trim()) {
      setName(board?.name || '');
      setEditingName(false);
      return;
    }
    setEditingName(false);
    if (name.trim() === board.name) return;
    setBusy('saving-name');
    setError('');
    try {
      replaceBoard(await updateMoodboard(board.id, { name: name.trim() }));
      setNotice(isEnglish ? 'Name saved' : '名称已保存');
    } catch (saveError) {
      setName(board.name);
      setError(saveError instanceof Error ? saveError.message : '保存失败');
    } finally {
      setBusy('');
    }
  };

  const saveGuidelines = async () => {
    if (!board?.isOwner) return;
    const guidelines = guidelinesDraft
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
    setBusy('saving-guidelines');
    setError('');
    try {
      replaceBoard(await updateMoodboard(board.id, { guidelines }));
      setNotice(isEnglish ? 'Guidelines saved' : '生成指导已保存');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败');
    } finally {
      setBusy('');
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!board || !files?.length) return;
    setBusy('uploading');
    setError('');
    try {
      const remaining = Math.max(0, MOODBOARD_MAX_ITEMS - board.itemCount);
      const references = await prepareUploadedMoodboardItems(
        Array.from(files),
        remaining
      );
      replaceBoard(await addMoodboardItems(board.id, references));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '上传失败');
    } finally {
      setBusy('');
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };

  const loadSourceImages = useCallback(
    async (query: string) => {
      setSourceLoading(true);
      setError('');
      try {
        const result = await searchVisualDiscovery(
          query,
          isEnglish ? 'en-US' : 'zh-CN'
        );
        // Treat a malformed-but-successful discovery response as an empty page.
        // This keeps the detail workspace usable when an upstream proxy returns
        // fallback JSON without the expected image collection.
        setSourceImages(Array.isArray(result.images) ? result.images : []);
      } catch (sourceError) {
        if (isCreateWorkspaceDemoEnabled()) {
          setSourceImages(
            withCreateWorkspaceDiscoveryFallback(null, query).images
          );
        } else {
          setError(
            sourceError instanceof Error
              ? sourceError.message
              : isEnglish
                ? 'Failed to load visual assets.'
                : '素材加载失败'
          );
        }
      } finally {
        setSourceLoading(false);
      }
    },
    [isEnglish]
  );

  useEffect(() => {
    if (!board || suggestionsInitialized) return;
    setSuggestionsInitialized(true);
    void loadSourceImages('');
  }, [board, loadSourceImages, suggestionsInitialized]);

  const addSourceImage = async (image: DiscoveryImage) => {
    if (!board || board.itemCount >= MOODBOARD_MAX_ITEMS) return;
    setBusy(`source:${image.id}`);
    setError('');
    try {
      replaceBoard(
        await addMoodboardItems(board.id, [
          await prepareDiscoveryMoodboardItem(image)
        ])
      );
      setSourceImages((current) =>
        current.filter((item) => item.id !== image.id)
      );
      setNotice(isEnglish ? 'Reference added' : '参考图已添加');
    } catch (sourceError) {
      setError(
        sourceError instanceof Error ? sourceError.message : '添加素材失败'
      );
    } finally {
      setBusy('');
    }
  };

  const runAnalysis = async () => {
    if (!board) return;
    setBusy('analyzing');
    setError('');
    try {
      replaceBoard(await analyzeMoodboard(board.id));
    } catch (analysisError) {
      setError(
        analysisError instanceof Error ? analysisError.message : '分析失败'
      );
    } finally {
      setBusy('');
    }
  };

  const changeVisibility = async (visibility: MoodboardVisibility) => {
    if (!board) return;
    setBusy('visibility');
    try {
      replaceBoard(await updateMoodboard(board.id, { visibility }));
    } catch (visibilityError) {
      setError(
        visibilityError instanceof Error
          ? visibilityError.message
          : '权限更新失败'
      );
    } finally {
      setBusy('');
    }
  };

  const handleShare = async () => {
    if (!board) return;
    setBusy('sharing');
    try {
      const token = await shareMoodboard(board.id);
      const shareUrl = `${window.location.origin}${prefix}/moodboards/s/${token}`;
      await navigator.clipboard.writeText(shareUrl);
      setBoard({ ...board, shareToken: token });
      setNotice(isEnglish ? 'Share link copied' : '分享链接已复制');
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : '分享失败');
    } finally {
      setBusy('');
    }
  };

  const handleCopyPreset = async () => {
    if (!board) return;
    if (!user) {
      openAuthModal({
        redirectTo: location.pathname,
        source: 'moodboard_preset_copy'
      });
      return;
    }
    setBusy('copying');
    setError('');
    try {
      const copy = await copyMoodboardToLibrary(board);
      navigate(`${prefix}/moodboards/${copy.id}`);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : '复制失败');
    } finally {
      setBusy('');
    }
  };

  const handleGenerateWithMoodboard = async () => {
    if (!board) return;
    if (!user) {
      openAuthModal({
        redirectTo: location.pathname,
        source: 'moodboard_generate'
      });
      return;
    }
    setBusy('preparing-generation');
    setError('');
    try {
      const usableBoard = await materializeMoodboardForUse(board);
      navigate(
        `${prefix}/image?moodboardId=${encodeURIComponent(usableBoard.id)}`
      );
    } catch (prepareError) {
      setError(
        prepareError instanceof Error
          ? prepareError.message
          : isEnglish
            ? 'Unable to prepare this moodboard for creation.'
            : '暂时无法使用这个情绪板进行创作。'
      );
    } finally {
      setBusy('');
    }
  };

  const removeItem = async (itemId: string) => {
    if (!board) return;
    setBusy(`delete:${itemId}`);
    try {
      replaceBoard(await removeMoodboardItem(board.id, itemId));
      if (previewItemId === itemId) setPreviewItemId(null);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : '删除失败');
    } finally {
      setBusy('');
    }
  };

  const removeBoard = async () => {
    if (
      !board ||
      !window.confirm(
        isEnglish
          ? 'Delete this moodboard permanently?'
          : '确定永久删除这个情绪板？'
      )
    )
      return;
    setBusy('deleting-board');
    try {
      await deleteMoodboard(board.id);
      navigate(`${prefix}/moodboards`, { replace: true });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除失败');
      setBusy('');
    }
  };

  if (!board && busy === 'loading') {
    return (
      <CreateWorkspaceShell>
        <div
          className="create-v2-page-container moodboard-detail-loading"
          aria-busy="true"
        >
          {isEnglish ? 'Loading moodboard…' : '正在加载情绪板…'}
        </div>
      </CreateWorkspaceShell>
    );
  }

  return (
    <CreateWorkspaceShell className="moodboard-detail-page">
      <div className="create-v2-page-container">
        <div className="moodboard-detail-back-row">
          <IconButton
            label={isEnglish ? 'All moodboards' : '全部情绪板'}
            variant="ghost"
            icon={<ArrowLeft />}
            onClick={() => navigate(`${prefix}/moodboards`)}
          />
        </div>
        {error ? (
          <FeedbackMessage className="moodboard-detail-notice" tone="error">
            {error}
          </FeedbackMessage>
        ) : null}
        {notice ? (
          <FeedbackMessage className="moodboard-detail-notice" tone="neutral">
            <Check /> {notice}
          </FeedbackMessage>
        ) : null}
        {board ? (
          <main className="moodboard-detail-main">
            {showCompactHeader ? (
              <div
                className="moodboard-detail-compact-header"
                role="region"
                aria-label={
                  isEnglish ? 'Moodboard quick actions' : '情绪板快捷操作'
                }
              >
                <div className="moodboard-detail-compact-context">
                  <div className="moodboard-detail-compact-thumbnails">
                    {(board.items || []).slice(0, 4).map((item) => (
                      <img key={item.id} src={item.imageUrl} alt="" />
                    ))}
                  </div>
                  <span>
                    {board.itemCount} {isEnglish ? 'Images' : '张图片'}
                  </span>
                </div>
                <div>
                  <Button
                    variant="primary"
                    size="sm"
                    leadingIcon={<Wand2 />}
                    disabled={busy === 'preparing-generation'}
                    onClick={() => void handleGenerateWithMoodboard()}
                  >
                    {isEnglish ? 'Generate with Moodboard' : '使用情绪板创作'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`${prefix}/moodboards`)}
                  >
                    {isEnglish ? 'Done' : '完成'}
                  </Button>
                </div>
              </div>
            ) : null}
            <header className="moodboard-detail-head">
              <div className="moodboard-detail-title-block">
                {board.coverImageUrl ? (
                  <img src={board.coverImageUrl} alt="" />
                ) : (
                  <Images aria-hidden="true" />
                )}
                {board.isOwner && editingName ? (
                  <Input
                    className="moodboard-detail-title-input"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={120}
                    autoFocus
                    aria-label={isEnglish ? 'Moodboard name' : '情绪板名称'}
                    onBlur={() => void saveName()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                      if (event.key === 'Escape') {
                        setName(board.name);
                        setEditingName(false);
                      }
                    }}
                  />
                ) : board.isOwner ? (
                  <button
                    type="button"
                    className="moodboard-detail-title-button"
                    aria-label={
                      isEnglish ? 'Edit moodboard name' : '编辑情绪板名称'
                    }
                    onClick={() => setEditingName(true)}
                  >
                    <h1>{board.name}</h1>
                  </button>
                ) : (
                  <h1>{board.name}</h1>
                )}
              </div>
              <div ref={headerActionsRef} className="moodboard-detail-actions">
                {board.isOwner ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    leadingIcon={<Share2 />}
                    disabled={busy === 'sharing'}
                    onClick={() => void handleShare()}
                  >
                    {isEnglish ? 'Share' : '分享'}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    leadingIcon={<Copy />}
                    onClick={() => void handleCopyPreset()}
                  >
                    {isEnglish ? 'Save a copy' : '保存副本'}
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  leadingIcon={<Wand2 />}
                  disabled={busy === 'preparing-generation'}
                  onClick={() => void handleGenerateWithMoodboard()}
                >
                  {isEnglish ? 'Generate with Moodboard' : '用于创作'}
                </Button>
                {board.isOwner ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    leadingIcon={<Wand2 />}
                    disabled={busy === 'analyzing'}
                    onClick={() => void runAnalysis()}
                  >
                    {isEnglish ? 'Analyze board' : '分析风格'}
                  </Button>
                ) : null}
              </div>
            </header>

            {busy === 'analyzing' ||
            board.analysisStatus !== 'idle' ||
            Boolean(board.tasteProfile) ||
            board.keywords.length > 0 ? (
              <MoodboardDetailSummary
                board={board}
                isEnglish={isEnglish}
                guidelinesDraft={guidelinesDraft}
                savingGuidelines={busy === 'saving-guidelines'}
                analyzing={busy === 'analyzing'}
                onGuidelinesChange={setGuidelinesDraft}
                onSaveGuidelines={() => void saveGuidelines()}
              />
            ) : null}

            {board.isOwner ? (
              <div className="moodboard-detail-owner-controls">
                <label>
                  <span>{isEnglish ? 'Visibility' : '可见范围'}</span>
                  <Select
                    value={board.visibility}
                    onChange={(event) =>
                      void changeVisibility(
                        event.target.value as MoodboardVisibility
                      )
                    }
                    aria-label={
                      isEnglish ? 'Moodboard visibility' : '情绪板可见范围'
                    }
                  >
                    <option value="private">
                      {isEnglish ? 'Private' : '私有'}
                    </option>
                    <option value="unlisted">
                      {isEnglish ? 'Anyone with link' : '链接可见'}
                    </option>
                    <option value="public">
                      {isEnglish ? 'Public discovery' : '公开展示'}
                    </option>
                  </Select>
                </label>
                {board.shareToken ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === 'revoking'}
                    onClick={() => {
                      setBusy('revoking');
                      revokeMoodboardShare(board.id)
                        .then(() => {
                          setBoard({ ...board, shareToken: undefined });
                          setNotice(
                            isEnglish ? 'Share link revoked' : '分享链接已撤销'
                          );
                        })
                        .catch((revokeError) =>
                          setError(
                            revokeError instanceof Error
                              ? revokeError.message
                              : '撤销失败'
                          )
                        )
                        .finally(() => setBusy(''));
                    }}
                  >
                    {isEnglish ? 'Revoke link' : '撤销分享链接'}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  leadingIcon={<Trash2 />}
                  onClick={() => void removeBoard()}
                  disabled={busy === 'deleting-board'}
                >
                  {isEnglish ? 'Delete' : '删除'}
                </Button>
              </div>
            ) : null}

            <section className="moodboard-detail-images">
              <header>
                <h2>
                  {board.itemCount} {isEnglish ? 'Images' : '张图片'}
                </h2>
                {board.isOwner && board.itemCount < MOODBOARD_MAX_ITEMS ? (
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      leadingIcon={<Images />}
                      onClick={() => setSourcePickerOpen(true)}
                    >
                      {isEnglish ? 'Choose from library' : '从图库添加'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      leadingIcon={<Upload />}
                      onClick={() => uploadRef.current?.click()}
                    >
                      {isEnglish ? 'Add images' : '添加图片'}
                    </Button>
                  </div>
                ) : null}
              </header>
              <VisualMasonry
                className="moodboard-canvas"
                aria-label={isEnglish ? 'Moodboard references' : '情绪板参考图'}
              >
                {boardItems.map((item) => (
                  <article key={item.id} className="moodboard-item-card">
                    <button
                      type="button"
                      className="moodboard-item-preview"
                      aria-label={`${isEnglish ? 'Preview' : '预览'}：${item.title || (isEnglish ? 'reference image' : '参考图')}`}
                      onClick={() => setPreviewItemId(item.id)}
                    >
                      <img
                        src={item.imageUrl}
                        alt={item.title || ''}
                        loading="lazy"
                        decoding="async"
                      />
                    </button>
                    {board.isOwner ? (
                      <IconButton
                        className="moodboard-item-remove"
                        label={isEnglish ? 'Remove reference' : '移除参考图'}
                        variant="media"
                        size="sm"
                        icon={<Trash2 />}
                        disabled={busy === `delete:${item.id}`}
                        onClick={() => void removeItem(item.id)}
                      />
                    ) : null}
                  </article>
                ))}
              </VisualMasonry>
              <input
                ref={uploadRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => void uploadFiles(event.target.files)}
              />
            </section>

            <MoodboardSuggestions
              images={availableSourceImages.slice(0, 20)}
              query={sourceQuery}
              isEnglish={isEnglish}
              loading={sourceLoading}
              busy={busy}
              onQueryChange={setSourceQuery}
              onSearch={() => void loadSourceImages(sourceQuery)}
              onRefresh={() => void loadSourceImages('')}
              onAdd={(image) => void addSourceImage(image)}
            />
          </main>
        ) : (
          <FeedbackMessage tone="error">
            {isEnglish ? 'Moodboard not found.' : '情绪板不存在或无权访问。'}
          </FeedbackMessage>
        )}
      </div>
      {boardItems.length && previewItemId ? (
        <PhotoSwipeViewer
          items={boardItems.map((item) => ({
            src: item.imageUrl,
            alt: item.title || ''
          }))}
          index={Math.max(
            0,
            boardItems.findIndex((item) => item.id === previewItemId)
          )}
          onClose={() => setPreviewItemId(null)}
          onIndexChange={(nextIndex) => {
            const nextItem = boardItems[nextIndex];
            if (nextItem) setPreviewItemId(nextItem.id);
          }}
        />
      ) : null}
      <MoodboardSourcePicker
        open={sourcePickerOpen}
        images={availableSourceImages}
        query={sourceQuery}
        isEnglish={isEnglish}
        loading={sourceLoading}
        busyImageId={busy.startsWith('source:') ? busy.slice(7) : ''}
        onQueryChange={setSourceQuery}
        onSearch={() => void loadSourceImages(sourceQuery)}
        onSelect={(image) => void addSourceImage(image)}
        onClose={() => setSourcePickerOpen(false)}
      />
    </CreateWorkspaceShell>
  );
}

export default CreateMoodboardDetailPage;
