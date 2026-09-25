import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createLogger } from '@/utils/logger';
import { Download, Loader2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/shared/ui/radix/select';

const log = createLogger('ExportImageModal');
import html2canvas from 'html2canvas';
import { Logo } from './Logo';
import { sanitizeHtml } from '@/utils/sanitize-html';

interface ExportImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  contentHtml: string;
  isPremiumUser?: boolean;
  onUpgrade?: () => void;
}

type ThemeMode = 'light' | 'dark';

function processContent(html: string, theme: ThemeMode): string {
  if (!html?.trim()) return '<div style="color:#64748b">No content</div>';
  const safeHtml = sanitizeHtml(html);
  const temp = document.createElement('div');
  temp.innerHTML = safeHtml;
  const isDark = theme === 'dark';
  const textColor = isDark ? '#e2e8f0' : '#1e293b';
  temp.querySelectorAll('div').forEach((el) => {
    if (!el.style.color) el.style.color = textColor;
    if (!el.style.lineHeight) el.style.lineHeight = '1.7';
  });
  temp.querySelectorAll('img').forEach((el) => {
    el.style.maxWidth = '100%';
    el.style.borderRadius = '8px';
  });
  return sanitizeHtml(temp.innerHTML);
}

export function ExportImageModal({
  isOpen,
  onClose,
  title,
  contentHtml,
  isPremiumUser = false,
  onUpgrade
}: ExportImageModalProps) {
  const { t } = useTranslation('workspace');
  const [showWatermark, setShowWatermark] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleDownload = async () => {
    if (!contentRef.current) {
      log.error('[Export] contentRef is null');
      return;
    }
    setIsGenerating(true);
    try {
      log.info('[Export] Starting export...');
      log.info(
        '[Export] Original element size:',
        contentRef.current.offsetWidth,
        'x',
        contentRef.current.offsetHeight
      );

      // 获取原始元素的实际尺寸
      const rect = contentRef.current.getBoundingClientRect();
      const width = Math.max(rect.width, contentRef.current.scrollWidth, 400);
      const height = Math.max(
        rect.height,
        contentRef.current.scrollHeight,
        200
      );

      log.info('[Export] Calculated size:', width, 'x', height);

      // 直接在原始元素上截图，不克隆
      const canvas = await html2canvas(contentRef.current, {
        backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
        scale: 2,
        useCORS: true,
        logging: true,
        allowTaint: true,
        width: width,
        height: height,
        windowWidth: width,
        windowHeight: height,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0
      });

      log.info('[Export] Canvas created:', canvas.width, 'x', canvas.height);

      if (canvas.width === 0 || canvas.height === 0) {
        log.error('[Export] Canvas has zero dimensions, trying fallback...');
        // 尝试备用方案：强制设置尺寸
        const fallbackCanvas = await html2canvas(contentRef.current, {
          backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
          scale: 2,
          useCORS: true,
          logging: true,
          allowTaint: true,
          onclone: (_clonedDoc, element) => {
            element.style.width = width + 'px';
            element.style.height = height + 'px';
            element.style.display = 'block';
            element.style.visibility = 'visible';
          }
        });

        if (fallbackCanvas.width > 0 && fallbackCanvas.height > 0) {
          downloadCanvas(fallbackCanvas);
          return;
        }
        log.error('[Export] Fallback also failed');
        return;
      }

      downloadCanvas(canvas);
    } catch (e) {
      log.error('[Export] Failed:', e);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadCanvas = (canvas: HTMLCanvasElement) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        log.error('[Export] Failed to create blob');
        return;
      }
      log.info('[Export] Blob created, size:', blob.size);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'export'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const toggleWatermark = () => {
    if (showWatermark && !isPremiumUser) setShowUpgrade(true);
    else setShowWatermark(!showWatermark);
  };

  if (!isOpen) return null;
  const isDark = theme === 'dark';
  const bg = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#e2e8f0' : '#1e293b';

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setShowUpgrade(false);
            onClose();
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
          <DialogHeader className="px-6 py-4 text-left">
            <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {t('export.title', 'Export Image')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t('export.description', 'Preview and export this summary as an image.')}
            </DialogDescription>
          </DialogHeader>
          <Separator />

          <div className="flex flex-wrap items-center gap-4 px-6 py-3">
            <Select
              value={theme}
              onValueChange={(value) => setTheme(value as ThemeMode)}
            >
              <SelectTrigger
                aria-label={t('export.theme', 'Theme')}
                className="w-[140px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="light">
                    {t('export.lightTheme', 'Light')}
                  </SelectItem>
                  <SelectItem value="dark">
                    {t('export.darkTheme', 'Dark')}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={showWatermark}
                onCheckedChange={toggleWatermark}
              />
              <span className="text-sm text-slate-700 dark:text-slate-200">
                {t('export.watermark', 'Watermark')}
              </span>
            </label>
          </div>
          <Separator />

          <div className="flex-1 overflow-auto p-6 custom-scrollbar">
            <div
              ref={contentRef}
              style={{
                backgroundColor: bg,
                padding: 32,
                borderRadius: 12,
                minHeight: 200
              }}
            >
              {showWatermark && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 16
                  }}
                >
                  <Logo size={24} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: text }}>
                    WebToMind
                  </span>
                </div>
              )}
              <div
                style={{ color: text }}
                dangerouslySetInnerHTML={{
                  __html: processContent(contentHtml, theme)
                }}
              />
            </div>
          </div>
          <Separator />
          <DialogFooter className="gap-3 px-6 py-4 sm:space-x-0">
            <Button
              onClick={() => {
                setShowUpgrade(false);
                onClose();
              }}
              type="button"
              variant="outline"
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleDownload}
              disabled={isGenerating}
              type="button"
            >
              {isGenerating ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <Download data-icon="inline-start" />
              )}
              {t('export.download', 'Download')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showUpgrade} onOpenChange={setShowUpgrade}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t('export.upgradeTitle', 'Premium Feature')}
            </DialogTitle>
            <DialogDescription>
              {t('export.upgradeDesc', 'Remove watermark with premium')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              onClick={() => setShowUpgrade(false)}
              type="button"
              variant="outline"
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={() => {
                setShowUpgrade(false);
                onUpgrade?.();
              }}
              type="button"
            >
              {t('export.upgrade', 'Upgrade')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
