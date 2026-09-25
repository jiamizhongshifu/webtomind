import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';

const DEFAULT_ENV_FILES = ['.env.local', 'server/.env'];

export function loadRuntimeEnv(options = {}) {
  const cwd = options.cwd || process.cwd();
  const files = [
    ...(options.files || DEFAULT_ENV_FILES),
    ...(options.extraFiles || [])
  ];
  const loaded = [];

  for (const file of files) {
    if (!file) continue;
    const envPath = path.isAbsolute(file) ? file : path.join(cwd, file);
    if (!existsSync(envPath)) continue;
    dotenv.config({
      path: envPath,
      override: Boolean(options.override),
      quiet: true
    });
    loaded.push(envPath);
  }

  return loaded;
}

export function usableEnvValue(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  if (trimmed.includes('your-project.supabase.co')) return '';
  if (trimmed.includes('placeholder.supabase.co')) return '';
  if (trimmed.includes('example.supabase.co')) return '';
  if (
    trimmed.includes('your_') ||
    trimmed.includes('your-') ||
    trimmed.includes('<') ||
    trimmed.includes('placeholder-key') ||
    trimmed.includes('anon-key-for-e2e')
  ) {
    return '';
  }
  return trimmed;
}

export function getSupabaseEnv(options = {}) {
  const url =
    usableEnvValue(process.env.SUPABASE_URL) ||
    usableEnvValue(process.env.VITE_SUPABASE_URL);
  const anonKey =
    usableEnvValue(process.env.SUPABASE_ANON_KEY) ||
    usableEnvValue(process.env.VITE_SUPABASE_ANON_KEY);
  const serviceRoleKey = usableEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (options.requireUrl !== false && !url) {
    throw new Error('Missing usable SUPABASE_URL or VITE_SUPABASE_URL.');
  }
  if (options.requireAnonKey && !anonKey) {
    throw new Error('Missing usable SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY.');
  }
  if (options.requireServiceRoleKey && !serviceRoleKey) {
    throw new Error('Missing usable SUPABASE_SERVICE_ROLE_KEY.');
  }

  return {
    url,
    anonKey,
    serviceRoleKey,
    hasAnonKey: Boolean(anonKey),
    hasServiceRoleKey: Boolean(serviceRoleKey)
  };
}

export function redactValue(value) {
  if (!value) return '';
  const text = String(value);
  if (text.length <= 8) return '<redacted>';
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}
