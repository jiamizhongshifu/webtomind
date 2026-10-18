import { homedir } from 'node:os';
import { join } from 'node:path';

/** User-level Skills directory for each supported agent. */
const AGENT_SKILL_DIRS = {
  'claude-code': (home, env) =>
    join(env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'skills'),
  codex: (home, env) => join(env.CODEX_HOME || join(home, '.codex'), 'skills'),
  cursor: (home) => join(home, '.cursor', 'skills'),
  gemini: (home) => join(home, '.gemini', 'skills'),
  'kimi-code': (home) => join(home, '.kimi', 'skills'),
  antigravity: (home) => join(home, '.gemini', 'antigravity', 'skills'),
  trae: (home) => join(home, '.trae', 'skills')
};

export const AGENTS = Object.freeze(Object.keys(AGENT_SKILL_DIRS));
export const DEFAULT_AGENT = 'claude-code';

export function isAgent(value) {
  return typeof value === 'string' && Object.hasOwn(AGENT_SKILL_DIRS, value);
}

/**
 * @param {string} agent
 * @param {{ home?: string, env?: Record<string, string | undefined> }} [options]
 */
export function agentSkillsDir(agent, options = {}) {
  if (!isAgent(agent)) throw new Error(`Unknown agent: ${agent}`);
  return AGENT_SKILL_DIRS[agent](options.home || homedir(), options.env || process.env);
}
