import { createLogger } from '@/utils/logger';
import type {
  Shortcut,
  SavedSummary,
  ShortcutReference
} from '@/services/database';

const log = createLogger('ShortcutManager');
import { X, ArrowLeft, Zap } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/ui/radix/badge';
import { Button } from '@/shared/ui/radix/button';
import { Empty, EmptyHeader, EmptyTitle } from '@/shared/ui/radix/empty';
import { ShortcutList } from './ShortcutList';
import { ShortcutEditor } from './ShortcutEditor';
import {
  getAllShortcuts,
  saveShortcut,
  updateShortcut,
  deleteShortcut
} from '@/services/workspace-api';

interface ApiShortcut {
  id: string;
  name: string;
  prompt: string;
  description?: string;
  referenceIds?: string[];
  references?: ShortcutReference[];
  order?: number;
  createdAt: number;
  updatedAt?: number;
}

type ReferenceItem = string | ShortcutReference;

interface ShortcutManagerProps {
  summaries: SavedSummary[];
  onClose: () => void;
}

export function ShortcutManager({ summaries, onClose }: ShortcutManagerProps) {
  const { t } = useTranslation('workspace');

  // 快捷指令状态
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [selectedShortcutId, setSelectedShortcutId] = useState<string | null>(
    null
  );
  const [shortcutsLoading, setShortcutsLoading] = useState(true);

  // 加载快捷指令
  const loadShortcuts = useCallback(async () => {
    try {
      const apiShortcuts = await getAllShortcuts();
      const data: Shortcut[] = (apiShortcuts as ApiShortcut[]).map(
        (s: ApiShortcut) => {
          const rawRefs: ReferenceItem[] = s.referenceIds || s.references || [];
          const refs: ShortcutReference[] = rawRefs.map(
            (item: ReferenceItem, index: number): ShortcutReference => {
              if (typeof item === 'object' && 'summaryId' in item) {
                return item;
              }
              const summaryId = item;
              const summary = summaries.find((sum) => sum.id === summaryId);
              return {
                id: `ref-${index}-${summaryId}`,
                summaryId,
                summaryTitle:
                  summary?.title || t('shortcutManager.unknownTitle'),
                preview: summary?.markdown?.substring(0, 100) || ''
              };
            }
          );
          return {
            id: s.id,
            name: s.name,
            prompt: s.prompt,
            description: s.description || '',
            references: refs,
            order: s.order || 0,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt || s.createdAt
          };
        }
      );
      setShortcuts(data);
      if (!selectedShortcutId && data.length > 0) {
        setSelectedShortcutId(data[0].id);
      }
    } catch (error) {
      log.error('[ShortcutManager] Load shortcuts failed:', error);
    } finally {
      setShortcutsLoading(false);
    }
  }, [selectedShortcutId, summaries, t]);

  useEffect(() => {
    loadShortcuts();
  }, [loadShortcuts]);

  // 快捷指令操作
  const handleCreateShortcut = async () => {
    try {
      const result = await saveShortcut({
        name: t('shortcutManager.newSkill'),
        prompt: t('shortcutManager.promptPlaceholder')
      });
      await loadShortcuts();
      setSelectedShortcutId(result.id);
    } catch (error) {
      log.error('[ShortcutManager] Create shortcut failed:', error);
    }
  };

  const handleUpdateShortcut = async (
    id: string,
    updates: Partial<Shortcut>
  ) => {
    try {
      const referenceIds = updates.references?.map((ref) => ref.summaryId);
      const updateData: {
        name?: string;
        prompt?: string;
        order?: number;
        referenceIds?: string[];
      } = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.prompt !== undefined) updateData.prompt = updates.prompt;
      if (updates.order !== undefined) updateData.order = updates.order;
      if (referenceIds !== undefined) updateData.referenceIds = referenceIds;
      await updateShortcut(id, updateData);
      setShortcuts((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
        )
      );
    } catch (error) {
      log.error('[ShortcutManager] Update shortcut failed:', error);
    }
  };

  const handleDeleteShortcut = async (id: string) => {
    try {
      await deleteShortcut(id);
      setShortcuts((prev) => prev.filter((s) => s.id !== id));
      if (selectedShortcutId === id) {
        const remaining = shortcuts.filter((s) => s.id !== id);
        setSelectedShortcutId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (error) {
      log.error('[ShortcutManager] Delete shortcut failed:', error);
    }
  };

  const handleReorderShortcuts = async (ids: string[]) => {
    const reordered = ids.map((id, index) => {
      const shortcut = shortcuts.find((s) => s.id === id)!;
      return { ...shortcut, order: index };
    });
    setShortcuts(reordered);
    for (let i = 0; i < ids.length; i++) {
      await updateShortcut(ids[i], { order: i });
    }
  };

  const selectedShortcut =
    shortcuts.find((s) => s.id === selectedShortcutId) || null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* 顶部标题栏 */}
      <header className="flex flex-shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t('shortcutManager.back', '返回')}
          >
            <ArrowLeft data-icon="inline-start" />
          </Button>
          <h1 className="text-lg font-semibold text-foreground">
            {t('shortcutManager.title', '技能')}
          </h1>
        </div>
        <Badge variant="secondary" className="gap-1.5 py-1.5">
          <Zap data-icon="inline-start" />
          {t('shortcutManager.skills', '技能')}
        </Badge>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label={t('shortcutManager.close', '关闭')}
        >
          <X data-icon="inline-start" />
        </Button>
      </header>

      {/* 主内容区 */}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 flex-col border-r border-border bg-muted/40">
          <ShortcutList
            shortcuts={shortcuts}
            selectedId={selectedShortcutId}
            loading={shortcutsLoading}
            onSelect={setSelectedShortcutId}
            onCreate={handleCreateShortcut}
            onReorder={handleReorderShortcuts}
          />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col bg-background">
          {selectedShortcut ? (
            <ShortcutEditor
              shortcut={selectedShortcut}
              summaries={summaries}
              onUpdate={(updates) =>
                handleUpdateShortcut(selectedShortcut.id, updates)
              }
              onDelete={() => handleDeleteShortcut(selectedShortcut.id)}
            />
          ) : (
            <Empty className="flex-1 border-0">
              <EmptyHeader>
                <EmptyTitle className="text-sm text-muted-foreground">
                  {shortcutsLoading
                    ? t('shortcutManager.loading')
                    : t('shortcutManager.selectOrCreate')}
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </main>
      </div>
    </div>
  );
}
