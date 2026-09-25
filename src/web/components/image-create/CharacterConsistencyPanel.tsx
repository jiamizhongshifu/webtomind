import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, UserRound, Users } from 'lucide-react';
import {
  createImageCharacter,
  deleteImageCharacter,
  listImageCharacters
} from '@/services/agent-api';
import {
  MAX_CHARACTER_REFERENCE_GROUPS,
  MAX_CHARACTER_REFERENCES_PER_GROUP,
  MAX_IMAGE_REFERENCE_IDS,
  type ImageCharacterCard
} from '@/shared/image-reference-types';
import { Button } from '@/shared/ui/radix/button';
import { Input } from '@/shared/ui/radix/input';
import { Textarea } from '@/shared/ui/radix/textarea';

interface CharacterConsistencyPanelProps {
  isAuthenticated: boolean;
  onRequireLogin: () => void;
  selectedReferenceIds: string[];
  selectedCharacterIds: string[];
  onSelectedReferenceIdsChange: (ids: string[]) => void;
  onSelectedCharacterIdsChange: (ids: string[]) => void;
  onSelectedCharactersChange: (characters: ImageCharacterCard[]) => void;
  setError: (message: string) => void;
  setStatusText: (message: string) => void;
  onCharacterCreated?: (character: ImageCharacterCard) => void;
}

function getDefaultCharacterName(count: number): string {
  return count === 0 ? '角色 A' : `角色 ${count + 1}`;
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

export function CharacterConsistencyPanel({
  isAuthenticated,
  onRequireLogin,
  selectedReferenceIds,
  selectedCharacterIds,
  onSelectedReferenceIdsChange,
  onSelectedCharacterIdsChange,
  onSelectedCharactersChange,
  setError,
  setStatusText,
  onCharacterCreated
}: CharacterConsistencyPanelProps) {
  const [characters, setCharacters] = useState<ImageCharacterCard[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setCharacters([]);
      onSelectedCharacterIdsChange([]);
      onSelectedCharactersChange([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listImageCharacters()
      .then((items) => {
        if (cancelled) return;
        setCharacters(items);
        const available = new Set(items.map((item) => item.id));
        onSelectedCharacterIdsChange(
          selectedCharacterIds.filter((id) => available.has(id))
        );
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
    // 初次鉴权完成后加载;选择变化不应重复请求。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    const selectedCharacters = selectedCharacterIds
      .map((id) => characters.find((character) => character.id === id))
      .filter((item): item is ImageCharacterCard => Boolean(item));
    onSelectedCharactersChange(selectedCharacters);
  }, [characters, onSelectedCharactersChange, selectedCharacterIds]);

  const applySelectedCharacterReferences = (ids: string[]) => {
    const selectedCharacters = ids
      .map((id) => characters.find((character) => character.id === id))
      .filter((item): item is ImageCharacterCard => Boolean(item));
    const nextReferenceIds = uniqueIds(
      selectedCharacters.flatMap((character) => character.referenceImageIds)
    ).slice(0, MAX_IMAGE_REFERENCE_IDS);
    onSelectedReferenceIdsChange(nextReferenceIds);
  };

  const toggleCharacter = (character: ImageCharacterCard) => {
    if (selectedCharacterIds.includes(character.id)) {
      const next = selectedCharacterIds.filter((id) => id !== character.id);
      onSelectedCharacterIdsChange(next);
      applySelectedCharacterReferences(next);
      return;
    }
    if (selectedCharacterIds.length >= MAX_CHARACTER_REFERENCE_GROUPS) {
      setError(`最多同时选择 ${MAX_CHARACTER_REFERENCE_GROUPS} 个角色`);
      return;
    }
    const next = [...selectedCharacterIds, character.id];
    const totalReferences = uniqueIds(
      next.flatMap(
        (id) =>
          characters.find((item) => item.id === id)?.referenceImageIds || []
      )
    );
    if (totalReferences.length > MAX_IMAGE_REFERENCE_IDS) {
      setError(
        `两个角色合计最多 ${MAX_IMAGE_REFERENCE_IDS} 张参考图，请减少角色参考图数量`
      );
      return;
    }
    onSelectedCharacterIdsChange(next);
    applySelectedCharacterReferences(next);
  };

  const handleCreateCharacter = async () => {
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }
    const referenceIds = selectedReferenceIds.slice(
      0,
      MAX_CHARACTER_REFERENCES_PER_GROUP
    );
    if (referenceIds.length === 0) {
      setError('请先在参考图面板选择 1-3 张角色参考图');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const character = await createImageCharacter({
        name: name.trim() || getDefaultCharacterName(characters.length),
        description: description.trim() || undefined,
        referenceImageIds: referenceIds
      });
      setCharacters((current) => [
        character,
        ...current.filter((item) => item.id !== character.id)
      ]);
      const nextSelected = uniqueIds([
        ...selectedCharacterIds,
        character.id
      ]).slice(0, MAX_CHARACTER_REFERENCE_GROUPS);
      const nextSelectedCharacters = nextSelected
        .map((id) =>
          id === character.id
            ? character
            : characters.find((item) => item.id === id)
        )
        .filter((item): item is ImageCharacterCard => Boolean(item));
      const totalReferenceIds = uniqueIds(
        nextSelectedCharacters.flatMap((item) => item.referenceImageIds)
      );
      if (totalReferenceIds.length > MAX_IMAGE_REFERENCE_IDS) {
        setError(
          `两个角色合计最多 ${MAX_IMAGE_REFERENCE_IDS} 张参考图，请减少角色参考图数量`
        );
        return;
      }
      onSelectedCharacterIdsChange(nextSelected);
      onSelectedCharactersChange(nextSelectedCharacters);
      setName('');
      setDescription('');
      setStatusText(`已创建角色卡「${character.name}」`);
      onCharacterCreated?.(character);
    } catch (error) {
      setError(error instanceof Error ? error.message : '角色卡创建失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCharacter = async (characterId: string) => {
    setDeletingId(characterId);
    setError('');
    try {
      await deleteImageCharacter(characterId);
      setCharacters((current) =>
        current.filter((item) => item.id !== characterId)
      );
      const next = selectedCharacterIds.filter((id) => id !== characterId);
      onSelectedCharacterIdsChange(next);
      applySelectedCharacterReferences(next);
      setStatusText('角色卡已删除');
    } catch (error) {
      setError(error instanceof Error ? error.message : '角色卡删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="creator-subpanel character-panel">
      <div className="creator-panel-head">
        <span>角色一致性</span>
        <strong>{selectedCharacterIds.length}</strong>
      </div>

      <div className="character-create-box">
        <Input
          type="text"
          value={name}
          maxLength={80}
          placeholder={getDefaultCharacterName(characters.length)}
          onChange={(event) => setName(event.target.value)}
        />
        <Textarea
          value={description}
          maxLength={300}
          placeholder="可选：五官、发型、服装或人设锚点"
          onChange={(event) => setDescription(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={handleCreateCharacter}
        >
          {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
          用当前参考图创建角色
        </Button>
      </div>

      <p className="character-panel-note">
        单角色建议 1-3 张参考图；双角色会自动按 A/B 分组，合计最多{' '}
        {MAX_IMAGE_REFERENCE_IDS} 张。
      </p>

      {loading ? (
        <div className="character-empty">
          <Loader2 size={16} className="spin" />
          加载角色卡...
        </div>
      ) : characters.length === 0 ? (
        <div className="character-empty">
          <UserRound size={18} />
          先选择参考图，再创建可复用角色卡。
        </div>
      ) : (
        <div className="character-list">
          {characters.map((character) => {
            const selected = selectedCharacterIds.includes(character.id);
            const isDual =
              selected && selectedCharacterIds.indexOf(character.id) === 1;
            return (
              <div
                key={character.id}
                className={`character-card${selected ? ' selected' : ''}`}
              >
                <Button
                  type="button"
                  variant="ghost"
                  className="character-card-main"
                  aria-pressed={selected}
                  onClick={() => toggleCharacter(character)}
                >
                  <span className="character-card-icon">
                    {isDual ? <Users size={16} /> : <UserRound size={16} />}
                  </span>
                  <span className="character-card-copy">
                    <strong>{character.name}</strong>
                    <small>
                      {character.referenceImageIds.length} 张参考图
                      {selected
                        ? ` · ${isDual ? 'Character B' : 'Character A'}`
                        : ''}
                    </small>
                  </span>
                </Button>
                <div className="character-card-refs">
                  {character.references.slice(0, 3).map((reference) => (
                    <span key={reference.id}>
                      {reference.thumbnailUrl ? (
                        <img src={reference.thumbnailUrl} alt="" />
                      ) : (
                        <UserRound size={12} />
                      )}
                    </span>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="character-delete"
                  aria-label="删除角色卡"
                  disabled={deletingId === character.id}
                  onClick={() => void handleDeleteCharacter(character.id)}
                >
                  {deletingId === character.id ? (
                    <Loader2 className="spin" />
                  ) : (
                    <Trash2 />
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
