import { beforeEach, describe, expect, it, vi } from 'vitest';

const { closeMock, createAgentMock, queryMock } = vi.hoisted(() => ({
  closeMock: vi.fn().mockResolvedValue(undefined),
  createAgentMock: vi.fn(),
  queryMock: vi.fn()
}));

vi.mock('../../server/src/agent/open-agent-sdk.js', () => ({
  createAgent: createAgentMock
}));

vi.mock('../../server/src/agent/tool-adapter.js', () => ({
  buildAgentTools: vi.fn(() => [])
}));

vi.mock('../../server/src/agent/skill-to-agent.js', () => ({
  getSkillToAgentBridge: vi.fn(() => ({
    buildAgentConfig: vi.fn(() => ({ systemPrompt: 'test system prompt' }))
  }))
}));

vi.mock('../../server/src/agent/vision-preprocessor.js', () => ({
  analyzeImages: vi.fn()
}));

import { OpenAgentService } from '../../server/src/services/open-agent-service.js';

async function collect(stream: AsyncIterable<unknown>) {
  const chunks: unknown[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

describe('OpenAgentService lifecycle', () => {
  beforeEach(() => {
    closeMock.mockClear();
    createAgentMock.mockReset();
    queryMock.mockReset();
    createAgentMock.mockReturnValue({ query: queryMock, close: closeMock });
  });

  it('closes the SDK agent after a completed stream', async () => {
    queryMock.mockImplementation(async function* () {
      yield { type: 'partial_message', content: 'hello' };
    });

    const chunks = await collect(new OpenAgentService().chat('hello'));

    expect(chunks.length).toBeGreaterThan(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('closes the SDK agent when streaming throws', async () => {
    queryMock.mockReturnValue({
      [Symbol.asyncIterator]() {
        return {
          next: vi.fn().mockRejectedValue(new Error('provider unavailable'))
        };
      }
    });

    const chunks = await collect(new OpenAgentService().chat('hello'));

    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'error',
          data: { message: 'provider unavailable' }
        })
      ])
    );
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('closes the SDK agent when the consumer cancels the stream', async () => {
    queryMock.mockImplementation(async function* () {
      yield { type: 'partial_message', content: 'first' };
      yield { type: 'partial_message', content: 'second' };
    });
    const iterator = new OpenAgentService().chat('hello')[Symbol.asyncIterator]();

    await iterator.next();
    await iterator.next();
    await iterator.return?.(undefined);

    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
