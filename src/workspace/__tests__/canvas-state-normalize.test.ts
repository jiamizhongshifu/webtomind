import { describe, expect, it } from 'vitest';
import {
  getEffectiveWorkspaceProjectId,
  normalizeCanvasProjectState
} from '../App';

describe('getEffectiveWorkspaceProjectId', () => {
  it('uses route and URL project ids before stale workspace state', () => {
    expect(
      getEffectiveWorkspaceProjectId('route-project', null, null)
    ).toBe('route-project');
    expect(
      getEffectiveWorkspaceProjectId(null, 'url-project', null)
    ).toBe('url-project');
    expect(
      getEffectiveWorkspaceProjectId(null, 'url-project', 'old-project')
    ).toBe('url-project');
    expect(
      getEffectiveWorkspaceProjectId('route-project', 'url-project', null)
    ).toBe('route-project');
  });
});

describe('normalizeCanvasProjectState', () => {
  it('drops invalid canvas records while preserving valid nodes', () => {
    const normalized = normalizeCanvasProjectState({
      'project-1': {
        nodeIds: ['summary-1', 'summary-1', 42],
        activeNodeIds: ['summary-1', 'missing-node'],
        customNodes: {
          'holder-1': {
            id: 'holder-1',
            type: 'ai_image_holder',
            title: 'AI 图片槽',
            targetWidth: 1200,
            targetHeight: Infinity,
            aspectRatio: '',
            aspectLocked: true
          },
          'bad-node': {
            id: 'bad-node',
            type: 'unknown'
          }
        },
        positions: {
          'summary-1': { x: 10, y: 20 },
          'holder-1': { x: Number.NaN, y: 40 },
          missing: { x: 0, y: 0 }
        },
        sizes: {
          'summary-1': { width: 264, height: 176 },
          'holder-1': { width: 320, height: 220 },
          missing: { width: 20, height: 20 }
        },
        connections: [
          {
            id: 'valid',
            fromNodeId: 'summary-1',
            toNodeId: 'holder-1'
          },
          {
            id: 'broken',
            fromNodeId: 'summary-1',
            toNodeId: 'missing-node'
          }
        ],
        viewport: { x: 1, y: 2, k: Number.NaN },
        selectedNodeId: 'missing-node'
      }
    });

    expect(normalized['project-1']).toEqual(
      expect.objectContaining({
        nodeIds: ['summary-1'],
        activeNodeIds: ['summary-1'],
        selectedNodeId: undefined,
        viewport: undefined,
        recoveredRecordCount: expect.any(Number)
      })
    );
    expect(normalized['project-1'].customNodes).toEqual({
      'holder-1': expect.objectContaining({
        type: 'ai_image_holder',
        targetWidth: 1200,
        targetHeight: 1024,
        aspectRatio: '1:1',
        aspectPreset: '1:1',
        aspectLocked: true
      })
    });
    expect(normalized['project-1'].positions).toEqual({
      'summary-1': { x: 10, y: 20 }
    });
    expect(normalized['project-1'].connections).toEqual([
      {
        id: 'valid',
        fromNodeId: 'summary-1',
        toNodeId: 'holder-1'
      }
    ]);
    expect(normalized['project-1'].recoveredRecordCount).toBeGreaterThan(0);
  });
});
