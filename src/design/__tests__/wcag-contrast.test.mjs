import { describe, expect, it } from 'vitest';
import {
  compositeColors,
  contrastRatioFromCss,
  parseCssColor
} from '../../../scripts/lib/wcag-contrast.mjs';

describe('wcag contrast helpers', () => {
  it('parses comma, space and percentage alpha RGB colors', () => {
    expect(parseCssColor('rgb(255, 250, 242)')).toEqual({
      r: 255,
      g: 250,
      b: 242,
      a: 1
    });
    expect(parseCssColor('rgb(255 250 242 / 50%)')?.a).toBe(0.5);
  });

  it('composites translucent colors before measuring contrast', () => {
    const composite = compositeColors(
      { r: 255, g: 255, b: 255, a: 0.5 },
      { r: 0, g: 0, b: 0, a: 1 }
    );
    expect(composite.r).toBeCloseTo(127.5);
    expect(
      contrastRatioFromCss(
        'rgba(255, 255, 255, 0.5)',
        'rgb(0, 0, 0)'
      )
    ).toBeCloseTo(5.28, 1);
  });

  it('matches canonical WCAG black and white contrast', () => {
    expect(
      contrastRatioFromCss('rgb(255, 255, 255)', 'rgb(0, 0, 0)')
    ).toBe(21);
  });
});
