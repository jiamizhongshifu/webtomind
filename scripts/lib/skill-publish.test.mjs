import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  archiveObjectKey,
  buildDeterministicArchive,
  mapManifest,
  sha256Hex
} from './skill-publish.mjs';
import { normalizeSkillEntries, readTarGz } from '../../packages/webtomind-cli/src/tar.mjs';

function makeSkill(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'skill-publish-'));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

const manifest = {
  slug: 'og-image',
  version: '1.0.0',
  tier: 'free',
  name: { zh: '网站分享图', en: 'Open Graph Image' },
  description: { zh: '生成 1200×630 分享图。附 og:image 标签。', en: 'Share images. With tags.' },
  output_type: 'video',
  scenarios: ['og-image'],
  languages: ['en', 'zh-CN'],
  agents: ['claude-code', 'gemini-cli', 'codex'],
  permissions: { network: 'none', credentials: 'none' },
  examples: [
    {
      real_run: true,
      files: ['examples/run/video.mp4', 'examples/run/poster.jpg', 'examples/run/input.html'],
      title: { zh: '案例', en: 'Example' }
    },
    { real_run: false, files: ['examples/mock.png'], title: { en: 'Mock' } }
  ],
  changelog: [{ version: '1.0.0', notes: { zh: '首个版本', en: 'Initial' } }]
};

test('archives are byte-identical for identical content and readable by the CLI', () => {
  const files = {
    'SKILL.md': '---\nname: og-image\n---\n',
    'scripts/render.mjs': 'export {};\n',
    [`templates/${'nested/'.repeat(14)}og.html`]: '<html></html>'
  };
  const first = buildDeterministicArchive(makeSkill(files), 'og-image');
  const second = buildDeterministicArchive(makeSkill(files), 'og-image');
  assert.equal(sha256Hex(first), sha256Hex(second));

  const entries = normalizeSkillEntries(readTarGz(first));
  const paths = entries.filter((entry) => entry.type !== 'directory').map((entry) => entry.path).sort();
  assert.deepEqual(paths, Object.keys(files).sort());
});

test('archive content changes change the hash', () => {
  const a = buildDeterministicArchive(makeSkill({ 'SKILL.md': 'a' }), 'x-skill');
  const b = buildDeterministicArchive(makeSkill({ 'SKILL.md': 'b' }), 'x-skill');
  assert.notEqual(sha256Hex(a), sha256Hex(b));
});

test('symlinks and hidden files are rejected', () => {
  const root = makeSkill({ 'SKILL.md': 'x' });
  symlinkSync('/etc/hosts', path.join(root, 'hosts'));
  assert.throws(() => buildDeterministicArchive(root, 'x-skill'), /Symlink/);
  assert.throws(
    () => buildDeterministicArchive(makeSkill({ 'SKILL.md': 'x', '.env': 'SECRET=1' }), 'x-skill'),
    /Hidden/
  );
});

test('manifest maps to catalog rows with locale keys and catalog agent names', () => {
  const mapped = mapManifest(manifest, { dirName: 'og-image' });
  assert.deepEqual(mapped.catalog.name, { 'zh-CN': '网站分享图', 'en-US': 'Open Graph Image' });
  assert.equal(mapped.catalog.summary['zh-CN'], '生成 1200×630 分享图。');
  assert.deepEqual(mapped.version_row.compatible_agents, ['claude-code', 'gemini', 'codex']);
  // Only real-run media is shown; a video example keeps its poster.
  assert.equal(mapped.examples.length, 1);
  assert.equal(mapped.examples[0].file, 'examples/run/video.mp4');
  assert.equal(mapped.examples[0].posterFile, 'examples/run/poster.jpg');
});

test('manifest validation rejects unsafe or inconsistent packages', () => {
  assert.throws(() => mapManifest(manifest, { dirName: 'other' }), /does not match/);
  assert.throws(
    () => mapManifest({ ...manifest, permissions: { network: 'full', credentials: 'none' } }, { dirName: 'og-image' }),
    /network/
  );
  assert.throws(() => mapManifest({ ...manifest, agents: ['vscode'] }, { dirName: 'og-image' }), /unknown agent/);
  assert.throws(() => mapManifest({ ...manifest, version: '2.0.0' }, { dirName: 'og-image' }), /changelog/);
});

test('archive object keys require a random component', () => {
  assert.throws(() => archiveObjectKey('og-image', '1.0.0', 'abc'), /random/);
  assert.match(
    archiveObjectKey('og-image', '1.0.0', 'a'.repeat(32)),
    /^skills\/og-image\/1\.0\.0\/a{32}\.tar\.gz$/
  );
});
