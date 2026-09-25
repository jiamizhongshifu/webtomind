const RGB_PATTERN =
  /rgba?\(\s*([\d.]+)(?:\s*,|\s+)\s*([\d.]+)(?:\s*,|\s+)\s*([\d.]+)(?:\s*(?:,|\/)\s*([\d.]+)%?)?\s*\)/i;

export function parseCssColor(value) {
  if (!value || value === 'none' || value === 'transparent') return null;
  const match = String(value).match(RGB_PATTERN);
  if (!match) return null;
  const alphaValue = match[4];
  const alpha =
    alphaValue === undefined
      ? 1
      : String(value).includes(`${alphaValue}%`)
        ? Number(alphaValue) / 100
        : Number(alphaValue);
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: Math.min(1, Math.max(0, alpha))
  };
}

export function compositeColors(foreground, background) {
  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r:
      (foreground.r * foreground.a +
        background.r * background.a * (1 - foreground.a)) /
      alpha,
    g:
      (foreground.g * foreground.a +
        background.g * background.a * (1 - foreground.a)) /
      alpha,
    b:
      (foreground.b * foreground.a +
        background.b * background.a * (1 - foreground.a)) /
      alpha,
    a: alpha
  };
}

function linearize(channel) {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(color) {
  return (
    0.2126 * linearize(color.r) +
    0.7152 * linearize(color.g) +
    0.0722 * linearize(color.b)
  );
}

export function contrastRatio(foreground, background) {
  const opaqueBackground =
    background.a < 1
      ? compositeColors(background, { r: 255, g: 255, b: 255, a: 1 })
      : background;
  const opaqueForeground =
    foreground.a < 1
      ? compositeColors(foreground, opaqueBackground)
      : foreground;
  const foregroundLuminance = relativeLuminance(opaqueForeground);
  const backgroundLuminance = relativeLuminance(opaqueBackground);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastRatioFromCss(foreground, background) {
  const parsedForeground = parseCssColor(foreground);
  const parsedBackground = parseCssColor(background);
  if (!parsedForeground || !parsedBackground) return null;
  return contrastRatio(parsedForeground, parsedBackground);
}
