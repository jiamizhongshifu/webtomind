import type { ImageCreationTurn } from '@/shared/create-workspace-v2';
import type { GenerationRecordTask } from './GenerationRecordsRail';

export function selectSessionProgressTasks(
  tasks: GenerationRecordTask[],
  activeSessionId: string | undefined,
  turns: ImageCreationTurn[]
): GenerationRecordTask[] {
  if (!activeSessionId) return [];
  const completedGenerationIds = new Set(
    turns.flatMap((turn) => turn.generationIds)
  );

  return tasks.filter((task) => {
    if (task.sessionId !== activeSessionId) return false;
    if (task.status === 'queued' || task.status === 'running') return true;
    return (
      task.status === 'succeeded' &&
      task.generationIds?.some(
        (generationId) => !completedGenerationIds.has(generationId)
      ) === true
    );
  });
}
