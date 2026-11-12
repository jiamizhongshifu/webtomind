import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const SERVICE = 'webtomind-cli';

/** @returns {Promise<{ code: number, stdout: string, stderr: string }>} */
export function run(command, args, input) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ code: 127, stdout: '', stderr: String(error) });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => resolve({ code: 127, stdout, stderr: String(error) }));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.stdin.end(input ?? '');
  });
}

export function configDir(env = process.env, home = homedir()) {
  if (env.WEBTOMIND_CONFIG_DIR) return env.WEBTOMIND_CONFIG_DIR;
  if (process.platform === 'win32' && env.APPDATA) return join(env.APPDATA, 'webtomind');
  return join(env.XDG_CONFIG_HOME || join(home, '.config'), 'webtomind');
}

function createFileStore(file, account) {
  async function readAll() {
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch {
      return {};
    }
  }
  return {
    kind: 'file',
    async get() {
      const all = await readAll();
      return typeof all[account] === 'string' ? all[account] : null;
    },
    async set(token) {
      const all = await readAll();
      all[account] = token;
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      await writeFile(file, JSON.stringify(all, null, 2), { mode: 0o600 });
      await chmod(file, 0o600);
    },
    async delete() {
      const all = await readAll();
      delete all[account];
      if (Object.keys(all).length === 0) await rm(file, { force: true });
      else await writeFile(file, JSON.stringify(all, null, 2), { mode: 0o600 });
    }
  };
}

function createMacKeychainStore(account, runner) {
  return {
    kind: 'macos-keychain',
    async get() {
      const result = await runner('security', [
        'find-generic-password', '-s', SERVICE, '-a', account, '-w'
      ]);
      return result.code === 0 ? result.stdout.trim() || null : null;
    },
    async set(token) {
      const result = await runner('security', [
        'add-generic-password', '-U', '-s', SERVICE, '-a', account, '-l', 'WebToMind CLI', '-w', token
      ]);
      if (result.code !== 0) throw new Error(`Keychain write failed: ${result.stderr.trim()}`);
    },
    async delete() {
      await runner('security', ['delete-generic-password', '-s', SERVICE, '-a', account]);
    }
  };
}

function createSecretServiceStore(account, runner) {
  return {
    kind: 'secret-service',
    async get() {
      const result = await runner('secret-tool', ['lookup', 'service', SERVICE, 'account', account]);
      return result.code === 0 ? result.stdout.trim() || null : null;
    },
    async set(token) {
      // secret-tool reads the secret from stdin, keeping it out of argv.
      const result = await runner(
        'secret-tool',
        ['store', '--label=WebToMind CLI', 'service', SERVICE, 'account', account],
        token
      );
      if (result.code !== 0) throw new Error(`Secret Service write failed: ${result.stderr.trim()}`);
    },
    async delete() {
      await runner('secret-tool', ['clear', 'service', SERVICE, 'account', account]);
    }
  };
}

/**
 * System keychain on macOS (Keychain) and Linux (Secret Service via
 * secret-tool). Other systems, or Linux without secret-tool, fall back to a
 * 0600 file in the user config directory.
 *
 * @param {{ account: string, platform?: string, env?: Record<string, string | undefined>, runner?: typeof run }} options
 */
export async function createCredentialStore({
  account,
  platform = process.platform,
  env = process.env,
  runner = run
}) {
  const file = join(configDir(env), 'credentials.json');
  if (env.WEBTOMIND_CREDENTIAL_STORE === 'file') return createFileStore(file, account);
  if (platform === 'darwin') return createMacKeychainStore(account, runner);
  if (platform === 'linux') {
    const probe = await runner('secret-tool', ['--version']);
    if (probe.code === 0) return createSecretServiceStore(account, runner);
  }
  return createFileStore(file, account);
}
