import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Check, ChevronDown, LoaderCircle, Plus } from 'lucide-react';
import { ActionSheet } from '@/shared/ui';
import {
  PopoverContent,
  PopoverRoot,
  PopoverTrigger
} from '@/shared/ui/PopoverPrimitives';
import type { VisualMoodboard } from '@/shared/create-workspace-v2';

interface DiscoveryImageMoodboardActionsProps {
  boards: VisualMoodboard[];
  selectedBoardId: string;
  prefix: string;
  isEnglish: boolean;
  saved: boolean;
  saving: boolean;
  onSelectBoard: (boardId: string) => void;
  onSave: () => void;
}

function useCompactMoodboardPicker(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(
      '(max-width: 800px), (hover: none), (pointer: coarse)'
    );
    const sync = () => setCompact(query.matches);
    sync();
    query.addEventListener?.('change', sync);
    return () => query.removeEventListener?.('change', sync);
  }, []);

  return compact;
}

function MoodboardPickerList({
  boards,
  selectedBoardId,
  prefix,
  isEnglish,
  onSelect
}: {
  boards: VisualMoodboard[];
  selectedBoardId: string;
  prefix: string;
  isEnglish: boolean;
  onSelect: (boardId: string) => void;
}) {
  return (
    <div className="discovery-moodboard-picker-list">
      <Link
        to={`${prefix}/moodboards/new`}
        className="discovery-moodboard-picker-create"
      >
        <span aria-hidden="true">
          <Plus />
        </span>
        <strong>{isEnglish ? 'Create a moodboard' : '创建情绪板'}</strong>
      </Link>
      {boards.map((board) => {
        const selected = board.id === selectedBoardId;
        const cover =
          board.coverImageUrl ||
          board.items?.find((item) => Boolean(item.imageUrl))?.imageUrl;
        return (
          <button
            type="button"
            className="discovery-moodboard-picker-option"
            aria-pressed={selected}
            key={board.id}
            onClick={() => onSelect(board.id)}
          >
            <span className="discovery-moodboard-picker-cover">
              {cover ? <img src={cover} alt="" loading="lazy" /> : null}
            </span>
            <span>
              <strong>{board.name}</strong>
              <small>
                {board.itemCount}{' '}
                {isEnglish
                  ? board.itemCount === 1
                    ? 'item'
                    : 'items'
                  : '张图片'}
              </small>
            </span>
            <span
              className="discovery-moodboard-picker-check"
              aria-hidden="true"
            >
              {selected ? <Check /> : <Plus />}
            </span>
          </button>
        );
      })}
      {!boards.length ? (
        <p className="discovery-moodboard-picker-empty">
          {isEnglish
            ? 'Create your first moodboard to start collecting images.'
            : '创建第一个情绪板后，就可以在这里快速收集图片。'}
        </p>
      ) : null}
    </div>
  );
}

export function DiscoveryImageMoodboardActions({
  boards,
  selectedBoardId,
  prefix,
  isEnglish,
  saved,
  saving,
  onSelectBoard,
  onSave
}: DiscoveryImageMoodboardActionsProps) {
  const compact = useCompactMoodboardPicker();
  const [open, setOpen] = useState(false);
  const selectedBoard = boards.find((board) => board.id === selectedBoardId);
  const boardLabel =
    selectedBoard?.name || (isEnglish ? 'Choose moodboard' : '选择情绪板');

  const picker = (
    <MoodboardPickerList
      boards={boards}
      selectedBoardId={selectedBoardId}
      prefix={prefix}
      isEnglish={isEnglish}
      onSelect={(boardId) => {
        onSelectBoard(boardId);
        setOpen(false);
      }}
    />
  );

  const trigger = (
    <button
      type="button"
      className="discovery-image-board-trigger"
      aria-label={`${isEnglish ? 'Choose moodboard' : '选择情绪板'}：${boardLabel}`}
      onClick={(event) => {
        if (compact) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }
      }}
    >
      <span>{boardLabel}</span>
      <ChevronDown aria-hidden="true" />
    </button>
  );

  return (
    <div className="discovery-image-moodboard-actions">
      {compact ? (
        <>
          {trigger}
          <ActionSheet
            open={open}
            title={isEnglish ? 'Save to moodboard' : '保存到情绪板'}
            closeLabel={isEnglish ? 'Close' : '关闭'}
            className="discovery-moodboard-picker-sheet"
            onClose={() => setOpen(false)}
          >
            {picker}
          </ActionSheet>
        </>
      ) : (
        <PopoverRoot open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={8}
            className="discovery-moodboard-picker-popover"
          >
            {picker}
          </PopoverContent>
        </PopoverRoot>
      )}
      <button
        type="button"
        className="discovery-image-quick-save"
        data-saved={saved ? 'true' : 'false'}
        disabled={saving}
        aria-label={
          saved
            ? isEnglish
              ? `Saved to ${boardLabel}`
              : `已保存到${boardLabel}`
            : isEnglish
              ? `Save to ${boardLabel}`
              : `保存到${boardLabel}`
        }
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSave();
        }}
      >
        {saving ? (
          <LoaderCircle className="is-spinning" aria-hidden="true" />
        ) : saved ? (
          <Check aria-hidden="true" />
        ) : (
          <Bookmark aria-hidden="true" />
        )}
        <span>
          {saved
            ? isEnglish
              ? 'Saved'
              : '已保存'
            : isEnglish
              ? 'Save'
              : '保存'}
        </span>
      </button>
    </div>
  );
}
