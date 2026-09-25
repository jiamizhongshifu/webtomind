import { describe, expect, it } from 'vitest';
import {
  buildDemoPindouPattern,
  buildPindouCsv,
  buildPindouPattern,
  buildPindouPatternFromCells,
  clampPindouColumns,
  clampPindouMaxColors,
  clampPindouMergeThreshold,
  DEFAULT_PINDOU_SETTINGS,
  decodePindouShareCode,
  deserializePindouProject,
  encodePindouShareCode,
  erasePindouConnectedRegion,
  findNearestPindouColor,
  getPindouFileRejectionReason,
  getPindouImageDimensionRejectionReason,
  mergePindouSimilarColors,
  parsePindouCsv,
  pindouColorDistance,
  PINDOU_PALETTES,
  removePindouBackground,
  replacePindouColor,
  serializePindouProject,
  setPindouCellColor
} from '../pindou-pattern-maker';
import { PINDOU_COLOR_CHART_ROWS } from '../pindou-color-chart-data';

describe('pindou pattern maker utilities', () => {
  it('clamps grid controls to printable bounds', () => {
    expect(clampPindouColumns(2)).toBe(16);
    expect(clampPindouColumns(200)).toBe(140);
    expect(clampPindouMaxColors(1)).toBe(4);
    expect(clampPindouMaxColors(99)).toBe(32);
  });

  it('clamps the color-merge threshold', () => {
    expect(clampPindouMergeThreshold(-5)).toBe(0);
    expect(clampPindouMergeThreshold(99)).toBe(40);
    expect(clampPindouMergeThreshold(12.6)).toBe(13);
  });

  it('ships full brand palettes with MARD-style codes', () => {
    expect(PINDOU_PALETTES.mard).toHaveLength(291);
    expect(PINDOU_PALETTES.coco).toHaveLength(291);
    expect(PINDOU_PALETTES.panpan).toHaveLength(291);
    expect(PINDOU_PALETTES.mixiaowo).toHaveLength(291);
    const codes = new Set(PINDOU_PALETTES.mard.map((color) => color.code));
    expect(codes.size).toBe(291);
    expect(PINDOU_PALETTES.mard[0].code).toBe('A01');
    expect(DEFAULT_PINDOU_SETTINGS.mode).toBe('dominant');
    expect(DEFAULT_PINDOU_SETTINGS.removeBackground).toBe(false);
  });

  it('uses perceptual Oklab distance for matching', () => {
    const red = [220, 50, 45] as [number, number, number];
    const darkerRed = [190, 40, 40] as [number, number, number];
    const green = [50, 180, 70] as [number, number, number];
    expect(pindouColorDistance(red, darkerRed)).toBeLessThan(
      pindouColorDistance(red, green)
    );
  });

  it('rejects unsupported or oversized uploads before decoding', () => {
    expect(
      getPindouFileRejectionReason({ type: 'image/svg+xml', size: 1200 })
    ).toBe('unsupported-type');
    expect(
      getPindouFileRejectionReason({
        type: 'image/png',
        size: 13 * 1024 * 1024
      })
    ).toBe('file-too-large');
    expect(
      getPindouFileRejectionReason({ type: 'image/webp', size: 1000 })
    ).toBeNull();
    expect(
      getPindouImageDimensionRejectionReason({
        width: 8000,
        height: 4000
      })
    ).toBe('image-too-large');
  });

  it('maps pixels to the nearest palette color and counts beads', () => {
    const red = PINDOU_PALETTES.perler.find((color) => color.code === 'P04');
    expect(findNearestPindouColor([220, 50, 45], PINDOU_PALETTES.perler)).toBe(
      red
    );

    const pattern = buildPindouPattern({
      columns: 2,
      rows: 2,
      paletteId: 'perler',
      maxColors: 4,
      pixels: [
        [220, 50, 45],
        [220, 50, 45],
        [30, 30, 30],
        [248, 246, 240]
      ]
    });

    expect(pattern.cells).toHaveLength(4);
    expect(pattern.counts[0]).toMatchObject({ code: 'P04', count: 2 });
    expect(pattern.counts.reduce((sum, item) => sum + item.count, 0)).toBe(4);
  });

  it('exports cell rows and color-count rows as CSV', () => {
    const pattern = buildDemoPindouPattern();
    const csv = buildPindouCsv(pattern);

    expect(csv).toContain('x,y,code,name,hex');
    expect(csv).toContain('code,name,hex,count');
    expect(csv.split('\n').length).toBeGreaterThan(pattern.cells.length);
  });

  it('removes border-connected background regions and recounts beads', () => {
    const pattern = buildPindouPattern({
      columns: 8,
      rows: 8,
      paletteId: 'perler',
      maxColors: 4,
      pixels: Array.from({ length: 64 }, (_, index) => {
        const x = index % 8;
        const y = Math.floor(index / 8);
        const onBorder = x === 0 || y === 0 || x === 7 || y === 7;
        const nearCenter = x >= 3 && x <= 4 && y >= 3 && y <= 4;
        if (onBorder) return [248, 246, 240];
        if (nearCenter) return [220, 50, 45];
        return [248, 246, 240];
      })
    });
    const cleaned = removePindouBackground(pattern);
    const externalCount = cleaned.cells.filter((cell) => cell.external).length;
    expect(externalCount).toBe(60); // all white cells connected to the border
    expect(cleaned.counts).toHaveLength(1); // only red remains
    expect(cleaned.counts[0]).toMatchObject({ code: 'P04', count: 4 });
  });

  it('parses raw hex grids and detailed CSV exports', () => {
    const raw = '#FF0000,#00FF00\n#0000FF,TRANSPARENT';
    const grid = parsePindouCsv(raw);
    expect(grid.columns).toBe(2);
    expect(grid.rows).toBe(2);
    expect(grid.cells[0].color.hex).toBe('#FF0000');
    expect(grid.cells[3].external).toBe(true);

    const detailed = buildPindouCsv(buildDemoPindouPattern());
    const parsed = parsePindouCsv(detailed);
    expect(parsed.columns).toBe(24);
    expect(parsed.rows).toBe(24);
    expect(parsed.cells).toHaveLength(576);
  });

  it('paints cells, replaces colors and erases connected regions', () => {
    const yellow = PINDOU_PALETTES.perler.find(
      (color) => color.code === 'P06'
    ) as (typeof PINDOU_PALETTES.perler)[number];
    const pixels: Array<[number, number, number]> = [];
    for (let index = 0; index < 9; index += 1) {
      pixels.push(index === 4 ? [255, 211, 61] : [220, 50, 45]);
    }
    let pattern = buildPindouPattern({
      columns: 3,
      rows: 3,
      paletteId: 'perler',
      maxColors: 4,
      pixels
    });

    pattern = setPindouCellColor(pattern, 0, 0, yellow);
    expect(pattern.cells[0].color.code).toBe('P06');
    expect(pattern.counts.find((item) => item.code === 'P06')?.count).toBe(2);

    pattern = replacePindouColor(pattern, 'P04', yellow);
    expect(pattern.counts).toHaveLength(1);
    expect(pattern.counts[0]).toMatchObject({ code: 'P06', count: 9 });

    pattern = erasePindouConnectedRegion(pattern, 0, 0);
    expect(pattern.cells.every((cell) => cell.external)).toBe(true);
    expect(pattern.counts).toHaveLength(0);
  });

  it('round-trips project serialization', () => {
    const pattern = buildPindouPatternFromCells(
      buildDemoPindouPattern().cells,
      24,
      24,
      'perler'
    );
    const json = serializePindouProject(pattern, DEFAULT_PINDOU_SETTINGS, 'image');
    const restored = deserializePindouProject(json);
    expect(restored).not.toBeNull();
    expect(restored?.pattern.columns).toBe(24);
    expect(restored?.pattern.rows).toBe(24);
    expect(restored?.pattern.cells).toHaveLength(576);
    expect(restored?.pattern.cells[0].color.hex).toBe(
      pattern.cells[0].color.hex
    );
    expect(restored?.origin).toBe('image');
  });

  it('merges adjacent similar colors and keeps distant colors', () => {
    const p01 = PINDOU_PALETTES.perler.find((color) => color.code === 'P01');
    const p16 = PINDOU_PALETTES.perler.find((color) => color.code === 'P16');
    const p02 = PINDOU_PALETTES.perler.find((color) => color.code === 'P02');
    const pattern = buildPindouPatternFromCells(
      [
        { x: 0, y: 0, color: p01! },
        { x: 1, y: 0, color: p16! },
        { x: 2, y: 0, color: p02! },
        { x: 0, y: 1, color: p16! },
        { x: 1, y: 1, color: p01! },
        { x: 2, y: 1, color: p02! }
      ],
      3,
      2,
      'perler'
    );
    expect(pattern.counts).toHaveLength(3);
    const merged = mergePindouSimilarColors(pattern, 8);
    expect(merged.counts).toHaveLength(2);
    expect(merged.cells.filter((cell) => cell.color.code === 'P02')).toHaveLength(2);
    expect(merged.cells.filter((cell) => cell.color.code === 'P01')).toHaveLength(4);
  });

  it('round-trips compact share codes', () => {
    const pattern = buildDemoPindouPattern('mard');
    const code = encodePindouShareCode(pattern);
    const decoded = decodePindouShareCode(code);
    expect(decoded.columns).toBe(pattern.columns);
    expect(decoded.rows).toBe(pattern.rows);
    expect(decoded.cells).toHaveLength(pattern.cells.length);
    expect(
      decoded.cells.map((cell) => (cell.external ? 'T' : cell.color.hex))
    ).toEqual(
      pattern.cells.map((cell) => (cell.external ? 'T' : cell.color.hex))
    );
    expect(code.length).toBeLessThan(4000);
  });

  it('ships a complete 291-row color chart across 5 brand systems', () => {
    expect(PINDOU_COLOR_CHART_ROWS).toHaveLength(291);
    const hexSet = new Set(PINDOU_COLOR_CHART_ROWS.map((row) => row.hex));
    expect(hexSet.size).toBe(291);
    const mardCodes = new Set(PINDOU_PALETTES.mard.map((color) => color.code));
    for (const row of PINDOU_COLOR_CHART_ROWS) {
      expect(row.hex).toMatch(/^#[0-9A-F]{6}$/);
      expect(mardCodes.has(row.systems.mard)).toBe(true);
    }
  });

  it('ships 8 brand palettes with 1502 standard color codes', () => {
    expect(Object.keys(PINDOU_PALETTES)).toHaveLength(8);
    const total = Object.values(PINDOU_PALETTES).reduce(
      (sum, colors) => sum + colors.length,
      0
    );
    expect(total).toBe(1502);
    for (const [id, colors] of Object.entries(PINDOU_PALETTES)) {
      const codes = new Set(colors.map((color) => color.code));
      expect(codes.size).toBe(colors.length);
      expect(id).toMatch(/^(perler|hama|artkal|mard|coco|manman|panpan|mixiaowo)$/);
    }
  });
});
