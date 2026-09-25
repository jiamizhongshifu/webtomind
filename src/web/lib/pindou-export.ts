import type { PindouPattern } from '@/shared/pindou-pattern-maker';

/**
 * Printable PNG export for the pindou pattern maker: branded title bar,
 * optional coordinates, per-cell color codes, section grid lines and a
 * material-count section, matching the quality of leading bead tools.
 */

const CELL_SIZE = 30;
const TITLE_BAR_HEIGHT = 84;
const FOOTER_HEIGHT = 34;
const STATS_PADDING = 16;
const STATS_HEADER_HEIGHT = 40;
const STATS_ROW_HEIGHT = 32;
const STATS_FOOTER_HEIGHT = 34;

const FONT_STACK = [
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'Roboto',
  '"PingFang SC"',
  '"Hiragino Sans GB"',
  '"Microsoft YaHei"',
  '"Noto Sans CJK SC"',
  'sans-serif'
].join(', ');

export interface PindouExportOptions {
  showCoordinates?: boolean;
  showCellCodes?: boolean;
  gridInterval?: number;
}

export interface PindouExportCopy {
  title: string;
  subtitle: string;
  size: string;
  total: string;
  source: string;
  beadList: string;
  code: string;
  color: string;
  count: string;
  totalLabel: string;
  brand: string;
}

export interface PindouExportLayout {
  cellSize: number;
  axisSize: number;
  sideMargin: number;
  gridWidth: number;
  gridHeight: number;
  titleBarHeight: number;
  statsHeight: number;
  footerHeight: number;
  width: number;
  height: number;
}

export function computePindouExportLayout(
  pattern: PindouPattern,
  options: PindouExportOptions = {}
): PindouExportLayout {
  const showCoordinates = options.showCoordinates ?? true;
  const axisSize = showCoordinates ? 34 : 0;
  const sideMargin = showCoordinates ? 30 : 16;
  const gridWidth = pattern.columns * CELL_SIZE;
  const gridHeight = pattern.rows * CELL_SIZE;
  const availableStatsWidth = Math.max(
    200,
    gridWidth + sideMargin * 2 - STATS_PADDING * 2
  );
  const statsColumns = Math.max(
    1,
    Math.min(4, Math.floor(availableStatsWidth / 250))
  );
  const statsRows = Math.ceil(Math.max(1, pattern.counts.length) / statsColumns);
  const statsHeight =
    STATS_PADDING +
    STATS_HEADER_HEIGHT +
    statsRows * STATS_ROW_HEIGHT +
    STATS_FOOTER_HEIGHT;
  const width = sideMargin * 2 + axisSize * 2 + gridWidth;
  const height =
    TITLE_BAR_HEIGHT +
    axisSize * 2 +
    gridHeight +
    statsHeight +
    FOOTER_HEIGHT;
  return {
    cellSize: CELL_SIZE,
    axisSize,
    sideMargin,
    gridWidth,
    gridHeight,
    titleBarHeight: TITLE_BAR_HEIGHT,
    statsHeight,
    footerHeight: FOOTER_HEIGHT,
    width,
    height
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ];
}

function getContrastColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.55 ? '#1f2937' : '#ffffff';
}

function truncateText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && context.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

export function renderPindouExportCanvas(
  pattern: PindouPattern,
  options: PindouExportOptions & {
    sourceName: string;
    totalBeads: number;
    copy: PindouExportCopy;
  }
): HTMLCanvasElement {
  const layout = computePindouExportLayout(pattern, options);
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is unavailable');
  }
  const { copy } = options;
  const gridLeft = layout.sideMargin + layout.axisSize;
  const gridTop = layout.titleBarHeight + layout.axisSize;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, layout.width, layout.height);

  // Title bar
  context.fillStyle = '#1f2937';
  context.fillRect(0, 0, layout.width, layout.titleBarHeight);
  context.textBaseline = 'middle';
  context.textAlign = 'left';
  context.font = `bold 30px ${FONT_STACK}`;
  context.fillStyle = '#ffffff';
  context.fillText(
    truncateText(context, copy.title, layout.width - 320),
    layout.sideMargin,
    layout.titleBarHeight * 0.38
  );
  context.font = `16px ${FONT_STACK}`;
  context.fillStyle = 'rgba(255, 255, 255, 0.75)';
  context.fillText(
    truncateText(context, copy.subtitle, layout.width - 320),
    layout.sideMargin,
    layout.titleBarHeight * 0.72
  );
  context.textAlign = 'right';
  context.font = `bold 18px ${FONT_STACK}`;
  context.fillStyle = '#ffffff';
  context.fillText(
    copy.brand,
    layout.width - layout.sideMargin,
    layout.titleBarHeight * 0.5
  );

  // Coordinate axes
  if (layout.axisSize > 0) {
    context.fillStyle = '#f3f4f6';
    context.fillRect(
      gridLeft,
      layout.titleBarHeight,
      layout.gridWidth,
      layout.axisSize
    );
    context.fillRect(
      gridLeft,
      layout.titleBarHeight + layout.axisSize + layout.gridHeight,
      layout.gridWidth,
      layout.axisSize
    );
    context.fillRect(
      layout.sideMargin,
      gridTop,
      layout.axisSize,
      layout.gridHeight
    );
    context.fillRect(
      layout.sideMargin + layout.axisSize + layout.gridWidth,
      gridTop,
      layout.axisSize,
      layout.gridHeight
    );
    const interval = options.gridInterval ?? 10;
    context.font = `13px ${FONT_STACK}`;
    context.fillStyle = '#374151';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const shouldLabel = (value: number) =>
      value === 0 || (value + 1) % interval === 0 || value === pattern.columns - 1;
    for (let i = 0; i < pattern.columns; i += 1) {
      if (!shouldLabel(i)) continue;
      const x = gridLeft + i * layout.cellSize + layout.cellSize / 2;
      context.fillText(
        String(i + 1),
        x,
        layout.titleBarHeight + layout.axisSize / 2
      );
      context.fillText(
        String(i + 1),
        x,
        layout.titleBarHeight + layout.axisSize + layout.gridHeight + layout.axisSize / 2
      );
    }
    const shouldLabelRow = (value: number) =>
      value === 0 || (value + 1) % interval === 0 || value === pattern.rows - 1;
    for (let j = 0; j < pattern.rows; j += 1) {
      if (!shouldLabelRow(j)) continue;
      const y = gridTop + j * layout.cellSize + layout.cellSize / 2;
      context.fillText(String(j + 1), layout.sideMargin + layout.axisSize / 2, y);
      context.fillText(
        String(j + 1),
        layout.sideMargin + layout.axisSize + layout.gridWidth + layout.axisSize / 2,
        y
      );
    }
  }

  // Cells
  const showCodes = options.showCellCodes ?? true;
  for (const cell of pattern.cells) {
    const x = gridLeft + cell.x * layout.cellSize;
    const y = gridTop + cell.y * layout.cellSize;
    if (!cell.external) {
      context.fillStyle = cell.color.hex;
      context.fillRect(x, y, layout.cellSize, layout.cellSize);
      if (showCodes && !cell.color.code.startsWith('#')) {
        context.font = `bold 13px ${FONT_STACK}`;
        context.fillStyle = getContrastColor(cell.color.hex);
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(
          cell.color.code,
          x + layout.cellSize / 2,
          y + layout.cellSize / 2
        );
      }
    }
    context.strokeStyle = '#e5e7eb';
    context.lineWidth = 0.5;
    context.strokeRect(x + 0.5, y + 0.5, layout.cellSize - 1, layout.cellSize - 1);
  }

  // Section lines
  const interval = options.gridInterval ?? 10;
  context.strokeStyle = '#111827';
  context.lineWidth = 1.5;
  for (let i = interval; i < pattern.columns; i += interval) {
    const x = gridLeft + i * layout.cellSize;
    context.beginPath();
    context.moveTo(x, gridTop);
    context.lineTo(x, gridTop + layout.gridHeight);
    context.stroke();
  }
  for (let j = interval; j < pattern.rows; j += interval) {
    const y = gridTop + j * layout.cellSize;
    context.beginPath();
    context.moveTo(gridLeft, y);
    context.lineTo(gridLeft + layout.gridWidth, y);
    context.stroke();
  }
  context.strokeStyle = '#000000';
  context.lineWidth = 1.5;
  context.strokeRect(
    gridLeft + 0.5,
    gridTop + 0.5,
    layout.gridWidth,
    layout.gridHeight
  );

  // Stats section
  const statsTop = gridTop + layout.gridHeight + layout.axisSize;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.font = `bold 22px ${FONT_STACK}`;
  context.fillStyle = '#111827';
  context.fillText(
    copy.beadList,
    layout.sideMargin,
    statsTop + STATS_PADDING + STATS_HEADER_HEIGHT / 2
  );
  const statsColumns = Math.max(
    1,
    Math.min(4, Math.floor((layout.width - STATS_PADDING * 2) / 250))
  );
  const itemWidth = Math.floor((layout.width - STATS_PADDING * 2) / statsColumns);
  const firstRowY = statsTop + STATS_PADDING + STATS_HEADER_HEIGHT;
  pattern.counts.forEach((item, index) => {
    const col = index % statsColumns;
    const row = Math.floor(index / statsColumns);
    const x = STATS_PADDING + col * itemWidth;
    const y = firstRowY + row * STATS_ROW_HEIGHT + STATS_ROW_HEIGHT / 2;
    const swatchSize = 18;
    context.fillStyle = item.hex;
    context.fillRect(x, y - swatchSize / 2, swatchSize, swatchSize);
    context.strokeStyle = '#d1d5db';
    context.lineWidth = 1;
    context.strokeRect(x + 0.5, y - swatchSize / 2 + 0.5, swatchSize, swatchSize);
    context.font = `bold 15px ${FONT_STACK}`;
    context.fillStyle = '#111827';
    context.fillText(item.code, x + swatchSize + 8, y);
    const nameWidth = item.name ? 170 : 0;
    if (item.name) {
      context.font = `14px ${FONT_STACK}`;
      context.fillStyle = '#6b7280';
      context.fillText(
        truncateText(context, item.name, nameWidth - 4),
        x + swatchSize + 8 + 74,
        y
      );
    }
    context.font = `14px ${FONT_STACK}`;
    context.fillStyle = '#374151';
    context.textAlign = 'right';
    context.fillText(
      `${item.count} ${copy.count}`,
      x + itemWidth - 8,
      y
    );
    context.textAlign = 'left';
  });
  const totalY =
    firstRowY +
    Math.ceil(Math.max(1, pattern.counts.length) / statsColumns) *
      STATS_ROW_HEIGHT;
  context.font = `bold 16px ${FONT_STACK}`;
  context.fillStyle = '#111827';
  context.textAlign = 'left';
  context.fillText(
    `${copy.totalLabel}: ${options.totalBeads}`,
    layout.sideMargin,
    totalY + STATS_FOOTER_HEIGHT / 2
  );

  // Footer
  const footerY = layout.height - FOOTER_HEIGHT / 2;
  context.font = `14px ${FONT_STACK}`;
  context.fillStyle = '#9ca3af';
  context.textAlign = 'left';
  context.fillText(
    truncateText(context, `${copy.source}: ${options.sourceName}`, layout.width / 2),
    layout.sideMargin,
    footerY
  );
  context.textAlign = 'right';
  context.fillText(
    `${copy.size}: ${pattern.columns} x ${pattern.rows}`,
    layout.width - layout.sideMargin,
    footerY
  );

  return canvas;
}
