import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CopyPlus,
  Heart,
  ImageIcon,
  Loader2,
  Search,
  Sparkles,
  Upload,
  UserRound,
  X
} from 'lucide-react';
import {
  OfficialCharacterCard,
  UserCharacterCard
} from '../components/create-characters/CharacterLibraryCards';
import { CreateWorkspaceFrame } from '../components/image-create/CreateWorkspaceFrame';
import { HistoryGalleryModal } from '../components/image-create/HistoryGalleryModal';
import { fileToDataUrl } from '../components/image-create/referenceFileUtils';
import { useAuth } from '../contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type {
  ImageCharacterCard,
  ImageCharacterReferenceGroup,
  ImageReferenceAsset
} from '@/shared/image-reference-types';
import {
  MAX_CHARACTER_REFERENCE_GROUPS,
  MAX_CHARACTER_REFERENCES_PER_GROUP
} from '@/shared/image-reference-types';
import {
  createImageCharacter,
  deleteImageCharacter,
  enqueueVisualImageTask,
  getVisualImageHistoryResult,
  importGenerationAsReference,
  listImageCharacters,
  listImageReferences,
  type VisualImageHistoryItem,
  uploadImageReference
} from '@/services/agent-api';
import {
  completeRewardTaskOnce,
  REWARD_TASK_IDENTIFIERS
} from '@/services/reward-task-events';
import {
  OFFICIAL_CHARACTER_PRESETS,
  readLikedOfficialCharacterIds,
  type OfficialCharacterPreset,
  type OfficialCharacterGender,
  type OfficialCharacterSpecies,
  writeLikedOfficialCharacterIds
} from '@/web/data/official-character-presets';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia
} from '@/shared/ui/radix/empty';
import { Input } from '@/shared/ui/radix/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/shared/ui/radix/select';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/radix/tabs';
import { Textarea } from '@/shared/ui/radix/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/radix/toggle-group';
import { applySeo } from '../lib/seo';
import '../styles/create-characters.css';
import {
  Button,
  IconButton,
  SupportErrorNotice,
  imageFetchPriority,
  useOverlayBehavior
} from '../../shared/ui';

function getLocalePrefix(pathname: string): '' | '/zh-CN' | '/en-US' {
  if (pathname.startsWith('/en-US')) return '/en-US';
  if (pathname.startsWith('/zh-CN')) return '/zh-CN';
  return '';
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

function buildCharacterGroups(
  characters: ImageCharacterCard[]
): ImageCharacterReferenceGroup[] {
  return characters.slice(0, MAX_CHARACTER_REFERENCE_GROUPS).map(
    (character, index): ImageCharacterReferenceGroup => ({
      characterCardId: character.id,
      label:
        index === 0
          ? `Character A - ${character.name}`
          : `Character B - ${character.name}`,
      description: character.description,
      referenceImageIds: character.referenceImageIds.slice(
        0,
        MAX_CHARACTER_REFERENCES_PER_GROUP
      )
    })
  );
}

type CreationMode = 'prompt' | 'clone' | null;
type CharacterLibraryTab = 'discover' | 'mine' | 'liked';
const CHARACTER_HISTORY_PAGE_SIZE = 24;

function buildCharacterPreviewPrompt(description: string): string {
  return [
    'Create a clean reusable character reference image for a character card.',
    'Show one full-body or three-quarter character, clear face, stable hairstyle, outfit, color palette and silhouette.',
    'Use a neutral simple background, balanced lighting, no typography, no watermark, no collage, no extra characters.',
    `Character brief: ${description.trim()}`
  ].join('\n');
}

export function CreateCharactersPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const localePrefix = getLocalePrefix(location.pathname);
  const characterWorkflow =
    new URLSearchParams(location.search).get('workflow') === 'create'
      ? 'create'
      : 'consistency';
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();
  const charactersQuery = useQuery({
    queryKey: ['image-characters'],
    queryFn: () => listImageCharacters(),
    enabled: isAuthenticated,
    staleTime: 30_000
  });
  const characters = charactersQuery.data ?? [];
  const characterFormSchema = z.object({
    name: z.string().trim().min(1, '请输入角色名称').max(80, '角色名称过长'),
    description: z
      .string()
      .trim()
      .max(500, '描述过长（最多 500 字）')
      .optional()
  });
  const characterForm = useForm<{
    name: string;
    description?: string;
  }>({
    resolver: zodResolver(characterFormSchema),
    defaultValues: { name: '', description: '' }
  });
  const characterFieldErrors = characterForm.formState.errors;
  const getCharacterValues = characterForm.getValues;
  const [references, setReferences] = useState<ImageReferenceAsset[]>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>(
    []
  );
  const [selectedCloneReferenceIds, setSelectedCloneReferenceIds] = useState<
    string[]
  >([]);
  const [promptReferenceGenerationMap, setPromptReferenceGenerationMap] =
    useState<Record<string, string>>({});
  const [mode, setMode] = useState<CreationMode>(null);
  const [libraryTab, setLibraryTab] = useState<CharacterLibraryTab>('discover');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [styleFilter, setStyleFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState<
    'all' | OfficialCharacterGender
  >('all');
  const [speciesFilter, setSpeciesFilter] = useState<
    'all' | OfficialCharacterSpecies
  >('all');
  const [likedOfficialCharacterIds, setLikedOfficialCharacterIds] = useState<
    string[]
  >(() => readLikedOfficialCharacterIds());
  const [selectedOfficialPresetId, setSelectedOfficialPresetId] = useState<
    string | null
  >(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [generationGalleryOpen, setGenerationGalleryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<VisualImageHistoryItem[]>(
    []
  );
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [importingGenerationId, setImportingGenerationId] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewGenerating, setPreviewGenerating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const characterLoadErrorRef = useRef(false);

  useEffect(() => {
    if (charactersQuery.error) {
      characterLoadErrorRef.current = true;
      setError(
        charactersQuery.error instanceof Error
          ? charactersQuery.error.message
          : '角色数据加载失败'
      );
      return;
    }
    if (characterLoadErrorRef.current && charactersQuery.isSuccess) {
      characterLoadErrorRef.current = false;
      setError('');
    }
  }, [charactersQuery.error, charactersQuery.isSuccess]);

  useEffect(() => {
    return applySeo({
      title: 'WebToMind 角色一致性 | AI 角色卡与参考图',
      description:
        '用提示词或参考图克隆创建角色卡，并在 WebToMind 图像创作台中复用角色一致性设置。',
      robots: 'noindex,nofollow',
      htmlLang: localePrefix === '/en-US' ? 'en' : 'zh-CN'
    });
  }, [localePrefix]);

  useEffect(() => {
    if (!isAuthenticated) {
      queryClient.removeQueries({ queryKey: ['image-characters'] });
      setReferences([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listImageReferences()
      .then((referenceItems) => {
        if (cancelled) return;
        setReferences(referenceItems);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : '角色数据加载失败'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, queryClient]);

  const requireLogin = () => {
    if (!isAuthenticated) {
      navigate('/login');
      return true;
    }
    return false;
  };

  const resetForm = () => {
    characterForm.reset({ name: '', description: '' });
    setSelectedCloneReferenceIds([]);
    setPromptReferenceGenerationMap({});
    setMode(null);
    setGalleryOpen(false);
    setGenerationGalleryOpen(false);
  };

  const selectedCharacters = selectedCharacterIds
    .map((id) => characters.find((character) => character.id === id))
    .filter((item): item is ImageCharacterCard => Boolean(item));
  const selectedOfficialPreset =
    OFFICIAL_CHARACTER_PRESETS.find(
      (preset) => preset.id === selectedOfficialPresetId
    ) || null;
  const galleryModalRef = useOverlayBehavior<HTMLElement>({
    open: galleryOpen,
    onClose: () => setGalleryOpen(false)
  });
  const officialPresetModalRef = useOverlayBehavior<HTMLElement>({
    open: Boolean(selectedOfficialPreset),
    onClose: () => setSelectedOfficialPresetId(null)
  });

  const styleOptions = Array.from(
    new Map(
      OFFICIAL_CHARACTER_PRESETS.map((preset) => [
        preset.style,
        preset.styleLabel
      ])
    )
  );
  const genderOptions = Array.from(
    new Map(
      OFFICIAL_CHARACTER_PRESETS.map((preset) => [
        preset.gender,
        preset.genderLabel
      ])
    )
  );
  const speciesOptions = Array.from(
    new Map(
      OFFICIAL_CHARACTER_PRESETS.map((preset) => [
        preset.species,
        preset.speciesLabel
      ])
    )
  );
  const filteredOfficialCharacters = OFFICIAL_CHARACTER_PRESETS.filter(
    (preset) => {
      const keyword = libraryQuery.trim().toLowerCase();
      const matchesQuery =
        !keyword ||
        `${preset.name} ${preset.style} ${preset.styleLabel} ${preset.speciesLabel} ${preset.description}`
          .toLowerCase()
          .includes(keyword);
      return (
        matchesQuery &&
        (styleFilter === 'all' || preset.style === styleFilter) &&
        (genderFilter === 'all' || preset.gender === genderFilter) &&
        (speciesFilter === 'all' || preset.species === speciesFilter)
      );
    }
  );
  const likedOfficialCharacters = filteredOfficialCharacters.filter((preset) =>
    likedOfficialCharacterIds.includes(preset.id)
  );
  const filteredUserCharacters = characters.filter((character) => {
    const keyword = libraryQuery.trim().toLowerCase();
    if (!keyword) return true;
    return `${character.name} ${character.description || ''}`
      .toLowerCase()
      .includes(keyword);
  });
  const visibleOfficialCharacters =
    libraryTab === 'liked'
      ? likedOfficialCharacters
      : filteredOfficialCharacters;
  const showOfficialFilters =
    libraryTab === 'discover' || libraryTab === 'liked';

  const toggleOfficialLike = (presetId: string) => {
    setLikedOfficialCharacterIds((current) => {
      const next = current.includes(presetId)
        ? current.filter((id) => id !== presetId)
        : [...current, presetId];
      writeLikedOfficialCharacterIds(next);
      return uniqueIds(next);
    });
  };

  const startWithSelection = () => {
    if (selectedCharacters.length === 0) return;
    const characterReferenceGroups = buildCharacterGroups(selectedCharacters);
    const referenceImageIds = uniqueIds(
      characterReferenceGroups.flatMap((group) => group.referenceImageIds)
    );
    navigate(`${localePrefix}/image`, {
      state: {
        referenceImageIds,
        characterCardIds: selectedCharacters.map((character) => character.id),
        characterReferenceGroups
      }
    });
  };

  const startWithOfficialPreset = (preset: OfficialCharacterPreset) => {
    navigate(`${localePrefix}/image`, {
      state: {
        promptCasePrompt: preset.prompt,
        promptCaseTitle: preset.name
      }
    });
  };

  const loadGenerationHistory = async (mode: 'replace' | 'append') => {
    const offset = mode === 'append' ? historyItems.length : 0;
    if (mode === 'append') {
      setHistoryLoadingMore(true);
    } else {
      setHistoryLoading(true);
      setHistoryError('');
    }
    try {
      const result = await getVisualImageHistoryResult(
        CHARACTER_HISTORY_PAGE_SIZE,
        offset
      );
      setHistoryItems((current) =>
        mode === 'append' ? [...current, ...result.items] : result.items
      );
      setHistoryTotal(result.total);
    } catch (loadError) {
      setHistoryError(
        loadError instanceof Error ? loadError.message : '生成历史加载失败'
      );
    } finally {
      if (mode === 'append') {
        setHistoryLoadingMore(false);
      } else {
        setHistoryLoading(false);
      }
    }
  };

  const openGenerationGallery = () => {
    if (requireLogin()) return;
    setGenerationGalleryOpen(true);
    void loadGenerationHistory('replace');
  };

  const handleGeneratePromptPreview = async () => {
    if (requireLogin()) return;
    const { description = '' } = getCharacterValues();
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setError('请先填写角色提示词，再生成预览。');
      return;
    }
    setPreviewGenerating(true);
    setError('');
    try {
      const task = await enqueueVisualImageTask({
        prompt: buildCharacterPreviewPrompt(trimmedDescription),
        negativePrompt:
          'text, watermark, logo, multiple characters, cropped face, blurry, distorted anatomy, extra limbs',
        model: 'gpt-image-2',
        aspectRatio: '1:1',
        imageSize: '1024x1024',
        quality: 'auto',
        outputFormat: 'png',
        imageCount: 1,
        assetIds: [],
        promptMode: 'custom',
        referenceImageIds: [],
        referenceMode: 'none',
        characterCardIds: [],
        characterReferenceGroups: [],
        sourceApp: 'create-characters',
        appOperation: 'character_prompt_preview'
      });
      setStatusText(
        `角色预览已加入生成队列（${task.taskId.slice(0, 8)}）。完成后从生成历史选择预览图保存角色。`
      );
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : '角色预览生成任务提交失败'
      );
    } finally {
      setPreviewGenerating(false);
    }
  };

  const toggleGeneratedPreviewReference = async (
    item: VisualImageHistoryItem
  ) => {
    const { name, description = '' } = getCharacterValues();
    const existingReferenceId = promptReferenceGenerationMap[item.id];
    if (existingReferenceId) {
      setSelectedCloneReferenceIds((current) =>
        current.filter((id) => id !== existingReferenceId)
      );
      setPromptReferenceGenerationMap((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      return;
    }
    if (
      selectedCloneReferenceIds.length >= MAX_CHARACTER_REFERENCES_PER_GROUP
    ) {
      setError(`单个角色最多 ${MAX_CHARACTER_REFERENCES_PER_GROUP} 张参考图。`);
      return;
    }
    setImportingGenerationId(item.id);
    setError('');
    try {
      const reference = await importGenerationAsReference({
        generationId: item.id,
        role: 'character',
        label: name.trim() || '角色预览',
        description: description.trim() || undefined
      });
      setReferences((current) => [
        reference,
        ...current.filter((entry) => entry.id !== reference.id)
      ]);
      setSelectedCloneReferenceIds((current) =>
        uniqueIds([...current, reference.id]).slice(
          0,
          MAX_CHARACTER_REFERENCES_PER_GROUP
        )
      );
      setPromptReferenceGenerationMap((current) => ({
        ...current,
        [item.id]: reference.id
      }));
      setStatusText('已把生成结果导入为角色参考图');
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : '生成图导入失败'
      );
    } finally {
      setImportingGenerationId(null);
    }
  };

  const handleCreateCharacter = async () => {
    if (requireLogin()) return;
    const { name, description = '' } = getCharacterValues();
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    if (!trimmedName) {
      setError('请先输入角色名称。');
      return;
    }
    if (mode === 'prompt' && !trimmedDescription) {
      setError('请描述角色的外貌、风格或稳定特征。');
      return;
    }
    if (selectedCloneReferenceIds.length === 0) {
      setError(
        mode === 'prompt'
          ? '请先生成或选择 1 张角色预览图，再保存为角色卡。'
          : '请上传或从图库选择至少 1 张参考图。'
      );
      return;
    }
    setSaving(true);
    setError('');
    try {
      const character = await createImageCharacter({
        name: trimmedName,
        description: trimmedDescription || undefined,
        lockedTraits:
          mode === 'prompt'
            ? [
                'prompt-created',
                `${selectedCloneReferenceIds.length} preview references`
              ]
            : ['image-clone', `${selectedCloneReferenceIds.length} references`],
        referenceImageIds: selectedCloneReferenceIds.slice(
          0,
          MAX_CHARACTER_REFERENCES_PER_GROUP
        )
      });
      queryClient.setQueryData<ImageCharacterCard[]>(
        ['image-characters'],
        (current) => [
          character,
          ...(current || []).filter((item) => item.id !== character.id)
        ]
      );
      setSelectedCharacterIds((current) =>
        uniqueIds([character.id, ...current]).slice(
          0,
          MAX_CHARACTER_REFERENCE_GROUPS
        )
      );
      void completeRewardTaskOnce(REWARD_TASK_IDENTIFIERS.useReferenceImage);
      setStatusText(`已创建角色「${character.name}」`);
      resetForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '角色创建失败');
    } finally {
      setSaving(false);
    }
  };

  const handlePickUploadFiles = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = '';
    if (files.length === 0 || requireLogin()) return;
    const remaining =
      MAX_CHARACTER_REFERENCES_PER_GROUP - selectedCloneReferenceIds.length;
    if (remaining <= 0) {
      setError(`单个角色最多 ${MAX_CHARACTER_REFERENCES_PER_GROUP} 张参考图。`);
      return;
    }
    const selectedFiles = files
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, remaining);
    if (selectedFiles.length === 0) {
      setError('请选择 JPG、PNG 或 WEBP 图片。');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const uploaded: ImageReferenceAsset[] = [];
      for (const file of selectedFiles) {
        const reference = await uploadImageReference({
          imageBase64: await fileToDataUrl(file),
          mimeType: file.type,
          role: 'character',
          label: file.name.replace(/\.[^.]+$/, '').slice(0, 80)
        });
        uploaded.push(reference);
      }
      setReferences((current) => [...uploaded, ...current]);
      setSelectedCloneReferenceIds((current) =>
        uniqueIds([...current, ...uploaded.map((item) => item.id)]).slice(
          0,
          MAX_CHARACTER_REFERENCES_PER_GROUP
        )
      );
      setStatusText(`已上传 ${uploaded.length} 张角色参考图`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : '参考图上传失败'
      );
    } finally {
      setUploading(false);
    }
  };

  const toggleCloneReference = (referenceId: string) => {
    setSelectedCloneReferenceIds((current) => {
      if (current.includes(referenceId)) {
        setPromptReferenceGenerationMap((map) => {
          const next = { ...map };
          Object.entries(next).forEach(([generationId, mappedReferenceId]) => {
            if (mappedReferenceId === referenceId) delete next[generationId];
          });
          return next;
        });
        return current.filter((id) => id !== referenceId);
      }
      if (current.length >= MAX_CHARACTER_REFERENCES_PER_GROUP) {
        setError(
          `单个角色最多 ${MAX_CHARACTER_REFERENCES_PER_GROUP} 张参考图。`
        );
        return current;
      }
      setError('');
      return [...current, referenceId];
    });
  };

  const toggleCharacter = (character: ImageCharacterCard) => {
    setSelectedCharacterIds((current) => {
      if (current.includes(character.id)) {
        return current.filter((id) => id !== character.id);
      }
      if (current.length >= MAX_CHARACTER_REFERENCE_GROUPS) {
        setError(`最多同时带入 ${MAX_CHARACTER_REFERENCE_GROUPS} 个角色。`);
        return current;
      }
      setError('');
      return [...current, character.id];
    });
  };

  const handleDeleteCharacter = async (characterId: string) => {
    if (requireLogin()) return;
    setDeletingId(characterId);
    setError('');
    try {
      await deleteImageCharacter(characterId);
      queryClient.setQueryData<ImageCharacterCard[]>(
        ['image-characters'],
        (current) =>
          (current || []).filter(
            (character) => character.id !== characterId
          )
      );
      setSelectedCharacterIds((current) =>
        current.filter((id) => id !== characterId)
      );
      setStatusText('角色已删除');
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : '角色删除失败'
      );
    } finally {
      setDeletingId(null);
    }
  };

  const galleryReferences = references.filter(
    (reference) => reference.thumbnailUrl
  );

  return (
    <CreateWorkspaceFrame className="create-characters-route">
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(event) => void handlePickUploadFiles(event)}
      />

      <section className="create-character-hero create-character-hero-redesign">
        <div>
          <span className="create-eyebrow">Characters</span>
          <h1>
            {characterWorkflow === 'create' ? '角色创建器' : '角色一致性'}
          </h1>
          <p>
            {characterWorkflow === 'create'
              ? '用提示词定义或图片克隆创建角色卡；保存后可在后续创作中反复使用。'
              : '选择已保存的角色卡和参考图，在不同场景中复用稳定身份；也可以先创建新角色。'}
          </p>
        </div>
        <div className="create-character-actions">
          <Button
            type="button"
            variant="outline"
            leadingIcon={<Sparkles />}
            onClick={startWithSelection}
            disabled={selectedCharacters.length === 0}
          >
            带入创作台
          </Button>
        </div>
      </section>

      <ToggleGroup
        type="single"
        value={mode || ''}
        className="create-character-methods"
        onValueChange={(value) => {
          if (!value) return;
          if (requireLogin()) return;
          setMode(value as Exclude<CreationMode, null>);
          setError('');
        }}
      >
        <ToggleGroupItem
          value="prompt"
          variant="outline"
          className={mode === 'prompt' ? 'active' : ''}
        >
          <Sparkles size={20} />
          <strong>提示词</strong>
          <span>从文字设定创建角色。</span>
        </ToggleGroupItem>
        <ToggleGroupItem
          value="clone"
          variant="outline"
          className={mode === 'clone' ? 'active' : ''}
        >
          <CopyPlus size={20} />
          <strong>克隆</strong>
          <span>上传或从图库选择参考图。</span>
        </ToggleGroupItem>
      </ToggleGroup>

      {mode && (
        <section className="create-character-builder">
          <div className="create-character-builder-head">
            <div>
              <strong>{mode === 'prompt' ? '提示词创建' : '图像克隆'}</strong>
              <span>
                {mode === 'prompt'
                  ? '用稳定外貌、服装、气质和风格描述创建角色卡。'
                  : '选择 1-3 张参考图，保存为可复用角色卡。'}
              </span>
            </div>
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              label="关闭创建面板"
              icon={<X />}
              onClick={resetForm}
            />
          </div>
          <div className="create-character-form">
            <label>
              <span>角色名称</span>
              <Input
                {...characterForm.register('name')}
                maxLength={80}
                placeholder="例如：Cyber Courier"
              />
              {characterFieldErrors.name ? (
                <span className="create-character-form-error" role="alert">
                  {characterFieldErrors.name.message}
                </span>
              ) : null}
            </label>
            <label>
              <span>{mode === 'prompt' ? '角色提示词' : '补充描述'}</span>
              <Textarea
                {...characterForm.register('description')}
                maxLength={500}
                placeholder={
                  mode === 'prompt'
                    ? '描述外貌、发型、服装、气质、色彩和稳定特征。'
                    : '可选：补充图像无法稳定表达的人设、服装或氛围。'
                }
              />
              {characterFieldErrors.description ? (
                <span className="create-character-form-error" role="alert">
                  {characterFieldErrors.description.message}
                </span>
              ) : null}
            </label>

            {mode === 'clone' && (
              <div className="create-character-clone-sources">
                <Button
                  type="button"
                  variant="outline"
                  leadingIcon={
                    uploading ? (
                      <Loader2 className="creator-spin-icon" />
                    ) : (
                      <Upload />
                    )
                  }
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={uploading}
                >
                  <span className="create-character-clone-source-copy">
                    <strong>上传图片</strong>
                    <span>支持 JPG、PNG 或 WEBP</span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  leadingIcon={<ImageIcon />}
                  onClick={() => setGalleryOpen(true)}
                >
                  <span className="create-character-clone-source-copy">
                    <strong>图库</strong>
                    <span>从过往参考图中选择</span>
                  </span>
                </Button>
              </div>
            )}

            {mode === 'prompt' && (
              <div className="create-character-clone-sources create-character-prompt-preview-sources">
                <Button
                  type="button"
                  variant="outline"
                  leadingIcon={
                    previewGenerating ? (
                      <Loader2 className="creator-spin-icon" />
                    ) : (
                      <Sparkles />
                    )
                  }
                  onClick={() => void handleGeneratePromptPreview()}
                  disabled={previewGenerating}
                >
                  <span className="create-character-clone-source-copy">
                    <strong>生成角色预览</strong>
                    <span>先产出可保存的参考图</span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  leadingIcon={<ImageIcon />}
                  onClick={openGenerationGallery}
                  aria-label="打开生成历史，选择完成图作为参考"
                >
                  <span className="create-character-clone-source-copy">
                    <strong>生成历史</strong>
                    <span>选择完成图作为参考</span>
                  </span>
                </Button>
              </div>
            )}

            {selectedCloneReferenceIds.length > 0 && (
              <div className="create-character-selected-refs">
                {selectedCloneReferenceIds.map((id) => {
                  const reference = references.find((item) => item.id === id);
                  return reference ? (
                    <button
                      type="button"
                      key={id}
                      onClick={() => toggleCloneReference(id)}
                    >
                      <img
                        src={reference.thumbnailUrl}
                        alt={reference.label}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                      />
                    </button>
                  ) : null;
                })}
              </div>
            )}

            <Button
              type="button"
              className="create-character-submit"
              leadingIcon={
                saving ? <Loader2 className="creator-spin-icon" /> : undefined
              }
              onClick={() =>
                void characterForm.handleSubmit(() =>
                  handleCreateCharacter()
                )()
              }
              disabled={saving}
            >
              保存角色
            </Button>
          </div>
        </section>
      )}

      {error ? (
        <SupportErrorNotice
          className="create-inline-error"
          locale={localePrefix === '/en-US' ? 'en-US' : 'zh-CN'}
          message={error}
        />
      ) : statusText ? (
        <div className="create-inline-status">{statusText}</div>
      ) : null}

      <section className="create-character-library">
        <div className="create-character-library-head">
          <div>
            <span className="create-eyebrow">Character Library</span>
            <h2>角色</h2>
          </div>
          <small>
            发现是官方预设；我的角色只展示你主动创建的角色；喜欢保存你收藏的官方角色。
          </small>
        </div>

        <div className="create-character-library-controls">
          <Tabs
            className="create-character-tabs-shell"
            value={libraryTab}
            onValueChange={(value) =>
              setLibraryTab(value as CharacterLibraryTab)
            }
          >
            <TabsList className="create-character-tabs">
              <TabsTrigger
                value="discover"
                onClick={() => setLibraryTab('discover')}
              >
                发现
                <span>{OFFICIAL_CHARACTER_PRESETS.length}</span>
              </TabsTrigger>
              <TabsTrigger value="mine" onClick={() => setLibraryTab('mine')}>
                我的角色
                <span>{characters.length}</span>
              </TabsTrigger>
              <TabsTrigger value="liked" onClick={() => setLibraryTab('liked')}>
                喜欢
                <span>{likedOfficialCharacterIds.length}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="create-character-search">
            <Search size={15} />
            <Input
              value={libraryQuery}
              placeholder="搜索角色..."
              onChange={(event) => setLibraryQuery(event.currentTarget.value)}
            />
          </div>
        </div>

        {showOfficialFilters && (
          <div className="create-character-filters">
            <Select value={styleFilter} onValueChange={setStyleFilter}>
              <SelectTrigger
                className="create-character-filter-trigger"
                aria-label="按风格筛选"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部风格</SelectItem>
                  {styleOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={genderFilter}
              onValueChange={(value) =>
                setGenderFilter(value as 'all' | OfficialCharacterGender)
              }
            >
              <SelectTrigger
                className="create-character-filter-trigger"
                aria-label="按性别筛选"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部性别</SelectItem>
                  {genderOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={speciesFilter}
              onValueChange={(value) =>
                setSpeciesFilter(value as 'all' | OfficialCharacterSpecies)
              }
            >
              <SelectTrigger
                className="create-character-filter-trigger"
                aria-label="按物种筛选"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部物种</SelectItem>
                  {speciesOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        )}

        {libraryTab === 'discover' || libraryTab === 'liked' ? (
          visibleOfficialCharacters.length === 0 ? (
            <Empty className="create-empty-state compact">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Heart />
                </EmptyMedia>
                <EmptyDescription>
                  {libraryTab === 'liked'
                    ? '还没有喜欢的官方角色。先在发现里点亮喜欢。'
                    : '没有匹配的官方角色。'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="create-character-library-grid official">
              {visibleOfficialCharacters.map((preset) => {
                const liked = likedOfficialCharacterIds.includes(preset.id);
                return (
                  <OfficialCharacterCard
                    key={preset.id}
                    preset={preset}
                    liked={liked}
                    onOpen={() => setSelectedOfficialPresetId(preset.id)}
                    onToggleLike={() => toggleOfficialLike(preset.id)}
                  />
                );
              })}
            </div>
          )
        ) : loading || charactersQuery.isPending ? (
          <Empty className="create-empty-state compact">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Loader2 className="creator-spin-icon" />
              </EmptyMedia>
              <EmptyDescription>正在加载角色...</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : filteredUserCharacters.length === 0 ? (
          <Empty className="create-empty-state compact">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UserRound />
              </EmptyMedia>
              <EmptyDescription>
                {characters.length === 0
                  ? '还没有角色。用提示词或图像克隆创建第一个角色。'
                  : '没有匹配的我的角色。'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="create-character-library-grid">
            {filteredUserCharacters.map((character) => {
              const selected = selectedCharacterIds.includes(character.id);
              return (
                <UserCharacterCard
                  key={character.id}
                  character={character}
                  selected={selected}
                  deleting={deletingId === character.id}
                  onToggle={() => toggleCharacter(character)}
                  onDelete={() => void handleDeleteCharacter(character.id)}
                />
              );
            })}
          </div>
        )}
      </section>

      {!isAuthenticated && (
        <div className="create-empty-state compact">
          <UserRound size={24} />
          <span>登录后创建和保存你的角色卡。</span>
        </div>
      )}

      {galleryOpen && (
        <div
          className="creator-reference-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setGalleryOpen(false);
          }}
        >
          <section
            ref={galleryModalRef}
            className="creator-reference-modal create-character-gallery-modal"
            role="dialog"
            aria-modal="true"
            aria-label="从图库选择角色参考图"
            tabIndex={-1}
          >
            <div className="creator-reference-modal-head">
              <div>
                <span>从图库选择</span>
                <small>
                  最多选择 {MAX_CHARACTER_REFERENCES_PER_GROUP}{' '}
                  张作为角色克隆参考。
                </small>
              </div>
              <IconButton
                type="button"
                variant="ghost"
                size="sm"
                label="关闭图库"
                icon={<X />}
                onClick={() => setGalleryOpen(false)}
              />
            </div>
            {galleryReferences.length === 0 ? (
              <div className="creator-reference-modal-state">
                <ImageIcon size={24} />
                <span>暂无可用参考图，可以先上传图片。</span>
              </div>
            ) : (
              <div className="create-character-gallery-grid">
                {galleryReferences.map((reference) => {
                  const selected = selectedCloneReferenceIds.includes(
                    reference.id
                  );
                  return (
                    <button
                      key={reference.id}
                      type="button"
                      className={selected ? 'selected' : ''}
                      onClick={() => toggleCloneReference(reference.id)}
                    >
                      <img
                        src={reference.thumbnailUrl}
                        alt={reference.label}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                      />
                      <span>{selected ? '已选' : '选择'}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {generationGalleryOpen && (
        <HistoryGalleryModal
          mode="reference-picker"
          items={historyItems}
          total={historyTotal}
          loading={historyLoading}
          loadingMore={historyLoadingMore}
          error={historyError}
          dateLocale={localePrefix === '/en-US' ? 'en-US' : 'zh-CN'}
          selectedIds={Object.keys(promptReferenceGenerationMap)}
          importingId={importingGenerationId}
          onClose={() => setGenerationGalleryOpen(false)}
          onSelect={() => undefined}
          onToggleReference={(id) => {
            const item = historyItems.find(
              (historyItem) => historyItem.id === id
            );
            if (item) void toggleGeneratedPreviewReference(item);
          }}
          onConfirmReferences={() => setGenerationGalleryOpen(false)}
          onLoadMore={() => void loadGenerationHistory('append')}
        />
      )}

      {selectedOfficialPreset && (
        <div
          className="creator-reference-modal-backdrop create-character-detail-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedOfficialPresetId(null);
            }
          }}
        >
          <section
            ref={officialPresetModalRef}
            className="create-character-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedOfficialPreset.name} 角色详情`}
            tabIndex={-1}
          >
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              className="create-character-detail-close"
              label="关闭角色详情"
              icon={<X />}
              onClick={() => setSelectedOfficialPresetId(null)}
            />
            <div className="create-character-detail-media">
              <img
                src={selectedOfficialPreset.imageUrl}
                alt={selectedOfficialPreset.name}
                loading="eager"
                decoding="async"
                {...imageFetchPriority('high')}
              />
            </div>
            <div className="create-character-detail-content">
              <div className="create-character-detail-head">
                <span className="create-eyebrow">Official preset</span>
                <h3>{selectedOfficialPreset.name}</h3>
                <div className="create-character-detail-tags">
                  <span>{selectedOfficialPreset.styleLabel}</span>
                  <span>{selectedOfficialPreset.speciesLabel}</span>
                  <span>{selectedOfficialPreset.genderLabel}</span>
                </div>
              </div>
              <p>{selectedOfficialPreset.description}</p>
              <div className="create-character-detail-prompt">
                <span>角色提示词</span>
                <p>{selectedOfficialPreset.prompt}</p>
              </div>
              <div className="create-character-detail-actions">
                <Button
                  type="button"
                  leadingIcon={<Sparkles />}
                  onClick={() =>
                    startWithOfficialPreset(selectedOfficialPreset)
                  }
                >
                  用于图像创作
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  leadingIcon={<CopyPlus />}
                  onClick={() => {
                    void navigator.clipboard?.writeText(
                      selectedOfficialPreset.prompt
                    );
                    setStatusText('已复制官方角色 Prompt');
                  }}
                >
                  复制 Prompt
                </Button>
              </div>
            </div>
          </section>
        </div>
      )}
    </CreateWorkspaceFrame>
  );
}
