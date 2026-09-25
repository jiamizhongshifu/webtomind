import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { installUiAuditMockRoutes } from './lib/ui-audit-fixtures.mjs';

const baseUrl = (process.env.MOBILE_DARK_CONTRAST_BASE_URL || 'http://127.0.0.1:4173').replace(/\/+$/, '');
const dataMode = process.env.MOBILE_DARK_CONTRAST_DATA === 'real' ? 'real' : 'mock';
const theme = process.env.MOBILE_CONTRAST_THEME === 'light' ? 'light' : 'dark';
const viewport = {
  width: Number(process.env.MOBILE_DARK_CONTRAST_WIDTH || 390),
  height: Number(process.env.MOBILE_DARK_CONTRAST_HEIGHT || 844)
};
const viewportLabel = viewport.width < 768 ? 'Mobile' : 'Desktop';
const environment = new URL(baseUrl).hostname === '127.0.0.1' ? 'local' : 'production';
const outputDir = path.resolve('output/mobile-contrast');
const routeSpecs = [
  { id: 'create', path: '/zh-CN/create' },
  { id: 'image', path: '/zh-CN/create/image' },
  { id: 'video', path: '/zh-CN/create/video' },
  { id: 'gallery', path: '/zh-CN/create/gallery' },
  { id: 'characters', path: '/zh-CN/create/characters' },
  { id: 'tasks', path: '/zh-CN/create/tasks' },
  { id: 'apps', path: '/zh-CN/create/apps' },
  { id: 'app-detail', path: '/zh-CN/create/apps/ecommerce-product-photo' },
  { id: 'prompts', path: '/zh-CN/prompts' },
  { id: 'prompt-model', path: '/zh-CN/prompts/model/gpt-image-2' },
  { id: 'prompt-detail', path: '/zh-CN/prompts/18540db9-a283-4ce1-877c-f8e103610627' },
  { id: 'account', path: '/zh-CN/account' },
  { id: 'pricing', path: '/zh-CN/pricing' },
  { id: 'recharge', path: '/zh-CN/recharge' },
  { id: 'recharge', path: '/zh-CN/recharge' },
  { id: 'terms', path: '/zh-CN/terms' },
  { id: 'privacy', path: '/zh-CN/privacy' },
  { id: 'history-preview', path: '/__dev/creative-workspace-controls-harness?mode=history-preview', mockOnly: true },
  { id: 'video-preview', path: '/__dev/creative-workspace-controls-harness?mode=video-preview', mockOnly: true },
  { id: 'history-gallery', path: '/__dev/creative-workspace-controls-harness?mode=history-gallery', mockOnly: true },
  { id: 'upgrade-modal', path: '/__dev/creative-workspace-controls-harness?mode=upgrade-modal', mockOnly: true },
  { id: 'asset-picker', path: '/__dev/creative-workspace-controls-harness?mode=asset-picker', mockOnly: true },
  { id: 'character-picker', path: '/__dev/creative-workspace-controls-harness?mode=character-picker', mockOnly: true },
  { id: 'action-sheet', path: '/__dev/action-sheet-harness', mockOnly: true },
  { id: 'onboarding-modal', path: '/__dev/create-onboarding-modal-harness', mockOnly: true },
  { id: 'project-modal', path: '/__dev/project-edit-modal-harness', mockOnly: true },
  { id: 'generation-records', path: '/__dev/generation-records-rail-harness', mockOnly: true }
].filter((spec) => dataMode === 'mock' || !spec.mockOnly);

function parseColor(value) {
  const match = String(value || '').match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i);
  if (!match) return null;
  return { r: +match[1], g: +match[2], b: +match[3], a: match[4] === undefined ? 1 : +match[4] };
}

function luminance({ r, g, b }) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function composite(front, back) {
  const alpha = front.a + back.a * (1 - front.a);
  return alpha === 0 ? { r: 0, g: 0, b: 0, a: 0 } : {
    r: (front.r * front.a + back.r * back.a * (1 - front.a)) / alpha,
    g: (front.g * front.a + back.g * back.a * (1 - front.a)) / alpha,
    b: (front.b * front.a + back.b * back.a * (1 - front.a)) / alpha,
    a: alpha
  };
}

function sampleImageBackground({ data, info }, candidate) {
  const scaleX = info.width / candidate.pageWidth;
  const scaleY = info.height / candidate.pageHeight;
  const points = [
    [candidate.x + 2, candidate.y + 2],
    [candidate.x + candidate.width - 3, candidate.y + 2],
    [candidate.x + 2, candidate.y + candidate.height - 3],
    [candidate.x + candidate.width - 3, candidate.y + candidate.height - 3]
  ];
  return points.map(([x, y]) => {
    const px = Math.max(0, Math.min(info.width - 1, Math.round(x * scaleX)));
    const py = Math.max(0, Math.min(info.height - 1, Math.round(y * scaleY)));
    const offset = (py * info.width + px) * info.channels;
    return { r: data[offset], g: data[offset + 1], b: data[offset + 2], a: 1 };
  });
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: 3,
  isMobile: viewport.width < 768,
  hasTouch: viewport.width < 768,
  locale: 'zh-CN',
  colorScheme: theme
});
if (dataMode === 'mock') {
  await installUiAuditMockRoutes(context, { baseUrl, enabled: true, seedAuthSession: true });
}
await context.addInitScript(({ selectedTheme }) => {
  localStorage.setItem('webtomind_theme', selectedTheme);
  localStorage.setItem('webtomind:analytics-consent:v1', 'denied');
  localStorage.setItem('webtomind:create-onboarding-seen:v1', '1');
  localStorage.setItem('workspace:onboarding-seen', '1');
}, { selectedTheme: theme });

const results = [];
for (const spec of routeSpecs) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}${spec.path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
  await page.waitForTimeout(500);
  if (theme === 'dark') {
    // Consent-gate storage handling can race with theme init; force the
    // resolved theme so contrast findings reflect the actual dark surface.
    await page.evaluate(() => {
      localStorage.setItem('webtomind_theme', 'dark');
      document.documentElement.classList.add('dark');
    });
    await page.waitForTimeout(200);
  }
  const candidates = await page.evaluate(() => {
    const parse = (value) => {
      const match = String(value || '').match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i);
      if (!match) return null;
      return { r: +match[1], g: +match[2], b: +match[3], a: match[4] === undefined ? 1 : +match[4] };
    };
    const blend = (front, back) => {
      const a = front.a + back.a * (1 - front.a);
      return a === 0 ? { r: 0, g: 0, b: 0, a: 0 } : {
        r: (front.r * front.a + back.r * back.a * (1 - front.a)) / a,
        g: (front.g * front.a + back.g * back.a * (1 - front.a)) / a,
        b: (front.b * front.a + back.b * back.a * (1 - front.a)) / a,
        a
      };
    };
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || +style.opacity <= 0 || rect.width <= 0 || rect.height <= 0) return false;
      const clippedForAssistiveTechnology =
        style.clipPath === 'inset(50%)' ||
        style.clip === 'rect(0px, 0px, 0px, 0px)' ||
        style.clip === 'rect(0px 0px 0px 0px)';
      if (clippedForAssistiveTechnology && rect.width <= 1 && rect.height <= 1) return false;
      let parent = element.parentElement;
      while (parent) {
        const parentStyle = getComputedStyle(parent);
        if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden' || +parentStyle.opacity <= 0) return false;
        const parentRect = parent.getBoundingClientRect();
        const parentClippedForAssistiveTechnology =
          parentStyle.clipPath === 'inset(50%)' ||
          parentStyle.clip === 'rect(0px, 0px, 0px, 0px)' ||
          parentStyle.clip === 'rect(0px 0px 0px 0px)';
        if (
          parentClippedForAssistiveTechnology &&
          parentRect.width <= 1 &&
          parentRect.height <= 1
        ) {
          return false;
        }
        parent = parent.parentElement;
      }
      return true;
    };
    const effectiveBackground = (element) => {
      const layers = [];
      let imageOwner = '';
      let node = element;
      while (node instanceof Element) {
        const style = getComputedStyle(node);
        if (!imageOwner && node !== document.body && node !== document.documentElement && style.backgroundImage !== 'none') {
          const id = node.id ? `#${CSS.escape(node.id)}` : '';
          const classes = Array.from(node.classList).slice(0, 3).map((name) => `.${CSS.escape(name)}`).join('');
          imageOwner = `${node.tagName.toLowerCase()}${id}${classes}`;
        }
        const color = parse(style.backgroundColor);
        if (color?.a > 0) {
          layers.push(color);
          if (color.a >= 0.99) break;
        }
        node = node.parentElement;
      }
      const body = parse(getComputedStyle(document.body).backgroundColor);
      let result = body?.a > 0 ? body : { r: 18, g: 18, b: 18, a: 1 };
      for (let index = layers.length - 1; index >= 0; index -= 1) result = blend(layers[index], result);
      return { color: result, imageOwner };
    };
    const selector = (element, pseudo = '') => {
      const id = element.id ? `#${CSS.escape(element.id)}` : '';
      const classes = Array.from(element.classList).slice(0, 3).map((name) => `.${CSS.escape(name)}`).join('');
      return `${element.tagName.toLowerCase()}${id}${classes}${pseudo}`;
    };
    const pageWidth = Math.max(document.documentElement.scrollWidth, innerWidth);
    const pageHeight = Math.max(document.documentElement.scrollHeight, innerHeight);
    const output = [];
    const push = (element, type, style, text, minimum, pseudo = '') => {
      const rect = element.getBoundingClientRect();
      const background = effectiveBackground(element);
      output.push({
        type,
        selector: selector(element, pseudo),
        text: String(text || '').trim().replace(/\s+/g, ' ').slice(0, 100),
        foreground: style.color || style.stroke || style.fill || style.borderColor,
        background: background.color,
        backgroundImageOwner: background.imageOwner,
        minimum,
        x: rect.left + scrollX,
        y: rect.top + scrollY,
        width: rect.width,
        height: rect.height,
        pageWidth,
        pageHeight
      });
    };
    const visibleDialogs = Array.from(
      document.querySelectorAll('[role="dialog"]')
    ).filter(visible);
    const scanRoot = visibleDialogs.at(-1) || document.body;
    for (const element of scanRoot.querySelectorAll('*')) {
      if (!visible(element) || ['SCRIPT', 'STYLE', 'IMG', 'VIDEO', 'CANVAS', 'PATH'].includes(element.tagName)) continue;
      const style = getComputedStyle(element);
      const ownText = Array.from(element.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (ownText) {
        const size = parseFloat(style.fontSize);
        const weight = parseInt(style.fontWeight, 10) || 400;
        push(element, 'text', style, element.textContent, size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5);
      }
      if (['INPUT', 'TEXTAREA'].includes(element.tagName) && element.getAttribute('placeholder')) {
        push(element, 'placeholder', getComputedStyle(element, '::placeholder'), element.getAttribute('placeholder'), 4.5, '::placeholder');
      }
      for (const pseudo of ['::before', '::after']) {
        const pseudoStyle = getComputedStyle(element, pseudo);
        if (pseudoStyle.content && !['none', 'normal', '""'].includes(pseudoStyle.content)) {
          push(element, 'pseudo-text', pseudoStyle, pseudoStyle.content.replace(/^['"]|['"]$/g, ''), 4.5, pseudo);
        }
      }
      if (element.tagName.toLowerCase() === 'svg') {
        const paintedChildren = Array.from(element.querySelectorAll('path, circle, rect, line, polyline, polygon'))
          .map((shape) => {
            const shapeStyle = getComputedStyle(shape);
            return shapeStyle.stroke !== 'none' ? shapeStyle.stroke : shapeStyle.fill;
          })
          .filter((color) => color && color !== 'none');
        const colors = [...new Set(paintedChildren)];
        if (colors.length > 1) {
          push(element, 'icon', { color: colors[0] }, element.getAttribute('aria-label') || '', 3);
          output.at(-1).backgroundImageOwner = `${selector(element)}[multicolor-svg]`;
        } else if (colors.length) {
          for (const color of colors) push(element, 'icon', { color }, element.getAttribute('aria-label') || '', 3);
        } else {
          const iconStyle = getComputedStyle(element);
          const color = iconStyle.stroke !== 'none' ? iconStyle.stroke : iconStyle.fill;
          if (color && color !== 'none') push(element, 'icon', { color }, element.getAttribute('aria-label') || '', 3);
        }
      }
      if (element.matches('input, textarea, select, [role="switch"]')) {
        const width = Math.max(parseFloat(style.borderTopWidth), parseFloat(style.borderRightWidth), parseFloat(style.borderBottomWidth), parseFloat(style.borderLeftWidth));
        if (width >= 1 && style.borderStyle !== 'none') push(element, 'control-border', { color: style.borderColor }, element.getAttribute('aria-label') || element.textContent, 3);
      }
    }
    return output;
  });
  const screenshot = await page.screenshot({ fullPage: true });
  const decodedScreenshot = await sharp(screenshot).raw().toBuffer({
    resolveWithObject: true
  });
  const findings = [];
  const manualReviews = [];
  const imageBackgroundReviews = new Map();
  for (const candidate of candidates) {
    const foreground = parseColor(candidate.foreground);
    if (!foreground) continue;
    if (candidate.backgroundImageOwner) {
      const reviewKey = `${candidate.backgroundImageOwner}|${candidate.type}`;
      const existing = imageBackgroundReviews.get(reviewKey);
      if (existing) {
        existing.affectedElements += 1;
        continue;
      }
      imageBackgroundReviews.set(reviewKey, {
        type: candidate.type,
        backgroundImageOwner: candidate.backgroundImageOwner,
        selector: candidate.selector,
        text: candidate.text,
        foreground: candidate.foreground,
        affectedElements: 1,
        sampledBackgrounds: sampleImageBackground(
          decodedScreenshot,
          candidate
        )
      });
      continue;
    }
    const backgrounds = [candidate.background];
    const ratios = backgrounds.map((background) => contrast(composite(foreground, background), background));
    const measured = Math.min(...ratios);
    if (measured + 0.01 < candidate.minimum) {
      findings.push({ ...candidate, ratio: +measured.toFixed(2), sampledBackgrounds: backgrounds });
    }
  }
  manualReviews.push(...imageBackgroundReviews.values());
  const screenshotName = `${environment}-${dataMode}-${theme}-${viewport.width}-${spec.id}.png`;
  await fs.writeFile(path.join(outputDir, screenshotName), screenshot);
  results.push({ id: spec.id, path: spec.path, findings, manualReviews });
  await page.close();
}

await browser.close();
const total = results.reduce((sum, result) => sum + result.findings.length, 0);
const manualReviewTotal = results.reduce(
  (sum, result) => sum + result.manualReviews.length,
  0
);
const reportName = `report-${environment}-${dataMode}-${theme}-${viewport.width}.json`;
await fs.writeFile(path.join(outputDir, reportName), `${JSON.stringify({ baseUrl, environment, dataMode, theme, viewport, generatedAt: new Date().toISOString(), total, manualReviewTotal, results }, null, 2)}\n`);
console.log(`${viewportLabel} ${theme} contrast audit: ${total} failure(s), ${manualReviewTotal} image-background review item(s) across ${routeSpecs.length} states (${environment}/${dataMode}).`);
console.log(`Report: ${path.join(outputDir, reportName)}`);
if (total > 0) process.exitCode = 1;
