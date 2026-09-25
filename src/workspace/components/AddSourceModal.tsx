/**
 * AddSourceModal - 统一的添加来源弹窗
 * 上半区：全网搜索新来源
 * 下半区：手动添加（上传文件 / 粘贴URL / 粘贴文字）
 * 交互参考 NotebookLM 的来源添加界面
 */

import { useState, useCallback, useRef } from 'react';
import {
  X,
  Search,
  Globe,
  Loader2,
  ExternalLink,
  Check,
  Upload,
  Link,
  FileText,
  ArrowRight,
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  ChevronRight
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/shared/ui/radix/alert-dialog';
import { Button } from '@/shared/ui/radix/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/shared/ui/radix/dialog';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel
} from '@/shared/ui/radix/field';
import { Input } from '@/shared/ui/radix/input';
import { Textarea } from '@/shared/ui/radix/textarea';
import type { WebSearchResult } from '@/services/workspace-api';
import {
  searchWebSources,
  extractAndImportSources,
  saveSummary
} from '@/services/workspace-api';
import { SourceDiscoveryModal } from './SourceDiscoveryModal';

interface AddSourceModalProps {
  projectId: string;
  onClose: () => void;
  onImportComplete: () => void;
  onUploadFiles: () => void;
}

type SubView = 'main' | 'url' | 'text';
type SearchState = 'idle' | 'searching' | 'results' | 'importing';

function zhCopy(
  fallback: string,
  values?: Record<string, string | number>
): string {
  if (!values) return fallback;
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, String(value)),
    fallback
  );
}

export function AddSourceModal({
  projectId,
  onClose,
  onImportComplete,
  onUploadFiles
}: AddSourceModalProps) {
  const t = (
    _key: string,
    fallback: string,
    values?: Record<string, string | number>
  ) => zhCopy(fallback, values);

  // 子视图导航
  const [subView, setSubView] = useState<SubView>('main');

  // 搜索状态
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [results, setResults] = useState<WebSearchResult[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // URL 粘贴
  const [urlInput, setUrlInput] = useState('');
  const [urlImporting, setUrlImporting] = useState(false);

  // 文本粘贴
  const [textInput, setTextInput] = useState('');
  const [textSaving, setTextSaving] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // ============ 搜索逻辑 ============

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setSearchState('searching');
    setSearchError(null);
    setResults([]);
    setSelectedUrls(new Set());

    try {
      const searchResults = await searchWebSources(trimmed);
      setResults(searchResults);
      setSelectedUrls(new Set(searchResults.map((r) => r.url)));
      setSearchState('results');
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : '搜索失败');
      setSearchState('idle');
    }
  }, [query]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
        handleSearch();
      }
    },
    [handleSearch]
  );

  const handleImportResults = useCallback(async () => {
    if (selectedUrls.size === 0) return;
    setSearchState('importing');
    try {
      await extractAndImportSources(Array.from(selectedUrls), projectId);
      setSearchState('idle');
      setQuery('');
      setResults([]);
      setSelectedUrls(new Set());
      onImportComplete();
      onClose();
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : '导入失败');
      setSearchState('results');
    }
  }, [selectedUrls, projectId, onImportComplete, onClose]);

  const handleDiscardResults = useCallback(() => {
    setShowDiscardConfirm(false);
    setSearchState('idle');
    setQuery('');
    setResults([]);
    setSelectedUrls(new Set());
  }, []);

  const toggleUrl = useCallback((url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  }, []);

  // ============ URL 导入 ============

  const handleUrlImport = useCallback(async () => {
    const urls = urlInput
      .split(/[\s\n]+/)
      .map((u) => u.trim())
      .filter((u) => u.startsWith('http'));

    if (urls.length === 0) return;
    setUrlImporting(true);
    try {
      await extractAndImportSources(urls, projectId);
      setUrlInput('');
      onImportComplete();
      onClose();
    } catch {
      // 保持弹窗打开
    } finally {
      setUrlImporting(false);
    }
  }, [urlInput, projectId, onImportComplete, onClose]);

  // ============ 文本导入 ============

  const handleTextSave = useCallback(async () => {
    const text = textInput.trim();
    if (!text) return;
    setTextSaving(true);
    try {
      const title =
        text.substring(0, 50) + (text.length > 50 ? '...' : '');
      await saveSummary({
        title,
        url: '',
        markdown: text,
        tags: ['paste'],
        project_id: projectId,
        content_type: 'article'
      });
      setTextInput('');
      onImportComplete();
      onClose();
    } catch {
      // 保持弹窗打开
    } finally {
      setTextSaving(false);
    }
  }, [textInput, projectId, onImportComplete, onClose]);

  // ============ 搜索结果预览 ============

  const previewResults = results.slice(0, 3);
  const moreCount = results.length - previewResults.length;

  // ============ 渲染 ============

  // URL 子视图
  if (subView === 'url') {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="z-[180] w-[calc(100%-2rem)] max-w-lg gap-5 rounded-2xl p-6"
          overlayClassName="z-[180] bg-black/60"
          showCloseButton={false}
        >
          <DialogHeader className="flex-row items-center justify-between gap-3 text-left">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSubView('main')}
                aria-label={t('addSource.back', '返回')}
              >
                <ArrowLeft />
              </Button>
              <DialogTitle>
                {t('addSource.urlTitle', '网站和 YouTube 网址')}
              </DialogTitle>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label={t('addSource.close', '关闭')}
            >
              <X />
            </Button>
          </DialogHeader>

          <DialogDescription>
            {t(
              'addSource.urlDescription',
              '在下方粘贴网站和 YouTube 网址，即可将其作为来源导入。'
            )}
          </DialogDescription>

          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="add-source-url-input">
                {t('addSource.urlFieldLabel', '网址')}
              </FieldLabel>
              <Textarea
                id="add-source-url-input"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder={t('addSource.urlPlaceholder', '粘贴任何链接')}
                className="h-48 resize-none"
              />
              <FieldDescription>
                {t(
                  'addSource.urlHint1',
                  '如要添加多个网址，请用空格或换行符分隔。'
                )}
              </FieldDescription>
              <FieldDescription>
                {t('addSource.urlHint2', '目前只会导入网站上的可见文字。')}
              </FieldDescription>
            </Field>
          </FieldGroup>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleUrlImport}
              disabled={!urlInput.trim() || urlImporting}
            >
              {urlImporting ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : null}
              {t('addSource.insert', '插入')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // 文本子视图
  if (subView === 'text') {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="z-[180] w-[calc(100%-2rem)] max-w-lg gap-5 rounded-2xl p-6"
          overlayClassName="z-[180] bg-black/60"
          showCloseButton={false}
        >
          <DialogHeader className="flex-row items-center justify-between gap-3 text-left">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSubView('main')}
                aria-label={t('addSource.back', '返回')}
              >
                <ArrowLeft />
              </Button>
              <DialogTitle>
                {t('addSource.textTitle', '粘贴复制的文字')}
              </DialogTitle>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label={t('addSource.close', '关闭')}
            >
              <X />
            </Button>
          </DialogHeader>

          <DialogDescription>
            {t(
              'addSource.textDescription',
              '在下方粘贴复制的文字，即可将其作为来源导入。'
            )}
          </DialogDescription>

          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="add-source-text-input">
                {t('addSource.textFieldLabel', '文字内容')}
              </FieldLabel>
              <Textarea
                id="add-source-text-input"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={t('addSource.textPlaceholder', '在此处粘贴文字')}
                className="h-48 resize-none"
              />
            </Field>
          </FieldGroup>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleTextSave}
              disabled={!textInput.trim() || textSaving}
            >
              {textSaving ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : null}
              {t('addSource.insert', '插入')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // 主视图
  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="z-[180] w-[calc(100%-2rem)] max-w-xl max-h-[85vh] gap-0 overflow-hidden rounded-2xl p-0"
          overlayClassName="z-[180] bg-black/60"
          showCloseButton={false}
        >
          {/* 头部 */}
          <DialogHeader className="flex-row items-center justify-between gap-3 px-6 pt-5 pb-3 text-left">
            <DialogTitle>
              {t('addSource.title', '添加来源')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t(
                'addSource.description',
                '搜索网络来源，或通过文件、网址和文本手动添加来源。'
              )}
            </DialogDescription>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label={t('addSource.close', '关闭')}
            >
              <X />
            </Button>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {/* ===== 上半区：全网搜索 ===== */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-5">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">
                <Search className="w-3.5 h-3.5" />
                <span>
                  {t('addSource.searchLabel', '在网络中搜索新来源')}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder={t(
                    'sourceSearch.placeholder',
                    '例如：AI Agent 产品案例 / Notion AI'
                  )}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  disabled={
                    searchState === 'searching' ||
                    searchState === 'importing'
                  }
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={handleSearch}
                  disabled={
                    !query.trim() ||
                    searchState === 'searching' ||
                    searchState === 'importing'
                  }
                  aria-label={t('sourceSearch.search', '搜索')}
                >
                  {searchState === 'searching' ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ArrowRight />
                  )}
                </Button>
              </div>

              {searchError && (
                <p className="mt-2 text-xs text-red-500">{searchError}</p>
              )}

              {/* 搜索中 */}
              {searchState === 'searching' && (
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('sourceSearch.searching', '正在搜索...')}</span>
                </div>
              )}

              {/* 搜索结果 */}
              {(searchState === 'results' || searchState === 'importing') &&
                results.length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-green-600 dark:text-green-400">
                        <Check className="w-3.5 h-3.5" />
                        <span>
                          {t(
                            'sourceSearch.completed',
                            'Fast Research 已完成！'
                          )}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        onClick={() => setShowDiscoveryModal(true)}
                        className="h-auto px-0 py-0 text-xs"
                      >
                        {t('sourceSearch.viewAll', '查看')}
                      </Button>
                    </div>

                    <div className="space-y-1">
                      {previewResults.map((result) => (
                        <a
                          key={result.url}
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                        >
                          {result.favicon ? (
                            <img
                              src={result.favicon}
                              alt=""
                              className="w-4 h-4 mt-0.5 rounded-sm flex-shrink-0"
                            />
                          ) : (
                            <Globe className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                              {result.title}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate">
                              {result.source}
                            </p>
                          </div>
                          <ExternalLink className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                        </a>
                      ))}
                    </div>

                    {moreCount > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDiscoveryModal(true)}
                        className="mt-1 h-auto justify-start px-0 py-0 text-xs text-muted-foreground"
                      >
                        <ChevronRight data-icon="inline-start" />
                        {t('sourceSearch.moreResults', '另外 {{count}} 个来源', {
                          count: moreCount
                        })}
                      </Button>
                    )}

                    {/* 操作栏 */}
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground"
                        >
                          <ThumbsUp />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground"
                        >
                          <ThumbsDown />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowDiscardConfirm(true)}
                        >
                          {t('sourceSearch.discard', '删除')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleImportResults}
                          disabled={
                            selectedUrls.size === 0 ||
                            searchState === 'importing'
                          }
                        >
                          {searchState === 'importing' ? (
                            <Loader2 className="animate-spin" data-icon="inline-start" />
                          ) : (
                            <span data-icon="inline-start">+</span>
                          )}
                          {t('sourceSearch.import', '导入')}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
            </div>

            {/* ===== 下半区：手动添加来源 ===== */}
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-6 text-center">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('addSource.dropLabel', '或拖放文件')}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">
                {t(
                  'addSource.dropHint',
                  'PDF、图片、文档、音频，等等'
                )}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onUploadFiles();
                  }}
                  className="rounded-full"
                >
                  <Upload data-icon="inline-start" />
                  {t('addSource.uploadFiles', '上传文件')}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSubView('url')}
                  className="rounded-full"
                >
                  <Link data-icon="inline-start" />
                  {t('addSource.website', '网站')}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSubView('text')}
                  className="rounded-full"
                >
                  <FileText data-icon="inline-start" />
                  {t('addSource.pasteText', '复制的文字')}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 查看全部结果模态框 */}
      {showDiscoveryModal && (
        <SourceDiscoveryModal
          query={query}
          results={results}
          selectedUrls={selectedUrls}
          onToggleUrl={toggleUrl}
          onToggleAll={() => {
            if (selectedUrls.size === results.length) {
              setSelectedUrls(new Set());
            } else {
              setSelectedUrls(new Set(results.map((r) => r.url)));
            }
          }}
          onImport={async () => {
            setShowDiscoveryModal(false);
            await handleImportResults();
          }}
          onClose={() => setShowDiscoveryModal(false)}
          importing={searchState === 'importing'}
        />
      )}

      <AlertDialog
        open={showDiscardConfirm}
        onOpenChange={setShowDiscardConfirm}
      >
        <AlertDialogContent
          className="z-[190] w-[calc(100%-2rem)] max-w-sm rounded-2xl"
          overlayClassName="z-[190] bg-black/50"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                'sourceSearch.discardTitle',
                '不导入笔记本就删除吗？'
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'sourceSearch.discardDescription',
                '您将无法检索已发现的来源。'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('sourceSearch.cancel', '取消')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscardResults}>
              {t('sourceSearch.confirm', '确认')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
