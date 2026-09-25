export type SkillRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_confirmation'
  | 'waiting_async'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type SkillRunStepKind =
  | 'resolution'
  | 'prompt_build'
  | 'model_invoke'
  | 'tool_call'
  | 'tool_result'
  | 'async_handoff'
  | 'artifact'
  | 'completion'
  | 'status';

export interface SkillRun {
  id: string;
  userId: string;
  skillId?: string;
  mode: 'sync' | 'async' | 'hybrid';
  status: SkillRunStatus;
  traceId: string;
  startedAt: number;
  endedAt?: number;
  errorMessage?: string;
}

export interface ResolutionRuntimeEventPayload {
  eventType: 'resolution';
  explicitSkillId?: string;
  selectedPrimarySkillId?: string;
  selectedSkillIds?: string[];
  selectedSkillNames?: string[];
  candidateCount?: number;
  selectedToolNames?: string[];
  resolutionContext?: {
    explicitSkillId?: string;
    selectedToolNames?: string[];
    localHint?: {
      id: string;
      name: string;
      source?: 'user' | 'system' | 'market';
      explicit?: boolean;
      matchedTriggers?: string[];
    } | null;
  };
}

export interface PromptBuildRuntimeEventPayload {
  eventType: 'prompt_build';
  activeSkillCount?: number;
  systemPromptLength?: number;
  selectedToolNames?: string[];
  explicitSkillId?: string;
}

export interface ToolRuntimeEventPayload {
  eventType: 'tool';
  success?: boolean;
  result?: unknown;
  error?: string;
  confirmationState?: string;
  policyReason?: string;
  policySource?: string;
  auditTrail?: Array<{
    type: string;
    at: number;
    detail?: unknown;
  }>;
  resolutionContext?: {
    explicitSkillId?: string;
    selectedToolNames?: string[];
    localHintName?: string;
    resolvedSkillNames?: string[];
  };
}

export type RuntimeEventPayload =
  | ResolutionRuntimeEventPayload
  | PromptBuildRuntimeEventPayload
  | ToolRuntimeEventPayload
  | Record<string, unknown>;

export interface SkillRunStep {
  id: string;
  runId: string;
  index: number;
  kind: SkillRunStepKind;
  status: SkillRunStatus;
  title: string;
  toolName?: string;
  payload?: RuntimeEventPayload;
  startedAt: number;
  endedAt?: number;
  errorMessage?: string;
}

export interface SkillArtifact {
  id: string;
  runId: string;
  stepId?: string;
  type: string;
  title?: string;
  preview?: string;
  data?: unknown;
  createdAt: number;
}
