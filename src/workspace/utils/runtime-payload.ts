import type { RuntimeStepPayload } from '@/services/agent-api';

export function getRuntimePayloadSections(payload?: RuntimeStepPayload): Array<{
  title: string;
  rows: Array<{ label: string; value: string }>;
  raw?: unknown;
}> {
  if (!payload) return [];

  const sections: Array<{
    title: string;
    rows: Array<{ label: string; value: string }>;
    raw?: unknown;
  }> = [];

  if (payload.eventType === 'resolution' || payload.resolutionContext || payload.selectedSkillIds || payload.selectedSkillNames) {
    sections.push({
      title: 'Resolution',
      rows: [
        {
          label: 'explicitSkillId',
          value: payload.explicitSkillId || payload.resolutionContext?.explicitSkillId || '-'
        },
        {
          label: 'selectedSkillNames',
          value: payload.selectedSkillNames?.join(', ') || payload.resolutionContext?.resolvedSkillNames?.join(', ') || '-'
        },
        {
          label: 'selectedToolNames',
          value: payload.selectedToolNames?.join(', ') || payload.resolutionContext?.selectedToolNames?.join(', ') || '-'
        },
        {
          label: 'localHint',
          value: payload.resolutionContext?.localHintName || '-'
        }
      ]
    });
  }

  if (payload.eventType === 'prompt_build' || 'activeSkillCount' in payload || 'systemPromptLength' in payload) {
    sections.push({
      title: 'Prompt Build',
      rows: [
        {
          label: 'activeSkillCount',
          value: String(payload.activeSkillCount ?? 0)
        },
        {
          label: 'systemPromptLength',
          value: String(payload.systemPromptLength ?? 0)
        }
      ]
    });
  }

  if (payload.eventType === 'tool' || 'success' in payload || 'result' in payload || 'error' in payload) {
    sections.push({
      title: 'Tool Result',
      rows: [
        { label: 'success', value: String(payload.success ?? '-') },
        { label: 'error', value: payload.error || '-' },
        {
          label: 'confirmationState',
          value: payload.confirmationState || '-'
        }
      ],
      raw: payload.result
    });
  }

  if (payload.auditTrail) {
    sections.push({
      title: 'Audit Trail',
      rows: payload.auditTrail.map((item) => ({
        label: item.type,
        value: item.detail ? JSON.stringify(item.detail) : '-'
      }))
    });
  }

  return sections;
}
