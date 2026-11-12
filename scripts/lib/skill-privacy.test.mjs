import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { inspectSkillPrivacy, assertSkillPrivacy } from './skill-privacy.mjs';
import { buildDeterministicArchive } from './skill-publish.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('detects personal paths on macOS, Linux and Windows without disclosing them', () => {
  for (const value of ['/Users/private-person/project', '/home/private-person/project', 'C:\\Users\\private-person\\project']) {
    assert.deepEqual(inspectSkillPrivacy('SKILL.md', value), [{ file: 'SKILL.md', rule: 'personal-path' }]);
    assert.throws(() => assertSkillPrivacy('SKILL.md', value), (error) => !error.message.includes('private-person'));
  }
});
test('rejects credentials in example sources and printable media metadata', () => {
  const token = 'ghp_' + 'a'.repeat(36);
  const issues = inspectSkillPrivacy('examples/demo.png', Buffer.from('\0metadata\0' + token));
  assert.equal(issues[0].rule, 'provider-token');
  assert.equal(JSON.stringify(issues).includes(token), false);
  assert.ok(inspectSkillPrivacy('examples/input.json', '{"api_key":"' + 'a'.repeat(32) + '"}').length);
  assert.ok(inspectSkillPrivacy('README.md', ['-----BEGIN', 'PRIVATE KEY-----'].join(' ')).length);
});
test('detects private endpoints, signed media links and cloned voice identifiers', () => {
  for (const value of ['http://192.168.1.2/demo', 'https://media.example.com/p.png?X-Amz-Signature=' + 'a'.repeat(64), 'S_123456789']) {
    assert.ok(inspectSkillPrivacy('examples/source.html', value).length);
  }
});
test('allows portable paths, public product links and empty credential placeholders', () => {
  assert.deepEqual(inspectSkillPrivacy('SKILL.md', 'output/demo.png https://webtomind.com https://example.com api_key="" ${API_KEY}'), []);
});
test('rejects credential files even if their content is empty', () => {
  assert.deepEqual(inspectSkillPrivacy('examples/cookies.json', '{}'), [{ file: 'examples/cookies.json', rule: 'private-file' }]);
});
test('flags potential personal contact data but permits reserved demo addresses', () => {
  assert.ok(inspectSkillPrivacy('brief.md', 'customer@private-mail.tld').length);
  assert.ok(inspectSkillPrivacy('brief.md', ['138', '0013', '8000'].join('')).length);
  assert.deepEqual(inspectSkillPrivacy('brief.md', 'demo@example.com support@webtomind.com demo@shop.test'), []);
});
test('archive creation cannot bypass the privacy guard', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'skill-privacy-test-'));
  writeFileSync(path.join(root, 'SKILL.md'), '/Users/private-person/project');
  assert.throws(() => buildDeterministicArchive(root, 'demo'), /Skill privacy check failed/);
});
