import type { Shortcut } from '@/services/database';
import { Plus, Settings2, GripVertical } from 'lucide-react';
import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/radix/button';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/shared/ui/radix/empty';
import { Separator } from '@/shared/ui/radix/separator';
import { Skeleton } from '@/shared/ui/radix/skeleton';
import { cn } from '@/lib/utils';

interface ShortcutListProps {
  shortcuts: Shortcut[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onReorder: (ids: string[]) => void;
}

/**
 * 快捷指令列表组件
 * 支持拖拽排序
 */
export function ShortcutList({
  shortcuts,
  selectedId,
  loading,
  onSelect,
  onCreate,
  onReorder
}: ShortcutListProps) {
  const { t } = useTranslation('workspace');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragNodeRef = useRef<HTMLButtonElement | null>(null);

  // 拖拽开始
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);

    // 添加拖拽时的样式
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = '0.5';
    }
  };

  // 拖拽结束
  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);

    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = '1';
    }
  };

  // 拖拽经过
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (id !== draggedId) {
      setDragOverId(id);
    }
  };

  // 拖拽离开
  const handleDragLeave = () => {
    setDragOverId(null);
  };

  // 放置
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();

    if (!draggedId || draggedId === targetId) {
      setDragOverId(null);
      return;
    }

    // 计算新顺序
    const draggedIndex = shortcuts.findIndex((s) => s.id === draggedId);
    const targetIndex = shortcuts.findIndex((s) => s.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // 创建新的ID数组
    const newIds = shortcuts.map((s) => s.id);
    newIds.splice(draggedIndex, 1);
    newIds.splice(targetIndex, 0, draggedId);

    onReorder(newIds);
    setDragOverId(null);
  };

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-3">
        <Skeleton className="h-9 w-full" aria-label={t('shortcutList.loading')} />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-4/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 新建按钮 */}
      <div className="p-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCreate}
          className="w-full justify-start bg-background"
        >
          <Plus data-icon="inline-start" />
          <span>{t('shortcutList.newShortcut')}</span>
        </Button>
      </div>
      <Separator />

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {shortcuts.length === 0 ? (
          <Empty className="min-h-40 border-0 p-4">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Settings2 data-icon="inline-start" />
              </EmptyMedia>
              <EmptyTitle className="text-sm text-muted-foreground">
                {t('shortcutList.empty')}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-1">
            {shortcuts.map((shortcut) => (
              <Button
                key={shortcut.id}
                ref={draggedId === shortcut.id ? dragNodeRef : null}
                type="button"
                variant="ghost"
                draggable
                onDragStart={(e) => handleDragStart(e, shortcut.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, shortcut.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, shortcut.id)}
                onClick={() => onSelect(shortcut.id)}
                className={cn(
                  'group h-auto w-full justify-start gap-2 rounded-lg border border-transparent px-3 py-2.5 text-left',
                  selectedId === shortcut.id
                    ? 'border-border bg-accent text-accent-foreground'
                    : 'hover:border-border hover:bg-background',
                  dragOverId === shortcut.id &&
                    draggedId !== shortcut.id &&
                    'border-t-2 border-t-ring',
                  draggedId === shortcut.id && 'opacity-50'
                )}
              >
                {/* 拖拽手柄 */}
                <div className="flex-shrink-0 cursor-grab opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing">
                  <GripVertical data-icon="inline-start" />
                </div>

                {/* 图标 */}
                <Settings2 data-icon="inline-start" />

                {/* 名称 */}
                <span
                  className={cn(
                    'flex-1 truncate text-sm',
                    selectedId === shortcut.id
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  {shortcut.name || t('shortcutList.unnamed')}
                </span>
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
