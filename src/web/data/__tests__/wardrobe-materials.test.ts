import { describe, expect, it } from 'vitest';
import { defaultImagePromptSelection } from '../image-prompt-core';
import {
  applyWardrobeMaterialPrefix,
  normalizeWardrobeMaterialSelection,
  wardrobeMaterialFamilies,
  wardrobeMaterialPresets
} from '../wardrobe-materials';

describe('wardrobe material overrides', () => {
  it('ships a focused material set with unique stable identifiers', () => {
    expect(wardrobeMaterialPresets).toHaveLength(24);
    expect(new Set(wardrobeMaterialPresets.map((item) => item.id)).size).toBe(
      24
    );
  });

  it('organizes every material into a populated, known fashion family', () => {
    const familyIds = new Set(wardrobeMaterialFamilies.map((item) => item.id));

    expect(wardrobeMaterialFamilies).toHaveLength(4);
    expect(
      wardrobeMaterialPresets.every((item) => familyIds.has(item.family))
    ).toBe(true);
    for (const family of wardrobeMaterialFamilies) {
      expect(
        wardrobeMaterialPresets.filter((item) => item.family === family.id)
          .length
      ).toBeGreaterThanOrEqual(5);
    }
  });

  it('keeps translucent and patterned materials physically bounded', () => {
    const chiffon = wardrobeMaterialPresets.find(
      (item) => item.id === 'silk-chiffon'
    )!;
    const jacquard = wardrobeMaterialPresets.find(
      (item) => item.id === 'brocade-jacquard'
    )!;

    expect(chiffon.renderingEn).toContain('opaque lining');
    expect(chiffon.renderingEn).toContain('preserves the original coverage');
    expect(jacquard.renderingEn).toContain('without printed graphics');
  });

  it('keeps every material preset inside the material axis', () => {
    const crossAxisTerms =
      /camera|lens|lighting|background|scene|pose|expression|makeup/i;

    for (const material of wardrobeMaterialPresets) {
      expect(material.renderingEn).not.toMatch(crossAxisTerms);
      expect(material.swatch).toHaveLength(2);
      expect(
        material.swatch.every((color) => /^#[0-9a-f]{6}$/i.test(color))
      ).toBe(true);
    }
  });

  it('prefixes the material while preserving the original garment description', () => {
    const original = 'black cropped jacket with crisp tailoring';
    const result = applyWardrobeMaterialPrefix(
      'top',
      original,
      { top: 'silk-satin' },
      'en-US'
    );

    expect(result.indexOf('Material replacement:')).toBe(0);
    expect(result).toContain(
      'preserve the original silhouette, color, coverage'
    );
    expect(result).toContain(`Original garment: ${original}`);
  });

  it('uses structure-specific guards for outfits, one-pieces, and shoes', () => {
    expect(
      applyWardrobeMaterialPrefix(
        'outfit',
        'tailored set',
        { outfit: 'velvet' },
        'en-US'
      )
    ).toContain('separate top-and-bottom structure');
    expect(
      applyWardrobeMaterialPrefix(
        'onePiece',
        'column dress',
        { onePiece: 'velvet' },
        'en-US'
      )
    ).toContain('connected one-piece structure');
    expect(
      applyWardrobeMaterialPrefix(
        'shoes',
        'platform boots',
        { shoes: 'velvet' },
        'en-US'
      )
    ).toContain('sole construction');
    expect(
      applyWardrobeMaterialPrefix(
        'shoes',
        'platform boots',
        { shoes: 'patent-vinyl' },
        'en-US'
      )
    ).toContain("footwear's primary upper material");
  });

  it('drops invalid and orphaned overrides', () => {
    expect(
      normalizeWardrobeMaterialSelection(
        { top: 'not-real', bottom: 'velvet' },
        { ...defaultImagePromptSelection, top: 'top-test', bottom: null }
      )
    ).toEqual({});
  });
});
