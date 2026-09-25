import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SavedSummary } from '@/services/database';
import { InfiniteCanvasBoard } from '../InfiniteCanvasBoard';
import type {
  CanvasCustomNode,
  CanvasProjectState
} from '@/workspace/canvas/types';

const summaries = [
  {
    id: 'summary-1',
    title: '商业图片案例',
    markdown: '这是一段可用于画布编排的素材内容。',
    contentType: 'text',
    url: 'https://example.com/a',
    createdAt: Date.now()
  },
  {
    id: 'summary-2',
    title: '参考图素材',
    markdown: '![参考图](https://example.com/reference.png)',
    contentType: 'image',
    url: 'https://example.com/b',
    createdAt: Date.now()
  }
] as unknown as SavedSummary[];

function createCanvasState(
  overrides: Partial<CanvasProjectState> = {}
): CanvasProjectState {
  return {
    nodeIds: summaries.map((summary) => summary.id),
    activeNodeIds: [],
    customNodes: {},
    positions: {},
    sizes: {},
    connections: [],
    ...overrides
  };
}

describe('InfiniteCanvasBoard', () => {
  it('renders an empty canvas prompt instead of auto-importing sources', () => {
    render(
      <InfiniteCanvasBoard
        projectName="测试项目"
        summaries={[]}
        canvasState={createCanvasState({ nodeIds: [] })}
        activeNodeIds={[]}
        onToggleNodeActive={vi.fn()}
        onOpenSummary={vi.fn()}
        onRemoveNode={vi.fn()}
        onImportNodeIds={vi.fn()}
        onReplaceNodeIds={vi.fn()}
        onCanvasStateChange={vi.fn()}
        sourcePanelCollapsed
        agentPanelCollapsed={false}
        onOpenSourcePanel={vi.fn()}
        onOpenAgentPanel={vi.fn()}
      />
    );

    expect(screen.getByText('画布还是空的')).toBeInTheDocument();
    expect(
      screen.getByText(
        '在来源素材面板勾选来源，然后点击“添加选中到画布”。画布不会自动导入全部素材。'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '打开素材栏' })
    ).toBeInTheDocument();
  });

  it('renders material nodes and exposes canvas controls', () => {
    render(
      <InfiniteCanvasBoard
        projectName="测试项目"
        summaries={summaries}
        canvasState={createCanvasState({ activeNodeIds: ['summary-1'] })}
        activeNodeIds={['summary-1']}
        onToggleNodeActive={vi.fn()}
        onOpenSummary={vi.fn()}
        onRemoveNode={vi.fn()}
        onImportNodeIds={vi.fn()}
        onReplaceNodeIds={vi.fn()}
        onCanvasStateChange={vi.fn()}
        sourcePanelCollapsed={false}
        agentPanelCollapsed
        onOpenSourcePanel={vi.fn()}
        onOpenAgentPanel={vi.fn()}
      />
    );

    expect(screen.getByText('测试项目')).toBeInTheDocument();
    expect(screen.getByText('2 个画布节点 · 1 个已启用')).toBeInTheDocument();
    expect(screen.getByText('商业图片案例')).toBeInTheDocument();
    expect(screen.getByText('参考图素材')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '打开 Agent' })
    ).toBeInTheDocument();
  });

  it('exposes collapsed panel recovery controls from xl desktop layouts', () => {
    render(
      <InfiniteCanvasBoard
        projectName="测试项目"
        summaries={summaries}
        canvasState={createCanvasState({ activeNodeIds: ['summary-1'] })}
        activeNodeIds={['summary-1']}
        onToggleNodeActive={vi.fn()}
        onOpenSummary={vi.fn()}
        onRemoveNode={vi.fn()}
        onImportNodeIds={vi.fn()}
        onReplaceNodeIds={vi.fn()}
        onCanvasStateChange={vi.fn()}
        sourcePanelCollapsed
        agentPanelCollapsed
        onOpenSourcePanel={vi.fn()}
        onOpenAgentPanel={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '素材栏' })).toHaveClass(
      'xl:inline-flex'
    );
    expect(screen.getByRole('button', { name: '打开 Agent' })).toHaveClass(
      'xl:inline-flex'
    );
  });

  it('renders canvas thumbnails from visual metadata preview urls', () => {
    render(
      <InfiniteCanvasBoard
        projectName="测试项目"
        summaries={[
          {
            id: 'summary-preview',
            title: '元数据预览图',
            markdown: '',
            contentType: 'image',
            url: 'https://example.com/source',
            createdAt: Date.now(),
            metadata: {
              previewUrl: 'https://example.com/preview.webp',
              thumbnailUrl: 'https://example.com/thumb.webp',
              imageUrl: 'https://example.com/original.webp'
            }
          } as SavedSummary
        ]}
        canvasState={createCanvasState({
          nodeIds: ['summary-preview'],
          activeNodeIds: ['summary-preview']
        })}
        activeNodeIds={['summary-preview']}
        onToggleNodeActive={vi.fn()}
        onOpenSummary={vi.fn()}
        onRemoveNode={vi.fn()}
        onImportNodeIds={vi.fn()}
        onReplaceNodeIds={vi.fn()}
        onCanvasStateChange={vi.fn()}
        sourcePanelCollapsed={false}
        agentPanelCollapsed={false}
        onOpenSourcePanel={vi.fn()}
        onOpenAgentPanel={vi.fn()}
      />
    );

    expect(screen.getByAltText('元数据预览图')).toHaveAttribute(
      'src',
      'https://example.com/preview.webp'
    );
  });

  it('keeps common canvas tools in the bottom toolbar', () => {
    render(
      <InfiniteCanvasBoard
        projectName="测试项目"
        summaries={summaries}
        canvasState={createCanvasState({ activeNodeIds: ['summary-1'] })}
        activeNodeIds={['summary-1']}
        onToggleNodeActive={vi.fn()}
        onOpenSummary={vi.fn()}
        onRemoveNode={vi.fn()}
        onImportNodeIds={vi.fn()}
        onReplaceNodeIds={vi.fn()}
        onCanvasStateChange={vi.fn()}
        sourcePanelCollapsed={false}
        agentPanelCollapsed={false}
        onOpenSourcePanel={vi.fn()}
        onOpenAgentPanel={vi.fn()}
      />
    );

    const toolbar = screen.getByTestId('canvas-bottom-toolbar');
    expect(
      within(toolbar).getByRole('button', { name: '添加 AI 图片槽' })
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole('button', { name: '添加批注' })
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole('button', { name: '撤销' })
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole('button', { name: '导入画布' })
    ).toBeInTheDocument();
    expect(within(toolbar).getByText('82%')).toBeInTheDocument();
  });

  it('only renders sources that were explicitly added to the canvas state', () => {
    render(
      <InfiniteCanvasBoard
        projectName="测试项目"
        summaries={summaries}
        canvasState={createCanvasState({
          nodeIds: ['summary-2'],
          positions: { 'summary-2': { x: 0, y: 0 } }
        })}
        activeNodeIds={[]}
        onToggleNodeActive={vi.fn()}
        onOpenSummary={vi.fn()}
        onRemoveNode={vi.fn()}
        onImportNodeIds={vi.fn()}
        onReplaceNodeIds={vi.fn()}
        onCanvasStateChange={vi.fn()}
        sourcePanelCollapsed={false}
        agentPanelCollapsed={false}
        onOpenSourcePanel={vi.fn()}
        onOpenAgentPanel={vi.fn()}
      />
    );

    expect(screen.getByText('参考图素材')).toBeInTheDocument();
    expect(screen.queryByText('商业图片案例')).not.toBeInTheDocument();
    expect(screen.getByText('1 个画布节点 · 0 个已启用')).toBeInTheDocument();
  });

  it('imports a dragged source onto the canvas at the drop location', () => {
    const onImportNodeIds = vi.fn();
    const onCanvasStateChange = vi.fn();
    const dataTransfer = {
      types: ['application/x-webtomind-summary-id', 'text/plain'],
      dropEffect: 'none',
      getData: vi.fn((type: string) =>
        type === 'application/x-webtomind-summary-id' ? 'summary-2' : ''
      )
    };

    render(
      <InfiniteCanvasBoard
        projectName="测试项目"
        summaries={summaries}
        canvasState={createCanvasState({ nodeIds: [] })}
        activeNodeIds={[]}
        onToggleNodeActive={vi.fn()}
        onOpenSummary={vi.fn()}
        onRemoveNode={vi.fn()}
        onImportNodeIds={onImportNodeIds}
        onReplaceNodeIds={vi.fn()}
        onCanvasStateChange={onCanvasStateChange}
        sourcePanelCollapsed={false}
        agentPanelCollapsed={false}
        onOpenSourcePanel={vi.fn()}
        onOpenAgentPanel={vi.fn()}
      />
    );

    const dropzone = screen.getByTestId('infinite-canvas-dropzone');
    fireEvent.dragOver(dropzone, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('copy');

    fireEvent.drop(dropzone, {
      clientX: 360,
      clientY: 260,
      dataTransfer
    });

    expect(onImportNodeIds).toHaveBeenCalledWith(
      ['summary-2'],
      expect.objectContaining({
        activeNodeIds: ['summary-2'],
        selectedNodeId: 'summary-2',
        positions: expect.objectContaining({
          'summary-2': expect.objectContaining({
            x: expect.any(Number),
            y: expect.any(Number)
          })
        })
      })
    );
  });

  it('uses the contextual toolbar for enabling and opening canvas nodes', () => {
    const onToggleNodeActive = vi.fn();
    const onOpenSummary = vi.fn();
    const onCanvasStateChange = vi.fn();

    render(
      <InfiniteCanvasBoard
        projectName="测试项目"
        summaries={summaries}
        canvasState={createCanvasState()}
        activeNodeIds={[]}
        onToggleNodeActive={onToggleNodeActive}
        onOpenSummary={onOpenSummary}
        onRemoveNode={vi.fn()}
        onImportNodeIds={vi.fn()}
        onReplaceNodeIds={vi.fn()}
        onCanvasStateChange={onCanvasStateChange}
        sourcePanelCollapsed={false}
        agentPanelCollapsed={false}
        onOpenSourcePanel={vi.fn()}
        onOpenAgentPanel={vi.fn()}
      />
    );

    expect(
      screen.queryByRole('button', { name: '启用' })
    ).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByText('商业图片案例'), {
      button: 0,
      clientX: 20,
      clientY: 20
    });
    expect(onCanvasStateChange).toHaveBeenCalledWith({
      selectedNodeId: 'summary-1'
    });

    fireEvent.click(screen.getByRole('button', { name: '引用' }));
    expect(onToggleNodeActive).toHaveBeenCalledWith('summary-1');

    fireEvent.click(screen.getByRole('button', { name: '查看' }));
    expect(onOpenSummary).toHaveBeenCalledWith(summaries[0]);
  });

  it('shows contextual actions after selecting a canvas card', () => {
    const onCanvasStateChange = vi.fn();

    render(
      <InfiniteCanvasBoard
        projectName="测试项目"
        summaries={summaries}
        canvasState={createCanvasState({
          positions: {
            'summary-1': { x: 0, y: 0 },
            'summary-2': { x: 360, y: 0 }
          }
        })}
        activeNodeIds={[]}
        onToggleNodeActive={vi.fn()}
        onOpenSummary={vi.fn()}
        onRemoveNode={vi.fn()}
        onImportNodeIds={vi.fn()}
        onReplaceNodeIds={vi.fn()}
        onCanvasStateChange={onCanvasStateChange}
        sourcePanelCollapsed={false}
        agentPanelCollapsed={false}
        onOpenSourcePanel={vi.fn()}
        onOpenAgentPanel={vi.fn()}
      />
    );

    const firstNode = document.querySelector('[data-node-id="summary-1"]');
    expect(firstNode).toBeTruthy();
    fireEvent(
      firstNode!,
      new MouseEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 12,
        clientY: 12
      })
    );

    const toolbar = screen.getByTestId('canvas-context-toolbar');
    expect(
      within(toolbar).getByRole('button', { name: '引用' })
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole('button', { name: '查看' })
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole('button', { name: '连线' })
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole('button', { name: '删除' })
    ).toBeInTheDocument();
    expect(onCanvasStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        activeNodeIds: ['summary-1'],
        selectedNodeId: 'summary-1'
      })
    );
  });

  it('supports keyboard selection, reference toggling, and deletion for canvas nodes', () => {
    const onToggleNodeActive = vi.fn();
    const onRemoveNode = vi.fn();
    const onCanvasStateChange = vi.fn();

    render(
      <InfiniteCanvasBoard
        projectName="测试项目"
        summaries={summaries}
        canvasState={createCanvasState({
          positions: {
            'summary-1': { x: 0, y: 0 },
            'summary-2': { x: 360, y: 0 }
          }
        })}
        activeNodeIds={[]}
        onToggleNodeActive={onToggleNodeActive}
        onOpenSummary={vi.fn()}
        onRemoveNode={onRemoveNode}
        onImportNodeIds={vi.fn()}
        onReplaceNodeIds={vi.fn()}
        onCanvasStateChange={onCanvasStateChange}
        sourcePanelCollapsed={false}
        agentPanelCollapsed={false}
        onOpenSourcePanel={vi.fn()}
        onOpenAgentPanel={vi.fn()}
      />
    );

    const firstNode = screen.getByRole('group', {
      name: /画布节点：商业图片案例/
    });

    fireEvent.keyDown(firstNode, { key: 'Enter' });
    expect(onCanvasStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        activeNodeIds: ['summary-1'],
        selectedNodeId: 'summary-1'
      })
    );

    fireEvent.keyDown(firstNode, { key: ' ' });
    expect(onToggleNodeActive).toHaveBeenCalledWith('summary-1');

    fireEvent.keyDown(firstNode, { key: 'Delete' });
    expect(onRemoveNode).toHaveBeenCalledWith('summary-1');
  });

  it('supports additive multi-select without clearing existing canvas references', () => {
    const onToggleNodeActive = vi.fn();
    const onCanvasStateChange = vi.fn();

    render(
      <InfiniteCanvasBoard
        projectName="测试项目"
        summaries={summaries}
        canvasState={createCanvasState({
          activeNodeIds: ['summary-1'],
          positions: {
            'summary-1': { x: 0, y: 0 },
            'summary-2': { x: 360, y: 0 }
          }
        })}
        activeNodeIds={['summary-1']}
        onToggleNodeActive={onToggleNodeActive}
        onOpenSummary={vi.fn()}
        onRemoveNode={vi.fn()}
        onImportNodeIds={vi.fn()}
        onReplaceNodeIds={vi.fn()}
        onCanvasStateChange={onCanvasStateChange}
        sourcePanelCollapsed={false}
        agentPanelCollapsed={false}
        onOpenSourcePanel={vi.fn()}
        onOpenAgentPanel={vi.fn()}
      />
    );

    const secondNode = document.querySelector('[data-node-id="summary-2"]');
    expect(secondNode).toBeTruthy();

    const multiSelectEvent = new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      shiftKey: true,
      clientX: 360,
      clientY: 0
    });
    fireEvent(secondNode!, multiSelectEvent);

    expect(onToggleNodeActive).toHaveBeenCalledWith('summary-2');
    expect(onCanvasStateChange).not.toHaveBeenCalledWith(
      expect.objectContaining({
        activeNodeIds: ['summary-2']
      })
    );
  });

  it('creates AI image holder and annotation custom nodes', () => {
    const onCanvasStateChange = vi.fn();
    const promptSpy = vi
      .spyOn(window, 'prompt')
      .mockReturnValueOnce('把主体放大，保留标题区');

    render(
      <InfiniteCanvasBoard
        projectName="测试项目"
        summaries={[]}
        canvasState={createCanvasState({ nodeIds: [] })}
        activeNodeIds={[]}
        onToggleNodeActive={vi.fn()}
        onOpenSummary={vi.fn()}
        onRemoveNode={vi.fn()}
        onImportNodeIds={vi.fn()}
        onReplaceNodeIds={vi.fn()}
        onCanvasStateChange={onCanvasStateChange}
        sourcePanelCollapsed={false}
        agentPanelCollapsed={false}
        onOpenSourcePanel={vi.fn()}
        onOpenAgentPanel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '添加 AI 图片槽' }));
    const holderPayload = onCanvasStateChange.mock.calls
      .map((call) => call[0])
      .find((payload) =>
        Object.values(
          (payload.customNodes || {}) as Record<string, CanvasCustomNode>
        ).some((node) => node.type === 'ai_image_holder')
      );
    expect(holderPayload).toBeTruthy();
    expect(Object.values(holderPayload!.customNodes)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.stringMatching(/^ai_image_holder-/),
          type: 'ai_image_holder',
          prompt: undefined,
          targetWidth: 1024,
          targetHeight: 1024,
          aspectRatio: '1:1',
          aspectPreset: '1:1',
          aspectLocked: true
        })
      ])
    );

    fireEvent.click(screen.getByRole('button', { name: '添加批注' }));
    const annotationPayload = onCanvasStateChange.mock.calls
      .map((call) => call[0])
      .find((payload) =>
        Object.values(
          (payload.customNodes || {}) as Record<string, CanvasCustomNode>
        ).some((node) => node.type === 'annotation')
      );
    expect(annotationPayload).toBeTruthy();
    expect(Object.values(annotationPayload!.customNodes)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.stringMatching(/^annotation-/),
          type: 'annotation',
          annotationKind: 'note',
          content: '把主体放大，保留标题区'
        })
      ])
    );

    promptSpy.mockRestore();
  });

  it('links a new annotation to the currently selected canvas node', async () => {
    const onCanvasStateChange = vi.fn();
    const promptSpy = vi
      .spyOn(window, 'prompt')
      .mockReturnValueOnce('把杯子放大，其他区域保持不变');

    render(
      <InfiniteCanvasBoard
        projectName="测试项目"
        summaries={summaries}
        canvasState={createCanvasState({
          selectedNodeId: 'summary-1',
          positions: {
            'summary-1': { x: 320, y: 180 },
            'summary-2': { x: 680, y: 180 }
          }
        })}
        activeNodeIds={[]}
        onToggleNodeActive={vi.fn()}
        onOpenSummary={vi.fn()}
        onRemoveNode={vi.fn()}
        onImportNodeIds={vi.fn()}
        onReplaceNodeIds={vi.fn()}
        onCanvasStateChange={onCanvasStateChange}
        sourcePanelCollapsed={false}
        agentPanelCollapsed={false}
        onOpenSourcePanel={vi.fn()}
        onOpenAgentPanel={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('商业图片案例')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加批注' }));

    const annotationPayload = onCanvasStateChange.mock.calls
      .map((call) => call[0])
      .find((payload) =>
        Object.values(
          (payload.customNodes || {}) as Record<string, CanvasCustomNode>
        ).some((node) => node.type === 'annotation')
      );
    expect(annotationPayload).toBeTruthy();
    const annotation = Object.values(
      annotationPayload!.customNodes as Record<string, CanvasCustomNode>
    ).find((node) => node.type === 'annotation');
    expect(annotation).toEqual(
      expect.objectContaining({
        targetNodeId: 'summary-1',
        content: '把杯子放大，其他区域保持不变'
      })
    );
    expect(annotationPayload!.connections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromNodeId: annotation!.id,
          toNodeId: 'summary-1'
        })
      ])
    );

    promptSpy.mockRestore();
  });

  it('renders saved AI holder output as an image on the canvas', () => {
    render(
      <InfiniteCanvasBoard
        projectName="测试项目"
        summaries={[]}
        canvasState={createCanvasState({
          nodeIds: [],
          activeNodeIds: ['holder-1'],
          customNodes: {
            'holder-1': {
              id: 'holder-1',
              type: 'ai_image_holder',
              title: 'AI 图片槽',
              prompt: '生成一张封面图',
              output: {
                imageUrl: 'https://example.com/generated.png',
                summaryId: 'summary-generated',
                title: '生成图'
              }
            }
          },
          positions: { 'holder-1': { x: 0, y: 0 } }
        })}
        activeNodeIds={['holder-1']}
        onToggleNodeActive={vi.fn()}
        onOpenSummary={vi.fn()}
        onRemoveNode={vi.fn()}
        onImportNodeIds={vi.fn()}
        onReplaceNodeIds={vi.fn()}
        onCanvasStateChange={vi.fn()}
        sourcePanelCollapsed={false}
        agentPanelCollapsed={false}
        onOpenSourcePanel={vi.fn()}
        onOpenAgentPanel={vi.fn()}
      />
    );

    const image = screen.getByAltText('AI 图片槽');
    expect(image).toHaveAttribute('src', 'https://example.com/generated.png');
  });

  it('uses saved metadata thumbnails for source image nodes', () => {
    const metadataSummary = {
      id: 'summary-metadata-image',
      title: '无扩展名缩略图',
      markdown: '这是一张来自存储服务的图片。',
      contentType: 'article',
      url: 'https://example.com/image',
      createdAt: Date.now(),
      metadata: {
        thumbnailUrl: 'https://cdn.example.com/storage/render?id=abc'
      }
    } as unknown as SavedSummary;

    render(
      <InfiniteCanvasBoard
        projectName="测试项目"
        summaries={[metadataSummary]}
        canvasState={createCanvasState({
          nodeIds: [metadataSummary.id],
          positions: { [metadataSummary.id]: { x: 0, y: 0 } }
        })}
        activeNodeIds={[]}
        onToggleNodeActive={vi.fn()}
        onOpenSummary={vi.fn()}
        onRemoveNode={vi.fn()}
        onImportNodeIds={vi.fn()}
        onReplaceNodeIds={vi.fn()}
        onCanvasStateChange={vi.fn()}
        sourcePanelCollapsed={false}
        agentPanelCollapsed={false}
        onOpenSourcePanel={vi.fn()}
        onOpenAgentPanel={vi.fn()}
      />
    );

    expect(screen.getByAltText('无扩展名缩略图')).toHaveAttribute(
      'src',
      'https://cdn.example.com/storage/render?id=abc'
    );
  });

  it('turns an AI holder generation click into a canvas generation request', () => {
    const onCanvasStateChange = vi.fn();
    const onRequestGenerateImage = vi.fn();
    const promptSpy = vi
      .spyOn(window, 'prompt')
      .mockReturnValueOnce('为品牌手册生成封面');

    render(
      <InfiniteCanvasBoard
        projectName="测试项目"
        summaries={[]}
        canvasState={createCanvasState({
          nodeIds: [],
          customNodes: {
            'holder-1': {
              id: 'holder-1',
              type: 'ai_image_holder',
              title: 'AI 图片槽',
              content: '等待生成',
              createdAt: Date.now()
            }
          },
          positions: { 'holder-1': { x: 0, y: 0 } }
        })}
        activeNodeIds={[]}
        onToggleNodeActive={vi.fn()}
        onOpenSummary={vi.fn()}
        onRemoveNode={vi.fn()}
        onImportNodeIds={vi.fn()}
        onReplaceNodeIds={vi.fn()}
        onCanvasStateChange={onCanvasStateChange}
        onRequestGenerateImage={onRequestGenerateImage}
        sourcePanelCollapsed={false}
        agentPanelCollapsed={false}
        onOpenSourcePanel={vi.fn()}
        onOpenAgentPanel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '生成图片' }));

    expect(onCanvasStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        activeNodeIds: ['holder-1'],
        selectedNodeId: 'holder-1',
        customNodes: expect.objectContaining({
          'holder-1': expect.objectContaining({
            prompt: '为品牌手册生成封面'
          })
        })
      })
    );
    expect(onRequestGenerateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'holder-1',
        prompt: '为品牌手册生成封面',
        targetWidth: 1024,
        targetHeight: 1024,
        aspectRatio: '1:1'
      })
    );

    promptSpy.mockRestore();
  });

  it('lets users adjust selected AI holder generation size presets', () => {
    const onCanvasStateChange = vi.fn();

    render(
      <InfiniteCanvasBoard
        projectName="测试项目"
        summaries={[]}
        canvasState={createCanvasState({
          nodeIds: [],
          customNodes: {
            'holder-1': {
              id: 'holder-1',
              type: 'ai_image_holder',
              title: 'AI 图片槽',
              targetWidth: 1024,
              targetHeight: 1024,
              aspectRatio: '1:1',
              aspectPreset: '1:1',
              aspectLocked: true
            }
          },
          positions: { 'holder-1': { x: 0, y: 0 } },
          selectedNodeId: 'holder-1'
        })}
        activeNodeIds={[]}
        onToggleNodeActive={vi.fn()}
        onOpenSummary={vi.fn()}
        onRemoveNode={vi.fn()}
        onImportNodeIds={vi.fn()}
        onReplaceNodeIds={vi.fn()}
        onCanvasStateChange={onCanvasStateChange}
        sourcePanelCollapsed={false}
        agentPanelCollapsed={false}
        onOpenSourcePanel={vi.fn()}
        onOpenAgentPanel={vi.fn()}
      />
    );

    const toolbar = screen.getByTestId('canvas-context-toolbar');
    expect(within(toolbar).getByLabelText('生成宽度')).toHaveValue(1024);
    expect(within(toolbar).getByLabelText('生成高度')).toHaveValue(1024);

    fireEvent.click(within(toolbar).getByRole('button', { name: '16:9' }));

    expect(onCanvasStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedNodeId: 'holder-1',
        customNodes: expect.objectContaining({
          'holder-1': expect.objectContaining({
            targetWidth: 1024,
            targetHeight: 576,
            aspectRatio: '16:9',
            aspectPreset: '16:9',
            aspectLocked: true
          })
        })
      })
    );
  });

  it('lets users select and delete a canvas connection', async () => {
    const onCanvasStateChange = vi.fn();

    render(
      <InfiniteCanvasBoard
        projectName="测试项目"
        summaries={summaries}
        canvasState={createCanvasState({
          nodeIds: ['summary-1', 'summary-2'],
          positions: {
            'summary-1': { x: 0, y: 0 },
            'summary-2': { x: 360, y: 0 }
          },
          connections: [
            {
              id: 'connection-1',
              fromNodeId: 'summary-1',
              toNodeId: 'summary-2'
            }
          ]
        })}
        activeNodeIds={[]}
        onToggleNodeActive={vi.fn()}
        onOpenSummary={vi.fn()}
        onRemoveNode={vi.fn()}
        onImportNodeIds={vi.fn()}
        onReplaceNodeIds={vi.fn()}
        onCanvasStateChange={onCanvasStateChange}
        sourcePanelCollapsed={false}
        agentPanelCollapsed={false}
        onOpenSourcePanel={vi.fn()}
        onOpenAgentPanel={vi.fn()}
      />
    );

    const connection = document.querySelector(
      '[data-connection-id="connection-1"]'
    );
    expect(connection).toBeTruthy();
    fireEvent.click(connection!);
    expect(screen.getByText('已选中连线')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(
        document.querySelector('[data-connection-id="connection-1"]')
      ).not.toBeInTheDocument();
    });
  });
});
