import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent as ReactMouseEvent
} from 'react';
import { Link } from 'react-router-dom';
import { Slider } from '@/shared/ui/radix/slider';
import { ImageToolWorkspaceShell } from '@/web/components/image-tools/ImageToolShell';
import { trackEvent } from '../lib/analytics';
import { applySeo } from '../lib/seo';
import { buildPindouPatternPdfBlob } from '../lib/pindou-pdf';
import { renderPindouExportCanvas } from '../lib/pindou-export';
import { useRouteLocale } from '../lib/route-locale';
import '../styles/marketing-pages.css';
import {
  DEFAULT_PINDOU_SETTINGS,
  PINDOU_PALETTES,
  buildDemoPindouPattern,
  buildPindouCsv,
  buildPindouPattern,
  buildPindouPatternFromCells,
  clampPindouColumns,
  clampPindouMaxColors,
  clampPindouMergeThreshold,
  decodePindouShareCode,
  deserializePindouProject,
  encodePindouShareCode,
  erasePindouConnectedRegion,
  getPindouFileRejectionReason,
  getPindouImageDimensionRejectionReason,
  mergePindouSimilarColors,
  parsePindouCsv,
  replacePindouColor,
  serializePindouProject,
  setPindouCellColor,
  type PindouColor,
  type PindouUploadRejectionReason,
  type PindouPaletteId,
  type PindouPattern,
  removePindouBackground,
  type PindouSettings
} from '@/shared/pindou-pattern-maker';

const PINDOU_PROJECT_STORAGE_KEY = 'webtomind-pindou-project-v1';

type ImageSource = {
  name: string;
  width: number;
  height: number;
  image: HTMLImageElement;
};

function getText(isZh: boolean) {
  return {
    metaTitle: isZh
      ? '免费拼豆生成器 - 在线拼豆图案图纸生成'
      : 'Free Bead Pattern Ideas & Perler Bead Pattern Maker',
    title: isZh ? '免费在线拼豆图案生成器' : 'Free Perler Bead Pattern Maker',
    subtitle: isZh
      ? '拼豆生成器：上传照片或像素图，在浏览器内生成可打印拼豆图纸、色号清单和珠子数量统计，支持 8 套品牌色板与 PDF 分页导出。'
      : 'Upload a photo and generate printable bead grids, palette codes, and bead counts locally in your browser.',
    uploadTitle: isZh ? '上传图片' : 'Upload image',
    uploadHint: isZh
      ? '支持 JPG、PNG、WebP，CSV 图纸可直接导入继续编辑。图片只在本地浏览器处理，不会上传。'
      : 'JPG, PNG, WebP, and bead-grid CSV files are supported. Everything stays in this browser.',
    chooseFile: isZh ? '选择图片' : 'Choose image',
    drop: isZh ? '拖放图片到这里' : 'Drop an image here',
    controls: isZh ? '图纸设置' : 'Pattern settings',
    columns: isZh ? '宽度珠子数' : 'Beads wide',
    palette: isZh ? '色板' : 'Palette',
    maxColors: isZh ? '最多颜色' : 'Max colors',
    mode: isZh ? '像素化模式' : 'Pixelation',
    modeAverage: isZh ? '平均色' : 'Average color',
    modeDominant: isZh ? '主色（推荐）' : 'Dominant color (recommended)',
    mergeThreshold: isZh ? '杂色合并阈值' : 'Color merge',
    mergeThresholdHint: isZh
      ? '把相邻且颜色接近的格子合并成同一色，数值越大清理越多杂色。'
      : 'Merge adjacent cells that are perceptually close; higher values clean more noise.',
    removeBackground: isZh ? '自动去背景' : 'Remove background',
    showGrid: isZh ? '显示网格' : 'Show grid',
    editingTitle: isZh ? '手工编辑' : 'Manual editing',
    toolPaint: isZh ? '画笔' : 'Paint',
    toolReplace: isZh ? '整色替换' : 'Replace color',
    toolErase: isZh ? '连通擦除' : 'Erase region',
    undo: isZh ? '撤销' : 'Undo',
    redo: isZh ? '重做' : 'Redo',
    brush: isZh ? '画笔颜色' : 'Brush color',
    editHint: isZh
      ? '选择工具后点击图纸格子；整色替换会把该颜色全部换成画笔色。'
      : 'Pick a tool, then click cells on the chart. Replace swaps every cell of that color with the brush color.',
    reset: isZh ? '重置' : 'Reset',
    exportShareCode: isZh ? '导出分享码' : 'Export share code',
    importShareCode: isZh ? '导入分享码' : 'Import share code',
    shareCodeTitle: isZh ? '分享图纸' : 'Share pattern',
    shareCodeHint: isZh
      ? '把分享码发给朋友，对方粘贴导入后即可继续编辑同一张图纸。'
      : 'Send the code to a friend; they can paste it here to keep editing the same chart.',
    pasteShareCode: isZh ? '粘贴分享码' : 'Paste share code',
    copyCode: isZh ? '复制' : 'Copy',
    copied: isZh ? '已复制' : 'Copied',
    close: isZh ? '关闭' : 'Close',
    confirmImport: isZh ? '导入' : 'Import',
    shareCodeFailed: isZh
      ? '分享码导入失败，请检查是否完整复制。'
      : 'Could not import that share code. Check that it was copied completely.',
    preview: isZh ? '图案预览' : 'Pattern preview',
    exportPng: isZh ? '导出 PNG' : 'Export PNG',
    exportCsv: isZh ? '导出 CSV' : 'Export CSV',
    exportPdf: isZh ? '导出 PDF' : 'Export PDF',
    copySummary: isZh ? '复制图案说明' : 'Copy pattern summary',
    beadList: isZh ? '珠子清单' : 'Bead list',
    empty: isZh
      ? '先上传图片，或使用当前示例图案测试导出。'
      : 'Upload an image, or test exports with the demo pattern.',
    source: isZh ? '当前图片' : 'Current image',
    total: isZh ? '总珠子数' : 'Total beads',
    size: isZh ? '图纸尺寸' : 'Pattern size',
    code: isZh ? '色号' : 'Code',
    color: isZh ? '颜色' : 'Color',
    count: isZh ? '数量' : 'Count',
    gridPageTitle: isZh ? '拼豆图纸页' : 'Bead chart',
    pagePrefix: isZh ? '第' : 'Page',
    pageSuffix: isZh ? '页' : '',
    columnsWord: isZh ? '列' : 'columns',
    rowsWord: isZh ? '行' : 'rows',
    workspaceTitle: isZh
      ? '继续整理成创意方案'
      : 'Continue in Creative Workspace',
    workspaceBody: isZh
      ? '把图案说明、配色和制作步骤整理成可复用素材卡，后续可继续生成封面、教程图或小红书内容。'
      : 'Turn the pattern notes, palette, and making steps into reusable creative cards for posts, tutorials, or image prompts.',
    workspaceCta: isZh ? '进入创意工作台' : 'Open Creative Workspace',
    patternIdeasTitle: isZh ? '拼豆图案灵感' : 'Bead pattern ideas',
    patternIdeasBody: isZh
      ? '从灵感方向开始：宠物、动漫、像素画、亲子手工，选一个再用生成器出图。'
      : 'Start from an idea: pets, anime, pixel art or kids crafts — then generate the chart.',
    patternIdeas: [
      {
        title: isZh ? '宠物肖像' : 'Pet portrait',
        desc: isZh ? '50–100 珠宽 · 6–10 色' : '50-100 beads · 6-10 colors',
        href: '/blog/bead-pattern-pet-portrait'
      },
      {
        title: isZh ? '动漫同人' : 'Anime fan art',
        desc: isZh ? '40–80 珠宽 · 8–12 色' : '40-80 beads · 8-12 colors',
        href: '/blog/bead-pattern-anime-fanart'
      },
      {
        title: isZh ? '像素画' : 'Pixel art',
        desc: isZh ? '24–64 珠宽 · 4–8 色' : '24-64 beads · 4-8 colors',
        href: '/blog/bead-pattern-pixel-art'
      },
      {
        title: isZh ? '亲子手工' : 'Kids crafts',
        desc: isZh ? '30–50 珠宽 · 6–10 色' : '30-50 beads · 6-10 colors',
        href: '/blog/bead-pattern-kids-craft'
      }
    ],
    quickFactsTitle: isZh ? '拼豆生成器速览' : 'Bead pattern maker at a glance',
    quickFacts: [
      {
        name: isZh ? '价格' : 'Price',
        value: isZh
          ? '完全免费，无需注册。'
          : 'Free to use, no registration required.'
      },
      {
        name: isZh ? '隐私' : 'Privacy',
        value: isZh
          ? '转换全部在浏览器本地完成，原图不会上传。'
          : 'All conversion happens in the browser; the original image is never uploaded.'
      },
      {
        name: isZh ? '色板' : 'Palettes',
        value: isZh
          ? '8 套品牌色板：Perler、Hama、Artkal，以及 MARD、COCO、漫漫、盼盼、咪小窝 5 套中文品牌色板，共 1502 个标准色号。'
          : '8 brand palettes totaling 1502 standard color codes, including the MARD, COCO, Manman, Panpan and Mixiaowo Chinese brand sets.'
      },
      {
        name: isZh ? '导出' : 'Exports',
        value: isZh
          ? 'PNG 图纸（坐标与每格色号）、CSV 采购清单、PDF 制作说明（大图按 50×50 格分页）。'
          : 'PNG chart with coordinates and codes, CSV material list, and paginated PDF (50x50 cells per page).'
      },
      {
        name: isZh ? '尺寸' : 'Grid size',
        value: isZh
          ? '宽度 16-140 珠，最多 4-32 色。'
          : '16-140 beads wide, 4-32 colors.'
      },
      {
        name: isZh ? '编辑' : 'Editing',
        value: isZh
          ? '主色/平均色像素化、自动去背景、相似色合并、画笔、整色替换、连通擦除、撤销/重做与分享码。'
          : 'Dominant or average pixelation, background removal, color merge, paint, replace, erase, undo/redo and share codes.'
      }
    ],
    quickReferenceTitle: isZh
      ? '拼豆新手速查'
      : 'Quick reference for beginners',
    quickReference: [
      {
        name: isZh ? '选豆' : 'Choosing beads',
        value: isZh
          ? '新手先用 5mm 大颗拼豆和基础色板练手；做照片级细节再换 2.6mm 拼豆和 291 色板。'
          : 'Beginners: start with 5mm beads and a basic palette; use 2.6mm beads and 291-color palettes for detailed pieces.'
      },
      {
        name: isZh ? '配色' : 'Color planning',
        value: isZh
          ? '简单图案用基础色板就够；照片、渐变和肤色建议切到 291 色板。'
          : 'Basic palettes cover simple patterns; switch to 291-color sets for photos, gradients and skin tones.'
      },
      {
        name: isZh ? '打印' : 'Printing',
        value: isZh
          ? '按 300 DPI、A4 打印，大图按 50×50 格分页；把蓝图垫在透明拼板下对照摆豆。'
          : 'Print at 300 DPI on A4, paginate large grids at 50x50 cells, and keep the blueprint under the transparent pegboard.'
      },
      {
        name: isZh ? '熨烫' : 'Ironing',
        value: isZh
          ? '中温（约 145-165°C）画圈均匀移动，熨完趁热压重物冷却再取底板。'
          : 'Iron at medium heat (about 145-165°C) in small circles, then cool flat under weight before lifting.'
      }
    ],
    colorReferenceTitle: isZh
      ? '拼豆颜色表、色号对照表与 MARD 色卡'
      : 'Bead color charts and MARD references',
    colorReferenceBody: isZh
      ? '如果你在找拼豆颜色表、拼豆色号对照表、MARD 拼豆色卡或拼豆色号 RGB 转换表，可以先在工具里选择对应品牌色板。生成的 PNG 和 CSV 会保留每格色号；需要采购前核对 RGB/HEX 时，再打开 291 色对照表。'
      : 'If you are looking for a bead color chart, bead color code chart, MARD bead color card or RGB reference, choose the matching palette first. Generated PNG and CSV files keep each cell code visible; use the 291-color reference when checking RGB/HEX values before buying materials.',
    colorReferenceLinks: [
      {
        label: isZh ? 'MARD 拼豆色卡与色号对照表' : 'MARD bead color chart',
        description: isZh
          ? '查看 291 色 MARD 拼豆色卡，按色号对照后再备料。'
          : 'Read the 291-color MARD chart before buying beads.',
        href: '/blog/mard-bead-color-chart'
      },
      {
        label: isZh ? '打印拼豆图纸' : 'Print a bead chart',
        description: isZh
          ? '了解 300 DPI、A4 与大图分页，减少打印返工。'
          : 'Use the 300 DPI and A4 pagination guide for large charts.',
        href: '/blog/pindou-printing-guide'
      }
    ],
    lastUpdated: isZh
      ? '最后更新：2026-08-11 · WebToMind 产品团队维护'
      : 'Last reviewed: 2026-08-11 · maintained by the WebToMind product team',
    processing: isZh ? '正在生成图案...' : 'Generating pattern...',
    parseFailed: isZh
      ? '图片读取失败，请换一张图片重试。'
      : 'Could not read this image. Try another file.',
    exportFailed: isZh
      ? 'PDF 生成失败，请重试。'
      : 'Could not generate the PDF. Try again.',
    unsupportedType: isZh
      ? '仅支持 JPG、PNG 或 WebP 图片。'
      : 'Only JPG, PNG, or WebP images are supported.',
    fileTooLarge: isZh
      ? '图片文件过大，请使用 12 MB 以内的图片。'
      : 'This file is too large. Use an image under 12 MB.',
    imageTooLarge: isZh
      ? '图片尺寸过大，请使用 2400 万像素以内的图片。'
      : 'This image is too large. Use an image under 24 megapixels.'
  };
}

function getRejectionMessage(
  reason: PindouUploadRejectionReason,
  copy: ReturnType<typeof getText>
): string {
  if (reason === 'unsupported-type') return copy.unsupportedType;
  if (reason === 'file-too-large') return copy.fileTooLarge;
  return copy.imageTooLarge;
}

function getPindouCellSize(columns: number): number {
  return Math.max(5, Math.min(18, Math.floor(940 / columns)));
}

function loadSavedProject(): {
  pattern: PindouPattern;
  settings: PindouSettings;
  origin: 'demo' | 'image' | 'csv' | 'edited';
} | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PINDOU_PROJECT_STORAGE_KEY);
    return raw ? deserializePindouProject(raw) : null;
  } catch {
    return null;
  }
}

function paletteName(id: PindouPaletteId) {
  return {
    perler: 'Perler',
    hama: 'Hama',
    artkal: 'Artkal',
    mard: 'MARD',
    coco: 'COCO',
    manman: '漫漫',
    panpan: '盼盼',
    mixiaowo: '咪小窝'
  }[id];
}

function drawPindouPattern(
  canvas: HTMLCanvasElement | null,
  pattern: PindouPattern,
  showGrid: boolean
) {
  if (!canvas) return;
  const cellSize = getPindouCellSize(pattern.columns);
  const width = pattern.columns * cellSize;
  const height = pattern.rows * cellSize;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#fffaf0';
  context.fillRect(0, 0, width, height);
  for (const cell of pattern.cells) {
    if (cell.external) continue;
    context.fillStyle = cell.color.hex;
    context.fillRect(cell.x * cellSize, cell.y * cellSize, cellSize, cellSize);
  }
  if (showGrid && cellSize >= 6) {
    context.strokeStyle = 'rgba(23, 17, 13, 0.16)';
    context.lineWidth = 1;
    for (let x = 0; x <= pattern.columns; x += 1) {
      context.beginPath();
      context.moveTo(x * cellSize + 0.5, 0);
      context.lineTo(x * cellSize + 0.5, height);
      context.stroke();
    }
    for (let y = 0; y <= pattern.rows; y += 1) {
      context.beginPath();
      context.moveTo(0, y * cellSize + 0.5);
      context.lineTo(width, y * cellSize + 0.5);
      context.stroke();
    }
  }
}

async function loadImageFromFile(file: File): Promise<ImageSource> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return {
      name: file.name,
      width: image.naturalWidth,
      height: image.naturalHeight,
      image
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sampleImageToPattern(
  source: ImageSource,
  settings: Pick<
    PindouSettings,
    | 'columns'
    | 'paletteId'
    | 'maxColors'
    | 'mode'
    | 'removeBackground'
    | 'mergeThreshold'
  >
): PindouPattern {
  const columns = clampPindouColumns(settings.columns);
  const rows = Math.min(
    180,
    Math.max(16, Math.round((columns * source.height) / source.width))
  );
  const sampleScale = Math.min(1, 1600 / source.width);
  const sampleWidth = Math.max(columns, Math.round(source.width * sampleScale));
  const sampleHeight = Math.max(rows, Math.round(source.height * sampleScale));
  const canvas = document.createElement('canvas');
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Canvas is unavailable');
  }
  context.imageSmoothingEnabled = true;
  context.drawImage(source.image, 0, 0, sampleWidth, sampleHeight);
  const data = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const pixels: Array<[number, number, number]> = [];
  for (let cellY = 0; cellY < rows; cellY += 1) {
    for (let cellX = 0; cellX < columns; cellX += 1) {
      const startX = Math.floor((cellX * sampleWidth) / columns);
      const endX = Math.min(
        sampleWidth,
        Math.ceil(((cellX + 1) * sampleWidth) / columns)
      );
      const startY = Math.floor((cellY * sampleHeight) / rows);
      const endY = Math.min(
        sampleHeight,
        Math.ceil(((cellY + 1) * sampleHeight) / rows)
      );
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let pixelCount = 0;
      const counts = new Map<string, number>();
      const rgbByKey = new Map<string, [number, number, number]>();
      let dominant: [number, number, number] | null = null;
      let maxCount = 0;
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const index = (y * sampleWidth + x) * 4;
          if (data[index + 3] < 128) continue;
          const rgb: [number, number, number] = [
            data[index],
            data[index + 1],
            data[index + 2]
          ];
          pixelCount += 1;
          if (settings.mode === 'average') {
            rSum += rgb[0];
            gSum += rgb[1];
            bSum += rgb[2];
          } else {
            const key = `${rgb[0]},${rgb[1]},${rgb[2]}`;
            const nextCount = (counts.get(key) || 0) + 1;
            counts.set(key, nextCount);
            rgbByKey.set(key, rgb);
            if (nextCount > maxCount) {
              maxCount = nextCount;
              dominant = rgb;
            }
          }
        }
      }
      if (pixelCount === 0) {
        pixels.push([250, 245, 234]);
      } else if (settings.mode === 'average') {
        pixels.push([
          Math.round(rSum / pixelCount),
          Math.round(gSum / pixelCount),
          Math.round(bSum / pixelCount)
        ]);
      } else {
        pixels.push(dominant as [number, number, number]);
      }
    }
  }
  let pattern = buildPindouPattern({
    pixels,
    columns,
    rows,
    paletteId: settings.paletteId,
    maxColors: settings.maxColors
  });
  if (settings.mergeThreshold > 0) {
    pattern = mergePindouSimilarColors(pattern, settings.mergeThreshold);
  }
  return settings.removeBackground ? removePindouBackground(pattern) : pattern;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function PindouPatternMakerPage() {
  const { locale, isZh } = useRouteLocale();
  const copy = getText(isZh);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [settings, setSettings] = useState<PindouSettings>(
    () => loadSavedProject()?.settings || DEFAULT_PINDOU_SETTINGS
  );
  const [source, setSource] = useState<ImageSource | null>(null);
  const [pattern, setPattern] = useState<PindouPattern>(
    () =>
      loadSavedProject()?.pattern ||
      buildDemoPindouPattern(DEFAULT_PINDOU_SETTINGS.paletteId)
  );
  const [patternOrigin, setPatternOrigin] = useState<
    'demo' | 'image' | 'csv' | 'edited'
  >(() => loadSavedProject()?.origin || 'demo');
  const [brushColor, setBrushColor] = useState<PindouColor | null>(null);
  const [tool, setTool] = useState<'paint' | 'replace' | 'erase' | null>(null);
  const [history, setHistory] = useState<PindouPattern[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [csvFileName, setCsvFileName] = useState('');
  const [sharePanel, setSharePanel] = useState<'export' | 'import' | null>(
    null
  );
  const [shareCodeText, setShareCodeText] = useState('');
  const [importedCode, setImportedCode] = useState('');
  const [copied, setCopied] = useState(false);
  const historyRef = useRef<PindouPattern[]>([]);
  const historyIndexRef = useRef(-1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const localePrefix = locale === 'en-US' ? '/en-US' : '/zh-CN';
  const totalBeads = useMemo(
    () => pattern.counts.reduce((sum, item) => sum + item.count, 0),
    [pattern.counts]
  );
  const conversionSettings = useMemo(
    () => ({
      columns: settings.columns,
      paletteId: settings.paletteId,
      maxColors: settings.maxColors,
      mode: settings.mode,
      removeBackground: settings.removeBackground,
      mergeThreshold: settings.mergeThreshold
    }),
    [
      settings.columns,
      settings.maxColors,
      settings.mode,
      settings.paletteId,
      settings.removeBackground,
      settings.mergeThreshold
    ]
  );
  const isLockedPattern = patternOrigin === 'csv' || patternOrigin === 'edited';

  useEffect(() => {
    return applySeo({
      title: copy.metaTitle,
      description: copy.subtitle,
      htmlLang: locale === 'en-US' ? 'en' : 'zh-CN'
    });
  }, [copy.metaTitle, copy.subtitle, locale]);

  useEffect(() => {
    if (isLockedPattern) return;
    if (!source) {
      setPattern(buildDemoPindouPattern(conversionSettings.paletteId));
      return;
    }
    setIsProcessing(true);
    const timer = window.setTimeout(() => {
      try {
        setPattern(sampleImageToPattern(source, conversionSettings));
        setError('');
      } catch {
        setError(copy.parseFailed);
      } finally {
        setIsProcessing(false);
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [copy.parseFailed, conversionSettings, isLockedPattern, source]);

  useEffect(() => {
    if (patternOrigin === 'demo') return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          PINDOU_PROJECT_STORAGE_KEY,
          serializePindouProject(pattern, settings, patternOrigin)
        );
      } catch {
        // Storage can be full or blocked; the session stays usable.
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [pattern, patternOrigin, settings]);

  useEffect(() => {
    if (!brushColor && pattern.counts[0]) {
      setBrushColor(pattern.counts[0]);
    }
  }, [brushColor, pattern.counts]);

  useEffect(() => {
    historyRef.current = [pattern];
    historyIndexRef.current = 0;
    setHistory([pattern]);
    setHistoryIndex(0);
    // Initialize the undo stack once on mount with the restored pattern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (historyRef.current.length === 0) {
      historyRef.current = [pattern];
      historyIndexRef.current = 0;
      setHistory([pattern]);
      setHistoryIndex(0);
    }
  }, [pattern]);

  useEffect(() => {
    drawPindouPattern(canvasRef.current, pattern, settings.showGrid);
  }, [pattern, settings.showGrid]);

  const clearHistory = () => {
    historyRef.current = [];
    historyIndexRef.current = -1;
    setHistory([]);
    setHistoryIndex(-1);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const fileRejection = getPindouFileRejectionReason(file);
    if (fileRejection) {
      setError(getRejectionMessage(fileRejection, copy));
      return;
    }
    setIsProcessing(true);
    try {
      const image = await loadImageFromFile(file);
      const dimensionRejection = getPindouImageDimensionRejectionReason(image);
      if (dimensionRejection) {
        setError(getRejectionMessage(dimensionRejection, copy));
        return;
      }
      setSource(image);
      setPatternOrigin('image');
      setCsvFileName('');
      setTool(null);
      clearHistory();
      setError('');
      trackEvent('pindou_image_loaded', {
        width: image.width,
        height: image.height,
        palette: settings.paletteId
      });
    } catch {
      setError(copy.parseFailed);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCsvFile = async (file: File) => {
    try {
      const text = await file.text();
      const grid = parsePindouCsv(text);
      const next = buildPindouPatternFromCells(
        grid.cells,
        grid.columns,
        grid.rows,
        settings.paletteId
      );
      clearHistory();
      setPattern(next);
      setPatternOrigin('csv');
      setCsvFileName(file.name);
      setSource(null);
      setBrushColor(next.counts[0] || null);
      setTool(null);
      setError('');
      trackEvent('pindou_csv_imported', {
        columns: grid.columns,
        rows: grid.rows
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : copy.parseFailed);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.type.includes('csv') || /\.csv$/i.test(file.name)) {
      void handleCsvFile(file);
      return;
    }
    void handleFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type.includes('csv') || /\.csv$/i.test(file.name)) {
      void handleCsvFile(file);
      return;
    }
    void handleFile(file);
  };

  const handleExportPng = () => {
    try {
      const exportCanvas = renderPindouExportCanvas(pattern, {
        showCoordinates: true,
        showCellCodes: true,
        gridInterval: 10,
        sourceName:
          source?.name ||
          (patternOrigin === 'csv' ? csvFileName || 'csv' : 'demo'),
        totalBeads,
        copy: {
          title: copy.title,
          subtitle: copy.subtitle,
          size: copy.size,
          total: copy.total,
          source: copy.source,
          beadList: copy.beadList,
          code: copy.code,
          color: copy.color,
          count: copy.count,
          totalLabel: copy.total,
          brand: 'WebToMind'
        }
      });
      exportCanvas.toBlob((blob) => {
        if (!blob) return;
        downloadBlob(blob, 'webtomind-pindou-pattern.png');
        trackEvent('pindou_export', { format: 'png' });
      }, 'image/png');
    } catch {
      setError(copy.exportFailed);
    }
  };

  const handleExportCsv = () => {
    downloadBlob(
      new Blob([buildPindouCsv(pattern)], { type: 'text/csv;charset=utf-8' }),
      'webtomind-pindou-pattern.csv'
    );
    trackEvent('pindou_export', { format: 'csv' });
  };

  const handleExportPdf = async () => {
    const dataUrl = canvasRef.current?.toDataURL('image/png');
    if (!dataUrl) return;
    try {
      const blob = await buildPindouPatternPdfBlob({
        pattern,
        imageDataUrl: dataUrl,
        sourceName: source?.name || 'demo',
        totalBeads,
        copy: {
          title: copy.title,
          size: copy.size,
          total: copy.total,
          source: copy.source,
          beadList: copy.beadList,
          code: copy.code,
          color: copy.color,
          count: copy.count,
          gridPageTitle: copy.gridPageTitle,
          pagePrefix: copy.pagePrefix,
          pageSuffix: copy.pageSuffix,
          columnsWord: copy.columnsWord,
          rowsWord: copy.rowsWord
        }
      });
      downloadBlob(blob, 'webtomind-pindou-pattern.pdf');
      setError('');
      trackEvent('pindou_export', { format: 'pdf' });
    } catch {
      setError(copy.exportFailed);
    }
  };

  const commitEdit = (next: PindouPattern) => {
    if (next === pattern) return;
    let nextHistory = [
      ...historyRef.current.slice(0, historyIndexRef.current + 1),
      next
    ];
    let nextIndex = nextHistory.length - 1;
    if (nextHistory.length > 60) {
      nextHistory = nextHistory.slice(nextHistory.length - 60);
      nextIndex = nextHistory.length - 1;
    }
    historyRef.current = nextHistory;
    historyIndexRef.current = nextIndex;
    setHistory(nextHistory);
    setHistoryIndex(nextIndex);
    setPattern(next);
    setPatternOrigin('edited');
    trackEvent('pindou_edit', { tool });
  };

  const handleUndo = () => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    setHistoryIndex(historyIndexRef.current);
    setPattern(historyRef.current[historyIndexRef.current]);
  };

  const handleRedo = () => {
    if (historyIndexRef.current + 1 >= historyRef.current.length) return;
    historyIndexRef.current += 1;
    setHistoryIndex(historyIndexRef.current);
    setPattern(historyRef.current[historyIndexRef.current]);
  };

  const handleCanvasClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !tool) return;
    const rect = canvas.getBoundingClientRect();
    const cellSize = getPindouCellSize(pattern.columns);
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    const cellX = Math.floor((event.clientX - rect.left) / scaleX / cellSize);
    const cellY = Math.floor((event.clientY - rect.top) / scaleY / cellSize);
    if (
      cellX < 0 ||
      cellY < 0 ||
      cellX >= pattern.columns ||
      cellY >= pattern.rows
    ) {
      return;
    }
    if (tool === 'paint') {
      if (!brushColor) return;
      commitEdit(setPindouCellColor(pattern, cellX, cellY, brushColor));
      return;
    }
    if (tool === 'replace') {
      const target = pattern.cells[cellY * pattern.columns + cellX];
      if (!target || target.external || !brushColor) return;
      commitEdit(replacePindouColor(pattern, target.color.code, brushColor));
      return;
    }
    commitEdit(erasePindouConnectedRegion(pattern, cellX, cellY));
  };

  const handleReset = () => {
    try {
      window.localStorage.removeItem(PINDOU_PROJECT_STORAGE_KEY);
    } catch {
      // ignore storage errors during reset
    }
    setSource(null);
    setPattern(buildDemoPindouPattern(DEFAULT_PINDOU_SETTINGS.paletteId));
    setSettings(DEFAULT_PINDOU_SETTINGS);
    setPatternOrigin('demo');
    setCsvFileName('');
    setTool(null);
    setBrushColor(null);
    setSharePanel(null);
    setImportedCode('');
    clearHistory();
    setError('');
  };

  const handleExportShareCode = () => {
    try {
      setShareCodeText(encodePindouShareCode(pattern));
      setSharePanel('export');
      setCopied(false);
      trackEvent('pindou_share_code_export', { columns: pattern.columns });
    } catch {
      setError(copy.shareCodeFailed);
    }
  };

  const copyTextToClipboard = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        textarea.remove();
        if (!ok) throw new Error('Copy failed');
        return true;
      } catch {
        return false;
      }
    }
  };

  const handleCopyShareCode = async () => {
    const ok = await copyTextToClipboard(shareCodeText);
    if (!ok) {
      setError(copy.shareCodeFailed);
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handleCopySummary = async () => {
    const summary = [
      `${copy.title} · ${pattern.columns} x ${pattern.rows} · ${copy.total}: ${totalBeads} · ${pattern.counts.length} ${copy.color}`,
      `${copy.palette}: ${paletteName(settings.paletteId)}`,
      copy.beadList,
      ...pattern.counts.map(
        (item) => `${item.code} · ${item.name || item.hex} · ${item.count}`
      )
    ].join('\n');
    const ok = await copyTextToClipboard(summary);
    if (!ok) {
      setError(copy.shareCodeFailed);
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
    trackEvent('pindou_copy_summary', { colors: pattern.counts.length });
  };

  const handleImportShareCode = () => {
    try {
      const next = decodePindouShareCode(importedCode);
      clearHistory();
      setPattern(next);
      setPatternOrigin('csv');
      setCsvFileName('share-code');
      setSource(null);
      setBrushColor(next.counts[0] || null);
      setTool(null);
      setSharePanel(null);
      setImportedCode('');
      setError('');
      trackEvent('pindou_share_code_import', { columns: next.columns });
    } catch {
      setError(copy.shareCodeFailed);
    }
  };

  return (
    <ImageToolWorkspaceShell
      title={copy.title}
      subtitle={copy.subtitle}
      processing="local"
      className="pindou-maker-page"
    >
      <section className="pindou-maker-layout">
        <aside className="pindou-maker-panel">
          <label
            className="pindou-maker-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <span>{copy.uploadTitle}</span>
            <strong>{copy.drop}</strong>
            <small>{copy.uploadHint}</small>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,.csv,text/csv"
              onChange={handleFileChange}
            />
          </label>
          <div className="pindou-maker-controls">
            <h2>{copy.controls}</h2>
            <label>
              <span>{copy.columns}</span>
              <Slider
                min={16}
                max={140}
                step={2}
                value={[settings.columns]}
                aria-label={copy.columns}
                thumbAriaLabel={copy.columns}
                onValueChange={(value) =>
                  setSettings((current) => ({
                    ...current,
                    columns: clampPindouColumns(value[0])
                  }))
                }
              />
              <strong>{settings.columns}</strong>
            </label>
            <label>
              <span>{copy.palette}</span>
              <select
                value={settings.paletteId}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    paletteId: event.target.value as PindouPaletteId
                  }))
                }
              >
                {Object.keys(PINDOU_PALETTES).map((id) => (
                  <option key={id} value={id}>
                    {paletteName(id as PindouPaletteId)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{copy.maxColors}</span>
              <input
                type="number"
                min={4}
                max={32}
                value={settings.maxColors}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    maxColors: clampPindouMaxColors(Number(event.target.value))
                  }))
                }
              />
            </label>
            <label>
              <span>{copy.mode}</span>
              <select
                value={settings.mode}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    mode: event.target.value as PindouSettings['mode']
                  }))
                }
              >
                <option value="dominant">{copy.modeDominant}</option>
                <option value="average">{copy.modeAverage}</option>
              </select>
            </label>
            <label>
              <span>{copy.mergeThreshold}</span>
              <Slider
                min={0}
                max={40}
                step={1}
                value={[settings.mergeThreshold]}
                aria-label={copy.mergeThreshold}
                thumbAriaLabel={copy.mergeThreshold}
                onValueChange={(value) =>
                  setSettings((current) => ({
                    ...current,
                    mergeThreshold: clampPindouMergeThreshold(value[0])
                  }))
                }
              />
              <strong>{settings.mergeThreshold}</strong>
              <small>{copy.mergeThresholdHint}</small>
            </label>
            <label className="pindou-maker-check">
              <input
                type="checkbox"
                checked={settings.removeBackground}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    removeBackground: event.target.checked
                  }))
                }
              />
              <span>{copy.removeBackground}</span>
            </label>
            <label className="pindou-maker-check">
              <input
                type="checkbox"
                checked={settings.showGrid}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    showGrid: event.target.checked
                  }))
                }
              />
              <span>{copy.showGrid}</span>
            </label>
          </div>
          <div className="pindou-maker-summary">
            <p>{copy.source}</p>
            <strong>
              {source?.name ||
                (patternOrigin === 'csv' ? csvFileName || 'CSV' : copy.empty)}
            </strong>
            <dl>
              <div>
                <dt>{copy.size}</dt>
                <dd>
                  {pattern.columns} x {pattern.rows}
                </dd>
              </div>
              <div>
                <dt>{copy.total}</dt>
                <dd>{totalBeads}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="pindou-maker-reset"
              onClick={handleReset}
            >
              {copy.reset}
            </button>
          </div>
        </aside>

        <section className="pindou-maker-preview-panel">
          <div className="pindou-maker-preview-head">
            <div>
              <h2>{copy.preview}</h2>
              <p>
                {paletteName(settings.paletteId)} · {pattern.counts.length}{' '}
                {copy.color}
              </p>
            </div>
            <div className="pindou-maker-export-actions">
              <button type="button" onClick={handleExportPng}>
                {copy.exportPng}
              </button>
              <button type="button" onClick={handleExportCsv}>
                {copy.exportCsv}
              </button>
              <button type="button" onClick={handleExportPdf}>
                {copy.exportPdf}
              </button>
              <button type="button" onClick={handleCopySummary}>
                {copied ? copy.copied : copy.copySummary}
              </button>
            </div>
          </div>
          <div className="pindou-maker-edit-bar">
            <div className="pindou-maker-edit-tools">
              <h2>{copy.editingTitle}</h2>
              <button
                type="button"
                className={tool === 'paint' ? 'is-active' : ''}
                onClick={() =>
                  setTool((current) => (current === 'paint' ? null : 'paint'))
                }
              >
                {copy.toolPaint}
              </button>
              <button
                type="button"
                className={tool === 'replace' ? 'is-active' : ''}
                onClick={() =>
                  setTool((current) =>
                    current === 'replace' ? null : 'replace'
                  )
                }
              >
                {copy.toolReplace}
              </button>
              <button
                type="button"
                className={tool === 'erase' ? 'is-active' : ''}
                onClick={() =>
                  setTool((current) => (current === 'erase' ? null : 'erase'))
                }
              >
                {copy.toolErase}
              </button>
              <button
                type="button"
                onClick={handleUndo}
                disabled={historyIndex <= 0}
              >
                {copy.undo}
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={historyIndex + 1 >= history.length}
              >
                {copy.redo}
              </button>
              <button type="button" onClick={handleExportShareCode}>
                {copy.exportShareCode}
              </button>
              <button type="button" onClick={() => setSharePanel('import')}>
                {copy.importShareCode}
              </button>
            </div>
            {tool === 'paint' || tool === 'replace' ? (
              <label className="pindou-maker-brush">
                <span>{copy.brush}</span>
                <select
                  value={brushColor?.code || ''}
                  onChange={(event) => {
                    const code = event.target.value;
                    setBrushColor(
                      PINDOU_PALETTES[settings.paletteId].find(
                        (color) => color.code === code
                      ) || null
                    );
                  }}
                >
                  {PINDOU_PALETTES[settings.paletteId].map((color) => (
                    <option key={color.code} value={color.code}>
                      {color.code} · {color.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {sharePanel && (
            <div className="pindou-maker-share-panel">
              <div className="pindou-maker-share-head">
                <strong>{copy.shareCodeTitle}</strong>
                <button type="button" onClick={() => setSharePanel(null)}>
                  {copy.close}
                </button>
              </div>
              <p>{copy.shareCodeHint}</p>
              {sharePanel === 'export' ? (
                <>
                  <textarea
                    readOnly
                    rows={4}
                    value={shareCodeText}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button type="button" onClick={handleCopyShareCode}>
                    {copied ? copy.copied : copy.copyCode}
                  </button>
                </>
              ) : (
                <>
                  <textarea
                    rows={4}
                    value={importedCode}
                    placeholder={copy.pasteShareCode}
                    onChange={(event) => setImportedCode(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={handleImportShareCode}
                    disabled={!importedCode.trim()}
                  >
                    {copy.confirmImport}
                  </button>
                </>
              )}
            </div>
          )}
          {tool && <p className="pindou-maker-edit-hint">{copy.editHint}</p>}
          <div className="pindou-maker-canvas-wrap" aria-busy={isProcessing}>
            <canvas
              ref={canvasRef}
              aria-label={copy.preview}
              onClick={handleCanvasClick}
              style={tool ? { cursor: 'crosshair' } : undefined}
            />
            {isProcessing && <span>{copy.processing}</span>}
          </div>
          {error && <p className="pindou-maker-error">{error}</p>}
          <div className="pindou-maker-counts">
            <h2>{copy.beadList}</h2>
            <table>
              <thead>
                <tr>
                  <th>{copy.code}</th>
                  <th>{copy.color}</th>
                  <th>{copy.count}</th>
                </tr>
              </thead>
              <tbody>
                {pattern.counts.map((item) => (
                  <tr
                    key={item.code}
                    className={
                      brushColor?.code === item.code && tool === 'paint'
                        ? 'is-brush'
                        : ''
                    }
                    onClick={() => setBrushColor(item)}
                  >
                    <td>
                      <span
                        className="pindou-maker-swatch"
                        style={{ backgroundColor: item.hex }}
                      />
                      {item.code}
                    </td>
                    <td>{item.name}</td>
                    <td>{item.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="pindou-maker-workspace-cta">
        <div>
          <h2>{copy.workspaceTitle}</h2>
          <p>{copy.workspaceBody}</p>
        </div>
        <Link to={`${localePrefix}/create?source=seo_pindou_pattern_maker`}>
          {copy.workspaceCta}
        </Link>
      </section>

      <section className="pindou-maker-ideas">
        <div className="pindou-maker-ideas-head">
          <h2>{copy.patternIdeasTitle}</h2>
          <p>{copy.patternIdeasBody}</p>
        </div>
        <ul className="pindou-maker-ideas-list">
          {copy.patternIdeas.map((item) => (
            <li key={item.href}>
              <Link to={`${localePrefix}${item.href}`}>
                <strong>{item.title}</strong>
                <span>{item.desc}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="pindou-maker-facts"
        aria-labelledby="pindou-quick-facts-title"
      >
        <div className="pindou-maker-ideas-head">
          <h2 id="pindou-quick-facts-title">{copy.quickFactsTitle}</h2>
        </div>
        <dl className="pindou-maker-facts-grid">
          {copy.quickFacts.map((item) => (
            <div key={item.name}>
              <dt>{item.name}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        className="pindou-maker-facts"
        aria-labelledby="pindou-quick-reference-title"
      >
        <div className="pindou-maker-ideas-head">
          <h2 id="pindou-quick-reference-title">{copy.quickReferenceTitle}</h2>
        </div>
        <dl className="pindou-maker-facts-grid">
          {copy.quickReference.map((item) => (
            <div key={item.name}>
              <dt>{item.name}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        className="pindou-maker-facts"
        aria-labelledby="pindou-color-reference-title"
      >
        <div className="pindou-maker-ideas-head">
          <h2 id="pindou-color-reference-title">{copy.colorReferenceTitle}</h2>
          <p>{copy.colorReferenceBody}</p>
        </div>
        <ul className="pindou-maker-ideas-list">
          {copy.colorReferenceLinks.map((item) => (
            <li key={item.href}>
              <Link to={`${localePrefix}${item.href}`}>
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="pindou-maker-last-updated">{copy.lastUpdated}</p>
    </ImageToolWorkspaceShell>
  );
}
