import os from 'node:os';
import path from 'node:path';

export function getRuntimeProductionEnvPath(env = process.env) {
  return (
    env.WEBTOMIND_RUNTIME_ENV_FILE ||
    path.join(env.HOME || os.homedir(), '.config/webtomind/runtime-production.env')
  );
}
