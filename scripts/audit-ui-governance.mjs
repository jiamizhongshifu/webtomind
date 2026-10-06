#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), 'utf8');
const failures = [];
try {
  const rules = read('docs/DESIGN_SYSTEM.md');
  const audit = read('scripts/audit-design-system-usage.mjs');
  const ids = [...new Set(audit.match(/rule\/[a-z0-9-]+/g))];
  for (const id of ids) {
    if (!rules.includes(`## ${id}\n`))
      failures.push(`Missing public rule: ${id}`);
  }
  for (const file of [
    'src/design/app-shell.css',
    'src/web/styles/geist-theme.css'
  ]) {
    if (/--(?:space|radius)-[a-z0-9]+\s*:/.test(read(file))) {
      failures.push(`${file}: dimensional scales belong in shared-tokens.css`);
    }
  }
  const shell = read('src/design/app-shell.css');
  if (
    !shell.includes('--primary: var(--product-action-hsl)') ||
    !shell.includes('--primary-foreground: var(--product-action-text-hsl)')
  ) {
    failures.push('Tailwind primary aliases must follow product action tokens');
  }
  if (/\.agents\/skills/.test(audit)) {
    failures.push('Design gate must not depend on private agent skills');
  }
  console.log(
    `Public design governance: ${ids.length} rule definitions checked`
  );
} catch (error) {
  failures.push(error.message);
}
for (const failure of failures) console.error(`- ${failure}`);
console.log(`Result: ${failures.length ? 'failed' : 'passed'}`);
process.exitCode = failures.length ? 1 : 0;
