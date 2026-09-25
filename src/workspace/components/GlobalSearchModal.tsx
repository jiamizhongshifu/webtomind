import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search, X } from 'lucide-react';
import { Badge } from '@/shared/ui/radix/badge';
import { Button } from '@/shared/ui/radix/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/shared/ui/radix/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/shared/ui/radix/empty';
import { Input } from '@/shared/ui/radix/input';
import { cn } from '@/lib/utils';
import type { SavedSummary } from '@/services/database';
import type { Project } from '@/services/workspace-api';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (summary: SavedSummary) => void;
  summaries: SavedSummary[];
  projects: Project[];
}

export function GlobalSearchModal({
  isOpen,
  onClose,
  onSelectResult: _onSelectResult,
  summaries,
  projects
}: GlobalSearchModalProps) {
  const { t } = useTranslation('boards');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((p) => {
      map.set(p.id, p.name);
    });
    return map;
  }, [projects]);

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) {
      return [];
    }

    const term = searchTerm.toLowerCase();
    return summaries
      .filter((s) => {
        const title = (s.title || '').toLowerCase();
        const markdown = (s.markdown || '').toLowerCase();
        const url = (s.url || '').toLowerCase();
        return (
          title.includes(term) || markdown.includes(term) || url.includes(term)
        );
      })
      .slice(0, 20);
  }, [searchTerm, summaries]);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const openInNewTab = useCallback((summary: SavedSummary) => {
    const boardsBase = '/boards';
    const url = summary.projectId
      ? `${boardsBase}/${summary.projectId}?summary-id=${summary.id}`
      : `${boardsBase}?summary-id=${summary.id}`;
    window.open(url, '_blank');
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, searchResults.length - 1)
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && searchResults.length > 0) {
        e.preventDefault();
        openInNewTab(searchResults[selectedIndex]);
      }
    },
    [searchResults, selectedIndex, openInNewTab, onClose]
  );

  useEffect(() => {
    if (listRef.current && searchResults.length > 0) {
      const selectedElement = listRef.current.children[
        selectedIndex
      ] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }
  }, [selectedIndex, searchResults.length]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  const getExcerpt = (markdown: string | undefined, length: number = 100) => {
    if (!markdown) return '';
    const text = markdown
      .replace(/<[^>]+>/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/[*_`~]/g, '')
      .trim();
    return text.slice(0, length) + (text.length > length ? '...' : '');
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="top-[15vh] max-w-2xl translate-y-0 overflow-hidden p-0 sm:rounded-2xl"
        overlayClassName="bg-black/50 backdrop-blur-sm"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t('search.title', '全局搜索')}</DialogTitle>
          <DialogDescription>
            {t('search.placeholder', '搜索所有卡片...')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 border-b px-5 py-4">
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('search.placeholder', '搜索所有卡片...')}
            className="h-auto flex-1 border-0 bg-transparent px-0 py-0 text-base shadow-none focus-visible:ring-0"
          />
          {searchTerm && (
            <Button
              aria-label={t('search.clear', '清空搜索')}
              onClick={() => setSearchTerm('')}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X data-icon="inline-start" />
            </Button>
          )}
          <kbd className="shrink-0 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[min(400px,65vh)] overflow-y-auto">
          {searchTerm.trim() === '' ? (
            <SearchEmptyState
              title={t('search.hint', '输入关键词搜索所有项目中的卡片')}
              description="支持全量文本检索"
            />
          ) : searchResults.length === 0 ? (
            <SearchEmptyState
              title={t('search.noResults', '没有找到匹配的卡片')}
              description="请尝试更换或者减少关键词"
            />
          ) : (
            searchResults.map((summary, index) => {
              const projectName = summary.projectId
                ? projectMap.get(summary.projectId) ||
                  t('search.unknownProject', '未知项目')
                : t('search.noProject', '未分类');

              return (
                <Button
                  key={summary.id}
                  className={cn(
                    'h-auto w-full justify-start rounded-none px-5 py-3 text-left font-normal whitespace-normal',
                    index === selectedIndex &&
                      'bg-accent text-accent-foreground'
                  )}
                  onClick={() => openInNewTab(summary)}
                  type="button"
                  variant="ghost"
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-medium">
                      {summary.title || t('search.untitled', 'Untitled')}
                    </h4>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {getExcerpt(summary.markdown)}
                    </p>
                    <div className="mt-1 flex items-center gap-1">
                      <Badge variant="secondary">{projectName}</Badge>
                    </div>
                  </div>
                  <ChevronRight
                    data-icon="inline-end"
                    className="ml-auto shrink-0 text-muted-foreground"
                  />
                </Button>
              );
            })
          )}
        </div>

        {searchResults.length > 0 && (
          <div className="border-t bg-muted/50 px-5 py-3">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <KeyboardHint
                keys={['↑', '↓']}
                label={t('search.navigate', '导航')}
              />
              <KeyboardHint
                keys={['Enter']}
                label={t('search.select', '选择')}
              />
              <KeyboardHint keys={['Esc']} label={t('search.close', '关闭')} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SearchEmptyState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <Empty className="border-0 py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Search />
        </EmptyMedia>
        <EmptyTitle className="text-sm">{title}</EmptyTitle>
        <EmptyDescription className="text-xs">{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function KeyboardHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((key) => (
        <kbd
          key={key}
          className="rounded bg-background px-1.5 py-0.5 font-mono"
        >
          {key}
        </kbd>
      ))}
      {label}
    </span>
  );
}
