import { describe, expect, it } from 'vitest';
import { getLatestSessionGenerationIds } from '../../api/image-sessions/index';
import { getImageSessionId } from '../../api/image-sessions/[id]/index';

describe('image session cover selection', () => {
  it('uses the first generated image from the newest populated turn per session', () => {
    const result = getLatestSessionGenerationIds([
      { session_id: 'session-a', generation_ids: [] },
      {
        session_id: 'session-b',
        generation_ids: ['generation-b-new', 'generation-b-second']
      },
      {
        session_id: 'session-a',
        generation_ids: ['generation-a-new', 'generation-a-second']
      },
      {
        session_id: 'session-a',
        generation_ids: ['generation-a-old']
      },
      { session_id: 'session-c', generation_ids: ['  '] }
    ]);

    expect(Object.fromEntries(result)).toEqual({
      'session-b': 'generation-b-new',
      'session-a': 'generation-a-new'
    });
  });

  it('extracts only a direct session detail id for the delete route', () => {
    expect(
      getImageSessionId(
        new Request('https://webtomind.com/api/image-sessions/session%201')
      )
    ).toBe('session 1');
    expect(
      getImageSessionId(
        new Request('https://webtomind.com/api/image-sessions/session-1/turns')
      )
    ).toBe('');
  });
});
