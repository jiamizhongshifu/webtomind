import { spawn } from 'node:child_process';
import { hostname } from 'node:os';
import { CliError, EXIT } from './errors.mjs';

export function openBrowser(url) {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // The URL is printed; opening a browser is best effort.
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * OAuth 2.0 device authorization grant (RFC 8628): show the user code, wait
 * for browser approval, store the issued credential in the system keychain.
 *
 * @param {{
 *   api: ReturnType<typeof import('./api.mjs').createApiClient>,
 *   store: { set(token: string): Promise<void> },
 *   log?: (line: string) => void,
 *   open?: (url: string) => void,
 *   sleep?: (ms: number) => Promise<void>,
 *   now?: () => number,
 *   clientVersion?: string
 * }} options
 */
export async function login({
  api,
  store,
  log = console.log,
  open = openBrowser,
  sleep = defaultSleep,
  now = Date.now,
  clientVersion
}) {
  const start = await api.deviceCode({
    client_name: `webtomind-cli on ${hostname()}`.slice(0, 120),
    client_version: clientVersion
  });

  log(`Open ${start.verification_uri} and enter code: ${start.user_code}`);
  log(`(or visit ${start.verification_uri_complete})`);
  open(start.verification_uri_complete);

  const deadline = now() + Number(start.expires_in) * 1000;
  let interval = Math.max(1, Number(start.interval) || 5);
  while (now() < deadline) {
    await sleep(interval * 1000);
    const { status, data } = await api.deviceToken(start.device_code);
    if (status === 200 && typeof data.access_token === 'string') {
      await store.set(data.access_token);
      return { expiresAt: data.expires_at };
    }
    switch (data.error) {
      case 'authorization_pending':
        continue;
      case 'slow_down':
        interval = Math.max(interval + 5, Number(data.interval) || 0);
        continue;
      case 'expired_token':
        throw new CliError('DEVICE_CODE_EXPIRED', 'The login code expired. Run `webtomind-cli login` again.', {
          exitCode: EXIT.AUTH
        });
      case 'access_denied':
        throw new CliError('ACCESS_DENIED', 'Login was denied in the browser.', { exitCode: EXIT.AUTH });
      default:
        throw new CliError(
          'LOGIN_FAILED',
          data.error_description || data.error || `Login failed (HTTP ${status})`,
          { exitCode: EXIT.AUTH }
        );
    }
  }
  throw new CliError('DEVICE_CODE_EXPIRED', 'The login code expired. Run `webtomind-cli login` again.', {
    exitCode: EXIT.AUTH
  });
}
