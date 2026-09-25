export const SKILL_RUN_FOCUS_EVENT = 'workspace:focus-skill-run';

export function focusSkillRun(runId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(SKILL_RUN_FOCUS_EVENT, {
      detail: { runId }
    })
  );
}
