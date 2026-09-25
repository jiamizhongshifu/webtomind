import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const scannerPath = join(process.cwd(), 'scripts/check-tracked-secrets.mjs');
const tempRepos: string[] = [];

function createRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'webtomind-secret-scan-'));
  tempRepos.push(repo);
  execFileSync('git', ['init', '-q'], { cwd: repo });
  return repo;
}

function runScanner(repo: string, args: string[] = []) {
  return spawnSync(process.execPath, [scannerPath, ...args], {
    cwd: repo,
    encoding: 'utf8'
  });
}

describe('tracked secret scanner', () => {
  afterEach(() => {
    while (tempRepos.length > 0) {
      rmSync(tempRepos.pop()!, { recursive: true, force: true });
    }
  });

  it('allows ordinary tracked content', () => {
    const repo = createRepo();
    writeFileSync(join(repo, 'README.md'), 'safe project documentation\n');
    execFileSync('git', ['add', 'README.md'], { cwd: repo });

    expect(runScanner(repo).status).toBe(0);
  });

  it('rejects a token pasted into an innocently named Markdown file', () => {
    const repo = createRepo();
    writeFileSync(
      join(repo, 'notes.md'),
      `temporary token: sk-proj-${'A'.repeat(48)}\n`
    );
    execFileSync('git', ['add', 'notes.md'], { cwd: repo });

    const result = runScanner(repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('notes.md:1: OpenAI/Anthropic API key');
  });

  it('rejects sensitive paths that remain in the Git index after deletion', () => {
    const repo = createRepo();
    writeFileSync(join(repo, 'cookie_input.json'), '{"cookies":[]}\n');
    execFileSync('git', ['add', 'cookie_input.json'], { cwd: repo });
    rmSync(join(repo, 'cookie_input.json'));

    expect(runScanner(repo).status).toBe(0);
    const strictResult = runScanner(repo, ['--strict-index']);
    expect(strictResult.status).toBe(1);
    expect(strictResult.stderr).toContain('cookie_input.json: forbidden path');
  });
});
