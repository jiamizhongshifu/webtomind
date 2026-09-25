import { Heart, Loader2, Trash2, UserRound } from 'lucide-react';
import type { ImageCharacterCard } from '@/shared/image-reference-types';
import type { OfficialCharacterPreset } from '@/web/data/official-character-presets';
import { Card, IconButton } from '@/shared/ui';

export function OfficialCharacterCard({
  preset,
  liked,
  onOpen,
  onToggleLike
}: {
  preset: OfficialCharacterPreset;
  liked: boolean;
  onOpen: () => void;
  onToggleLike: () => void;
}) {
  return (
    <Card as="article" className="create-character-card official">
      <button
        type="button"
        className="create-character-card-main"
        onClick={onOpen}
        aria-label={`查看 ${preset.name} 的角色提示词`}
      >
        <img
          src={preset.imageUrl}
          alt={preset.name}
          loading="lazy"
          decoding="async"
        />
        <span className="create-character-card-copy">
          <strong>{preset.name}</strong>
          <small>
            {preset.styleLabel} · {preset.genderLabel} · {preset.speciesLabel}
          </small>
        </span>
        <span className="create-character-card-hint">查看 Prompt</span>
      </button>
      <IconButton
        type="button"
        variant="ghost"
        size="sm"
        className={`create-character-like${liked ? ' active' : ''}`}
        label={liked ? '取消喜欢' : '喜欢角色'}
        icon={<Heart fill={liked ? 'currentColor' : 'none'} />}
        aria-pressed={liked}
        onClick={(event) => {
          event.stopPropagation();
          onToggleLike();
        }}
      />
    </Card>
  );
}

export function UserCharacterCard({
  character,
  selected,
  deleting,
  onToggle,
  onDelete
}: {
  character: ImageCharacterCard;
  selected: boolean;
  deleting: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const cover = character.references[0]?.thumbnailUrl;

  return (
    <Card
      as="article"
      className={`create-character-card${selected ? ' selected' : ''}`}
    >
      <button
        type="button"
        className="create-character-card-main"
        onClick={onToggle}
        aria-pressed={selected}
      >
        {cover ? (
          <img
            src={cover}
            alt={character.name}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="create-character-card-placeholder">
            <UserRound size={24} />
          </span>
        )}
        <span className="create-character-card-copy">
          <strong>{character.name}</strong>
          <small>
            {character.referenceImageIds.length > 0
              ? `${character.referenceImageIds.length} 张参考图`
              : '提示词角色'}
          </small>
        </span>
      </button>
      <IconButton
        type="button"
        variant="ghost"
        size="sm"
        className="create-character-card-delete"
        label="删除角色"
        icon={deleting ? <Loader2 className="creator-spin-icon" /> : <Trash2 />}
        disabled={deleting}
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      />
    </Card>
  );
}
