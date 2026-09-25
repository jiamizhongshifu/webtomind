import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface ToolConfirmationDecision {
  approved: boolean;
}

interface Waiter {
  resolve: (decision: ToolConfirmationDecision) => void;
  timer: NodeJS.Timeout;
  pollTimer?: NodeJS.Timeout;
}

interface WaitForToolConfirmationParams {
  userId: string;
  sessionId: string;
  toolCallId: string;
  timeoutMs?: number;
}

interface ResolveToolConfirmationParams {
  userId: string;
  sessionId: string;
  toolCallId: string;
  approved: boolean;
}

interface ToolConfirmationResult {
  approved: boolean;
  timedOut: boolean;
}

interface PersistedDecision {
  approved: boolean;
  expiresAt: number;
}

interface PersistedStore {
  version: 1;
  decisions: Record<string, PersistedDecision>;
}

interface ConfirmationIdentity {
  userId: string;
  sessionId: string;
  toolCallId: string;
}

const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;
const DEFAULT_DECISION_TTL_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 800;
const SUPABASE_TABLE = 'agent_tool_confirmations';

const backendMode = (process.env.AGENT_CONFIRMATION_STORE_BACKEND || 'auto')
  .trim()
  .toLowerCase();

const configuredTtl = Number(process.env.AGENT_CONFIRMATION_DECISION_TTL_MS);
const DECISION_TTL_MS = Number.isFinite(configuredTtl) && configuredTtl > 0
  ? configuredTtl
  : DEFAULT_DECISION_TTL_MS;

const STORE_FILE_PATH =
  process.env.AGENT_CONFIRMATION_STORE_FILE ||
  path.join(process.cwd(), '.runtime', 'tool-confirmations.json');

const pendingWaiters = new Map<string, Waiter>();
const earlyDecisions = new Map<string, ToolConfirmationDecision>();
let storeIoChain: Promise<void> = Promise.resolve();
let supabaseStoreAvailable = backendMode !== 'file';
let lastSupabaseCleanupAt = 0;

let toolConfirmationSupabase: SupabaseClient | null = null;

function getToolConfirmationSupabaseClient(): SupabaseClient {
  if (!toolConfirmationSupabase) {
    const url = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE key are required');
    }

    toolConfirmationSupabase = createClient(url, key);
  }

  return toolConfirmationSupabase;
}

function getKey(userId: string, sessionId: string, toolCallId: string): string {
  return `${userId}::${sessionId}::${toolCallId}`;
}

function createEmptyStore(): PersistedStore {
  return {
    version: 1,
    decisions: {}
  };
}

function pruneExpiredDecisions(store: PersistedStore): boolean {
  const now = Date.now();
  let changed = false;

  for (const [key, value] of Object.entries(store.decisions)) {
    if (value.expiresAt <= now) {
      delete store.decisions[key];
      changed = true;
    }
  }

  return changed;
}

function shouldTrySupabaseBackend(): boolean {
  return backendMode !== 'file' && supabaseStoreAvailable;
}

function isSupabaseTableMissingError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string };
  const message = candidate?.message ?? '';
  return (
    candidate?.code === '42P01' ||
    message.includes(SUPABASE_TABLE) ||
    message.includes('relation')
  );
}

function markSupabaseUnavailable(reason: string, error?: unknown): void {
  if (!supabaseStoreAvailable) {
    return;
  }
  supabaseStoreAvailable = false;
  console.warn('[ToolConfirmationStore] Supabase backend disabled:', reason, error);
}

function getSupabaseClientSafe() {
  if (!shouldTrySupabaseBackend()) {
    return null;
  }
  try {
    return getToolConfirmationSupabaseClient();
  } catch (error) {
    markSupabaseUnavailable('create supabase client failed', error);
    return null;
  }
}

async function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = storeIoChain.then(fn, fn);
  storeIoChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function readStoreUnsafe(): Promise<PersistedStore> {
  try {
    const raw = await fs.readFile(STORE_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as PersistedStore;

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.decisions ||
      typeof parsed.decisions !== 'object'
    ) {
      return createEmptyStore();
    }

    return {
      version: 1,
      decisions: parsed.decisions
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(
        '[ToolConfirmationStore] Failed to read persisted decisions, fallback to empty store:',
        error
      );
    }
    return createEmptyStore();
  }
}

async function writeStoreUnsafe(store: PersistedStore): Promise<void> {
  await fs.mkdir(path.dirname(STORE_FILE_PATH), { recursive: true });
  await fs.writeFile(STORE_FILE_PATH, JSON.stringify(store), 'utf8');
}

async function persistDecisionToFile(
  key: string,
  approved: boolean
): Promise<void> {
  await withStoreLock(async () => {
    const store = await readStoreUnsafe();
    pruneExpiredDecisions(store);
    store.decisions[key] = {
      approved,
      expiresAt: Date.now() + DECISION_TTL_MS
    };
    await writeStoreUnsafe(store);
  });
}

async function consumeDecisionFromFile(
  key: string
): Promise<ToolConfirmationDecision | undefined> {
  return withStoreLock(async () => {
    const store = await readStoreUnsafe();
    const pruned = pruneExpiredDecisions(store);
    const persisted = store.decisions[key];

    if (!persisted) {
      if (pruned) {
        await writeStoreUnsafe(store);
      }
      return undefined;
    }

    delete store.decisions[key];
    await writeStoreUnsafe(store);
    return { approved: persisted.approved };
  });
}

async function cleanupExpiredSupabaseRows(): Promise<void> {
  const now = Date.now();
  if (now - lastSupabaseCleanupAt < 60 * 1000) {
    return;
  }
  lastSupabaseCleanupAt = now;

  const supabase = getSupabaseClientSafe();
  if (!supabase) {
    return;
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from(SUPABASE_TABLE)
    .delete()
    .lt('expires_at', nowIso);

  if (error && isSupabaseTableMissingError(error)) {
    markSupabaseUnavailable('missing table when cleaning expired rows', error);
  }
}

async function persistDecisionToSupabase(
  identity: ConfirmationIdentity,
  approved: boolean
): Promise<boolean> {
  const supabase = getSupabaseClientSafe();
  if (!supabase) {
    return false;
  }

  const expiresAtIso = new Date(Date.now() + DECISION_TTL_MS).toISOString();
  const { error } = await supabase.from(SUPABASE_TABLE).upsert(
    {
      user_id: identity.userId,
      session_id: identity.sessionId,
      tool_call_id: identity.toolCallId,
      approved,
      expires_at: expiresAtIso
    },
    {
      onConflict: 'user_id,session_id,tool_call_id'
    }
  );

  if (error) {
    if (isSupabaseTableMissingError(error)) {
      markSupabaseUnavailable('missing table when persisting decision', error);
    } else {
      console.warn('[ToolConfirmationStore] Supabase persist failed:', error);
    }
    return false;
  }

  void cleanupExpiredSupabaseRows().catch((cleanupError) => {
    console.warn('[ToolConfirmationStore] Supabase cleanup failed:', cleanupError);
  });
  return true;
}

async function consumeDecisionFromSupabase(
  identity: ConfirmationIdentity
): Promise<ToolConfirmationDecision | undefined> {
  const supabase = getSupabaseClientSafe();
  if (!supabase) {
    return undefined;
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from(SUPABASE_TABLE)
    .select('approved')
    .eq('user_id', identity.userId)
    .eq('session_id', identity.sessionId)
    .eq('tool_call_id', identity.toolCallId)
    .gt('expires_at', nowIso)
    .maybeSingle();

  if (error) {
    if (isSupabaseTableMissingError(error)) {
      markSupabaseUnavailable('missing table when consuming decision', error);
    } else {
      console.warn('[ToolConfirmationStore] Supabase consume failed:', error);
    }
    return undefined;
  }

  if (!data) {
    return undefined;
  }

  const { error: deleteError } = await supabase
    .from(SUPABASE_TABLE)
    .delete()
    .eq('user_id', identity.userId)
    .eq('session_id', identity.sessionId)
    .eq('tool_call_id', identity.toolCallId);

  if (deleteError && !isSupabaseTableMissingError(deleteError)) {
    console.warn('[ToolConfirmationStore] Supabase consume-delete failed:', deleteError);
  }

  return { approved: !!data.approved };
}

async function persistDecision(
  identity: ConfirmationIdentity,
  key: string,
  approved: boolean
): Promise<void> {
  const savedToSupabase = shouldTrySupabaseBackend()
    ? await persistDecisionToSupabase(identity, approved)
    : false;

  if (!savedToSupabase) {
    await persistDecisionToFile(key, approved);
  }
}

async function consumePersistedDecision(
  identity: ConfirmationIdentity,
  key: string
): Promise<ToolConfirmationDecision | undefined> {
  if (shouldTrySupabaseBackend()) {
    const decision = await consumeDecisionFromSupabase(identity);
    if (decision) {
      return decision;
    }
  }

  return consumeDecisionFromFile(key);
}

export async function waitForToolConfirmation(
  params: WaitForToolConfirmationParams
): Promise<ToolConfirmationResult> {
  const { userId, sessionId, toolCallId, timeoutMs = DEFAULT_TIMEOUT_MS } =
    params;
  const identity: ConfirmationIdentity = { userId, sessionId, toolCallId };
  const key = getKey(userId, sessionId, toolCallId);

  const cachedDecision = earlyDecisions.get(key);
  if (cachedDecision) {
    earlyDecisions.delete(key);
    return {
      approved: cachedDecision.approved,
      timedOut: false
    };
  }

  let persistedDecision: ToolConfirmationDecision | undefined;
  try {
    persistedDecision = await consumePersistedDecision(identity, key);
  } catch (error) {
    console.warn('[ToolConfirmationStore] Load persisted decision failed:', error);
  }

  if (persistedDecision) {
    return {
      approved: persistedDecision.approved,
      timedOut: false
    };
  }

  return new Promise<ToolConfirmationResult>((resolve) => {
    const cleanup = () => {
      const waiter = pendingWaiters.get(key);
      if (!waiter) {
        return;
      }
      clearTimeout(waiter.timer);
      if (waiter.pollTimer) {
        clearInterval(waiter.pollTimer);
      }
      pendingWaiters.delete(key);
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve({
        approved: false,
        timedOut: true
      });
    }, timeoutMs);

    const waiter: Waiter = {
      timer,
      resolve: (decision) => {
        cleanup();
        resolve({
          approved: decision.approved,
          timedOut: false
        });
      }
    };

    let polling = false;
    waiter.pollTimer = setInterval(() => {
      if (polling) {
        return;
      }
      polling = true;
      void consumePersistedDecision(identity, key)
        .then((decision) => {
          const activeWaiter = pendingWaiters.get(key);
          if (decision && activeWaiter) {
            activeWaiter.resolve(decision);
          }
        })
        .catch((error) => {
          console.warn(
            '[ToolConfirmationStore] Poll persisted decision failed:',
            error
          );
        })
        .finally(() => {
          polling = false;
        });
    }, POLL_INTERVAL_MS);

    pendingWaiters.set(key, waiter);
  });
}

export async function resolveToolConfirmation(
  params: ResolveToolConfirmationParams
): Promise<{ delivered: boolean }> {
  const { userId, sessionId, toolCallId, approved } = params;
  const key = getKey(userId, sessionId, toolCallId);
  const waiter = pendingWaiters.get(key);

  if (waiter) {
    waiter.resolve({ approved });
    return { delivered: true };
  }
  // Support "confirm arrives before waiter" concurrency scenario.
  earlyDecisions.set(key, { approved });
  try {
    await persistDecision({ userId, sessionId, toolCallId }, key, approved);
  } catch (error) {
    console.warn('[ToolConfirmationStore] Persist decision failed:', error);
  }
  return { delivered: false };
}


