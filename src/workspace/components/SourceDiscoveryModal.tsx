/**
 * SourceDiscoveryModal - 搜索结果全量查看模态框
 * 展示所有搜索结果，支持勾选/全选/导入
 * 交互参考 NotebookLM 的来源发现窗口
 */

import {
  Globe,
  ExternalLink,
  Loader2,
  ArrowUpRight
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { WebSearchResult } from '@/services/workspace-api';
import { Button } from '@/shared/ui/radix/button';
import { Checkbox } from '@/shared/ui/radix/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/ui/radix/dialog';
import { Separator } from '@/shared/ui/radix/separator';

interface SourceDiscoveryModalProps {
  query: string;
  results: WebSearchResult[];
  selectedUrls: Set<string>;
  onToggleUrl: (url: string) => void;
  onToggleAll: () => void;
  onImport: () => void;
  onClose: () => void;
  importing: boolean;
}

export function SourceDiscoveryModal({
  query,
  results,
  selectedUrls,
  onToggleUrl,
  onToggleAll,
  onImport,
  onClose,
  importing
}: SourceDiscoveryModalProps) {
  const { t } = useTranslation('workspace');
  const allSelected = results.length > 0 && selectedUrls.size === results.length;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[80vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl"
        overlayClassName="bg-black/50"
        showCloseButton={false}
      >
        <DialogHeader className="flex-row items-center justify-between gap-4 px-5 py-4 text-left">
          <div>
            <DialogTitle className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {t('sourceSearch.discoveryTitle', '来源 > 来源发现')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t(
                'sourceSearch.discoveryDescription',
                '这些资源涵盖了相关主题的架构、应用与生态。'
              )}
            </DialogDescription>
          </div>
          <Button
            aria-label={t('common.close', '关闭')}
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowUpRight />
          </Button>
        </DialogHeader>
        <Separator />

        {/* 搜索词展示 */}
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2">
            <Globe className="size-4 text-slate-400" />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              {query}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {t(
              'sourceSearch.discoveryDescription',
              '这些资源涵盖了相关主题的架构、应用与生态。'
            )}
          </p>
        </div>

        {/* 全选 */}
        <div className="flex items-center justify-between px-5 py-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Checkbox
              checked={allSelected}
              disabled={results.length === 0}
              onCheckedChange={() => onToggleAll()}
            />
            <span>{t('sourceSearch.selectAll', '选择所有来源')}</span>
          </label>
        </div>
        <Separator />

        {/* 结果列表 */}
        <div className="flex-1 overflow-y-auto px-5 py-2 custom-scrollbar">
          <div className="space-y-1">
            {results.map((result) => {
              const isSelected = selectedUrls.has(result.url);
              return (
                <div
                  key={result.url}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  {/* favicon */}
                  <div className="flex-shrink-0">
                    {result.favicon ? (
                      <img
                        src={result.favicon}
                        alt=""
                        className="size-5 rounded"
                      />
                    ) : (
                      <Globe className="size-5 text-slate-400" />
                    )}
                  </div>

                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {result.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                      {result.snippet}
                    </p>
                  </div>

                  {/* 外链 */}
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="size-3.5 text-slate-400" />
                  </a>

                  {/* 勾选框 */}
                  <Checkbox
                    checked={isSelected}
                    className="size-5"
                    onCheckedChange={() => onToggleUrl(result.url)}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <Separator />

        {/* 底部操作栏 */}
        <DialogFooter className="flex-row items-center justify-between gap-3 px-5 py-4 sm:space-x-0">
          <span className="text-xs text-slate-500">
            {t('sourceSearch.selectedCount', '已选择 {{count}} 个来源', {
              count: selectedUrls.size
            })}
          </span>
          <Button
            type="button"
            onClick={onImport}
            disabled={selectedUrls.size === 0 || importing}
          >
            {importing ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : null}
            {t('sourceSearch.import', '导入')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
