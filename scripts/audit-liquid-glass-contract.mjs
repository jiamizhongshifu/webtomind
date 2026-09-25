#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const repoRoot = process.cwd();
const cssFiles = [
  'src/web/styles/geist-theme.css',
  'src/web/styles/image-create.css',
  'src/web/styles/marketing-pages.css'
];

const forbiddenMaterialProps = [
  'position',
  'display',
  'overflow',
  'overflow-x',
  'overflow-y',
  'pointer-events',
  'z-index',
  'inset',
  'top',
  'right',
  'bottom',
  'left'
];

function lineForIndex(source, index) {
  return source.slice(0, index).split('\n').length;
}

function hasProperty(body, property) {
  const escaped = property.replaceAll('-', '\\-');
  return new RegExp(`(^|[;\\n\\r])\\s*${escaped}\\s*:`, 'm').test(body);
}

const findings = [];

for (const file of cssFiles) {
  const absolute = resolve(repoRoot, file);
  const source = readFileSync(absolute, 'utf8');
  const relativeFile = relative(repoRoot, absolute);

  const localTokenPattern =
    /--(?:liquid|prompt)-glass-[\w-]+\s*:\s*([^;]+);/g;
  for (const match of source.matchAll(localTokenPattern)) {
    const value = String(match[1] ?? '').trim();
    if (value.startsWith('var(--surface-glass')) continue;

    findings.push({
      file: relativeFile,
      line: lineForIndex(source, match.index ?? 0),
      message:
        'Local liquid/prompt glass tokens must alias the shared --surface-glass-* token family.'
    });
  }

  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of source.matchAll(blockPattern)) {
    const selector = match[1].trim();
    const body = match[2];
    const usesGlassToken = /var\(--(?:liquid|prompt|surface)-glass/.test(body);
    const appliesBackdrop =
      /(^|[;\n\r])\s*(?:-webkit-)?backdrop-filter\s*:/.test(body);

    if (!usesGlassToken || !appliesBackdrop) continue;

    const forbidden = forbiddenMaterialProps.filter((property) =>
      hasProperty(body, property)
    );

    if (forbidden.length === 0) continue;

    findings.push({
      file: relativeFile,
      line: lineForIndex(source, match.index ?? 0),
      message: `Glass material block changes layout semantics (${forbidden.join(
        ', '
      )}) in selector: ${selector.replace(/\s+/g, ' ')}`
    });
  }
}

if (findings.length > 0) {
  console.error('Liquid Glass contract audit failed:\n');
  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line} ${finding.message}`
    );
  }
  process.exit(1);
}

console.log(
  'Liquid Glass contract audit passed: shared tokens are aliased and material blocks do not change layout semantics.'
);
