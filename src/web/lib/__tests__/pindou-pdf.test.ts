import { describe, expect, it } from 'vitest';
import {
  computePindouGridTiles,
  computePindouPdfLayout
} from '../pindou-pdf';

describe('pindou PDF layout', () => {
  it('fits a small pattern and its bead list on one page', () => {
    const layout = computePindouPdfLayout({
      columns: 24,
      rows: 24,
      colorCount: 3,
      imageWidth: 432,
      imageHeight: 432
    });
    expect(layout.tableStartsOnPageTwo).toBe(false);
    expect(layout.tableTopOnPageOne).toBeGreaterThan(0);
  });

  it('moves the bead list to page two when the pattern fills the page', () => {
    const layout = computePindouPdfLayout({
      columns: 140,
      rows: 180,
      colorCount: 32,
      imageWidth: 840,
      imageHeight: 1080
    });
    expect(layout.tableStartsOnPageTwo).toBe(true);
  });

  it('keeps a tall image inside the printable area', () => {
    const layout = computePindouPdfLayout({
      columns: 60,
      rows: 180,
      colorCount: 12,
      imageWidth: 360,
      imageHeight: 1080
    });
    expect(layout.imageDrawHeight).toBeLessThanOrEqual(880);
    expect(layout.tableStartsOnPageTwo).toBe(true);
  });
});

describe('pindou PDF grid pagination', () => {
  it('keeps small patterns on a single grid page', () => {
    const tiles = computePindouGridTiles(24, 24);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({
      pageNumber: 1,
      pageCount: 1,
      colStart: 0,
      rowStart: 0,
      colEnd: 23,
      rowEnd: 23,
      columns: 24,
      rows: 24
    });
  });

  it('splits a 50x50 pattern into exactly one page', () => {
    const tiles = computePindouGridTiles(50, 50);
    expect(tiles).toHaveLength(1);
    expect(tiles[0].pageCount).toBe(1);
  });

  it('paginates 140x180 into 12 pages of 50x50 tiles', () => {
    const tiles = computePindouGridTiles(140, 180);
    expect(tiles).toHaveLength(12);
    expect(tiles[0]).toMatchObject({
      pageNumber: 1,
      pageCount: 12,
      colStart: 0,
      rowStart: 0,
      colEnd: 49,
      rowEnd: 49,
      columns: 50,
      rows: 50
    });
    const rightEdge = tiles.find((tile) => tile.colStart === 100);
    expect(rightEdge?.colEnd).toBe(139);
    expect(rightEdge?.columns).toBe(40);
    const bottomEdge = tiles.find((tile) => tile.rowStart === 150);
    expect(bottomEdge?.rowEnd).toBe(179);
    expect(bottomEdge?.rows).toBe(30);
    expect(tiles[tiles.length - 1].pageNumber).toBe(12);
  });
});
