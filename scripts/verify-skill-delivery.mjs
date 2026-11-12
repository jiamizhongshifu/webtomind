#!/usr/bin/env node
// Local package → CLI install → runtime acceptance. No catalog or payment writes.
import assert from 'node:assert/strict';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { writeDeliveryReview } from './lib/skill-delivery-review.mjs';
import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildDeterministicArchive, sha256Hex } from './lib/skill-publish.mjs';
import { installSkill } from '../packages/webtomind-cli/src/install.mjs';

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
for (const name of ['--content', '--runtime-project']) {
  if (!args.includes(name) || !option(name)) throw new Error(`Missing ${name}`);
}
const contentRoot = path.resolve(option('--content'));
const runtime = path.resolve(option('--runtime-project'));
const out = path.resolve(args.includes('--out') ? option('--out') : 'output/skill-delivery');
const slugs = args.includes('--slugs') ? option('--slugs').split(',') : ['xhs-cover-note', 'og-image', 'weekly-report-deck', 'waitlist-page', 'kinetic-typography-short', 'xhs-carousel'];
const isolatedHome = await mkdtemp(path.join(tmpdir(), 'webtomind-delivery-'));
await mkdir(out, { recursive: true });
const results = [];
const pattern = /(<script\b[^>]*\bid=["']content["'][^>]*>)([\s\S]*?)(<\/script>)/i;
const run = (command, argv) => {
  const result = spawnSync(command, argv, { cwd: runtime, encoding: 'utf8', timeout: 300000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
  assert.doesNotMatch(result.stdout + result.stderr, /\boverflow\b|blocked external request/i);
  return result.stdout;
};
try {
  for (const slug of slugs) {
    const source = path.join(contentRoot, 'skills', slug);
    const manifest = JSON.parse(await readFile(path.join(source, 'skill.json')));
    for (const file of ['LICENSE.md', 'DEPENDENCIES.md']) {
      assert.ok((await readFile(path.join(source, file), 'utf8')).length > 200);
    }
    const archive = buildDeterministicArchive(source, slug);
    const hash = sha256Hex(archive);
    assert.equal(hash, sha256Hex(buildDeterministicArchive(source, slug)));
    const grant = { version: manifest.version, sha256: hash, sizeBytes: archive.length, downloadUrl: 'https://example.test/package', entitlementSource: 'local-fixture' };
    const api = { baseUrl: 'https://example.test', install: async () => grant };
    const installOptions = { api, slug, home: isolatedHome, env: {}, fetchImpl: async () => new Response(archive) };
    const installed = [];
    for (const agent of ['codex', 'claude-code']) {
      const result = await installSkill({ ...installOptions, agent });
      assert.equal(result.status, 'installed');
      assert.equal((await installSkill({ ...installOptions, agent })).status, 'unchanged');
      assert.equal(await readFile(path.join(result.path, 'SKILL.md'), 'utf8'), await readFile(path.join(source, 'SKILL.md'), 'utf8'));
      installed.push(result);
    }
    await assert.rejects(
      installSkill({ ...installOptions, target: path.join(isolatedHome, 'tampered', slug), fetchImpl: async () => new Response(Buffer.alloc(archive.length)) }),
      error => error.code === 'SHA256_MISMATCH'
    );
    const installedRoot = installed[0].path;
    const destination = path.join(out, slug);
    await mkdir(destination, { recursive: true });
    await writeFile(path.join(destination, `${slug}-${manifest.version}.tar.gz`), archive);
    // Use historical authored copy with the CURRENT installed template/layout.
    const template = await readFile(path.join(installedRoot, manifest.entry.templates.find(file => file.endsWith('.html'))), 'utf8');
    const example = await readFile(path.join(installedRoot, manifest.examples[0].source), 'utf8');
    const exampleMatch = example.match(pattern);
    const directHtml = manifest.output_type === 'web';
    if (!directHtml) assert.ok(exampleMatch && template.match(pattern), `${slug}: content JSON not found`);
    const input = directHtml ? null : JSON.parse(exampleMatch[2]);
    const html = directHtml ? (args.includes('--authored-web') ? example : template) : template.replace(pattern, (_, start, body, end) => start + JSON.stringify(input).replace(/</g, '\\u003c') + end);
    const inputFile = path.join(destination, 'input.html');
    await writeFile(inputFile, html);
    let argv;
    if (slug === 'xhs-carousel') argv = [path.join(installedRoot, 'scripts/render-pages.mjs'), inputFile, destination];
    else {
      const renderer = path.join(installedRoot, 'scripts/render.mjs');
      const dimensions = manifest.dimensions[0].split('x');
      const mode = manifest.output_type === 'web' ? 'page' : manifest.output_type;
      argv = [renderer, mode, inputFile];
      if (mode === 'image' || mode === 'video') argv.push('--out', path.join(destination, `result.${mode === 'image' ? 'png' : 'mp4'}`), '--width', dimensions[0], '--height', dimensions[1]);
      else argv.push('--out-dir', destination);
      if (mode === 'slides') argv.push('--pdf');
    }
    const log = run(process.execPath, argv);
    await writeFile(path.join(destination, 'render.log'), log);
    const files = await readdir(destination);
    const pngs = files.filter(file => file.endsWith('.png'));
    const expected = slug === 'xhs-carousel' ? input.pages.length : manifest.output_type === 'slides' ? input.slides.length : manifest.output_type === 'web' ? 2 : manifest.output_type === 'video' ? 0 : 1;
    assert.equal(pngs.length, expected, `${slug}: PNG count`);
    const images = [];
    for (const file of pngs) {
      const bytes = await readFile(path.join(destination, file));
      assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
      const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
      if (manifest.output_type !== 'web') {
        const [w, h] = manifest.dimensions[0].split('x').map(Number);
        assert.equal(width, w); assert.equal(height, h);
      }
      images.push({ file, width, height, sha256: sha256Hex(bytes) });
    }
    let video = null;
    if (manifest.output_type === 'video') {
      video = JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path.join(destination, 'result.mp4')]));
      assert.equal(video.streams.filter(stream => stream.codec_type === 'audio').length, 0);
      assert.ok(Number(video.format.duration) > 1);
      video = { width: video.streams[0].width, height: video.streams[0].height, duration: Number(video.format.duration), audio: false };
    }
    results.push({ slug, version: manifest.version, archiveSha256: hash, archiveBytes: archive.length, agentsInstalled: installed.map((_, i) => ['codex', 'claude-code'][i]), outputType: manifest.output_type, checks: ['deterministic-archive', 'privacy-scan', 'license-files', 'isolated-cli-install', 'unchanged-reinstall', 'tamper-rejected', 'current-template-render', 'no-overflow'], images, video });
    console.log(`PASS ${slug}@${manifest.version}: installed, integrity checked, rendered`);
  }
} finally {
  await writeFile(path.join(out, 'results.json'), JSON.stringify({
    scope: 'Local real package bytes and renderer; simulated download grant, separately installed runtime. No cloud auth, payment, publishing or independent Agent discovery.',
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    results
  }, null, 2));
}
assert.equal(results.length, slugs.length);
await writeDeliveryReview(out, results);
