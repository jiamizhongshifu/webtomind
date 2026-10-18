import { readFileSync } from 'node:fs';
import { AGENTS, DEFAULT_AGENT, isAgent } from './agents.mjs';
import { createApiClient, resolveApiUrl } from './api.mjs';
import { createCredentialStore } from './credentials.mjs';
import { CliError, EXIT } from './errors.mjs';
import { installSkill, listInstalled } from './install.mjs';
import { login } from './login.mjs';

const VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version;

const HELP = `webtomind-cli ${VERSION}

Usage:
  webtomind-cli login                 Authorize this device in the browser
  webtomind-cli logout                Revoke and forget the stored credential
  webtomind-cli status                Show login state and Skill access
  webtomind-cli install <slug> [--agent <name> | --target <dir>] [--version <x.y.z>] [--force]
  webtomind-cli list [--available] [--target <dir>]

Agents: ${AGENTS.join(', ')} (default: ${DEFAULT_AGENT})
Environment: WEBTOMIND_API_URL (default https://webtomind.com)`;

/** Minimal argv parser: positionals plus --flag / --flag value / --flag=value. */
export function parseArgs(argv, booleanFlags = new Set()) {
  const positionals = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s, 2);
    if (booleanFlags.has(name)) {
      flags[name] = true;
    } else if (inline !== undefined) {
      flags[name] = inline;
    } else if (index + 1 < argv.length && !argv[index + 1].startsWith('--')) {
      flags[name] = argv[(index += 1)];
    } else {
      throw new CliError('USAGE', `--${name} needs a value`, { exitCode: EXIT.USAGE });
    }
  }
  return { positionals, flags };
}

/**
 * @param {string[]} argv
 * @param {{ env?: Record<string, string | undefined>, fetchImpl?: typeof fetch,
 *   log?: (line: string) => void, error?: (line: string) => void,
 *   store?: { kind?: string, get(): Promise<string | null>, set(token: string): Promise<void>, delete(): Promise<void> } }} [io]
 */
export async function main(argv, io = {}) {
  const env = io.env ?? process.env;
  const log = io.log ?? console.log;
  const error = io.error ?? console.error;
  try {
    if (argv[0] === '--version' || argv[0] === '-v') {
      log(VERSION);
      return EXIT.OK;
    }
    const { positionals, flags } = parseArgs(argv, new Set(['force', 'available', 'help']));
    const [command, ...rest] = positionals;
    if (command === 'version') {
      log(VERSION);
      return EXIT.OK;
    }
    if (!command || flags.help || command === 'help') {
      log(HELP);
      return command || flags.help ? EXIT.OK : EXIT.USAGE;
    }

    const baseUrl = resolveApiUrl(env);
    const store = io.store ?? (await createCredentialStore({ account: new URL(baseUrl).host, env }));
    const token = await store.get();
    const api = createApiClient({
      baseUrl,
      token,
      fetchImpl: io.fetchImpl,
      userAgent: `webtomind-cli/${VERSION}`
    });

    switch (command) {
      case 'login': {
        const result = await login({ api, store, log, clientVersion: VERSION });
        log(`Logged in. Credential stored in ${store.kind ?? 'credential store'}; expires ${result.expiresAt}.`);
        return EXIT.OK;
      }
      case 'logout': {
        if (token) {
          try {
            await api.revoke();
          } catch (revokeError) {
            error(`Server revoke failed (${revokeError.message}); removing local credential anyway.`);
          }
        }
        await store.delete();
        log('Logged out.');
        return EXIT.OK;
      }
      case 'status': {
        if (!token) {
          log(`Not logged in (${baseUrl}). Run \`npx webtomind-cli login\`.`);
          return EXIT.AUTH;
        }
        const me = await api.me();
        log(`Logged in to ${baseUrl}`);
        log(`Premium Skills: ${me.premiumAccess ? 'yes' : 'no'}`);
        for (const entitlement of me.entitlements || []) {
          log(`  - ${entitlement.source}${entitlement.endsAt ? ` until ${entitlement.endsAt}` : ''}`);
        }
        log(`Credential expires ${me.credentialExpiresAt}`);
        return EXIT.OK;
      }
      case 'install': {
        const [slug] = rest;
        if (!slug) throw new CliError('USAGE', 'Usage: webtomind-cli install <slug>', { exitCode: EXIT.USAGE });
        if (flags.agent && flags.target) {
          throw new CliError('USAGE', 'Use either --agent or --target, not both', { exitCode: EXIT.USAGE });
        }
        if (flags.agent && !isAgent(flags.agent)) {
          throw new CliError('USAGE', `Unknown agent "${flags.agent}". Choose: ${AGENTS.join(', ')}`, {
            exitCode: EXIT.USAGE
          });
        }
        const result = await installSkill({
          api,
          slug,
          agent: flags.target ? null : flags.agent || DEFAULT_AGENT,
          target: flags.target || null,
          version: flags.version || null,
          force: Boolean(flags.force),
          env,
          fetchImpl: io.fetchImpl
        });
        log(
          result.status === 'unchanged'
            ? `${slug}@${result.version} is already installed at ${result.path}`
            : `${result.status === 'updated' ? 'Updated' : 'Installed'} ${slug}@${result.version} → ${result.path} (SHA-256 verified)`
        );
        return EXIT.OK;
      }
      case 'list': {
        if (flags.available) {
          const catalog = await api.catalog({ limit: 100 });
          for (const item of catalog.items || []) {
            const name = item.name?.en || item.name?.['zh-CN'] || item.slug;
            log(`${item.slug}\t${item.tier}\t${item.latestVersion ?? '-'}\t${name}`);
          }
          return EXIT.OK;
        }
        const installed = await listInstalled({
          env,
          extraDirs: flags.target ? [flags.target] : []
        });
        if (installed.length === 0) log('No WebToMind Skills installed.');
        for (const item of installed) {
          log(`${item.slug}@${item.version}\t${item.agent ?? 'custom'}\t${item.path}`);
        }
        return EXIT.OK;
      }
      default:
        throw new CliError('USAGE', `Unknown command "${command}"\n\n${HELP}`, { exitCode: EXIT.USAGE });
    }
  } catch (caught) {
    if (caught instanceof CliError) {
      error(`Error [${caught.code}]: ${caught.message}`);
      if (caught.code === 'SKILL_ENTITLEMENT_REQUIRED') {
        error(`Upgrade at ${resolveApiUrl(env)}${caught.details.upgradeUrl || '/pricing'}`);
      }
      return caught.exitCode;
    }
    error(`Error: ${caught instanceof Error ? caught.message : String(caught)}`);
    return EXIT.ERROR;
  }
}
