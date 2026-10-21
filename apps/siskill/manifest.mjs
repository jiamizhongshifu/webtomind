import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8'
}).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], {
  encoding: 'utf8'
}).trim();
if (dirty) throw Error('Release manifest requires a clean source checkout');
const hash = (name) =>
  createHash('sha256')
    .update(readFileSync(new URL(name, import.meta.url)))
    .digest('hex');
writeFileSync(
  new URL('./dist/release-manifest.json', import.meta.url),
  JSON.stringify(
    {
      product: 'siskill',
      scope: 'public-preview',
      commit,
      builtAt: new Date().toISOString(),
      catalogSha256: hash('./catalog.json'),
      workerSha256: hash('./worker.mjs')
    },
    null,
    2
  ) + '\n'
);
console.log(`SiSkill manifest: ${commit}`);
