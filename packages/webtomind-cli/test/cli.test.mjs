// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentSkillsDir } from '../src/agents.mjs';
import { createApiClient } from '../src/api.mjs';
import { main } from '../src/cli.mjs';
import { createCredentialStore } from '../src/credentials.mjs';
import { EXIT } from '../src/errors.mjs';
import { installSkill, listInstalled } from '../src/install.mjs';
import { login } from '../src/login.mjs';
import { normalizeSkillEntries, readTarGz } from '../src/tar.mjs';

function tarHeader(name, size, type = '0', linkName = '') {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write('0000644\0', 100);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  header.write(size.toString(8).padStart(11, '0') + '\0', 124);
  header.write('00000000000\0', 136);
  header.write('        ', 148);
  header.write(type, 156);
  header.write(linkName, 157, 100, 'utf8');
  header.write('ustar\0', 257);
  header.write('00', 263);
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return header;
}

function makeTarGz(entries) {
  const blocks = [];
  for (const entry of entries) {
    const data = Buffer.from(entry.content ?? '');
    blocks.push(tarHeader(entry.name, data.length, entry.type ?? '0', entry.link ?? ''));
    if (data.length) {
      blocks.push(data, Buffer.alloc((512 - (data.length % 512)) % 512));
    }
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const API = 'https://webtomind.test';

let home;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'webtomind-cli-'));
});
afterEach(() => vi.restoreAllMocks());

function fakeServer({ archive, sha256, installStatus = 200, installBody }) {
  const calls = [];
  const fetchImpl = vi.fn(async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/api/skill-catalog/install')) {
      return Response.json(
        installBody ?? {
          slug: 'xhs-cover',
          version: '1.0.0',
          sha256,
          sizeBytes: archive.length,
          downloadUrl: 'https://r2.test/signed',
          entitlementSource: 'free'
        },
        { status: installStatus }
      );
    }
    if (String(url) === 'https://r2.test/signed') return new Response(archive);
    return new Response('not found', { status: 404 });
  });
  return { fetchImpl, calls };
}

describe('install', () => {
  const archive = makeTarGz([
    { name: 'xhs-cover/', type: '5' },
    { name: 'xhs-cover/SKILL.md', content: '---\nname: xhs-cover\n---\n' },
    { name: 'xhs-cover/templates/cover.html', content: '<html></html>' }
  ]);

  it('verifies SHA-256 and extracts into the agent Skills directory', async () => {
    const { fetchImpl, calls } = fakeServer({ archive, sha256: sha(archive) });
    const api = createApiClient({ baseUrl: API, token: 'wtm_cli_test', fetchImpl });
    const result = await installSkill({ api, slug: 'xhs-cover', agent: 'claude-code', home, env: {}, fetchImpl });

    const skillDir = join(home, '.claude', 'skills', 'xhs-cover');
    expect(result).toMatchObject({ status: 'installed', version: '1.0.0', path: skillDir });
    expect(await readFile(join(skillDir, 'SKILL.md'), 'utf8')).toContain('name: xhs-cover');
    expect(await readFile(join(skillDir, 'templates', 'cover.html'), 'utf8')).toBe('<html></html>');
    expect(JSON.parse(calls[0].init.body)).toEqual({ slug: 'xhs-cover', agent: 'claude-code' });
    expect(calls[0].init.headers.Authorization).toBe('Bearer wtm_cli_test');

    const again = await installSkill({ api, slug: 'xhs-cover', agent: 'claude-code', home, env: {}, fetchImpl });
    expect(again.status).toBe('unchanged');
    expect(await listInstalled({ home, env: {} })).toEqual([
      { agent: 'claude-code', slug: 'xhs-cover', version: '1.0.0', path: skillDir }
    ]);
  });

  it('refuses to install when the archive hash does not match', async () => {
    const { fetchImpl } = fakeServer({ archive, sha256: 'f'.repeat(64) });
    const api = createApiClient({ baseUrl: API, token: 'wtm_cli_test', fetchImpl });
    const target = join(home, 'custom');
    await expect(
      installSkill({ api, slug: 'xhs-cover', target, fetchImpl })
    ).rejects.toMatchObject({ code: 'SHA256_MISMATCH', exitCode: EXIT.INTEGRITY });
    await expect(stat(target)).rejects.toThrow();
  });

  it('does not overwrite a directory it did not install without --force', async () => {
    const { fetchImpl } = fakeServer({ archive, sha256: sha(archive) });
    const api = createApiClient({ baseUrl: API, token: 'wtm_cli_test', fetchImpl });
    await mkdir(join(home, 'skills', 'xhs-cover'), { recursive: true });
    await writeFile(join(home, 'skills', 'xhs-cover', 'SKILL.md'), 'mine');
    await expect(
      installSkill({ api, slug: 'xhs-cover', target: join(home, 'skills'), fetchImpl })
    ).rejects.toMatchObject({ code: 'TARGET_EXISTS' });
    await installSkill({ api, slug: 'xhs-cover', target: join(home, 'skills'), force: true, fetchImpl });
    expect(await readFile(join(home, 'skills', 'xhs-cover', 'SKILL.md'), 'utf8')).toContain('name:');
  });

  it('rejects path traversal, links and archives without SKILL.md', () => {
    expect(() => readTarGz(makeTarGz([{ name: '../evil.sh', content: 'x' }]))).toThrow(/escapes/);
    expect(() => readTarGz(makeTarGz([{ name: '/etc/passwd', content: 'x' }]))).toThrow(/Absolute/);
    expect(() =>
      readTarGz(makeTarGz([{ name: 'link', type: '2', link: '/etc/passwd' }]))
    ).toThrow(/Unsupported/);
    expect(() =>
      normalizeSkillEntries(readTarGz(makeTarGz([{ name: 'pkg/README.md', content: 'x' }])))
    ).toThrow(/SKILL.md/);
  });

  it('reports a missing entitlement with a dedicated exit code', async () => {
    const { fetchImpl } = fakeServer({
      archive,
      sha256: sha(archive),
      installStatus: 403,
      installBody: {
        error: 'This premium Skill requires an active Pro subscription',
        code: 'SKILL_ENTITLEMENT_REQUIRED',
        upgradeUrl: '/pricing'
      }
    });
    const errors = [];
    const store = { kind: 'memory', get: async () => 'wtm_cli_test', set: vi.fn(), delete: vi.fn() };
    const code = await main(['install', 'launch-deck', '--agent', 'codex'], {
      env: { WEBTOMIND_API_URL: API },
      fetchImpl,
      store,
      log: () => {},
      error: (line) => errors.push(line)
    });
    expect(code).toBe(EXIT.ENTITLEMENT);
    expect(errors.join('\n')).toContain('SKILL_ENTITLEMENT_REQUIRED');
    expect(errors.join('\n')).toContain(`${API}/pricing`);
  });

  it('validates agents and arguments before calling the API', async () => {
    const fetchImpl = vi.fn();
    const store = { get: async () => 'wtm_cli_test', set: vi.fn(), delete: vi.fn() };
    const io = { env: { WEBTOMIND_API_URL: API }, fetchImpl, store, log: () => {}, error: () => {} };
    expect(await main(['install', 'x', '--agent', 'vim'], io)).toBe(EXIT.USAGE);
    expect(await main(['install', 'x', '--agent', 'codex', '--target', '/tmp/x'], io)).toBe(EXIT.USAGE);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('login (device authorization)', () => {
  function deviceApi(tokenResponses) {
    return {
      deviceCode: vi.fn(async () => ({
        device_code: 'device-secret',
        user_code: 'BCDF-GHJK',
        verification_uri: `${API}/cli/device`,
        verification_uri_complete: `${API}/cli/device?user_code=BCDF-GHJK`,
        expires_in: 600,
        interval: 5
      })),
      deviceToken: vi.fn(async () => tokenResponses.shift())
    };
  }

  it('polls through pending and slow_down, then stores the credential', async () => {
    const api = deviceApi([
      { status: 400, data: { error: 'authorization_pending' } },
      { status: 400, data: { error: 'slow_down', interval: 10 } },
      { status: 200, data: { access_token: 'wtm_cli_new', expires_at: '2027-04-16T00:00:00Z' } }
    ]);
    const store = { set: vi.fn() };
    const sleeps = [];
    let clock = 0;
    await login({
      api,
      store,
      log: () => {},
      open: () => {},
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      now: () => clock
    });
    expect(store.set).toHaveBeenCalledWith('wtm_cli_new');
    expect(sleeps).toEqual([5000, 5000, 10000]);
  });

  it('fails clearly when the device code expires', async () => {
    const api = deviceApi([{ status: 400, data: { error: 'expired_token' } }]);
    const store = { set: vi.fn() };
    await expect(
      login({ api, store, log: () => {}, open: () => {}, sleep: async () => {}, now: () => 0 })
    ).rejects.toMatchObject({ code: 'DEVICE_CODE_EXPIRED', exitCode: EXIT.AUTH });
    expect(store.set).not.toHaveBeenCalled();
  });

  it('stops polling at the local deadline even if the server stays pending', async () => {
    const api = deviceApi(
      Array.from({ length: 500 }, () => ({ status: 400, data: { error: 'authorization_pending' } }))
    );
    let clock = 0;
    await expect(
      login({
        api,
        store: { set: vi.fn() },
        log: () => {},
        open: () => {},
        sleep: async (ms) => {
          clock += ms;
        },
        now: () => clock
      })
    ).rejects.toMatchObject({ code: 'DEVICE_CODE_EXPIRED' });
    expect(api.deviceToken.mock.calls.length).toBeLessThanOrEqual(120);
  });
});

describe('credential storage and agent paths', () => {
  it('uses the macOS keychain without writing token files', async () => {
    const runner = vi.fn(async () => ({ code: 0, stdout: 'wtm_cli_saved\n', stderr: '' }));
    const store = await createCredentialStore({ account: 'webtomind.com', platform: 'darwin', env: {}, runner });
    await store.set('wtm_cli_saved');
    expect(await store.get()).toBe('wtm_cli_saved');
    expect(store.kind).toBe('macos-keychain');
    expect(runner.mock.calls[0][0]).toBe('security');
  });

  it('falls back to a 0600 file when no keychain is available', async () => {
    const runner = vi.fn(async () => ({ code: 127, stdout: '', stderr: '' }));
    const env = { WEBTOMIND_CONFIG_DIR: join(home, 'config') };
    const store = await createCredentialStore({ account: 'webtomind.com', platform: 'linux', env, runner });
    await store.set('wtm_cli_file');
    expect(await store.get()).toBe('wtm_cli_file');
    const info = await stat(join(home, 'config', 'credentials.json'));
    if (process.platform !== 'win32') expect(info.mode & 0o777).toBe(0o600);
    await store.delete();
    expect(await store.get()).toBeNull();
  });

  it('maps every supported agent to its Skills directory', () => {
    const env = {};
    expect(agentSkillsDir('claude-code', { home: '/h', env })).toBe(join('/h', '.claude', 'skills'));
    expect(agentSkillsDir('codex', { home: '/h', env: { CODEX_HOME: '/c' } })).toBe(join('/c', 'skills'));
    expect(agentSkillsDir('antigravity', { home: '/h', env })).toBe(join('/h', '.gemini', 'antigravity', 'skills'));
    expect(() => agentSkillsDir('vim', { home: '/h', env })).toThrow();
  });
});
