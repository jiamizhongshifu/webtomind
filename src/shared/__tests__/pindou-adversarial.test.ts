import { describe, expect, it } from 'vitest';
import {
  buildDemoPindouPattern,
  buildPindouPattern,
  DEFAULT_PINDOU_SETTINGS,
  decodePindouShareCode,
  deserializePindouProject,
  encodePindouShareCode,
  mergePindouSimilarColors,
  parsePindouCsv,
  pindouColorDistance,
  removePindouBackground,
  serializePindouProject
} from '../pindou-pattern-maker';

describe('pindou adversarial edge cases', () => {
  it(
    'merges a full 140x180 grid without freezing the main thread',
    // buildPindouPattern on 25k pixels takes ~2.7s even on a fast machine and
    // grows further under 2-worker CPU contention on GitHub runners, so the
    // default 5s vitest timeout is too tight. The 30s budget still catches a
    // quadratic merge regression (25k^2 distance checks take minutes). Retry
    // once under contention: a real perf regression fails every attempt, while
    // a scheduler pause on a shared 2-core runner passes on the second try.
    { timeout: 30000, retry: 2 },
    () => {
      const columns = 140;
      const rows = 180;
      const pixels: Array<[number, number, number]> = [];
      for (let index = 0; index < columns * rows; index += 1) {
        pixels.push([200 + (index % 10), 100 + (index % 8), 50 + (index % 6)]);
      }
      const pattern = buildPindouPattern({
        columns,
        rows,
        paletteId: 'mard',
        maxColors: 32,
        pixels
      });
      const start = Date.now();
      const merged = mergePindouSimilarColors(pattern, 40);
      const elapsed = Date.now() - start;
      // Wall-clock smoke: a quadratic merge at 25k pixels would take far longer
      // than this even on an idle machine, while 2-worker CI runners can pause
      // the main thread for several seconds under CPU contention.
      expect(elapsed).toBeLessThan(20000);
      expect(merged.cells).toHaveLength(columns * rows);
      expect(merged.counts.length).toBeLessThanOrEqual(pattern.counts.length);
    }
  );

  it('rejects malformed share codes', () => {
    expect(() => decodePindouShareCode('!!!not-base64!!!')).toThrow();
    expect(() => decodePindouShareCode('')).toThrow();
    expect(() =>
      decodePindouShareCode(
        btoa(JSON.stringify({ v: 1, c: 0, r: 0, p: 'perler', d: '' }))
      )
    ).toThrow();
  });

  it('handles a flat single-color pattern and zero thresholds without crashing', () => {
    const pattern = buildPindouPattern({
      columns: 16,
      rows: 16,
      paletteId: 'perler',
      maxColors: 4,
      pixels: Array.from({ length: 256 }, () => [250, 245, 234])
    });
    expect(pattern.counts.length).toBeGreaterThan(0);
    const cleaned = removePindouBackground(pattern);
    expect(cleaned.cells).toHaveLength(256);
    const merged = mergePindouSimilarColors(pattern, 0);
    expect(merged.counts).toEqual(pattern.counts);
  });

  it('csv parser rejects inconsistent rows but tolerates BOM and blank lines', () => {
    expect(() => parsePindouCsv('#FFFFFF,#000000\n#123456')).toThrow(
      /columns, expected 2/
    );
    const grid = parsePindouCsv('\uFEFF#FFFFFF,#000000\n\n#123456,#ABCDEF\n');
    expect(grid.columns).toBe(2);
    expect(grid.rows).toBe(2);
  });

  it('serialization round-trips external cells with a MARD palette', () => {
    const pattern = removePindouBackground(buildDemoPindouPattern('mard'));
    const json = serializePindouProject(
      pattern,
      DEFAULT_PINDOU_SETTINGS,
      'edited'
    );
    const restored = deserializePindouProject(json);
    expect(restored).not.toBeNull();
    expect(
      restored?.pattern.cells.map((cell) =>
        cell.external ? 'T' : cell.color.hex
      )
    ).toEqual(
      pattern.cells.map((cell) => (cell.external ? 'T' : cell.color.hex))
    );
    expect(restored?.origin).toBe('edited');
  });

  it('share code round-trips external cells', () => {
    const pattern = removePindouBackground(buildDemoPindouPattern('perler'));
    const decoded = decodePindouShareCode(encodePindouShareCode(pattern));
    expect(
      decoded.cells.map((cell) => (cell.external ? 'T' : cell.color.hex))
    ).toEqual(
      pattern.cells.map((cell) => (cell.external ? 'T' : cell.color.hex))
    );
  });

  it('color distance is symmetric and zero for identical colors', () => {
    const color: [number, number, number] = [120, 80, 200];
    expect(pindouColorDistance(color, color)).toBe(0);
    expect(pindouColorDistance(color, [120, 81, 200])).toBeCloseTo(
      pindouColorDistance([120, 81, 200], color),
      8
    );
  });
});
