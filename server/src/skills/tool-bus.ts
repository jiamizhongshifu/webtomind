import type { ToolExecutor, ToolResult } from './tool-executor.js';
import { requiresToolConfirmation } from '../tools/index.js';
import { waitForToolConfirmation } from '../services/tool-confirmation-store.js';

export interface ToolBusContext {
  userId?: string;
  sessionId?: string;
  toolCallId?: string;
  runId?: string;
  skillName?: string;
  resolutionContext?: {
    explicitSkillId?: string;
    resolvedSkillNames?: string[];
    selectedToolNames?: string[];
    localHintName?: string;
  };
  allowedTools?: string[];
  onConfirmationRequired?: (payload: {
    toolName: string;
    toolCallId: string;
    runId?: string;
    sessionId?: string;
  }) => void;
}

export interface ToolEnvelope {
  toolName: string;
  status: 'completed' | 'error' | 'blocked';
  success: boolean;
  result?: unknown;
  error?: string;
  runId?: string;
  requiresConfirmation: boolean;
  confirmationState?: 'required' | 'approved' | 'rejected' | 'timed_out' | 'not_required';
  policyReason?: 'not_allowed' | 'missing_confirmation_context' | 'confirmation_rejected' | 'confirmation_timed_out' | 'execution_error' | 'execution_success';
  policySource?: 'allowlist' | 'confirmation' | 'executor';
  auditTrail?: Array<{
    type: string;
    at: number;
    detail?: unknown;
  }>;
}

export class ToolBus {
  constructor(private executor: ToolExecutor) {}

  async execute(
    toolName: string,
    params: Record<string, unknown>,
    context: ToolBusContext = {}
  ): Promise<ToolEnvelope> {
    if (
      Array.isArray(context.allowedTools) &&
      context.allowedTools.length > 0 &&
      !context.allowedTools.includes(toolName)
    ) {
      return {
        toolName,
        status: 'blocked',
        success: false,
        error: `Tool not allowed for skill: ${toolName}`,
        runId: context.runId,
        requiresConfirmation: false,
        confirmationState: 'not_required',
        policyReason: 'not_allowed',
        policySource: 'allowlist',
        auditTrail: [{ type: 'tool_blocked', at: Date.now(), detail: { reason: 'not_allowed', resolutionContext: context.resolutionContext } }]
      };
    }

    const needsConfirmation = requiresToolConfirmation(toolName);
    if (needsConfirmation) {
      if (
        !context.userId ||
        !context.sessionId ||
        !context.toolCallId
      ) {
        return {
          toolName,
          status: 'blocked',
          success: false,
          error: `Missing confirmation context for tool: ${toolName}`,
          runId: context.runId,
          requiresConfirmation: true,
          confirmationState: 'required',
          policyReason: 'missing_confirmation_context',
          policySource: 'confirmation',
          auditTrail: [{ type: 'tool_confirmation_missing_context', at: Date.now(), detail: { resolutionContext: context.resolutionContext } }]
        };
      }

      context.onConfirmationRequired?.({
        toolName,
        toolCallId: context.toolCallId,
        runId: context.runId,
        sessionId: context.sessionId
      });

      const decision = await waitForToolConfirmation({
        userId: context.userId,
        sessionId: context.sessionId,
        toolCallId: context.toolCallId
      });

      if (!decision.approved) {
        return {
          toolName,
          status: 'blocked',
          success: false,
          error: decision.timedOut
            ? `Tool confirmation timed out: ${toolName}`
            : `Tool execution rejected: ${toolName}`,
          runId: context.runId,
          requiresConfirmation: true,
          confirmationState: decision.timedOut ? 'timed_out' : 'rejected',
          policyReason: decision.timedOut ? 'confirmation_timed_out' : 'confirmation_rejected',
          policySource: 'confirmation',
          auditTrail: [{
            type: decision.timedOut ? 'tool_confirmation_timed_out' : 'tool_confirmation_rejected',
            at: Date.now(),
            detail: { resolutionContext: context.resolutionContext }
          }]
        };
      }
    }

    const result: ToolResult = await this.executor.execute(toolName, params);
    return {
      toolName,
      status: result.success ? 'completed' : 'error',
      success: result.success,
      result: result.data,
      error: result.error,
      runId: context.runId,
      requiresConfirmation: needsConfirmation,
      confirmationState: needsConfirmation ? 'approved' : 'not_required',
      policyReason: result.success ? 'execution_success' : 'execution_error',
      policySource: 'executor',
      auditTrail: [{
        type: result.success ? 'tool_completed' : 'tool_failed',
        at: Date.now(),
        detail: {
          resolutionContext: context.resolutionContext,
          ...(result.error ? { error: result.error } : {})
        }
      }]
    };
  }
}

export function createToolBus(executor: ToolExecutor): ToolBus {
  return new ToolBus(executor);
}
