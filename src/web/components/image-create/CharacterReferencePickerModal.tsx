import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Heart,
  ImageIcon,
  Loader2,
  Search,
  Sparkles,
  UserRound,
  X
} from 'lucide-react';
import {
  listImageCharacters,
  uploadImageReference
} from '@/services/agent-api';
import type { ImageCharacterCard } from '@/shared/image-reference-types';
import {
  MAX_CHARACTER_REFERENCE_GROUPS,
  MAX_IMAGE_REFERENCE_IDS
} from '@/shared/image-reference-types';
import { Button } from '@/shared/ui/radix/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/shared/ui/radix/dialog';
import { Input } from '@/shared/ui/radix/input';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/radix/tabs';
import { cn } from '@/lib/utils';
import { StaggeredImageGrid } from './StaggeredImageGrid';
import {
  OFFICIAL_CHARACTER_PRESETS,
  getOfficialCharacterId,
  LIKED_OFFICIAL_CHARACTER_STORAGE_KEY,
  readLikedOfficialCharacterIds,
  type OfficialCharacterPreset
} from '@/web/data/official-character-presets';
import { imageUrlToReferencePayload } from './referenceFileUtils';

const OFFICIAL_CHARACTER_REFERENCE_STORAGE_KEY =
  'webtomind:image-create-official-character-reference-map';

export interface CharacterReferencePickerModalProps {
  isAuthenticated: boolean;
  selectedCharacterIds: string[];
  onSelectedCharacterIdsChange: (ids: string[]) => void;
  onSelectedCharactersChange: (characters: ImageCharacterCard[]) => void;
  onSelectedReferenceIdsChange: (ids: string[]) => void;
  onRequireLogin: () => void;
  setError: (message: string) => void;
  setStatusText: (message: string) => void;
  onClose: () => void;
}

type CharacterPickerTab = 'discover' | 'mine' | 'liked';

function readOfficialReferenceMap(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(OFFICIAL_CHARACTER_REFERENCE_STORAGE_KEY) ||
        '{}'
    );
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function writeOfficialReferenceMap(map: Record<string, string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      OFFICIAL_CHARACTER_REFERENCE_STORAGE_KEY,
      JSON.stringify(map)
    );
  } catch {
    // Mapping only avoids duplicate official reference imports.
  }
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

function getSelectedCharacters(
  characters: ImageCharacterCard[],
  selectedIds: string[]
): ImageCharacterCard[] {
  return selectedIds
    .map((id) => characters.find((character) => character.id === id))
    .filter((item): item is ImageCharacterCard => Boolean(item));
}

function officialPresetToCharacter(
  preset: OfficialCharacterPreset,
  referenceId: string
): ImageCharacterCard {
  return {
    id: getOfficialCharacterId(preset.id),
    name: preset.name,
    description: preset.description,
    lockedTraits: ['official-preset', preset.style],
    referenceImageIds: [referenceId],
    references: [
      {
        id: referenceId,
        role: 'character',
        label: preset.name,
        thumbnailUrl: preset.imageUrl
      }
    ]
  };
}

export function CharacterReferencePickerModal({
  isAuthenticated,
  selectedCharacterIds,
  onSelectedCharacterIdsChange,
  onSelectedCharactersChange,
  onSelectedReferenceIdsChange,
  onRequireLogin,
  setError,
  setStatusText,
  onClose
}: CharacterReferencePickerModalProps) {
  const { t } = useTranslation('imageCreate');
  const [activeTab, setActiveTab] = useState<CharacterPickerTab>('discover');
  const [characters, setCharacters] = useState<ImageCharacterCard[]>([]);
  const [officialCharacters, setOfficialCharacters] = useState<
    ImageCharacterCard[]
  >([]);
  const [likedOfficialIds, setLikedOfficialIds] = useState<string[]>(() =>
    readLikedOfficialCharacterIds()
  );
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [materializingId, setMaterializingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setCharacters([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listImageCharacters()
      .then((items) => {
        if (!cancelled) setCharacters(items);
      })
      .catch((error) => {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : '角色卡加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, setError]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === LIKED_OFFICIAL_CHARACTER_STORAGE_KEY) {
        setLikedOfficialIds(readLikedOfficialCharacterIds());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    const savedMap = readOfficialReferenceMap();
    const selectedOfficialCharacters = selectedCharacterIds
      .map((id) => {
        if (!id.startsWith('official:')) return null;
        const presetId = id.slice('official:'.length);
        const preset = OFFICIAL_CHARACTER_PRESETS.find(
          (item) => item.id === presetId
        );
        const referenceId = savedMap[presetId];
        return preset && referenceId
          ? officialPresetToCharacter(preset, referenceId)
          : null;
      })
      .filter((item): item is ImageCharacterCard => Boolean(item));
    if (selectedOfficialCharacters.length > 0) {
      setOfficialCharacters((current) => {
        const next = [...selectedOfficialCharacters];
        current.forEach((item) => {
          if (!next.some((selected) => selected.id === item.id)) {
            next.push(item);
          }
        });
        return next;
      });
    }
  }, [selectedCharacterIds]);

  const filteredOfficialPresets = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return OFFICIAL_CHARACTER_PRESETS;
    return OFFICIAL_CHARACTER_PRESETS.filter((preset) =>
      `${preset.name} ${preset.style} ${preset.description}`
        .toLowerCase()
        .includes(keyword)
    );
  }, [query]);
  const visibleOfficialPresets = useMemo(() => {
    if (activeTab !== 'liked') return filteredOfficialPresets;
    return filteredOfficialPresets.filter((preset) =>
      likedOfficialIds.includes(preset.id)
    );
  }, [activeTab, filteredOfficialPresets, likedOfficialIds]);

  const filteredCharacters = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return characters;
    return characters.filter((character) =>
      `${character.name} ${character.description || ''}`
        .toLowerCase()
        .includes(keyword)
    );
  }, [characters, query]);

  const applySelectedIds = (
    nextIds: string[],
    sourceCharacters = characters,
    sourceOfficialCharacters = officialCharacters
  ) => {
    const nextSelectedCharacters = getSelectedCharacters(
      [...sourceCharacters, ...sourceOfficialCharacters],
      nextIds
    );
    const referenceIds = uniqueIds(
      nextSelectedCharacters.flatMap((character) => character.referenceImageIds)
    ).slice(0, MAX_IMAGE_REFERENCE_IDS);
    onSelectedCharacterIdsChange(nextIds);
    onSelectedCharactersChange(nextSelectedCharacters);
    onSelectedReferenceIdsChange(referenceIds);
  };

  const toggleCharacter = (character: ImageCharacterCard) => {
    if (selectedCharacterIds.includes(character.id)) {
      applySelectedIds(
        selectedCharacterIds.filter((id) => id !== character.id)
      );
      return;
    }
    if (selectedCharacterIds.length >= MAX_CHARACTER_REFERENCE_GROUPS) {
      setError(
        t('references.character.maxCharacters', {
          count: MAX_CHARACTER_REFERENCE_GROUPS
        }) as string
      );
      return;
    }
    const nextIds = [...selectedCharacterIds, character.id];
    const nextCharacters = getSelectedCharacters(characters, nextIds);
    const referenceCount = uniqueIds(
      nextCharacters.flatMap((item) => item.referenceImageIds)
    ).length;
    if (referenceCount > MAX_IMAGE_REFERENCE_IDS) {
      setError(
        t('references.maxImages', { count: MAX_IMAGE_REFERENCE_IDS }) as string
      );
      return;
    }
    applySelectedIds(nextIds);
  };

  const toggleOfficialPreset = async (preset: OfficialCharacterPreset) => {
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }
    const officialId = getOfficialCharacterId(preset.id);
    if (selectedCharacterIds.includes(officialId)) {
      applySelectedIds(selectedCharacterIds.filter((id) => id !== officialId));
      return;
    }
    if (selectedCharacterIds.length >= MAX_CHARACTER_REFERENCE_GROUPS) {
      setError(
        t('references.character.maxCharacters', {
          count: MAX_CHARACTER_REFERENCE_GROUPS
        }) as string
      );
      return;
    }
    setMaterializingId(preset.id);
    setError('');
    try {
      const savedMap = readOfficialReferenceMap();
      let referenceId = savedMap[preset.id];
      if (!referenceId) {
        const payload = await imageUrlToReferencePayload(preset.imageUrl);
        const reference = await uploadImageReference({
          imageBase64: payload.imageBase64,
          mimeType: payload.mimeType,
          role: 'character',
          label: preset.name,
          description: preset.description
        });
        referenceId = reference.id;
        writeOfficialReferenceMap({
          ...savedMap,
          [preset.id]: referenceId
        });
      }
      const officialCharacter = officialPresetToCharacter(preset, referenceId);
      const nextOfficialCharacters = [
        officialCharacter,
        ...officialCharacters.filter((item) => item.id !== officialId)
      ];
      setOfficialCharacters(nextOfficialCharacters);
      applySelectedIds(
        [...selectedCharacterIds, officialId],
        characters,
        nextOfficialCharacters
      );
      setStatusText(
        t('references.character.officialImported', {
          name: preset.name
        }) as string
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : (t('references.character.officialImportFailed') as string)
      );
    } finally {
      setMaterializingId(null);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="creator-reference-modal creator-character-picker-modal creator-nested-reference-modal z-[107] gap-0 p-0"
        overlayClassName="creator-reference-modal-backdrop creator-nested-reference-modal-backdrop"
        showCloseButton={false}
        aria-label={t('references.character.title') as string}
      >
        <div className="creator-reference-modal-head">
          <div>
            <DialogTitle asChild>
              <span>{t('references.character.title')}</span>
            </DialogTitle>
            <DialogDescription asChild>
              <small>{t('references.character.subtitle')}</small>
            </DialogDescription>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t('preview.close') as string}
            onClick={onClose}
          >
            <X data-icon="inline-start" />
          </Button>
        </div>

        <div className="creator-character-picker-toolbar">
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (value === 'liked') {
                setLikedOfficialIds(readLikedOfficialCharacterIds());
              }
              setActiveTab(value as CharacterPickerTab);
            }}
          >
            <TabsList className="creator-character-picker-tabs">
              <TabsTrigger
                value="discover"
                className={cn(activeTab === 'discover' && 'active')}
              >
                <Sparkles data-icon="inline-start" />
                {t('references.character.discover')}
              </TabsTrigger>
              <TabsTrigger
                value="mine"
                className={cn(activeTab === 'mine' && 'active')}
              >
                <UserRound data-icon="inline-start" />
                {t('references.character.mine')}
              </TabsTrigger>
              <TabsTrigger
                value="liked"
                className={cn(activeTab === 'liked' && 'active')}
              >
                <Heart data-icon="inline-start" />
                {t('references.character.liked')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <label className="creator-character-picker-search">
            <Search size={15} />
            <Input
              value={query}
              placeholder={t('references.character.search') as string}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </label>
        </div>

        {activeTab === 'discover' || activeTab === 'liked' ? (
          visibleOfficialPresets.length > 0 ? (
            <StaggeredImageGrid
              className="creator-character-discover-grid"
              observeAdditions
            >
              {visibleOfficialPresets.map((preset) => {
                const officialId = getOfficialCharacterId(preset.id);
                const selected = selectedCharacterIds.includes(officialId);
                const busy = materializingId === preset.id;
                return (
                  <Button
                    key={preset.id}
                    type="button"
                    variant="ghost"
                    className={`creator-character-discover-card ${
                      selected ? 'selected' : ''
                    }`}
                    disabled={busy}
                    onClick={() => void toggleOfficialPreset(preset)}
                  >
                    <img
                      src={preset.imageUrl}
                      alt={preset.name}
                      width={320}
                      height={420}
                      loading="lazy"
                      decoding="async"
                    />
                    <span>
                      <strong>{preset.name}</strong>
                      <small>{preset.style}</small>
                    </span>
                    {busy && (
                      <em>
                        <Loader2
                          data-icon="inline-start"
                          className="creator-spin-icon"
                        />
                      </em>
                    )}
                  </Button>
                );
              })}
            </StaggeredImageGrid>
          ) : (
            <div className="creator-reference-modal-state">
              <Heart size={20} />
              <span>
                {activeTab === 'liked'
                  ? t('references.character.likedEmpty')
                  : t('references.character.officialEmpty')}
              </span>
            </div>
          )
        ) : loading ? (
          <div className="creator-reference-modal-state">
            <Loader2 size={18} className="creator-spin-icon" />
            <span>{t('references.character.loading')}</span>
          </div>
        ) : filteredCharacters.length > 0 ? (
          <div className="creator-character-my-list">
            {filteredCharacters.map((character) => {
              const selected = selectedCharacterIds.includes(character.id);
              const cover = character.references[0]?.thumbnailUrl;
              return (
                <Button
                  key={character.id}
                  type="button"
                  variant="ghost"
                  className={`creator-character-my-card ${
                    selected ? 'selected' : ''
                  }`}
                  onClick={() => toggleCharacter(character)}
                >
                  {cover ? (
                    <img
                      src={cover}
                      alt={character.name}
                      width={64}
                      height={58}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="creator-character-empty-thumb">
                      <ImageIcon size={18} />
                    </span>
                  )}
                  <span>
                    <strong>{character.name}</strong>
                    <small>
                      {t('references.character.referenceCount', {
                        count: character.referenceImageIds.length
                      })}
                    </small>
                  </span>
                </Button>
              );
            })}
          </div>
        ) : (
          <div className="creator-reference-modal-state">
            <UserRound size={20} />
            <span>{t('references.character.empty')}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
