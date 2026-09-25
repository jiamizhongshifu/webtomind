import { jsPDF } from 'jspdf';
import type { PindouPattern } from '@/shared/pindou-pattern-maker';

/**
 * Client-side PDF export for the pindou pattern maker.
 *
 * Pages are rendered to canvas first so the PDF keeps the user's locale text
 * (including CJK) without embedding a font file; jsPDF only assembles the A4
 * pages. Everything stays in the browser.
 */

const PAGE_WIDTH = 1240; // A4 @ 150dpi
const PAGE_HEIGHT = 1754;
const MARGIN = 80;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const TITLE_HEIGHT = 100;
const META_HEIGHT = 60;
const GAP = 44;
const IMAGE_MAX_HEIGHT = 880;

/** Grid chart pages: each page shows at most a 50x50 tile of the pattern. */
const GRID_TILE_COLUMNS = 50;
const GRID_TILE_ROWS = 50;

// Grid pages are rendered at 2x the A4 150dpi size so per-cell codes stay
// crisp after jsPDF scales the canvas into the final page.
const GRID_PAGE_WIDTH = PAGE_WIDTH * 2;
const GRID_PAGE_HEIGHT = PAGE_HEIGHT * 2;
const GRID_MARGIN = 80;
const GRID_HEADER_HEIGHT = 150;
const GRID_FOOTER_HEIGHT = 70;
const GRID_AXIS_SIZE = 64;
const GRID_SIDE_MARGIN = 32;
const GRID_CELL_SIZE = 39;
const GRID_CODE_FONT_SIZE = 17;
const GRID_AXIS_FONT_SIZE = 20;

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

export interface PindouPdfCopy {
  title: string;
  size: string;
  total: string;
  source: string;
  beadList: string;
  code: string;
  color: string;
  count: string;
  gridPageTitle: string;
  pagePrefix: string;
  pageSuffix: string;
  columnsWord: string;
  rowsWord: string;
}

export interface PindouPdfInput {
  pattern: PindouPattern;
  imageDataUrl: string;
  sourceName: string;
  totalBeads: number;
  copy: PindouPdfCopy;
}

export interface PindouPdfLayout {
  imageDrawHeight: number;
  tableTopOnPageOne: number | null;
  tableHeight: number;
  tableStartsOnPageTwo: boolean;
}

export interface PindouGridTile {
  pageNumber: number;
  pageCount: number;
  colStart: number;
  rowStart: number;
  colEnd: number;
  rowEnd: number;
  columns: number;
  rows: number;
}

export function computePindouGridTiles(
  columns: number,
  rows: number
): PindouGridTile[] {
  const pageCountX = Math.max(1, Math.ceil(columns / GRID_TILE_COLUMNS));
  const pageCountY = Math.max(1, Math.ceil(rows / GRID_TILE_ROWS));
  const pageCount = pageCountX * pageCountY;
  const tiles: PindouGridTile[] = [];
  for (let py = 0; py < pageCountY; py += 1) {
    for (let px = 0; px < pageCountX; px += 1) {
      const colStart = px * GRID_TILE_COLUMNS;
      const rowStart = py * GRID_TILE_ROWS;
      const colEnd = Math.min(columns - 1, colStart + GRID_TILE_COLUMNS - 1);
      const rowEnd = Math.min(rows - 1, rowStart + GRID_TILE_ROWS - 1);
      tiles.push({
        pageNumber: tiles.length + 1,
        pageCount,
        colStart,
        rowStart,
        colEnd,
        rowEnd,
        columns: colEnd - colStart + 1,
        rows: rowEnd - rowStart + 1
      });
    }
  }
  return tiles;
}

export function computePindouPdfLayout(input: {
  columns: number;
  rows: number;
  colorCount: number;
  imageWidth: number;
  imageHeight: number;
}): PindouPdfLayout {
  const sectionTitleHeight = 56;
  const tableHeaderHeight = 56;
  const rowHeight = 42;
  const tableBottomPadding = 24;
  const tableHeight =
    sectionTitleHeight +
    tableHeaderHeight +
    input.colorCount * rowHeight +
    tableBottomPadding;

  const scale = Math.min(
    CONTENT_WIDTH / input.imageWidth,
    IMAGE_MAX_HEIGHT / input.imageHeight
  );
  const imageDrawHeight = input.imageHeight * scale;
  const imageTop = MARGIN + TITLE_HEIGHT + META_HEIGHT + GAP;
  const tableTopOnPageOne = imageTop + imageDrawHeight + GAP;
  const availableHeight = PAGE_HEIGHT - MARGIN * 2;
  const tableStartsOnPageTwo =
    tableTopOnPageOne + tableHeight > MARGIN + availableHeight;

  return {
    imageDrawHeight,
    tableTopOnPageOne,
    tableHeight,
    tableStartsOnPageTwo
  };
}

function createPageCanvas(): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is unavailable');
  }
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  return { canvas, context };
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = dataUrl;
  if (image.complete && image.naturalWidth > 0) {
    return Promise.resolve(image);
  }
  return new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error('Could not decode the pattern image for the PDF.'));
  });
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

function drawMeta(
  context: CanvasRenderingContext2D,
  text: string,
  y: number
) {
  context.font = `26px ${FONT_STACK}`;
  context.fillStyle = '#4b5563';
  context.textBaseline = 'middle';
  context.fillText(truncateText(context, text, CONTENT_WIDTH), MARGIN, y);
}

function drawBeadTable(
  context: CanvasRenderingContext2D,
  pattern: PindouPattern,
  copy: PindouPdfCopy,
  top: number
) {
  const sectionTitleHeight = 56;
  const tableHeaderHeight = 56;
  const rowHeight = 42;
  const codeWidth = 250;
  const nameWidth = 430;
  const hexWidth = 200;
  const countWidth = CONTENT_WIDTH - codeWidth - nameWidth - hexWidth;
  const countX = MARGIN + codeWidth + nameWidth + hexWidth + countWidth - 90;

  context.font = `bold 30px ${FONT_STACK}`;
  context.fillStyle = '#17110d';
  context.textBaseline = 'middle';
  context.fillText(copy.beadList, MARGIN, top + sectionTitleHeight / 2);

  const tableTop = top + sectionTitleHeight;
  context.font = `bold 24px ${FONT_STACK}`;
  context.fillStyle = '#6b7280';
  context.fillText(copy.code, MARGIN, tableTop + tableHeaderHeight / 2);
  context.fillText(
    copy.color,
    MARGIN + codeWidth,
    tableTop + tableHeaderHeight / 2
  );
  context.fillText(
    'HEX',
    MARGIN + codeWidth + nameWidth,
    tableTop + tableHeaderHeight / 2
  );
  context.fillText(
    copy.count,
    countX,
    tableTop + tableHeaderHeight / 2
  );

  context.strokeStyle = '#e5e7eb';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(MARGIN, tableTop + tableHeaderHeight);
  context.lineTo(PAGE_WIDTH - MARGIN, tableTop + tableHeaderHeight);
  context.stroke();

  pattern.counts.forEach((item, index) => {
    const rowTop = tableTop + tableHeaderHeight + index * rowHeight;
    const y = rowTop + rowHeight / 2;

    if (index > 0) {
      context.strokeStyle = '#f3f4f6';
      context.beginPath();
      context.moveTo(MARGIN, rowTop);
      context.lineTo(PAGE_WIDTH - MARGIN, rowTop);
      context.stroke();
    }

    const swatchSize = 26;
    const swatchX = MARGIN + 4;
    const swatchY = y - swatchSize / 2;
    context.fillStyle = item.hex;
    context.fillRect(swatchX, swatchY, swatchSize, swatchSize);
    context.strokeStyle = 'rgba(23, 17, 13, 0.2)';
    context.strokeRect(swatchX, swatchY, swatchSize, swatchSize);

    context.font = `24px ${FONT_STACK}`;
    context.fillStyle = '#17110d';
    context.textBaseline = 'middle';
    context.fillText(item.code, swatchX + swatchSize + 12, y);
    context.fillText(
      truncateText(context, item.name, nameWidth - 12),
      MARGIN + codeWidth,
      y
    );
    context.fillText(item.hex, MARGIN + codeWidth + nameWidth, y);
    context.fillText(String(item.count), countX, y);
  });
}

function renderPatternPage(
  input: PindouPdfInput,
  image: HTMLImageElement,
  layout: PindouPdfLayout
): HTMLCanvasElement {
  const { canvas, context } = createPageCanvas();
  const { pattern, totalBeads, copy } = input;

  context.font = `bold 46px ${FONT_STACK}`;
  context.fillStyle = '#17110d';
  context.textBaseline = 'middle';
  context.fillText(
    truncateText(context, copy.title, CONTENT_WIDTH),
    MARGIN,
    MARGIN + TITLE_HEIGHT / 2
  );

  drawMeta(
    context,
    `${copy.size}: ${pattern.columns} x ${pattern.rows} · ` +
      `${copy.total}: ${totalBeads} · ${copy.source}: ${input.sourceName}`,
    MARGIN + TITLE_HEIGHT + META_HEIGHT / 2
  );

  const imageTop = MARGIN + TITLE_HEIGHT + META_HEIGHT + GAP;
  const drawWidth = layout.imageDrawHeight * (image.naturalWidth / image.naturalHeight);
  context.drawImage(
    image,
    (PAGE_WIDTH - drawWidth) / 2,
    imageTop,
    drawWidth,
    layout.imageDrawHeight
  );

  if (!layout.tableStartsOnPageTwo && layout.tableTopOnPageOne !== null) {
    drawBeadTable(context, pattern, copy, layout.tableTopOnPageOne);
  }

  return canvas;
}

function renderBeadListPage(
  input: PindouPdfInput,
  layout: PindouPdfLayout
): HTMLCanvasElement {
  const { canvas, context } = createPageCanvas();
  const tableTop = MARGIN + Math.max(0, (PAGE_HEIGHT - MARGIN * 2 - layout.tableHeight) / 2);
  drawBeadTable(context, input.pattern, input.copy, tableTop);
  return canvas;
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

function formatGridRangeLabel(
  tile: PindouGridTile,
  copy: PindouPdfCopy
): string {
  const page =
    `${copy.pagePrefix} ${tile.pageNumber}/${tile.pageCount}${copy.pageSuffix}`.trim();
  const range =
    `${copy.columnsWord} ${tile.colStart + 1}-${tile.colEnd + 1} · ` +
    `${copy.rowsWord} ${tile.rowStart + 1}-${tile.rowEnd + 1}`;
  return `${page} · ${range}`;
}

function renderGridPage(
  input: PindouPdfInput,
  tile: PindouGridTile,
  copy: PindouPdfCopy
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = GRID_PAGE_WIDTH;
  canvas.height = GRID_PAGE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is unavailable');
  }
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, GRID_PAGE_WIDTH, GRID_PAGE_HEIGHT);

  const gridLeft = GRID_MARGIN + GRID_SIDE_MARGIN + GRID_AXIS_SIZE;
  const gridTop = GRID_MARGIN + GRID_HEADER_HEIGHT + GRID_AXIS_SIZE;
  const gridWidth = tile.columns * GRID_CELL_SIZE;
  const gridHeight = tile.rows * GRID_CELL_SIZE;
  const axisInterval = 10;

  // Header: chart title, page + range label, size meta.
  context.textBaseline = 'middle';
  context.textAlign = 'left';
  context.font = `bold 48px ${FONT_STACK}`;
  context.fillStyle = '#17110d';
  context.fillText(
    truncateText(context, copy.title, GRID_PAGE_WIDTH - GRID_MARGIN * 2),
    GRID_MARGIN,
    GRID_MARGIN + 42
  );
  context.font = `30px ${FONT_STACK}`;
  context.fillStyle = '#4b5563';
  context.fillText(
    formatGridRangeLabel(tile, copy),
    GRID_MARGIN,
    GRID_MARGIN + 100
  );
  context.font = `26px ${FONT_STACK}`;
  context.fillStyle = '#6b7280';
  context.fillText(
    `${copy.size}: ${input.pattern.columns} x ${input.pattern.rows} · ` +
      `${copy.total}: ${input.totalBeads}`,
    GRID_MARGIN,
    GRID_MARGIN + 138
  );

  // Coordinate axes.
  context.fillStyle = '#f3f4f6';
  context.fillRect(gridLeft, GRID_MARGIN + GRID_HEADER_HEIGHT, gridWidth, GRID_AXIS_SIZE);
  context.fillRect(
    gridLeft,
    GRID_MARGIN + GRID_HEADER_HEIGHT + GRID_AXIS_SIZE + gridHeight,
    gridWidth,
    GRID_AXIS_SIZE
  );
  context.fillRect(
    GRID_MARGIN + GRID_SIDE_MARGIN,
    gridTop,
    GRID_AXIS_SIZE,
    gridHeight
  );
  context.fillRect(
    GRID_MARGIN + GRID_SIDE_MARGIN + GRID_AXIS_SIZE + gridWidth,
    gridTop,
    GRID_AXIS_SIZE,
    gridHeight
  );
  context.font = `${GRID_AXIS_FONT_SIZE}px ${FONT_STACK}`;
  context.fillStyle = '#374151';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const shouldLabelColumn = (value: number) =>
    value === 0 ||
    (value + 1) % axisInterval === 0 ||
    value === tile.columns - 1;
  for (let i = 0; i < tile.columns; i += 1) {
    if (!shouldLabelColumn(i)) continue;
    const x = gridLeft + i * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;
    context.fillText(
      String(tile.colStart + i + 1),
      x,
      GRID_MARGIN + GRID_HEADER_HEIGHT + GRID_AXIS_SIZE / 2
    );
    context.fillText(
      String(tile.colStart + i + 1),
      x,
      GRID_MARGIN +
        GRID_HEADER_HEIGHT +
        GRID_AXIS_SIZE +
        gridHeight +
        GRID_AXIS_SIZE / 2
    );
  }
  const shouldLabelRow = (value: number) =>
    value === 0 ||
    (value + 1) % axisInterval === 0 ||
    value === tile.rows - 1;
  for (let j = 0; j < tile.rows; j += 1) {
    if (!shouldLabelRow(j)) continue;
    const y = gridTop + j * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;
    context.fillText(
      String(tile.rowStart + j + 1),
      GRID_MARGIN + GRID_SIDE_MARGIN + GRID_AXIS_SIZE / 2,
      y
    );
    context.fillText(
      String(tile.rowStart + j + 1),
      GRID_MARGIN +
        GRID_SIDE_MARGIN +
        GRID_AXIS_SIZE +
        gridWidth +
        GRID_AXIS_SIZE / 2,
      y
    );
  }

  // Cells with per-cell color codes.
  const showCodes = true;
  for (const cell of input.pattern.cells) {
    if (
      cell.x < tile.colStart ||
      cell.x > tile.colEnd ||
      cell.y < tile.rowStart ||
      cell.y > tile.rowEnd
    ) {
      continue;
    }
    const x = gridLeft + (cell.x - tile.colStart) * GRID_CELL_SIZE;
    const y = gridTop + (cell.y - tile.rowStart) * GRID_CELL_SIZE;
    if (!cell.external) {
      context.fillStyle = cell.color.hex;
      context.fillRect(x, y, GRID_CELL_SIZE, GRID_CELL_SIZE);
      if (showCodes && !cell.color.code.startsWith('#')) {
        context.font = `bold ${GRID_CODE_FONT_SIZE}px ${FONT_STACK}`;
        context.fillStyle = getContrastColor(cell.color.hex);
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(
          cell.color.code,
          x + GRID_CELL_SIZE / 2,
          y + GRID_CELL_SIZE / 2
        );
      }
    }
    context.strokeStyle = '#e5e7eb';
    context.lineWidth = 1;
    context.strokeRect(
      x + 0.5,
      y + 0.5,
      GRID_CELL_SIZE - 1,
      GRID_CELL_SIZE - 1
    );
  }

  // Strong section lines every 10 cells plus an outer border.
  context.strokeStyle = '#111827';
  context.lineWidth = 3;
  for (let i = axisInterval; i < tile.columns; i += axisInterval) {
    const x = gridLeft + i * GRID_CELL_SIZE;
    context.beginPath();
    context.moveTo(x, gridTop);
    context.lineTo(x, gridTop + gridHeight);
    context.stroke();
  }
  for (let j = axisInterval; j < tile.rows; j += axisInterval) {
    const y = gridTop + j * GRID_CELL_SIZE;
    context.beginPath();
    context.moveTo(gridLeft, y);
    context.lineTo(gridLeft + gridWidth, y);
    context.stroke();
  }
  context.strokeStyle = '#000000';
  context.lineWidth = 3;
  context.strokeRect(
    gridLeft + 1,
    gridTop + 1,
    gridWidth - 2,
    gridHeight - 2
  );

  // Footer.
  const footerY = GRID_PAGE_HEIGHT - GRID_FOOTER_HEIGHT / 2;
  context.font = `26px ${FONT_STACK}`;
  context.fillStyle = '#9ca3af';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(
    truncateText(context, `${copy.source}: ${input.sourceName}`, GRID_PAGE_WIDTH / 2),
    GRID_MARGIN,
    footerY
  );
  context.textAlign = 'right';
  context.fillText(
    `${copy.gridPageTitle} ${tile.pageNumber}/${tile.pageCount}`,
    GRID_PAGE_WIDTH - GRID_MARGIN,
    footerY
  );

  return canvas;
}

export async function buildPindouPatternPdfBlob(
  input: PindouPdfInput
): Promise<Blob> {
  const image = await loadImageFromDataUrl(input.imageDataUrl);
  const imageWidth = image.naturalWidth || 1;
  const imageHeight = image.naturalHeight || 1;

  const layout = computePindouPdfLayout({
    columns: input.pattern.columns,
    rows: input.pattern.rows,
    colorCount: input.pattern.counts.length,
    imageWidth,
    imageHeight
  });

  const firstPage = renderPatternPage(input, image, layout);
  const gridTiles = computePindouGridTiles(
    input.pattern.columns,
    input.pattern.rows
  );
  const pages = [
    firstPage,
    ...gridTiles.map((tile) => renderGridPage(input, tile, input.copy))
  ];
  if (layout.tableStartsOnPageTwo) {
    pages.push(renderBeadListPage(input, layout));
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });
  pages.forEach((page, index) => {
    if (index > 0) doc.addPage('a4', 'portrait');
    doc.addImage(
      page.toDataURL('image/jpeg', 0.92),
      'JPEG',
      0,
      0,
      210,
      297,
      undefined,
      'FAST'
    );
  });

  return doc.output('blob');
}
