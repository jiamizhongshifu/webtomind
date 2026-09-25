#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const sourceRoots = ['src/design', 'src/shared', 'src/web', 'src/workspace'];
const textExtensions = new Set(['.css', '.ts', '.tsx']);

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git')
      continue;
    const absolute = join(dir, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      walk(absolute, files);
    } else if (textExtensions.has(extname(entry))) {
      files.push(absolute);
    }
  }
  return files;
}

function countMatches(text, regex) {
  return [...text.matchAll(regex)].length;
}

function topEntries(map, limit = 12) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

const sharedPrimitiveTagNames = [
  'ActionSheet',
  'ButtonLink',
  'Card',
  'Dialog',
  'EmptyState',
  'FeedbackMessage',
  'ImageLightbox',
  'MediaTile',
  'Navigation',
  'NavigationList',
  'NavigationLink'
];

function stripSharedPrimitiveOpeningTags(text) {
  const tagPattern = new RegExp(
    `<(?:${sharedPrimitiveTagNames.join('|')})\\b`,
    'g'
  );
  let stripped = '';
  let cursor = 0;

  for (const match of text.matchAll(tagPattern)) {
    const start = match.index ?? 0;
    let end = start;
    let quote = null;

    while (end < text.length) {
      const char = text[end];
      if (quote) {
        if (char === quote && text[end - 1] !== '\\') quote = null;
      } else if (char === '"' || char === "'" || char === '`') {
        quote = char;
      } else if (char === '>' && text[end - 1] !== '=') {
        end += 1;
        break;
      }
      end += 1;
    }

    stripped += text.slice(cursor, start);
    cursor = end;
  }

  return stripped + text.slice(cursor);
}

function countNativeCategoryPillViolations(text) {
  let count = 0;

  for (const match of text.matchAll(/<(?:button|a|Link)\b/g)) {
    const start = match.index ?? 0;
    let end = start;
    let quote = null;

    while (end < text.length) {
      const char = text[end];
      if (quote) {
        if (char === quote && text[end - 1] !== '\\') quote = null;
      } else if (char === '"' || char === "'" || char === '`') {
        quote = char;
      } else if (char === '>' && text[end - 1] !== '=') {
        end += 1;
        break;
      }
      end += 1;
    }

    const openingTag = text.slice(start, end);
    if (openingTag.includes('marketing-category-pill')) {
      count += 1;
    }
  }

  return count;
}

function isTestFilePath(path) {
  return (
    path.includes('/__tests__/') || /\.(?:test|spec)\.[jt]sx?$/i.test(path)
  );
}

function isPausedSkillFeaturePath(path) {
  return (
    /^src\/web\/pages\/PublicSkill(?:sPage|DetailPage)\.tsx$/.test(path) ||
    /^src\/workspace\/components\/(?:ChatSkillEntryPopover|Skill[A-Za-z0-9]*|SkillsPlaza)\.tsx$/.test(
      path
    ) ||
    /^src\/workspace\/hooks\/use(?:ChatSkills|Skill[A-Za-z0-9]*|Skills)\.ts$/.test(
      path
    )
  );
}

const files = sourceRoots.flatMap((dir) => walk(join(root, dir)));
const cssFiles = files.filter((file) => file.endsWith('.css'));
const componentFiles = files.filter((file) => file.endsWith('.tsx'));
const productComponentSourceFiles = componentFiles.filter((file) => {
  const path = relative(root, file);
  return !isTestFilePath(path) && !isPausedSkillFeaturePath(path);
});
const pausedSkillFeatureFiles = componentFiles.filter((file) => {
  const path = relative(root, file);
  return !isTestFilePath(path) && isPausedSkillFeaturePath(path);
});
const componentTestFiles = componentFiles.filter((file) => {
  const path = relative(root, file);
  return isTestFilePath(path);
});
const sourceCodeFiles = files.filter((file) => {
  const path = relative(root, file);
  return (
    (file.endsWith('.ts') || file.endsWith('.tsx')) &&
    !isTestFilePath(path) &&
    !isPausedSkillFeaturePath(path)
  );
});

const alwaysDarkOverlaySelectors = [
  'creator-prompt-case-lightbox',
  'creator-preview-nav',
  'creator-preview-image-zoom',
  'creator-preview-image-switcher'
];
const alwaysDarkOverlayInverseViolations = [];
for (const file of cssFiles) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1];
    const body = match[2];
    if (
      alwaysDarkOverlaySelectors.some((name) => selector.includes(name)) &&
      body.includes('--product-text-inverse')
    ) {
      alwaysDarkOverlayInverseViolations.push(
        `${relative(root, file)} -> ${selector.trim().replace(/\s+/g, ' ')}`
      );
    }
  }
}
const pricingThemeSource = readFileSync(
  join(root, 'src/web/styles/geist-theme.css'),
  'utf8'
);
const fuzzyPricingCtaSelectorViolations = countMatches(
  pricingThemeSource,
  /(?:button|a)\[class\*=['"]bg-rose-500['"]\]/g
);

const cssLineCounts = cssFiles
  .map((file) => {
    const text = readFileSync(file, 'utf8');
    return [relative(root, file), text.split('\n').length];
  })
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12);

const classPrefixCounts = new Map();
for (const file of cssFiles) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\.([a-z][a-z0-9-]*)/gi)) {
    const className = match[1];
    const prefix = className.split('-').slice(0, 2).join('-');
    classPrefixCounts.set(prefix, (classPrefixCounts.get(prefix) ?? 0) + 1);
  }
}

const patternChecks = [
  {
    label: 'legacy button classes',
    ruleId: 'rule/component-semantics-before-style',
    regex: /\bbtn-(?:primary|secondary|gradient|ghost|icon|large)\b/g
  },
  {
    label: 'shared ui button classes',
    ruleId: 'rule/component-semantics-before-style',
    regex:
      /\bui-button(?:--(?:primary|secondary|ghost|danger|glass|sm|md|lg|loading)|__(?:icon|label))?\b/g,
    isDrift: false
  },
  {
    label: 'page-owned card classes',
    ruleId: 'rule/component-semantics-before-style',
    regex:
      /\b(?:(?:home|feature|scenario|advantage|pipeline|hot-case|case-collection|create-gallery|create-account|create-app|create-character|prompt-browser|workspace)-[a-z0-9-]*card(?!-)|theme-card-card(?!-))\b/g
  },
  {
    label: 'page-owned overlay classes',
    ruleId: 'rule/action-sheet-global-layer',
    regex:
      /\b(?:create-gallery|creator|history|image|prompt-browser|workspace)-[a-z0-9-]*(?:modal|popover|sheet|lightbox|preview)\b/g
  },
  {
    label: 'inline utility-style className strings',
    ruleId: 'rule/component-semantics-before-style',
    regex:
      /className=["'`][^"'`]*(?:bg-|rounded-|shadow-|border-|text-|px-|py-|grid |flex |absolute |fixed )[^"'`]*["'`]/g
  },
  {
    label: 'liquid glass direct tokens',
    ruleId: 'rule/layered-visual-language',
    regex: /--(?:liquid|prompt)-glass-[a-z0-9-]+/g
  }
];

const usageFiles = files.filter(
  (file) => relative(root, file) !== 'src/design/component-registry.ts'
);
const registryText = readFileSync(
  join(root, 'src/design/component-registry.ts'),
  'utf8'
);
const zhongRulesPath = join(
  root,
  '.agents/skills/zhong-design-review/references/rules.md'
);
const zhongRulesText = existsSync(zhongRulesPath)
  ? readFileSync(zhongRulesPath, 'utf8')
  : '';
const referencedRuleIds = new Set(
  patternChecks.map((check) => check.ruleId).filter(Boolean)
);
referencedRuleIds.add('rule/design-system-adapter-boundary');
referencedRuleIds.add('rule/image-loading-priority-by-viewport');
const missingRuleDefinitions = [...referencedRuleIds].filter(
  (ruleId) => !zhongRulesText.includes(`## ${ruleId}`)
);
const foundationTargetResults = [];
const semanticallyMigratedCardSignals = new Map();
const semanticallyMigratedButtonSignals = new Map();
const semanticallyMigratedFormControlSignals = new Map();
const semanticallyMigratedFeedbackSignals = new Map();
const semanticallyMigratedEmptyStateSignals = new Map();
const semanticallyMigratedDialogSignals = new Map();
const semanticallyMigratedActionSheetSignals = new Map();
const semanticallyMigratedOverlayBehaviorSignals = new Map();
const semanticallyMigratedMediaTileSignals = new Map();
const semanticallyMigratedBadgeSignals = new Map();
const semanticallyMigratedDynamicIconSignals = new Map();
const semanticallyMigratedNavigationSignals = new Map();
const featureOverlayPrimitiveSignals = new Map();
const domImageFetchPriorityViolations = [];
const nativeCategoryPillViolations = [];

for (const blockMatch of registryText.matchAll(
  /\{\s*family: '[^']+'[\s\S]*?liquidGlassPolicy: '[^']+'\s*\}/g
)) {
  const block = blockMatch[0];
  const family = block.match(/family: '([^']+)'/)?.[1];
  const target = block.match(/target:\s*'([^']+)'/)?.[1];
  const phase = block.match(/phase: '([^']+)'/)?.[1];
  if (!family || !target || !phase) continue;
  if (phase !== 'foundation') continue;

  const targetFiles = target
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  for (const targetFile of targetFiles) {
    foundationTargetResults.push({
      family,
      target: targetFile,
      exists: existsSync(join(root, targetFile))
    });
  }
}

const patternResults = patternChecks.map((check) => {
  const locations = [];
  let total = 0;
  for (const file of usageFiles) {
    const text = readFileSync(file, 'utf8');
    const count = countMatches(text, check.regex);
    if (count > 0) {
      total += count;
      locations.push([relative(root, file), count]);
    }
  }
  locations.sort((a, b) => b[1] - a[1]);
  return { ...check, total, locations: locations.slice(0, 10) };
});

const driftPatternChecks = patternChecks.filter(
  (check) => check.isDrift !== false
);

const componentPatternResults = driftPatternChecks.map((check) => {
  const locations = [];
  let total = 0;
  for (const file of productComponentSourceFiles) {
    const text = stripSharedPrimitiveOpeningTags(readFileSync(file, 'utf8'));
    const count = countMatches(text, check.regex);
    if (count > 0) {
      total += count;
      locations.push([relative(root, file), count]);
    }
  }
  locations.sort((a, b) => b[1] - a[1]);
  return { ...check, total, locations: locations.slice(0, 10) };
});

const pausedSkillFeaturePatternResults = driftPatternChecks.map((check) => {
  const locations = [];
  let total = 0;
  for (const file of pausedSkillFeatureFiles) {
    const text = readFileSync(file, 'utf8');
    const count = countMatches(text, check.regex);
    if (count > 0) {
      total += count;
      locations.push([relative(root, file), count]);
    }
  }
  locations.sort((a, b) => b[1] - a[1]);
  return { ...check, total, locations: locations.slice(0, 10) };
});

const componentTestPatternResults = driftPatternChecks.map((check) => {
  const locations = [];
  let total = 0;
  for (const file of componentTestFiles) {
    const text = readFileSync(file, 'utf8');
    const count = countMatches(text, check.regex);
    if (count > 0) {
      total += count;
      locations.push([relative(root, file), count]);
    }
  }
  locations.sort((a, b) => b[1] - a[1]);
  return { ...check, total, locations: locations.slice(0, 10) };
});

for (const file of productComponentSourceFiles) {
  const text = readFileSync(file, 'utf8');
  const nativeImageFetchPriorityCount = countMatches(
    text,
    /<img\b[^>]*\bfetchPriority\s*=/g
  );
  if (nativeImageFetchPriorityCount > 0) {
    domImageFetchPriorityViolations.push([
      relative(root, file),
      nativeImageFetchPriorityCount
    ]);
  }

  const nativeCategoryPillCount = countNativeCategoryPillViolations(text);
  if (nativeCategoryPillCount > 0) {
    nativeCategoryPillViolations.push([
      relative(root, file),
      nativeCategoryPillCount
    ]);
  }

  const migratedCardCount = countMatches(text, /<Card\b/g);
  if (migratedCardCount > 0) {
    semanticallyMigratedCardSignals.set(
      relative(root, file),
      migratedCardCount
    );
  }

  const migratedButtonCount = countMatches(
    text,
    /<(?:Button|ButtonLink|IconButton)\b/g
  );
  if (migratedButtonCount > 0) {
    semanticallyMigratedButtonSignals.set(
      relative(root, file),
      migratedButtonCount
    );
  }

  const migratedFormControlCount = countMatches(
    text,
    /<(?:FormField|FieldMessage|Input|Select|SearchField|Textarea)\b/g
  );
  if (migratedFormControlCount > 0) {
    semanticallyMigratedFormControlSignals.set(
      relative(root, file),
      migratedFormControlCount
    );
  }

  const migratedFeedbackCount = countMatches(text, /<FeedbackMessage\b/g);
  if (migratedFeedbackCount > 0) {
    semanticallyMigratedFeedbackSignals.set(
      relative(root, file),
      migratedFeedbackCount
    );
  }

  const migratedEmptyStateCount = countMatches(text, /<EmptyState\b/g);
  if (migratedEmptyStateCount > 0) {
    semanticallyMigratedEmptyStateSignals.set(
      relative(root, file),
      migratedEmptyStateCount
    );
  }

  const migratedDialogCount = countMatches(text, /<Dialog\b/g);
  if (migratedDialogCount > 0) {
    semanticallyMigratedDialogSignals.set(
      relative(root, file),
      migratedDialogCount
    );
  }

  const migratedActionSheetCount = countMatches(text, /<ActionSheet\b/g);
  if (migratedActionSheetCount > 0) {
    semanticallyMigratedActionSheetSignals.set(
      relative(root, file),
      migratedActionSheetCount
    );
  }

  const migratedOverlayBehaviorCount = countMatches(
    text,
    /useOverlayBehavior\s*(?:<|\()/g
  );
  if (migratedOverlayBehaviorCount > 0) {
    semanticallyMigratedOverlayBehaviorSignals.set(
      relative(root, file),
      migratedOverlayBehaviorCount
    );
  }

  const migratedMediaTileCount = countMatches(text, /<MediaTile\b/g);
  if (migratedMediaTileCount > 0) {
    semanticallyMigratedMediaTileSignals.set(
      relative(root, file),
      migratedMediaTileCount
    );
  }

  const migratedBadgeCount = countMatches(text, /<Badge\b/g);
  if (migratedBadgeCount > 0) {
    semanticallyMigratedBadgeSignals.set(
      relative(root, file),
      migratedBadgeCount
    );
  }

  const migratedDynamicIconCount = countMatches(text, /<DynamicIcon\b/g);
  if (migratedDynamicIconCount > 0) {
    semanticallyMigratedDynamicIconSignals.set(
      relative(root, file),
      migratedDynamicIconCount
    );
  }

  const migratedNavigationCount = countMatches(
    text,
    /<(?:Navigation|NavigationList|NavigationLink)\b/g
  );
  if (migratedNavigationCount > 0) {
    semanticallyMigratedNavigationSignals.set(
      relative(root, file),
      migratedNavigationCount
    );
  }

  const featureOverlayPrimitiveCount = countMatches(text, /<ImageLightbox\b/g);
  if (featureOverlayPrimitiveCount > 0) {
    featureOverlayPrimitiveSignals.set(
      relative(root, file),
      featureOverlayPrimitiveCount
    );
  }
}

const designImportCounts = new Map();
for (const file of sourceCodeFiles) {
  const text = readFileSync(file, 'utf8');
  const count = countMatches(
    text,
    /src\/design|\.\.\/design|\.\.\/\.\.\/design|\.\.\/\.\.\/\.\.\/design/g
  );
  if (count > 0) {
    designImportCounts.set(relative(root, file), count);
  }
}

const adapterBoundaryViolations = [];
const legacyUiImportViolations = [];
const sharedRadixCompatibilityImports = [];
const adapterOnlyImportRegex =
  /from\s+['"](?:@radix-ui\/[^'"]+|@\/design\/shadcn-reference(?:\/[^'"]*)?)['"]|import\s+['"](?:@radix-ui\/[^'"]+|@\/design\/shadcn-reference(?:\/[^'"]*)?)['"]/g;
const sharedRadixCompatibilityImportRegex =
  /from\s+['"]@\/shared\/ui\/radix\/[^'"]+['"]|import\s+['"]@\/shared\/ui\/radix\/[^'"]+['"]/g;
for (const file of sourceCodeFiles) {
  const path = relative(root, file);
  const text = readFileSync(file, 'utf8');

  const legacyUiImportCount = countMatches(
    text,
    /from\s+['"]@\/components\/ui\/[^'"]+['"]|import\s+['"]@\/components\/ui\/[^'"]+['"]/g
  );
  if (legacyUiImportCount > 0) {
    legacyUiImportViolations.push([path, legacyUiImportCount]);
  }

  const sharedRadixCompatibilityImportCount = countMatches(
    text,
    sharedRadixCompatibilityImportRegex
  );
  if (sharedRadixCompatibilityImportCount > 0) {
    sharedRadixCompatibilityImports.push([
      path,
      sharedRadixCompatibilityImportCount
    ]);
  }

  if (path.startsWith('src/shared/ui/')) {
    continue;
  }

  const count = countMatches(text, adapterOnlyImportRegex);
  if (count > 0) {
    adapterBoundaryViolations.push([path, count]);
  }
}

const hardcodedZIndexCount = cssFiles.reduce((total, file) => {
  const text = readFileSync(file, 'utf8');
  return total + countMatches(text, /z-index:\s*-?\d+(?:\s*!important)?\s*;/g);
}, 0);
const transitionAllCount = cssFiles.reduce((total, file) => {
  const text = readFileSync(file, 'utf8');
  return total + countMatches(text, /transition:\s*all\b/g);
}, 0);
const sharedFixedFontSizeCount = files
  .filter((file) => {
    const path = relative(root, file);
    return path.startsWith('src/design/') || path.startsWith('src/shared/ui/');
  })
  .reduce((total, file) => {
    const text = readFileSync(file, 'utf8');
    return total + countMatches(text, /font-size:\s*[\d.]+px\b/g);
  }, 0);
const MAX_HARDCODED_Z_INDEX_COUNT = 155;
const MAX_SHARED_RADIX_COMPATIBILITY_IMPORT_COUNT = 190;
const sharedRadixCompatibilityImportCount =
  sharedRadixCompatibilityImports.reduce(
    (total, [, count]) => total + count,
    0
  );

let shadcnConfigResult = null;
const shadcnConfigPath = join(root, 'components.json');
if (existsSync(shadcnConfigPath)) {
  try {
    const shadcnConfig = JSON.parse(readFileSync(shadcnConfigPath, 'utf8'));
    const uiAlias = shadcnConfig?.aliases?.ui;
    const componentsAlias = shadcnConfig?.aliases?.components;
    const safe =
      typeof uiAlias === 'string' &&
      uiAlias.includes('shadcn-reference') &&
      typeof componentsAlias === 'string' &&
      componentsAlias.includes('shadcn-reference');

    shadcnConfigResult = {
      exists: true,
      safe,
      uiAlias,
      componentsAlias
    };
  } catch (error) {
    shadcnConfigResult = {
      exists: true,
      safe: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
} else {
  shadcnConfigResult = {
    exists: false,
    safe: true
  };
}

console.log('WebToMind design-system usage audit');
console.log('');
console.log('Largest CSS files:');
for (const [file, lines] of cssLineCounts) {
  console.log(`- ${file}: ${lines} lines`);
}

console.log('');
console.log('Top CSS class prefixes:');
for (const [prefix, count] of topEntries(classPrefixCounts, 16)) {
  console.log(`- ${prefix}: ${count}`);
}

console.log('');
console.log('Repository-wide CSS/class drift signals:');
for (const result of patternResults) {
  console.log(
    `- ${result.label}: ${result.total}${result.ruleId ? ` [${result.ruleId}]` : ''}`
  );
  for (const [file, count] of result.locations) {
    console.log(`  - ${file}: ${count}`);
  }
}

console.log('');
console.log('Active product component drift hotspots:');
for (const result of componentPatternResults) {
  if (result.total === 0) continue;
  console.log(
    `- ${result.label}: ${result.total}${result.ruleId ? ` [${result.ruleId}]` : ''}`
  );
  for (const [file, count] of result.locations) {
    console.log(`  - ${file}: ${count}`);
  }
}

console.log('');
console.log(
  'Paused Skill feature drift references (excluded from active convergence):'
);
let hasPausedSkillFeatureDrift = false;
for (const result of pausedSkillFeaturePatternResults) {
  if (result.total === 0) continue;
  hasPausedSkillFeatureDrift = true;
  console.log(
    `- ${result.label}: ${result.total}${result.ruleId ? ` [${result.ruleId}]` : ''}`
  );
  for (const [file, count] of result.locations) {
    console.log(`  - ${file}: ${count}`);
  }
}
if (!hasPausedSkillFeatureDrift) {
  console.log('- none');
}

console.log('');
console.log('Test-fixture drift references:');
for (const result of componentTestPatternResults) {
  if (result.total === 0) continue;
  console.log(
    `- ${result.label}: ${result.total}${result.ruleId ? ` [${result.ruleId}]` : ''}`
  );
  for (const [file, count] of result.locations) {
    console.log(`  - ${file}: ${count}`);
  }
}

console.log('');
console.log('Semantically migrated page-card shells using shared Card:');
if (semanticallyMigratedCardSignals.size === 0) {
  console.log('- none');
} else {
  for (const [file, count] of topEntries(semanticallyMigratedCardSignals, 20)) {
    console.log(`- ${file}: ${count}`);
  }
}

console.log('');
console.log(
  'Semantically migrated buttons using shared Button/ButtonLink/IconButton:'
);
if (semanticallyMigratedButtonSignals.size === 0) {
  console.log('- none');
} else {
  for (const [file, count] of topEntries(
    semanticallyMigratedButtonSignals,
    20
  )) {
    console.log(`- ${file}: ${count}`);
  }
}

console.log('');
console.log(
  'Semantically migrated form controls using shared Input/Select/SearchField:'
);
if (semanticallyMigratedFormControlSignals.size === 0) {
  console.log('- none');
} else {
  for (const [file, count] of topEntries(
    semanticallyMigratedFormControlSignals,
    20
  )) {
    console.log(`- ${file}: ${count}`);
  }
}

console.log('');
console.log(
  'Semantically migrated feedback states using shared FeedbackMessage:'
);
if (semanticallyMigratedFeedbackSignals.size === 0) {
  console.log('- none');
} else {
  for (const [file, count] of topEntries(
    semanticallyMigratedFeedbackSignals,
    20
  )) {
    console.log(`- ${file}: ${count}`);
  }
}

console.log('');
console.log(
  'Semantically migrated empty/error states using shared EmptyState:'
);
if (semanticallyMigratedEmptyStateSignals.size === 0) {
  console.log('- none');
} else {
  for (const [file, count] of topEntries(
    semanticallyMigratedEmptyStateSignals,
    20
  )) {
    console.log(`- ${file}: ${count}`);
  }
}

console.log('');
console.log('Semantically migrated dialog shells using shared Dialog:');
if (semanticallyMigratedDialogSignals.size === 0) {
  console.log('- none');
} else {
  for (const [file, count] of topEntries(
    semanticallyMigratedDialogSignals,
    20
  )) {
    console.log(`- ${file}: ${count}`);
  }
}

console.log('');
console.log('Semantically migrated action sheets using shared ActionSheet:');
if (semanticallyMigratedActionSheetSignals.size === 0) {
  console.log('- none');
} else {
  for (const [file, count] of topEntries(
    semanticallyMigratedActionSheetSignals,
    20
  )) {
    console.log(`- ${file}: ${count}`);
  }
}

console.log('');
console.log('Overlays using shared overlay behavior:');
if (semanticallyMigratedOverlayBehaviorSignals.size === 0) {
  console.log('- none');
} else {
  for (const [file, count] of topEntries(
    semanticallyMigratedOverlayBehaviorSignals,
    20
  )) {
    console.log(`- ${file}: ${count}`);
  }
}

console.log('');
console.log('Semantically migrated media tiles using shared MediaTile:');
if (semanticallyMigratedMediaTileSignals.size === 0) {
  console.log('- none');
} else {
  for (const [file, count] of topEntries(
    semanticallyMigratedMediaTileSignals,
    20
  )) {
    console.log(`- ${file}: ${count}`);
  }
}

console.log('');
console.log('Semantically migrated badges/chips using shared Badge:');
if (semanticallyMigratedBadgeSignals.size === 0) {
  console.log('- none');
} else {
  for (const [file, count] of topEntries(
    semanticallyMigratedBadgeSignals,
    20
  )) {
    console.log(`- ${file}: ${count}`);
  }
}

console.log('');
console.log('Semantically migrated motion icons using shared DynamicIcon:');
if (semanticallyMigratedDynamicIconSignals.size === 0) {
  console.log('- none');
} else {
  for (const [file, count] of topEntries(
    semanticallyMigratedDynamicIconSignals,
    20
  )) {
    console.log(`- ${file}: ${count}`);
  }
}

console.log('');
console.log('Semantically migrated navigation using shared Navigation:');
if (semanticallyMigratedNavigationSignals.size === 0) {
  console.log('- none');
} else {
  for (const [file, count] of topEntries(
    semanticallyMigratedNavigationSignals,
    20
  )) {
    console.log(`- ${file}: ${count}`);
  }
}

console.log('');
console.log('Feature overlay primitives with domain behavior:');
if (featureOverlayPrimitiveSignals.size === 0) {
  console.log('- none');
} else {
  for (const [file, count] of topEntries(featureOverlayPrimitiveSignals, 20)) {
    console.log(`- ${file}: ${count}`);
  }
}

console.log('');
console.log('Native image loading attribute contract:');
if (domImageFetchPriorityViolations.length === 0) {
  console.log(
    '- ok: native <img> tags use lowercase fetchpriority via shared helper'
  );
} else {
  for (const [file, count] of domImageFetchPriorityViolations.sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`- violation ${file}: ${count}`);
  }
}

console.log('');
console.log('Category/filter pill primitive contract:');
if (nativeCategoryPillViolations.length === 0) {
  console.log(
    '- ok: active product category/filter pills use shared Button/ButtonLink primitives'
  );
} else {
  for (const [file, count] of nativeCategoryPillViolations.sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`- violation ${file}: ${count}`);
  }
}

console.log('');
console.log('Files importing design foundation:');
if (designImportCounts.size === 0) {
  console.log('- none');
} else {
  for (const [file, count] of topEntries(designImportCounts, 20)) {
    console.log(`- ${file}: ${count}`);
  }
}

console.log('');
console.log('shadcn/Radix adapter boundary:');
if (legacyUiImportViolations.length === 0) {
  console.log('- legacy @/components/ui imports: none');
} else {
  for (const [file, count] of legacyUiImportViolations.sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`- legacy import violation ${file}: ${count}`);
  }
}
if (shadcnConfigResult.exists) {
  console.log(
    `- components.json: ${shadcnConfigResult.safe ? 'ok' : 'unsafe'} ui=${shadcnConfigResult.uiAlias ?? 'n/a'} components=${shadcnConfigResult.componentsAlias ?? 'n/a'}`
  );
  if (shadcnConfigResult.error) {
    console.log(`  - parse error: ${shadcnConfigResult.error}`);
  }
} else {
  console.log('- components.json: not present');
}

console.log('');
console.log('Design-system debt gates:');
console.log(
  `- active @/shared/ui/radix compatibility imports: ${sharedRadixCompatibilityImportCount}/${MAX_SHARED_RADIX_COMPATIBILITY_IMPORT_COUNT} max`
);
console.log(
  `- hardcoded numeric z-index: ${hardcodedZIndexCount}/${MAX_HARDCODED_Z_INDEX_COUNT} max`
);
console.log(`- transition: all declarations: ${transitionAllCount}`);
console.log(
  `- fixed px font-size declarations in src/design and src/shared/ui: ${sharedFixedFontSizeCount}`
);
console.log(
  `- always-dark overlay inverse-token violations: ${alwaysDarkOverlayInverseViolations.length}`
);
console.log(
  `- fuzzy pricing CTA selectors: ${fuzzyPricingCtaSelectorViolations}`
);
if (adapterBoundaryViolations.length === 0) {
  console.log(
    '- direct Radix/shadcn-reference imports outside src/shared/ui: none'
  );
} else {
  for (const [file, count] of adapterBoundaryViolations.sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`- violation ${file}: ${count}`);
  }
}

console.log('');
console.log('Foundation component registry targets:');
for (const result of foundationTargetResults) {
  console.log(
    `- ${result.exists ? 'ok' : 'missing'} ${result.family}: ${result.target}`
  );
}

console.log('');
console.log('Zhong Design Review rule definitions referenced by this audit:');
for (const ruleId of referencedRuleIds) {
  console.log(
    `- ${missingRuleDefinitions.includes(ruleId) ? 'missing' : 'ok'} ${ruleId}`
  );
}

const missingFoundationTargets = foundationTargetResults.filter(
  (result) => !result.exists
);
const unsafeShadcnConfig =
  shadcnConfigResult.exists && !shadcnConfigResult.safe;

console.log('');
if (
  missingFoundationTargets.length > 0 ||
  missingRuleDefinitions.length > 0 ||
  legacyUiImportViolations.length > 0 ||
  adapterBoundaryViolations.length > 0 ||
  sharedRadixCompatibilityImportCount >
    MAX_SHARED_RADIX_COMPATIBILITY_IMPORT_COUNT ||
  hardcodedZIndexCount > MAX_HARDCODED_Z_INDEX_COUNT ||
  transitionAllCount > 0 ||
  sharedFixedFontSizeCount > 0 ||
  domImageFetchPriorityViolations.length > 0 ||
  nativeCategoryPillViolations.length > 0 ||
  alwaysDarkOverlayInverseViolations.length > 0 ||
  fuzzyPricingCtaSelectorViolations > 0 ||
  unsafeShadcnConfig
) {
  console.error(
    'Result: failed. Foundation registry targets, referenced Zhong Design Review rules, and adapter boundaries must be valid.'
  );
  if (missingRuleDefinitions.length > 0) {
    console.error(
      `Missing Zhong Design Review rule definitions: ${missingRuleDefinitions.join(', ')}`
    );
  }
  if (unsafeShadcnConfig) {
    console.error(
      'components.json must point shadcn generated sources at an isolated shadcn-reference directory.'
    );
  }
  if (adapterBoundaryViolations.length > 0) {
    console.error(
      'Radix/shadcn-reference imports are only allowed inside src/shared/ui adapters.'
    );
  }
  if (
    sharedRadixCompatibilityImportCount >
    MAX_SHARED_RADIX_COMPATIBILITY_IMPORT_COUNT
  ) {
    console.error(
      '@/shared/ui/radix compatibility imports are migration debt and may only decrease.'
    );
  }
  if (legacyUiImportViolations.length > 0) {
    console.error(
      'Product code must import UI adapters through src/shared/ui, never @/components/ui.'
    );
  }
  if (hardcodedZIndexCount > MAX_HARDCODED_Z_INDEX_COUNT) {
    console.error('Hardcoded numeric z-index debt may only decrease.');
  }
  if (transitionAllCount > 0) {
    console.error(
      'transition: all is forbidden; enumerate animated properties.'
    );
  }
  if (sharedFixedFontSizeCount > 0) {
    console.error(
      'Shared design foundations must use rem/clamp typography, not fixed px font sizes.'
    );
  }
  if (domImageFetchPriorityViolations.length > 0) {
    console.error(
      'Native <img> elements must use lowercase fetchpriority via src/shared/ui/imageAttributes.'
    );
  }
  if (nativeCategoryPillViolations.length > 0) {
    console.error(
      'Active product category/filter pills must use shared Button or ButtonLink primitives.'
    );
  }
  if (alwaysDarkOverlayInverseViolations.length > 0) {
    console.error(
      `Always-dark media overlays must use media overlay foreground tokens:\n${alwaysDarkOverlayInverseViolations.join('\n')}`
    );
  }
  if (fuzzyPricingCtaSelectorViolations > 0) {
    console.error(
      'Pricing CTA theming must use stable semantic classes, not class* background selectors.'
    );
  }
  process.exitCode = 1;
} else {
  console.log(
    'Result: report-only drift signals, with foundation registry and adapter boundary integrity passed.'
  );
}
