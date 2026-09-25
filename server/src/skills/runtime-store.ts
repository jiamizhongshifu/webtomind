import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  SkillArtifact,
  SkillRun,
  SkillRunStatus,
  SkillRunStep,
  SkillRunStepKind,
  RuntimeEventPayload
} from './runtime-types.js';

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

interface PersistedRuntimeStore {
  version: 1;
  runs: SkillRun[];
  steps: SkillRunStep[];
  artifacts: SkillArtifact[];
}

interface SupabaseSkillRuntimeStepRow {
  id: string;
  run_id: string;
  step_index: number;
  kind: SkillRunStepKind;
  status: SkillRunStatus;
  title: string;
  tool_name?: string | null;
  payload?: RuntimeEventPayload | null;
  started_at: number;
  ended_at?: number | null;
  error_message?: string | null;
}

interface SupabaseSkillRuntimeArtifactRow {
  id: string;
  run_id: string;
  step_id?: string | null;
  type: string;
  title?: string | null;
  preview?: string | null;
  data?: unknown;
  created_at: number;
}

const RUNTIME_STORE_MODE = (process.env.SKILL_RUNTIME_STORE_MODE || 'memory')
  .trim()
  .toLowerCase();
const RUNTIME_STORE_RETENTION_MS = Number(
  process.env.SKILL_RUNTIME_RETENTION_MS || 7 * 24 * 60 * 60 * 1000
);
const RUNTIME_STORE_FILE =
  process.env.SKILL_RUNTIME_STORE_FILE ||
  path.join(process.cwd(), '.runtime', 'skill-runtime-store.json');

async function ensureStoreDir(): Promise<void> {
  await fs.mkdir(path.dirname(RUNTIME_STORE_FILE), { recursive: true });
}

async function readPersistedStore(): Promise<PersistedRuntimeStore> {
  try {
    const raw = await fs.readFile(RUNTIME_STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as PersistedRuntimeStore;
    return {
      version: 1,
      runs: parsed.runs || [],
      steps: parsed.steps || [],
      artifacts: parsed.artifacts || []
    };
  } catch {
    return { version: 1, runs: [], steps: [], artifacts: [] };
  }
}

async function writePersistedStore(store: PersistedRuntimeStore): Promise<void> {
  await ensureStoreDir();
  await fs.writeFile(RUNTIME_STORE_FILE, JSON.stringify(store), 'utf8');
}

function getRuntimeSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export interface RuntimeStore {
  createRun(input: {
    userId: string;
    skillId?: string;
    mode: SkillRun['mode'];
    traceId: string;
  }): SkillRun;
  updateRunStatus(runId: string, status: SkillRunStatus, errorMessage?: string): SkillRun | null;
  createStep(input: {
    runId: string;
    kind: SkillRunStepKind;
    title: string;
    toolName?: string;
    payload?: unknown;
    status?: SkillRunStatus;
  }): SkillRunStep;
  completeStep(stepId: string, payload?: unknown): SkillRunStep | null;
  failStep(stepId: string, errorMessage: string, payload?: unknown): SkillRunStep | null;
  createArtifact(input: {
    runId: string;
    stepId?: string;
    type: string;
    title?: string;
    preview?: string;
    data?: unknown;
  }): SkillArtifact;
  getRun(runId: string): SkillRun | null;
  getRunSteps(runId: string): SkillRunStep[];
  getRunArtifacts(runId: string): SkillArtifact[];
  getRunWithDetails(runId: string): {
    run: SkillRun;
    steps: SkillRunStep[];
    artifacts: SkillArtifact[];
  } | null;
  listRuns(limit?: number): SkillRun[];
  cleanup(maxAgeMs?: number): number;
  flush?(): Promise<void>;
}

class InMemoryRuntimeStore implements RuntimeStore {
  protected runs = new Map<string, SkillRun>();
  protected steps = new Map<string, SkillRunStep>();
  protected artifacts = new Map<string, SkillArtifact>();
  protected stepIndexes = new Map<string, number>();

  createRun(input: {
    userId: string;
    skillId?: string;
    mode: SkillRun['mode'];
    traceId: string;
  }): SkillRun {
    const run: SkillRun = {
      id: createId('run'),
      userId: input.userId,
      skillId: input.skillId,
      mode: input.mode,
      status: 'running',
      traceId: input.traceId,
      startedAt: Date.now()
    };
    this.runs.set(run.id, run);
    this.stepIndexes.set(run.id, 0);
    return run;
  }

  updateRunStatus(runId: string, status: SkillRunStatus, errorMessage?: string): SkillRun | null {
    const run = this.runs.get(runId);
    if (!run) return null;
    const updated: SkillRun = {
      ...run,
      status,
      errorMessage,
      endedAt: ['completed', 'failed', 'cancelled'].includes(status) ? Date.now() : run.endedAt
    };
    this.runs.set(runId, updated);
    return updated;
  }

  createStep(input: {
    runId: string;
    kind: SkillRunStepKind;
    title: string;
    toolName?: string;
    payload?: unknown;
    status?: SkillRunStatus;
  }): SkillRunStep {
    const currentIndex = this.stepIndexes.get(input.runId) ?? 0;
    const nextIndex = currentIndex + 1;
    this.stepIndexes.set(input.runId, nextIndex);

    const step: SkillRunStep = {
      id: createId('step'),
      runId: input.runId,
      index: nextIndex,
      kind: input.kind,
      title: input.title,
      toolName: input.toolName,
      payload: input.payload as RuntimeEventPayload | undefined,
      status: input.status ?? 'running',
      startedAt: Date.now()
    };
    this.steps.set(step.id, step);
    return step;
  }

  completeStep(stepId: string, payload?: unknown): SkillRunStep | null {
    const step = this.steps.get(stepId);
    if (!step) return null;
    const updated: SkillRunStep = {
      ...step,
      payload: (payload ?? step.payload) as RuntimeEventPayload | undefined,
      status: 'completed',
      endedAt: Date.now()
    };
    this.steps.set(stepId, updated);
    return updated;
  }

  failStep(stepId: string, errorMessage: string, payload?: unknown): SkillRunStep | null {
    const step = this.steps.get(stepId);
    if (!step) return null;
    const updated: SkillRunStep = {
      ...step,
      payload: (payload ?? step.payload) as RuntimeEventPayload | undefined,
      status: 'failed',
      errorMessage,
      endedAt: Date.now()
    };
    this.steps.set(stepId, updated);
    return updated;
  }

  createArtifact(input: {
    runId: string;
    stepId?: string;
    type: string;
    title?: string;
    preview?: string;
    data?: unknown;
  }): SkillArtifact {
    const artifact: SkillArtifact = {
      id: createId('artifact'),
      runId: input.runId,
      stepId: input.stepId,
      type: input.type,
      title: input.title,
      preview: input.preview,
      data: input.data,
      createdAt: Date.now()
    };
    this.artifacts.set(artifact.id, artifact);
    return artifact;
  }

  getRun(runId: string): SkillRun | null {
    return this.runs.get(runId) ?? null;
  }

  getRunSteps(runId: string): SkillRunStep[] {
    return Array.from(this.steps.values())
      .filter((step) => step.runId === runId)
      .sort((a, b) => a.index - b.index);
  }

  getRunArtifacts(runId: string): SkillArtifact[] {
    return Array.from(this.artifacts.values()).filter(
      (artifact) => artifact.runId === runId
    );
  }

  getRunWithDetails(runId: string): {
    run: SkillRun;
    steps: SkillRunStep[];
    artifacts: SkillArtifact[];
  } | null {
    const run = this.getRun(runId);
    if (!run) return null;
    return {
      run,
      steps: this.getRunSteps(runId),
      artifacts: this.getRunArtifacts(runId)
    };
  }

  listRuns(limit = 20): SkillRun[] {
    return Array.from(this.runs.values())
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }

  cleanup(maxAgeMs = 24 * 60 * 60 * 1000): number {
    const threshold = Date.now() - maxAgeMs;
    const removableRunIds = Array.from(this.runs.values())
      .filter((run) => (run.endedAt || run.startedAt) < threshold)
      .map((run) => run.id);

    removableRunIds.forEach((runId) => {
      this.runs.delete(runId);
      this.stepIndexes.delete(runId);
      for (const [stepId, step] of this.steps.entries()) {
        if (step.runId === runId) this.steps.delete(stepId);
      }
      for (const [artifactId, artifact] of this.artifacts.entries()) {
        if (artifact.runId === runId) this.artifacts.delete(artifactId);
      }
    });

    return removableRunIds.length;
  }
}

class FileBackedRuntimeStore extends InMemoryRuntimeStore {
  private hydrated = false;
  private persistChain: Promise<void> = Promise.resolve();
  private persistDisabled = false;

  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    const persisted = await readPersistedStore();
    for (const run of persisted.runs) {
      this.runs.set(run.id, run);
      const currentIndex = this.stepIndexes.get(run.id) ?? 0;
      this.stepIndexes.set(run.id, currentIndex);
    }
    for (const step of persisted.steps) {
      this.steps.set(step.id, step);
      const currentIndex = this.stepIndexes.get(step.runId) ?? 0;
      this.stepIndexes.set(step.runId, Math.max(currentIndex, step.index));
    }
    for (const artifact of persisted.artifacts) {
      this.artifacts.set(artifact.id, artifact);
    }
    this.hydrated = true;
  }

  private schedulePersist(): void {
    if (this.persistDisabled) return;
    this.persistChain = this.persistChain
      .then(async () => {
        await this.hydrate();
        super.cleanup(RUNTIME_STORE_RETENTION_MS);
        await writePersistedStore({
          version: 1,
          runs: Array.from(this.runs.values()),
          steps: Array.from(this.steps.values()),
          artifacts: Array.from(this.artifacts.values())
        });
      })
      .catch((error) => {
        this.persistDisabled = true;
        console.warn('[RuntimeStore] File persist disabled after error:', error);
      });
  }

  override listRuns(limit = 20): SkillRun[] {
    void this.hydrate();
    return super.listRuns(limit);
  }

  override cleanup(maxAgeMs = 24 * 60 * 60 * 1000): number {
    const removed = super.cleanup(maxAgeMs);
    if (removed > 0) {
      this.schedulePersist();
    }
    return removed;
  }

  async flush(): Promise<void> {
    await this.persistChain;
  }

  override createRun(input: {
    userId: string;
    skillId?: string;
    mode: SkillRun['mode'];
    traceId: string;
  }): SkillRun {
    const run = super.createRun(input);
    this.schedulePersist();
    return run;
  }

  override updateRunStatus(runId: string, status: SkillRunStatus, errorMessage?: string): SkillRun | null {
    const run = super.updateRunStatus(runId, status, errorMessage);
    this.schedulePersist();
    return run;
  }

  override createStep(input: {
    runId: string;
    kind: SkillRunStepKind;
    title: string;
    toolName?: string;
    payload?: unknown;
    status?: SkillRunStatus;
  }): SkillRunStep {
    const step = super.createStep(input);
    this.schedulePersist();
    return step;
  }

  override completeStep(stepId: string, payload?: unknown): SkillRunStep | null {
    const step = super.completeStep(stepId, payload);
    this.schedulePersist();
    return step;
  }

  override failStep(stepId: string, errorMessage: string, payload?: unknown): SkillRunStep | null {
    const step = super.failStep(stepId, errorMessage, payload);
    this.schedulePersist();
    return step;
  }

  override createArtifact(input: {
    runId: string;
    stepId?: string;
    type: string;
    title?: string;
    preview?: string;
    data?: unknown;
  }): SkillArtifact {
    const artifact = super.createArtifact(input);
    this.schedulePersist();
    return artifact;
  }
}

class SupabaseRuntimeStore extends FileBackedRuntimeStore {
  private supabase = getRuntimeSupabaseClient();
  private supabaseAvailable = Boolean(this.supabase);
  private syncReadFallback<T>(fn: () => T): T {
    return fn();
  }
  private async fetchRunFromSupabase(runId: string): Promise<{
    run: SkillRun;
    steps: SkillRunStep[];
    artifacts: SkillArtifact[];
  } | null> {
    if (!this.supabase) return null;

    const { data: run, error: runError } = await this.supabase
      .from('skill_runtime_runs')
      .select('*')
      .eq('id', runId)
      .maybeSingle();
    if (runError || !run) return null;

    const { data: steps } = await this.supabase
      .from('skill_runtime_steps')
      .select('*')
      .eq('run_id', runId)
      .order('step_index', { ascending: true });

    const { data: artifacts } = await this.supabase
      .from('skill_runtime_artifacts')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: false });

    return {
      run: {
        id: run.id,
        userId: run.user_id,
        skillId: run.skill_id || undefined,
        mode: run.mode,
        status: run.status,
        traceId: run.trace_id,
        startedAt: run.started_at,
        endedAt: run.ended_at || undefined,
        errorMessage: run.error_message || undefined
      },
      steps: ((steps || []) as SupabaseSkillRuntimeStepRow[]).map((step) => ({
        id: step.id,
        runId: step.run_id,
        index: step.step_index,
        kind: step.kind,
        status: step.status,
        title: step.title,
        toolName: step.tool_name || undefined,
        payload: step.payload || undefined,
        startedAt: step.started_at,
        endedAt: step.ended_at || undefined,
        errorMessage: step.error_message || undefined
      })),
      artifacts: ((artifacts || []) as SupabaseSkillRuntimeArtifactRow[]).map((artifact) => ({
        id: artifact.id,
        runId: artifact.run_id,
        stepId: artifact.step_id || undefined,
        type: artifact.type,
        title: artifact.title || undefined,
        preview: artifact.preview || undefined,
        data: artifact.data || undefined,
        createdAt: artifact.created_at
      }))
    };
  }
  private async syncRunToSupabase(run: SkillRun): Promise<void> {
    if (!this.supabase || !this.supabaseAvailable) return;
    const { error } = await this.supabase.from('skill_runtime_runs').upsert({
      id: run.id,
      user_id: run.userId,
      skill_id: run.skillId || null,
      mode: run.mode,
      status: run.status,
      trace_id: run.traceId,
      started_at: run.startedAt,
      ended_at: run.endedAt || null,
      error_message: run.errorMessage || null
    });
    if (error) {
      this.supabaseAvailable = false;
      console.warn('[RuntimeStore] Supabase run sync disabled after error:', error);
    }
  }

  private async syncStepToSupabase(step: SkillRunStep): Promise<void> {
    if (!this.supabase || !this.supabaseAvailable) return;
    const { error } = await this.supabase.from('skill_runtime_steps').upsert({
      id: step.id,
      run_id: step.runId,
      step_index: step.index,
      kind: step.kind,
      status: step.status,
      title: step.title,
      tool_name: step.toolName || null,
      payload: step.payload || null,
      started_at: step.startedAt,
      ended_at: step.endedAt || null,
      error_message: step.errorMessage || null
    });
    if (error) {
      this.supabaseAvailable = false;
      console.warn('[RuntimeStore] Supabase step sync disabled after error:', error);
    }
  }

  private async syncArtifactToSupabase(artifact: SkillArtifact): Promise<void> {
    if (!this.supabase || !this.supabaseAvailable) return;
    const { error } = await this.supabase.from('skill_runtime_artifacts').upsert({
      id: artifact.id,
      run_id: artifact.runId,
      step_id: artifact.stepId || null,
      type: artifact.type,
      title: artifact.title || null,
      preview: artifact.preview || null,
      data: artifact.data || null,
      created_at: artifact.createdAt
    });
    if (error) {
      this.supabaseAvailable = false;
      console.warn('[RuntimeStore] Supabase artifact sync disabled after error:', error);
    }
  }

  override createRun(input: {
    userId: string;
    skillId?: string;
    mode: SkillRun['mode'];
    traceId: string;
  }): SkillRun {
    const run = super.createRun(input);
    void this.syncRunToSupabase(run);
    return run;
  }

  override updateRunStatus(runId: string, status: SkillRunStatus, errorMessage?: string): SkillRun | null {
    const run = super.updateRunStatus(runId, status, errorMessage);
    if (run) void this.syncRunToSupabase(run);
    return run;
  }

  override createStep(input: {
    runId: string;
    kind: SkillRunStepKind;
    title: string;
    toolName?: string;
    payload?: unknown;
    status?: SkillRunStatus;
  }): SkillRunStep {
    const step = super.createStep(input);
    void this.syncStepToSupabase(step);
    return step;
  }

  override completeStep(stepId: string, payload?: unknown): SkillRunStep | null {
    const step = super.completeStep(stepId, payload);
    if (step) void this.syncStepToSupabase(step);
    return step;
  }

  override failStep(stepId: string, errorMessage: string, payload?: unknown): SkillRunStep | null {
    const step = super.failStep(stepId, errorMessage, payload);
    if (step) void this.syncStepToSupabase(step);
    return step;
  }

  override createArtifact(input: {
    runId: string;
    stepId?: string;
    type: string;
    title?: string;
    preview?: string;
    data?: unknown;
  }): SkillArtifact {
    const artifact = super.createArtifact(input);
    void this.syncArtifactToSupabase(artifact);
    return artifact;
  }
}

const runtimeStore =
  RUNTIME_STORE_MODE === 'supabase'
    ? new SupabaseRuntimeStore()
    : RUNTIME_STORE_MODE === 'file'
      ? new FileBackedRuntimeStore()
      : new InMemoryRuntimeStore();

export function getRuntimeStore(): RuntimeStore {
  return runtimeStore;
}
