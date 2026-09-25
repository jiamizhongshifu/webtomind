#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const skillRoot = join(root, '.agents/skills/zhong-design-review');

const requiredSkillFiles = [
  'SKILL.md',
  'AGENTS.md',
  'references/rules.md',
  'references/surfaces.md',
  'references/design-system-audit.md',
  'references/coverage-gaps.md',
];

const requiredRuleFields = [
  'Scope:',
  'Rule:',
  'Why:',
  'Exceptions:',
  'Bad:',
  'Good:',
  'Automation:',
  'Evidence:',
];

const requiredGapFields = [
  'Status:',
  'Question:',
  'Why it matters:',
  'Needed evidence:',
  'Likely destination:',
];

const explicitRuleConsumerFiles = [
  '.agents/skills/zhong-design-review/SKILL.md',
  '.agents/skills/zhong-design-review/AGENTS.md',
  'scripts/audit-design-system-usage.mjs',
  'scripts/website-ui-regression.mjs',
];

function readAbsolute(file) {
  return readFileSync(file, 'utf8');
}

function readSkillFile(relativePath) {
  return readAbsolute(join(skillRoot, relativePath));
}

function rel(file) {
  return relative(root, file);
}

function getMarkdownSections(text, prefix) {
  const headingPattern = new RegExp(`^## (${prefix}\\/[a-z0-9-]+)\\s*$`, 'gm');
  const headings = [...text.matchAll(headingPattern)].map((match) => ({
    id: match[1],
    index: match.index,
  }));
  const sections = new Map();

  for (let index = 0; index < headings.length; index += 1) {
    const current = headings[index];
    const next = headings[index + 1];
    sections.set(current.id, text.slice(current.index, next?.index ?? text.length));
  }

  return sections;
}

function extractRuleIds(text) {
  return [...new Set([...text.matchAll(/\brule\/[a-z0-9-]+(?:-[a-z0-9]+)*\b/g)].map((match) => match[0]))];
}

function listMarkdownFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((entry) => join(dir, entry))
    .filter((file) => statSync(file).isFile() && file.endsWith('.md'))
    .sort();
}

const failures = [];
const warnings = [];

function fail(message, detail = '') {
  failures.push(detail ? `${message}: ${detail}` : message);
}

function warn(message, detail = '') {
  warnings.push(detail ? `${message}: ${detail}` : message);
}

for (const file of requiredSkillFiles) {
  if (!existsSync(join(skillRoot, file))) {
    fail('Missing required skill file', file);
  }
}

if (failures.length > 0) {
  console.error('Zhong Design Review governance audit failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const rulesText = readSkillFile('references/rules.md');
const coverageGapsText = readSkillFile('references/coverage-gaps.md');
const ruleSections = getMarkdownSections(rulesText, 'rule');
const gapSections = getMarkdownSections(coverageGapsText, 'gap');
const ruleIds = new Set(ruleSections.keys());

for (const [ruleId, section] of ruleSections.entries()) {
  for (const field of requiredRuleFields) {
    if (!section.includes(field)) {
      fail('Rule is missing required field', `${ruleId} -> ${field}`);
    }
  }
}

for (const [gapId, section] of gapSections.entries()) {
  for (const field of requiredGapFields) {
    if (!section.includes(field)) {
      fail('Coverage gap is missing required field', `${gapId} -> ${field}`);
    }
  }
}

if (gapSections.size === 0) {
  fail('No coverage gaps defined', 'references/coverage-gaps.md should track unresolved recurring decisions');
}

const exemplarFiles = listMarkdownFiles(join(skillRoot, 'exemplars'));
if (exemplarFiles.length === 0) {
  warn('No exemplars found', '.agents/skills/zhong-design-review/exemplars');
}

const referencedRulesByFile = new Map();

for (const exemplarFile of exemplarFiles) {
  const text = readAbsolute(exemplarFile);
  const rules = extractRuleIds(text);
  referencedRulesByFile.set(rel(exemplarFile), rules);

  if (!text.includes('Rule IDs:')) {
    fail('Exemplar is missing Rule IDs section', rel(exemplarFile));
  }
  if (rules.length === 0) {
    fail('Exemplar has no rule references', rel(exemplarFile));
  }
}

const referenceConsumerFiles = listMarkdownFiles(join(skillRoot, 'references'))
  .map((file) => rel(file))
  .filter((file) => !file.endsWith('references/rules.md'));

const ruleConsumerFiles = [...new Set([...explicitRuleConsumerFiles, ...referenceConsumerFiles])];

for (const file of ruleConsumerFiles) {
  const absolute = join(root, file);
  if (!existsSync(absolute)) {
    fail('Rule consumer file is missing', file);
    continue;
  }
  referencedRulesByFile.set(file, extractRuleIds(readAbsolute(absolute)));
}

for (const file of explicitRuleConsumerFiles) {
  const absolute = join(root, file);
  if (!existsSync(absolute)) continue;
  const text = readAbsolute(absolute);
  const staleSkillPaths = [...text.matchAll(/\.agents\/skills\/zhong-[a-z0-9-]+/g)]
    .map((match) => match[0])
    .filter((matchedPath) => matchedPath !== '.agents/skills/zhong-design-review');
  if (staleSkillPaths.length > 0) {
    fail('Rule consumer references stale skill path', `${file} -> ${[...new Set(staleSkillPaths)].join(', ')}`);
  }
}

for (const [file, referencedRules] of referencedRulesByFile.entries()) {
  for (const ruleId of referencedRules) {
    if (!ruleIds.has(ruleId)) {
      fail('Rule reference has no matching rule definition', `${file} -> ${ruleId}`);
    }
  }
}

const referencedRuleIds = new Set([...referencedRulesByFile.values()].flat());
const unreferencedRules = [...ruleIds].filter((ruleId) => !referencedRuleIds.has(ruleId));
if (unreferencedRules.length > 0) {
  warn('Rules currently have no checked references', unreferencedRules.join(', '));
}

console.log('Zhong Design Review governance audit');
console.log(`Rules defined: ${ruleSections.size}`);
console.log(`Rule references checked: ${referencedRuleIds.size}`);
console.log(`Exemplars checked: ${exemplarFiles.length}`);
console.log(`Coverage gaps checked: ${gapSections.size}`);

if (warnings.length > 0) {
  console.log('Warnings:');
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (failures.length > 0) {
  console.error('Result: failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Result: passed');
