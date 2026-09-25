import { describe, expect, it } from 'vitest';
import type { ImageCreationTurn } from '@/shared/create-workspace-v2';
import type { GenerationRecordTask } from '../GenerationRecordsRail';
import { selectSessionProgressTasks } from '../imageSessionProgress';

const turns: ImageCreationTurn[] = [
  {
    id: 'turn-1',
    sessionId: 'session-current',
    prompt: 'Editorial portrait',
    status: 'succeeded',
    context: { sessionId: 'session-current', referenceAssetIds: [] },
    generationIds: ['generation-finished'],
    createdAt: '2026-07-17T10:00:00.000Z',
    updatedAt: '2026-07-17T10:00:00.000Z'
  }
];

const tasks: GenerationRecordTask[] = [
  {
    key: 'running-current',
    sessionId: 'session-current',
    label: 'Current',
    status: 'running'
  },
  {
    key: 'running-other',
    sessionId: 'session-other',
    label: 'Other',
    status: 'running'
  },
  {
    key: 'succeeded-pending-turn',
    sessionId: 'session-current',
    generationIds: ['generation-pending'],
    label: 'Pending handoff',
    status: 'succeeded'
  },
  {
    key: 'succeeded-with-turn',
    sessionId: 'session-current',
    generationIds: ['generation-finished'],
    label: 'Finished handoff',
    status: 'succeeded'
  }
];

describe('selectSessionProgressTasks', () => {
  it('keeps only active tasks for the selected session', () => {
    expect(
      selectSessionProgressTasks(tasks, 'session-current', turns).map(
        (task) => task.key
      )
    ).toEqual(['running-current', 'succeeded-pending-turn']);
  });

  it('returns no global tasks when there is no active session', () => {
    expect(selectSessionProgressTasks(tasks, undefined, turns)).toEqual([]);
  });
});
