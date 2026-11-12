#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { listPackageFiles } from './lib/skill-publish.mjs';
import { inspectSkillPrivacy } from './lib/skill-privacy.mjs';

const args = process.argv.slice(2);
const at = args.indexOf('--content');
if (at < 0 || !args[at + 1]) throw new Error('Usage: node scripts/audit-skill-privacy.mjs --content <content-repository>');
const root = path.resolve(args[at + 1], 'skills');
const results = [];
for (const slug of readdirSync(root).sort()) {
  const dir = path.join(root, slug);
  if (!statSync(dir).isDirectory()) continue;
  try {
    const files = listPackageFiles(dir);
    const issues = files.flatMap((file) => inspectSkillPrivacy(file, readFileSync(path.join(dir, file))));
    results.push({ slug, files: files.length, issues });
  } catch {
    // Do not echo exception text: unsafe filenames could themselves be private.
    results.push({ slug, issues: [{ file: '[package]', rule: 'unsafe-package-entry' }] });
  }
}
console.log(JSON.stringify({
  scope: 'Package file content and printable metadata; no OCR, speech or rights verification',
  packages: results.length,
  passed: results.filter((item) => item.issues.length === 0).length,
  results
}, null, 2));
if (results.some((item) => item.issues.length)) process.exitCode = 1;
