import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Images, Library, Upload } from 'lucide-react';
import { Button, FeedbackMessage, IconButton } from '@/shared/ui';
import {
  addMoodboardItems,
  createMoodboard,
  deleteMoodboard,
  searchVisualDiscovery,
  type DiscoveryImage
} from '@/services/create-workspace-v2-api';
import { MOODBOARD_MAX_ITEMS } from '@/shared/create-workspace-v2';
import { CreateWorkspaceShell } from '../components/create-workspace/CreateWorkspaceShell';
import { MoodboardSourcePicker } from '../components/create-workspace/MoodboardSourcePicker';
import { MoodboardSuggestions } from '../components/create-workspace/MoodboardSuggestions';
import {
  isCreateWorkspaceDemoEnabled,
  withCreateWorkspaceDiscoveryFallback
} from '../data/create-workspace-demo';
import {
  prepareDiscoveryMoodboardItem,
  prepareUploadedMoodboardItems,
  type MoodboardItemInput
} from '../lib/moodboard-item-input';

function getPrefix(pathname: string): '' | '/zh-CN' | '/en-US' {
  return pathname.startsWith('/en-US')
    ? '/en-US'
    : pathname.startsWith('/zh-CN')
      ? '/zh-CN'
      : '';
}

export function CreateNewMoodboardPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const prefix = getPrefix(location.pathname);
  const isEnglish = prefix === '/en-US';
  const uploadRef = useRef<HTMLInputElement>(null);
  const draftBoardIdRef = useRef('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [assetQuery, setAssetQuery] = useState('');
  const [discoveryImages, setDiscoveryImages] = useState<DiscoveryImage[]>([]);
  const [assetImages, setAssetImages] = useState<DiscoveryImage[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [assetsLoading, setAssetsLoading] = useState(false);

  const loadSuggestions = useCallback(
    async (query: string) => {
      setSuggestionsLoading(true);
      setError('');
      try {
        const result = await searchVisualDiscovery(
          query,
          isEnglish ? 'en-US' : 'zh-CN'
        );
        setDiscoveryImages(result.images);
      } catch (loadError) {
        if (isCreateWorkspaceDemoEnabled()) {
          setDiscoveryImages(
            withCreateWorkspaceDiscoveryFallback(null, query).images
          );
        } else {
          setError(
            loadError instanceof Error
              ? loadError.message
              : isEnglish
                ? 'Failed to load suggested images.'
                : '推荐图片加载失败'
          );
        }
      } finally {
        setSuggestionsLoading(false);
      }
    },
    [isEnglish]
  );

  const loadAssets = async (query: string) => {
    setAssetsLoading(true);
    setError('');
    try {
      const result = await searchVisualDiscovery(
        query,
        isEnglish ? 'en-US' : 'zh-CN'
      );
      setAssetImages(result.images.filter((image) => image.kind === 'gallery'));
    } catch (loadError) {
      if (isCreateWorkspaceDemoEnabled()) {
        setAssetImages(
          withCreateWorkspaceDiscoveryFallback(null, query).images.filter(
            (image) => image.kind === 'gallery'
          )
        );
      } else {
        setError(
          loadError instanceof Error ? loadError.message : '图片资产加载失败'
        );
      }
    } finally {
      setAssetsLoading(false);
    }
  };

  useEffect(() => {
    void loadSuggestions('');
  }, [loadSuggestions]);

  const commitFirstItems = async (items: MoodboardItemInput[]) => {
    if (items.length === 0) return;
    let boardId = draftBoardIdRef.current;
    let createdForThisAttempt = false;
    if (!boardId) {
      const board = await createMoodboard({
        name: isEnglish ? 'New Moodboard' : '新建情绪板'
      });
      boardId = board.id;
      draftBoardIdRef.current = boardId;
      createdForThisAttempt = true;
    }
    try {
      await addMoodboardItems(boardId, items);
    } catch (commitError) {
      if (createdForThisAttempt) {
        try {
          await deleteMoodboard(boardId);
          draftBoardIdRef.current = '';
        } catch {
          // Keep the same draft id for an in-page retry if cleanup is unavailable.
        }
      }
      throw commitError;
    }
    navigate(`${prefix}/moodboards/${boardId}`, { replace: true });
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length || busy) return;
    setBusy('uploading');
    setError('');
    try {
      const items = await prepareUploadedMoodboardItems(
        Array.from(files),
        MOODBOARD_MAX_ITEMS
      );
      await commitFirstItems(items);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : '图片上传失败'
      );
    } finally {
      setBusy('');
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };

  const addFirstImage = async (image: DiscoveryImage) => {
    if (busy) return;
    setBusy(`source:${image.id}`);
    setError('');
    try {
      await commitFirstItems([await prepareDiscoveryMoodboardItem(image)]);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : '图片添加失败');
    } finally {
      setBusy('');
    }
  };

  const openAssets = () => {
    setPickerOpen(true);
    if (assetImages.length === 0) void loadAssets('');
  };

  const previewImages = discoveryImages.slice(0, 3);

  return (
    <CreateWorkspaceShell className="moodboard-detail-page moodboard-new-page">
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

        <main className="moodboard-detail-main">
          <header className="moodboard-detail-head moodboard-new-head">
            <div className="moodboard-detail-title-block">
              <Images aria-hidden="true" />
              <h1>{isEnglish ? 'New Moodboard' : '新建情绪板'}</h1>
            </div>
          </header>

          <section className="moodboard-new-empty" aria-busy={Boolean(busy)}>
            <div className="moodboard-new-empty-visual" aria-hidden="true">
              {previewImages.length > 0 ? (
                previewImages.map((image, index) => (
                  <img
                    key={`${image.kind}:${image.id}`}
                    src={image.imageUrl}
                    alt=""
                    style={
                      { '--moodboard-empty-index': index } as CSSProperties
                    }
                  />
                ))
              ) : (
                <Images />
              )}
            </div>
            <h2>
              {isEnglish
                ? 'Add images to this moodboard'
                : '添加图片到这个情绪板'}
            </h2>
            <p>
              {isEnglish
                ? 'Choose references with a shared visual direction. After they are added, analyze the board to extract its taste profile and keywords.'
                : '选择具有共同视觉方向的参考图。添加后，再分析画板以提取风格画像和关键词。'}
            </p>
            <div className="moodboard-new-empty-actions">
              <Button
                variant="primary"
                leadingIcon={<Upload />}
                disabled={Boolean(busy)}
                onClick={() => uploadRef.current?.click()}
              >
                {busy === 'uploading'
                  ? isEnglish
                    ? 'Uploading…'
                    : '上传中…'
                  : isEnglish
                    ? 'Upload images'
                    : '上传图片'}
              </Button>
              <Button
                variant="secondary"
                leadingIcon={<Library />}
                disabled={Boolean(busy)}
                onClick={openAssets}
              >
                {isEnglish ? 'Choose from assets' : '从我的资产选择'}
              </Button>
            </div>
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
            images={discoveryImages.slice(0, 24)}
            query={suggestionQuery}
            isEnglish={isEnglish}
            loading={suggestionsLoading}
            busy={busy}
            onQueryChange={setSuggestionQuery}
            onSearch={() => void loadSuggestions(suggestionQuery)}
            onRefresh={() => void loadSuggestions('')}
            onAdd={(image) => void addFirstImage(image)}
          />
        </main>
      </div>

      <MoodboardSourcePicker
        open={pickerOpen}
        images={assetImages}
        query={assetQuery}
        isEnglish={isEnglish}
        loading={assetsLoading}
        busyImageId={busy.startsWith('source:') ? busy.slice(7) : ''}
        personalOnly
        onQueryChange={setAssetQuery}
        onSearch={() => void loadAssets(assetQuery)}
        onSelect={(image) => void addFirstImage(image)}
        onClose={() => setPickerOpen(false)}
      />
    </CreateWorkspaceShell>
  );
}
