import {
  PINDOU_COCO_PALETTE,
  PINDOU_MANMAN_PALETTE,
  PINDOU_MARD_PALETTE,
  PINDOU_MIXIAOWO_PALETTE,
  PINDOU_PANPAN_PALETTE
} from './pindou-palette-data';

export type PindouPaletteId =
  | 'perler'
  | 'hama'
  | 'artkal'
  | 'mard'
  | 'coco'
  | 'manman'
  | 'panpan'
  | 'mixiaowo';

export type PindouPixelationMode = 'dominant' | 'average';

export interface PindouColor {
  code: string;
  name: string;
  hex: string;
}

export interface PindouCell {
  x: number;
  y: number;
  color: PindouColor;
  external?: boolean;
}

export interface PindouPattern {
  columns: number;
  rows: number;
  paletteId: PindouPaletteId;
  cells: PindouCell[];
  counts: Array<PindouColor & { count: number }>;
}

export interface PindouSettings {
  columns: number;
  paletteId: PindouPaletteId;
  maxColors: number;
  showGrid: boolean;
  mode: PindouPixelationMode;
  removeBackground: boolean;
  mergeThreshold: number;
}

export const PINDOU_ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp'
] as const;

export const PINDOU_MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const PINDOU_MAX_SOURCE_PIXELS = 24_000_000;

export type PindouUploadRejectionReason =
  | 'unsupported-type'
  | 'file-too-large'
  | 'image-too-large';

export function getPindouFileRejectionReason(
  file: Pick<File, 'type' | 'size'>
): PindouUploadRejectionReason | null {
  if (
    !PINDOU_ALLOWED_IMAGE_TYPES.includes(
      file.type as (typeof PINDOU_ALLOWED_IMAGE_TYPES)[number]
    )
  ) {
    return 'unsupported-type';
  }
  if (file.size > PINDOU_MAX_UPLOAD_BYTES) {
    return 'file-too-large';
  }
  return null;
}

export function getPindouImageDimensionRejectionReason(input: {
  width: number;
  height: number;
}): PindouUploadRejectionReason | null {
  if (input.width * input.height > PINDOU_MAX_SOURCE_PIXELS) {
    return 'image-too-large';
  }
  return null;
}

export const PINDOU_PALETTES: Record<PindouPaletteId, PindouColor[]> = {
  perler: [
    { code: 'P01', name: 'White', hex: '#f7f4ea' },
    { code: 'P02', name: 'Black', hex: '#1d1d1d' },
    { code: 'P03', name: 'Light gray', hex: '#b9bab5' },
    { code: 'P04', name: 'Red', hex: '#d83b33' },
    { code: 'P05', name: 'Orange', hex: '#f47f2c' },
    { code: 'P06', name: 'Yellow', hex: '#ffd33d' },
    { code: 'P07', name: 'Green', hex: '#4da45a' },
    { code: 'P08', name: 'Dark green', hex: '#1f6b48' },
    { code: 'P09', name: 'Sky blue', hex: '#75bfe6' },
    { code: 'P10', name: 'Blue', hex: '#2b64b5' },
    { code: 'P11', name: 'Purple', hex: '#7252a4' },
    { code: 'P12', name: 'Pink', hex: '#f59ac0' },
    { code: 'P13', name: 'Tan', hex: '#d8a46f' },
    { code: 'P14', name: 'Brown', hex: '#7a4f32' },
    { code: 'P15', name: 'Peach', hex: '#f3c19f' },
    { code: 'P16', name: 'Cream', hex: '#fff1c6' }
  ],
  hama: [
    { code: 'H01', name: 'White', hex: '#f8f7f0' },
    { code: 'H02', name: 'Black', hex: '#202020' },
    { code: 'H03', name: 'Gray', hex: '#9fa3a3' },
    { code: 'H04', name: 'Red', hex: '#c83238' },
    { code: 'H05', name: 'Fluorescent orange', hex: '#ff8a27' },
    { code: 'H06', name: 'Yellow', hex: '#ffdb43' },
    { code: 'H07', name: 'Light green', hex: '#8bcf5f' },
    { code: 'H08', name: 'Green', hex: '#2d8c58' },
    { code: 'H09', name: 'Turquoise', hex: '#40bfd0' },
    { code: 'H10', name: 'Light blue', hex: '#7fb7e8' },
    { code: 'H11', name: 'Dark blue', hex: '#2d529d' },
    { code: 'H12', name: 'Lavender', hex: '#9882c4' },
    { code: 'H13', name: 'Pink', hex: '#ec7ead' },
    { code: 'H14', name: 'Beige', hex: '#d8b486' },
    { code: 'H15', name: 'Brown', hex: '#6b4630' },
    { code: 'H16', name: 'Burgundy', hex: '#7d2634' }
  ],
  artkal: [
    { code: 'A01', name: 'Milk white', hex: '#fbf7ed' },
    { code: 'A02', name: 'Deep black', hex: '#18191b' },
    { code: 'A03', name: 'Warm gray', hex: '#b6b2aa' },
    { code: 'A04', name: 'Rose red', hex: '#d9344f' },
    { code: 'A05', name: 'Coral', hex: '#ff725c' },
    { code: 'A06', name: 'Sun yellow', hex: '#ffd447' },
    { code: 'A07', name: 'Mint', hex: '#8ed6a0' },
    { code: 'A08', name: 'Emerald', hex: '#1e8b69' },
    { code: 'A09', name: 'Cyan', hex: '#37c1df' },
    { code: 'A10', name: 'Ocean blue', hex: '#2274bd' },
    { code: 'A11', name: 'Indigo', hex: '#3d4c9f' },
    { code: 'A12', name: 'Violet', hex: '#8d62ba' },
    { code: 'A13', name: 'Blush', hex: '#f6a4b7' },
    { code: 'A14', name: 'Skin peach', hex: '#f0bf9a' },
    { code: 'A15', name: 'Coffee', hex: '#81553a' },
    { code: 'A16', name: 'Dark cocoa', hex: '#4b352a' }
  ],
  mard: PINDOU_MARD_PALETTE,
  coco: PINDOU_COCO_PALETTE,
  manman: PINDOU_MANMAN_PALETTE,
  panpan: PINDOU_PANPAN_PALETTE,
  mixiaowo: PINDOU_MIXIAOWO_PALETTE
};

export const DEFAULT_PINDOU_SETTINGS: PindouSettings = {
  columns: 64,
  paletteId: 'perler',
  maxColors: 18,
  showGrid: true,
  mode: 'dominant',
  removeBackground: false,
  mergeThreshold: 0
};

export function clampPindouColumns(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PINDOU_SETTINGS.columns;
  return Math.min(140, Math.max(16, Math.round(value)));
}

export function clampPindouMaxColors(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PINDOU_SETTINGS.maxColors;
  return Math.min(32, Math.max(4, Math.round(value)));
}

export function clampPindouMergeThreshold(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PINDOU_SETTINGS.mergeThreshold;
  return Math.min(40, Math.max(0, Math.round(value)));
}

export function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ];
}

function srgbChannelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function rgbToOklab(rgb: [number, number, number]): {
  l: number;
  a: number;
  b: number;
} {
  const r = srgbChannelToLinear(rgb[0]);
  const g = srgbChannelToLinear(rgb[1]);
  const b = srgbChannelToLinear(rgb[2]);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot
  };
}

const oklabCache = new Map<string, { l: number; a: number; b: number }>();

/**
 * Perceptual color distance in Oklab, scaled to the same 0-100 range used by
 * bead pattern tools so similarity thresholds stay intuitive.
 */
export function pindouColorDistance(
  rgb1: [number, number, number],
  rgb2: [number, number, number]
): number {
  const key1 = rgb1.join(',');
  const key2 = rgb2.join(',');
  let oklab1 = oklabCache.get(key1);
  if (!oklab1) {
    oklab1 = rgbToOklab(rgb1);
    oklabCache.set(key1, oklab1);
  }
  let oklab2 = oklabCache.get(key2);
  if (!oklab2) {
    oklab2 = rgbToOklab(rgb2);
    oklabCache.set(key2, oklab2);
  }
  const dl = oklab1.l - oklab2.l;
  const da = oklab1.a - oklab2.a;
  const db = oklab1.b - oklab2.b;
  return Math.sqrt(dl * dl + da * da + db * db) * 100;
}

export function findNearestPindouColor(
  rgb: [number, number, number],
  palette: PindouColor[]
): PindouColor {
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const color of palette) {
    const [r, g, b] = hexToRgb(color.hex);
    const distance = pindouColorDistance(rgb, [r, g, b]);
    if (distance < bestDistance) {
      best = color;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Marks cells connected to the border as external background when a border
 * color occupies a meaningful share of the image edge. Mirrors the flood-fill
 * background removal used by leading bead tools, implemented from the public
 * algorithm description.
 */
export function removePindouBackground(
  pattern: PindouPattern,
  options: { minBorderRatio?: number } = {}
): PindouPattern {
  const minBorderRatio = options.minBorderRatio ?? 0.2;
  const borderCounts = new Map<string, number>();
  const isBorder = (x: number, y: number) =>
    x === 0 || y === 0 || x === pattern.columns - 1 || y === pattern.rows - 1;

  let borderTotal = 0;
  for (const cell of pattern.cells) {
    if (isBorder(cell.x, cell.y)) {
      borderTotal += 1;
      borderCounts.set(cell.color.code, (borderCounts.get(cell.color.code) || 0) + 1);
    }
  }

  const candidates = new Set(
    [...borderCounts.entries()]
      .filter(([, count]) => borderTotal > 0 && count / borderTotal >= minBorderRatio)
      .map(([code]) => code)
  );
  if (candidates.size === 0) {
    return {
      ...pattern,
      cells: pattern.cells.map((cell) => ({ ...cell, external: false }))
    };
  }

  const grid: Array<Array<PindouCell | null>> = Array.from(
    { length: pattern.rows },
    () => Array<PindouCell | null>(pattern.columns).fill(null)
  );
  for (const cell of pattern.cells) {
    grid[cell.y][cell.x] = cell;
  }

  const external = new Set<number>();
  const stack: Array<[number, number]> = [];
  for (const cell of pattern.cells) {
    if (isBorder(cell.x, cell.y) && candidates.has(cell.color.code)) {
      stack.push([cell.x, cell.y]);
    }
  }
  while (stack.length > 0) {
    const [x, y] = stack.pop() as [number, number];
    const index = y * pattern.columns + x;
    if (external.has(index)) continue;
    const cell = grid[y][x];
    if (!cell || !candidates.has(cell.color.code)) continue;
    external.add(index);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < pattern.columns && ny < pattern.rows) {
        stack.push([nx, ny]);
      }
    }
  }

  const cells = pattern.cells.map((cell) => ({
    ...cell,
    external: external.has(cell.y * pattern.columns + cell.x)
  }));
  const countMap = new Map<string, PindouColor & { count: number }>();
  for (const cell of cells) {
    if (cell.external) continue;
    const current = countMap.get(cell.color.code);
    countMap.set(cell.color.code, {
      ...cell.color,
      count: (current?.count || 0) + 1
    });
  }
  return {
    ...pattern,
    cells,
    counts: [...countMap.values()].sort((a, b) => b.count - a.count)
  };
}

/**
 * Merges adjacent cells whose colors are perceptually close (Oklab distance
 * below the threshold) into regions and snaps each region to its most frequent
 * color. Mirrors the connected-region noise cleanup used by leading bead
 * tools, implemented from the public algorithm description.
 */
export function mergePindouSimilarColors(
  pattern: PindouPattern,
  threshold: number
): PindouPattern {
  const limit = clampPindouMergeThreshold(threshold);
  if (limit <= 0) return pattern;
  const grid: Array<Array<PindouCell | null>> = Array.from(
    { length: pattern.rows },
    () => Array<PindouCell | null>(pattern.columns).fill(null)
  );
  for (const cell of pattern.cells) {
    grid[cell.y][cell.x] = cell;
  }
  const visited = new Array<boolean>(pattern.columns * pattern.rows).fill(false);
  const nextCells = pattern.cells.map((cell) => ({ ...cell }));

  for (const seed of nextCells) {
    if (seed.external || visited[seed.y * pattern.columns + seed.x]) continue;
    const seedRgb = hexToRgb(seed.color.hex);
    const region: PindouCell[] = [];
    const stack: Array<[number, number]> = [[seed.x, seed.y]];
    while (stack.length > 0) {
      const [x, y] = stack.pop() as [number, number];
      const index = y * pattern.columns + x;
      if (visited[index]) continue;
      const cell = grid[y][x];
      if (!cell || cell.external) continue;
      if (pindouColorDistance(seedRgb, hexToRgb(cell.color.hex)) > limit) {
        continue;
      }
      visited[index] = true;
      region.push(cell);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < pattern.columns && ny < pattern.rows) {
          stack.push([nx, ny]);
        }
      }
    }
    if (region.length <= 1) continue;
    const colorCounts = new Map<string, { color: PindouColor; count: number }>();
    for (const cell of region) {
      const current = colorCounts.get(cell.color.code);
      colorCounts.set(cell.color.code, {
        color: cell.color,
        count: (current?.count || 0) + 1
      });
    }
    let chosen = region[0].color;
    let bestCount = -1;
    for (const entry of colorCounts.values()) {
      if (entry.count > bestCount) {
        bestCount = entry.count;
        chosen = entry.color;
      }
    }
    for (const cell of region) {
      nextCells[cell.y * pattern.columns + cell.x] = {
        ...nextCells[cell.y * pattern.columns + cell.x],
        color: chosen
      };
    }
  }
  return recomputePindouCounts({
    ...pattern,
    cells: nextCells
  });
}

function recomputePindouCounts(pattern: PindouPattern): PindouPattern {
  const countMap = new Map<string, PindouColor & { count: number }>();
  for (const cell of pattern.cells) {
    if (cell.external) continue;
    const current = countMap.get(cell.color.code);
    countMap.set(cell.color.code, {
      ...cell.color,
      count: (current?.count || 0) + 1
    });
  }
  return {
    ...pattern,
    counts: [...countMap.values()].sort((a, b) => b.count - a.count)
  };
}

export interface PindouImportedCell {
  x: number;
  y: number;
  color: PindouColor;
  external?: boolean;
}

export interface PindouCsvGrid {
  columns: number;
  rows: number;
  cells: PindouImportedCell[];
}

const TRANSPARENT_COLOR: PindouColor = {
  code: 'TRANSPARENT',
  name: '',
  hex: '#ffffff'
};

/**
 * Parses a bead-grid CSV. Supports both the raw hex grid used by popular bead
 * tools (rows of #RRGGBB / TRANSPARENT) and the detailed x,y,code,name,hex
 * export format used by this project.
 */
export function parsePindouCsv(text: string): PindouCsvGrid {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }

  const isDetailedFormat = /^\s*x\s*,\s*y\s*,\s*code/i.test(lines[0]);
  if (isDetailedFormat) {
    const cells: PindouImportedCell[] = [];
    let maxX = 0;
    let maxY = 0;
    for (const line of lines.slice(1)) {
      if (/^\s*code\s*,\s*name/i.test(line)) continue;
      const parts = line.split(',');
      if (parts.length < 3) continue;
      const x = Number(parts[0].trim());
      const y = Number(parts[1].trim());
      const code = parts[2].trim();
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const hex = (parts[4]?.trim() || '').toUpperCase();
      const external = code.toUpperCase() === 'TRANSPARENT';
      cells.push({
        x: x - 1,
        y: y - 1,
        color: external
          ? TRANSPARENT_COLOR
          : { code, name: parts[3]?.trim() || '', hex: hex || '#ffffff' },
        external
      });
    }
    if (cells.length === 0) {
      throw new Error('CSV contains no bead cells');
    }
    const columns = maxX;
    const rows = maxY;
    const full = Array.from({ length: columns * rows }, (_, index) => {
      const found = cells.find(
        (cell) => cell.x === index % columns && cell.y === Math.floor(index / columns)
      );
      return (
        found || {
          x: index % columns,
          y: Math.floor(index / columns),
          color: TRANSPARENT_COLOR,
          external: true
        }
      );
    });
    return { columns, rows, cells: full };
  }

  const rows = lines.length;
  const columns = lines[0].split(',').length;
  const cells: PindouImportedCell[] = [];
  for (let y = 0; y < rows; y += 1) {
    const row = lines[y].split(',');
    if (row.length !== columns) {
      throw new Error(
        `CSV row ${y + 1} has ${row.length} columns, expected ${columns}`
      );
    }
    for (let x = 0; x < columns; x += 1) {
      const value = row[x].trim();
      if (value.toUpperCase() === 'TRANSPARENT' || value === '') {
        cells.push({
          x,
          y,
          color: TRANSPARENT_COLOR,
          external: true
        });
        continue;
      }
      const hexPattern = /^#[0-9A-Fa-f]{6}$/;
      if (!hexPattern.test(value)) {
        throw new Error(`Invalid color value at row ${y + 1}, column ${x + 1}: ${value}`);
      }
      cells.push({
        x,
        y,
        color: { code: value.toUpperCase(), name: '', hex: value.toUpperCase() }
      });
    }
  }
  return { columns, rows, cells };
}

export function buildPindouPatternFromCells(
  cells: Array<{ x: number; y: number; color: PindouColor; external?: boolean }>,
  columns: number,
  rows: number,
  paletteId: PindouPaletteId
): PindouPattern {
  return recomputePindouCounts({
    columns,
    rows,
    paletteId,
    cells: cells.map((cell) => ({
      x: cell.x,
      y: cell.y,
      color: cell.color,
      external: Boolean(cell.external)
    })),
    counts: []
  });
}

export function setPindouCellColor(
  pattern: PindouPattern,
  x: number,
  y: number,
  color: PindouColor
): PindouPattern {
  if (x < 0 || y < 0 || x >= pattern.columns || y >= pattern.rows) {
    return pattern;
  }
  return recomputePindouCounts({
    ...pattern,
    cells: pattern.cells.map((cell) =>
      cell.x === x && cell.y === y
        ? { ...cell, color, external: false }
        : cell
    )
  });
}

export function replacePindouColor(
  pattern: PindouPattern,
  fromCode: string,
  toColor: PindouColor
): PindouPattern {
  return recomputePindouCounts({
    ...pattern,
    cells: pattern.cells.map((cell) =>
      !cell.external && cell.color.code === fromCode
        ? { ...cell, color: toColor }
        : cell
    )
  });
}

export function erasePindouConnectedRegion(
  pattern: PindouPattern,
  x: number,
  y: number
): PindouPattern {
  if (x < 0 || y < 0 || x >= pattern.columns || y >= pattern.rows) {
    return pattern;
  }
  const index = y * pattern.columns + x;
  const targetCell = pattern.cells[index];
  if (!targetCell || targetCell.external) return pattern;
  const targetCode = targetCell.color.code;
  const grid: Array<Array<PindouCell | null>> = Array.from(
    { length: pattern.rows },
    () => Array<PindouCell | null>(pattern.columns).fill(null)
  );
  for (const cell of pattern.cells) {
    grid[cell.y][cell.x] = cell;
  }
  const external = new Set<number>();
  const stack: Array<[number, number]> = [[x, y]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop() as [number, number];
    const cellIndex = cy * pattern.columns + cx;
    if (external.has(cellIndex)) continue;
    const cell = grid[cy][cx];
    if (!cell || cell.external || cell.color.code !== targetCode) continue;
    external.add(cellIndex);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && ny >= 0 && nx < pattern.columns && ny < pattern.rows) {
        stack.push([nx, ny]);
      }
    }
  }
  if (external.size === 0) return pattern;
  return recomputePindouCounts({
    ...pattern,
    cells: pattern.cells.map((cell) => ({
      ...cell,
      external:
        cell.external || external.has(cell.y * pattern.columns + cell.x)
    }))
  });
}

export interface PindouSerializedProject {
  version: 1;
  origin: 'demo' | 'image' | 'csv' | 'edited';
  settings: PindouSettings;
  columns: number;
  rows: number;
  paletteId: PindouPaletteId;
  data: string;
}

/**
 * Compresses a pattern to run-length encoded hex tokens, e.g.
 * "FFFFFF:120,T:30,A01:4". Externals use the token "T".
 */
export function serializePindouPatternData(pattern: PindouPattern): string {
  const tokens: string[] = [];
  let current = pattern.cells[0];
  let count = 0;
  const flush = () => {
    const value = current?.external
      ? 'T'
      : (current?.color.hex || '#ffffff').toUpperCase();
    tokens.push(`${value}:${count}`);
  };
  for (const cell of pattern.cells) {
    const value = cell.external ? 'T' : cell.color.hex.toUpperCase();
    if (current && value === (current.external ? 'T' : current.color.hex.toUpperCase())) {
      count += 1;
    } else {
      if (current) flush();
      current = cell;
      count = 1;
    }
  }
  if (current) flush();
  return tokens.join(',');
}

export function serializePindouProject(
  pattern: PindouPattern,
  settings: PindouSettings,
  origin: PindouSerializedProject['origin']
): string {
  const payload: PindouSerializedProject = {
    version: 1,
    origin,
    settings,
    columns: pattern.columns,
    rows: pattern.rows,
    paletteId: pattern.paletteId,
    data: serializePindouPatternData(pattern)
  };
  return JSON.stringify(payload);
}

export function deserializePindouProject(
  json: string
): Pick<PindouSerializedProject, 'origin' | 'settings'> & {
  pattern: PindouPattern;
} | null {
  try {
    const payload = JSON.parse(json) as PindouSerializedProject;
    if (
      payload.version !== 1 ||
      !Number.isFinite(payload.columns) ||
      !Number.isFinite(payload.rows) ||
      typeof payload.data !== 'string'
    ) {
      return null;
    }
    const palette = PINDOU_PALETTES[payload.paletteId] || PINDOU_PALETTES.perler;
    const cells: PindouCell[] = [];
    let x = 0;
    let y = 0;
    for (const token of payload.data.split(',')) {
      const separator = token.lastIndexOf(':');
      if (separator < 0) continue;
      const value = token.slice(0, separator).toUpperCase();
      const count = Number(token.slice(separator + 1));
      if (!Number.isFinite(count) || count <= 0) continue;
      for (let i = 0; i < count; i += 1) {
        if (x >= payload.columns) {
          x = 0;
          y += 1;
        }
        if (y >= payload.rows) break;
        const external = value === 'T';
        const hex = external ? '#ffffff' : value;
        const matched =
          palette.find((color) => color.hex.toUpperCase() === hex) || null;
        cells.push({
          x,
          y,
          color:
            matched || {
              code: hex,
              name: '',
              hex
            },
          external
        });
        x += 1;
      }
    }
    if (cells.length === 0) return null;
    const pattern = recomputePindouCounts({
      columns: payload.columns,
      rows: payload.rows,
      paletteId: payload.paletteId,
      cells,
      counts: []
    });
    return {
      origin: payload.origin,
      settings: {
        ...DEFAULT_PINDOU_SETTINGS,
        ...payload.settings
      },
      pattern
    };
  } catch {
    return null;
  }
}

function hexToBase36(hex: string): string {
  return Number.parseInt(hex.slice(1), 16).toString(36);
}

function base36ToHex(code: string): string {
  const value = Number.parseInt(code, 36);
  if (!Number.isFinite(value) || value < 0 || value > 0xffffff) {
    throw new Error('Invalid share code color value');
  }
  return `#${value.toString(16).padStart(6, '0').toUpperCase()}`;
}

function base64UrlEncode(value: string): string {
  if (typeof btoa === 'function') {
    return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(code: string): string {
  const normalized = code.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof atob === 'function') {
    return atob(normalized);
  }
  return Buffer.from(normalized, 'base64').toString('utf8');
}

/**
 * Compact share code: palette hex values are shortened to base-36 tokens and
 * run-length encoded, then wrapped in a URL-safe base64 JSON envelope.
 */
export function encodePindouShareCode(pattern: PindouPattern): string {
  const tokens: string[] = [];
  let currentValue = '';
  let count = 0;
  const flush = () => {
    tokens.push(`${currentValue}:${count}`);
  };
  for (const cell of pattern.cells) {
    const value = cell.external ? 'T' : hexToBase36(cell.color.hex);
    if (value === currentValue) {
      count += 1;
    } else {
      if (currentValue) flush();
      currentValue = value;
      count = 1;
    }
  }
  if (currentValue) flush();
  const payload = JSON.stringify({
    v: 1,
    c: pattern.columns,
    r: pattern.rows,
    p: pattern.paletteId,
    d: tokens.join(',')
  });
  return base64UrlEncode(payload);
}

export function decodePindouShareCode(code: string): PindouPattern {
  let payload: {
    v: number;
    c: number;
    r: number;
    p: PindouPaletteId;
    d: string;
  };
  try {
    payload = JSON.parse(base64UrlDecode(code.trim()));
  } catch {
    throw new Error('分享码无效，请检查后重试。');
  }
  if (
    payload.v !== 1 ||
    !Number.isFinite(payload.c) ||
    !Number.isFinite(payload.r) ||
    typeof payload.d !== 'string'
  ) {
    throw new Error('分享码无效，请检查后重试。');
  }
  const palette = PINDOU_PALETTES[payload.p] || PINDOU_PALETTES.perler;
  const cells: PindouCell[] = [];
  let x = 0;
  let y = 0;
  for (const token of payload.d.split(',')) {
    const separator = token.lastIndexOf(':');
    if (separator < 0) continue;
    const value = token.slice(0, separator);
    const count = Number(token.slice(separator + 1));
    if (!Number.isFinite(count) || count <= 0) continue;
    const external = value === 'T';
    const hex = external ? '#ffffff' : base36ToHex(value);
    const matched = palette.find(
      (color) => color.hex.toUpperCase() === hex
    );
    for (let i = 0; i < count; i += 1) {
      if (x >= payload.c) {
        x = 0;
        y += 1;
      }
      if (y >= payload.r) break;
      cells.push({
        x,
        y,
        color:
          matched ||
          (external
            ? TRANSPARENT_COLOR
            : { code: hex, name: '', hex }),
        external
      });
      x += 1;
    }
  }
  if (cells.length === 0) {
    throw new Error('分享码为空，无法导入。');
  }
  return recomputePindouCounts({
    columns: payload.c,
    rows: payload.r,
    paletteId: payload.p,
    cells,
    counts: []
  });
}

export function reducePindouPalette(
  imagePixels: Array<[number, number, number]>,
  paletteId: PindouPaletteId,
  maxColors: number
): PindouColor[] {
  const palette = PINDOU_PALETTES[paletteId];
  const counts = new Map<string, { color: PindouColor; count: number }>();
  for (const rgb of imagePixels) {
    const nearest = findNearestPindouColor(rgb, palette);
    const current = counts.get(nearest.code);
    counts.set(nearest.code, {
      color: nearest,
      count: (current?.count || 0) + 1
    });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, clampPindouMaxColors(maxColors))
    .map((item) => item.color);
}

export function buildPindouPattern(input: {
  pixels: Array<[number, number, number]>;
  columns: number;
  rows: number;
  paletteId: PindouPaletteId;
  maxColors: number;
}): PindouPattern {
  const limitedPalette = reducePindouPalette(
    input.pixels,
    input.paletteId,
    input.maxColors
  );
  const countMap = new Map<string, PindouColor & { count: number }>();
  const cells = input.pixels.map((rgb, index) => {
    const color = findNearestPindouColor(rgb, limitedPalette);
    const current = countMap.get(color.code);
    countMap.set(color.code, {
      ...color,
      count: (current?.count || 0) + 1
    });
    return {
      x: index % input.columns,
      y: Math.floor(index / input.columns),
      color
    };
  });
  return {
    columns: input.columns,
    rows: input.rows,
    paletteId: input.paletteId,
    cells,
    counts: [...countMap.values()].sort((a, b) => b.count - a.count)
  };
}

export function buildPindouCsv(pattern: PindouPattern): string {
  const lines = [
    ['x', 'y', 'code', 'name', 'hex'].join(','),
    ...pattern.cells.map((cell) =>
      cell.external
        ? [cell.x + 1, cell.y + 1, 'TRANSPARENT', '""', '#ffffff'].join(',')
        : [
            cell.x + 1,
            cell.y + 1,
            cell.color.code,
            JSON.stringify(cell.color.name),
            cell.color.hex
          ].join(',')
    ),
    '',
    ['code', 'name', 'hex', 'count'].join(','),
    ...pattern.counts.map((item) =>
      [item.code, JSON.stringify(item.name), item.hex, item.count].join(',')
    )
  ];
  return lines.join('\n');
}

export function buildDemoPindouPattern(
  paletteId: PindouPaletteId = 'perler'
): PindouPattern {
  const columns = 24;
  const rows = 24;
  const colors = PINDOU_PALETTES[paletteId];
  const bg = colors[0];
  const outline = colors[1];
  const red =
    colors.find((color) => /red|rose|tomato/i.test(color.name)) || colors[3];
  const pink = colors.find((color) => /pink|blush/i.test(color.name)) || red;
  const pixels: Array<[number, number, number]> = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const dx = x - 11.5;
      const dy = y - 11.5;
      const heart =
        (dx * dx + dy * dy - 72) ** 3 - dx * dx * dy * dy * dy * 7 < 0;
      const edge =
        (dx * dx + dy * dy - 62) ** 3 - dx * dx * dy * dy * dy * 7 < 0;
      const color = heart ? (edge ? pink : outline) : bg;
      pixels.push(hexToRgb(color.hex));
    }
  }
  return buildPindouPattern({
    pixels,
    columns,
    rows,
    paletteId,
    maxColors: 6
  });
}
