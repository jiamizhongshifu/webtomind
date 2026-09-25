import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import type React from 'react';
import {
  MemoryRouter,
  Route,
  Routes,
  type InitialEntry
} from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateVideoPage } from '../CreateVideoPage';

const testState = vi.hoisted(() => ({
  enqueueVisualVideoTask: vi.fn(),
  waitForVisualVideoTask: vi.fn(),
  getVisualImageHistoryResult: vi.fn(),
  getVisualVideoHistoryResult: vi.fn(),
  getVisualVideoHistoryByIds: vi.fn(),
  getVisualVideoAvailability: vi.fn(),
  optimizeVideoPrompt: vi.fn(),
  setVisualVideoFavorite: vi.fn(),
  getPublicPromptCase: vi.fn(),
  uploadImageReference: vi.fn(),
  uploadVideoReferenceMedia: vi.fn(),
  getVideoGenerationCost: vi.fn(),
  createImageSession: vi.fn(),
  createImageSessionTurn: vi.fn(),
  listImageSessionTurns: vi.fn(),
  auth: {
    user: { id: 'user-1' },
    isAuthenticated: true,
    isLoading: false
  }
}));

vi.mock('../../components/image-create/CreateWorkspaceFrame', () => ({
  CreateWorkspaceFrame: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="workspace-frame">{children}</div>
  )
}));

vi.mock('../../components/image-create/HistoryGalleryModal', () => ({
  HistoryGalleryModal: ({
    title,
    items,
    onSelect,
    onClose
  }: {
    title: string;
    items: Array<{ id: string; prompt?: string }>;
    onSelect: (item: { id: string; prompt?: string }) => void;
    onClose: () => void;
  }) => (
    <section role="dialog" aria-label={title}>
      {items.map((item) => (
        <button key={item.id} type="button" onClick={() => onSelect(item)}>
          {item.prompt}
        </button>
      ))}
      <button type="button" onClick={onClose}>
        关闭图库
      </button>
    </section>
  )
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => testState.auth
}));

vi.mock('../lib/seo', () => ({
  applySeo: () => () => {}
}));

vi.mock('@/services/agent-api', () => ({
  enqueueVisualVideoTask: testState.enqueueVisualVideoTask,
  waitForVisualVideoTask: testState.waitForVisualVideoTask,
  getVisualImageHistoryResult: testState.getVisualImageHistoryResult,
  getVisualVideoHistoryResult: testState.getVisualVideoHistoryResult,
  getVisualVideoHistoryByIds: testState.getVisualVideoHistoryByIds,
  getVisualVideoAvailability: testState.getVisualVideoAvailability,
  optimizeVideoPrompt: testState.optimizeVideoPrompt,
  setVisualVideoFavorite: testState.setVisualVideoFavorite,
  getPublicPromptCase: testState.getPublicPromptCase,
  uploadImageReference: testState.uploadImageReference,
  uploadVideoReferenceMedia: testState.uploadVideoReferenceMedia
}));

vi.mock('@/services/create-workspace-v2-api', () => ({
  createImageSession: testState.createImageSession,
  createImageSessionTurn: testState.createImageSessionTurn,
  listImageSessionTurns: testState.listImageSessionTurns
}));

vi.mock('@/services/credits-api', () => ({
  getVideoGenerationCost: testState.getVideoGenerationCost
}));

const historyItem = {
  generationId: 'video-history-1',
  videoUrl: 'https://cdn.example.com/video-history-1.mp4',
  posterUrl: 'https://cdn.example.com/video-history-1.jpg',
  prompt: '历史视频 prompt：城市夜景手持跟拍',
  provider: 'tuzi',
  model: 'seedance-2-0',
  modelLabel: 'Seedance 1.0 Pro',
  aspectRatio: '9:16',
  duration: 10,
  createdAt: '2026-06-29T12:00:00.000Z'
};

const galleryFrameItem = {
  id: 'image-history-1',
  imageUrl: 'https://cdn.example.com/gallery-first-original.png',
  previewUrl: 'https://cdn.example.com/gallery-first-preview.png',
  thumbnailUrl: 'https://cdn.example.com/gallery-first-thumb.png',
  prompt: '图库首帧参考图',
  provider: 'tuzi',
  model: 'gpt-image-2',
  modelLabel: 'GPT Image 2',
  aspectRatio: '16:9',
  createdAt: '2026-06-29T12:00:00.000Z'
};

beforeAll(() => {
  if (!HTMLElement.prototype.scrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: () => {}
    });
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

function renderPage(path: InitialEntry = '/zh-CN/create/video') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/zh-CN/create/video" element={<CreateVideoPage />} />
        <Route path="/en-US/create/video" element={<CreateVideoPage />} />
        <Route path="/login" element={<div>登录页</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function openTool(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('dialog', { name: `${name} 设置` });
}

describe('CreateVideoPage Krea-style workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.auth.isAuthenticated = true;
    testState.auth.isLoading = false;
    testState.getVisualVideoHistoryResult.mockResolvedValue({
      items: [],
      hasMore: false
    });
    testState.getVisualVideoHistoryByIds.mockResolvedValue({
      items: [],
      missingIds: []
    });
    testState.listImageSessionTurns.mockResolvedValue([]);
    testState.createImageSession.mockResolvedValue({
      id: 'video-session-1',
      title: '一支产品广告',
      mediaType: 'video',
      status: 'active',
      createdAt: '2026-07-23T00:00:00.000Z',
      updatedAt: '2026-07-23T00:00:00.000Z'
    });
    testState.createImageSessionTurn.mockImplementation(
      async (sessionId, input) => ({
        id: `turn-${Date.now()}`,
        sessionId,
        prompt: input.prompt,
        status: input.status,
        context: input.context || { sessionId, referenceAssetIds: [] },
        generationIds: input.generationIds || [],
        createdAt: '2026-07-23T00:00:00.000Z',
        updatedAt: '2026-07-23T00:00:00.000Z'
      })
    );
    testState.getVisualImageHistoryResult.mockResolvedValue({
      items: [galleryFrameItem],
      total: 1
    });
    testState.getVisualVideoAvailability.mockResolvedValue({
      enabled: true,
      message: '视频生成通道已开启。'
    });
    testState.optimizeVideoPrompt.mockImplementation(async ({ prompt }) => ({
      success: true,
      optimizedPrompt: prompt,
      optimizedNegativePrompt: '',
      summary: '提示词已优化',
      changes: []
    }));
    testState.setVisualVideoFavorite.mockImplementation(
      async (id, isFavorite) => ({ id, isFavorite })
    );
    testState.getPublicPromptCase.mockResolvedValue(null);
    testState.uploadImageReference.mockResolvedValue({
      id: 'uploaded-frame-1',
      role: 'style',
      label: 'uploaded-frame',
      thumbnailUrl: 'https://cdn.example.com/uploaded-frame.png'
    });
    testState.uploadVideoReferenceMedia.mockResolvedValue({
      mediaUrl: 'https://cdn.example.com/reference.mp4',
      filePath: 'video-references/user-1/reference.mp4',
      mediaType: 'video'
    });
    testState.getVideoGenerationCost.mockResolvedValue({
      cost: 80,
      baseCost: 80,
      referenceAdjustment: 0,
      modelMultiplier: 8,
      model: 'seedance-2-0',
      duration: 5,
      referenceImageCount: 0
    });
    testState.enqueueVisualVideoTask.mockResolvedValue({
      taskId: 'video-task-1',
      pollAfterMs: 0
    });
    testState.waitForVisualVideoTask.mockImplementation(
      () => new Promise(() => undefined)
    );
  });

  it('uses a centered model intro and compact composer without preset images', async () => {
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Doubao Seedance 2.0' })
      ).toBeVisible();
    });

    expect(
      screen.getByText('把一个镜头想法，变成可直接使用的视频。')
    ).toBeVisible();
    expect(screen.getByRole('region', { name: '视频创作器' })).toBeVisible();
    expect(screen.queryByText('推荐配方')).not.toBeInTheDocument();
    [
      '模型',
      '参考素材',
      '首尾帧',
      '比例',
      '时长',
      '分辨率',
      '音频',
      '生成数量',
      '提示词'
    ].forEach((name) => {
      expect(screen.getByRole('button', { name })).toBeVisible();
    });
    expect(
      screen.queryByRole('button', { name: '更多' })
    ).not.toBeInTheDocument();
  });

  it('imports a video prompt case from the route into the composer', async () => {
    testState.getPublicPromptCase.mockResolvedValue({
      id: 'video-case',
      slug: 'video-case',
      title: '城市追逐镜头',
      prompt: '雨夜城市街道，镜头低机位跟随一辆跑车高速前进。',
      mediaType: 'video',
      videoUrl: 'https://example.com/video.mp4',
      locale: 'zh-CN'
    });

    renderPage(
      '/zh-CN/create/video?caseId=video-case&source=prompt_preview_cta'
    );

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '视频提示词' })).toHaveValue(
        '雨夜城市街道，镜头低机位跟随一辆跑车高速前进。'
      );
    });
    expect(testState.getPublicPromptCase).toHaveBeenCalledWith('video-case', {
      by: 'id',
      locale: 'zh-CN'
    });
  });

  it('imports a discovery image and prompt as the first-frame video seed', async () => {
    renderPage({
      pathname: '/zh-CN/create/video',
      state: {
        prompt: '漂浮岛上的灯光逐层亮起，镜头缓慢向主塔推进。',
        imageUrl: 'https://cdn.example.com/discovery-floating-island.png'
      }
    });

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '视频提示词' })).toHaveValue(
        '漂浮岛上的灯光逐层亮起，镜头缓慢向主塔推进。'
      );
    });

    const framesDialog = openTool('首尾帧');
    const firstFrameCard = within(framesDialog)
      .getByText('首帧')
      .closest('article');
    expect(firstFrameCard?.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.example.com/discovery-floating-island.png'
    );
  });

  it('opens every desktop setting panel on hover', async () => {
    renderPage();

    const resolutionButton = await screen.findByRole('button', {
      name: '分辨率'
    });
    fireEvent.mouseEnter(resolutionButton);
    expect(screen.getByRole('dialog', { name: '分辨率 设置' })).toBeVisible();

    fireEvent.mouseEnter(screen.getByRole('button', { name: '提示词' }));
    const promptDialog = screen.getByRole('dialog', { name: '提示词 设置' });
    expect(promptDialog).toBeVisible();
    expect(screen.getByText('生成前自动优化提示词')).toBeVisible();
    expect(
      within(promptDialog).getByRole('checkbox', {
        name: '生成前自动优化提示词'
      })
    ).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: '随机镜头提示词' })
    ).toBeVisible();
  });

  it('shows reference-frame upload controls directly without a text-generation tab', () => {
    renderPage();

    const framesDialog = openTool('首尾帧');
    expect(
      within(framesDialog).queryByRole('tab', { name: '文本生成' })
    ).not.toBeInTheDocument();

    for (const label of ['首帧', '尾帧']) {
      const frameCard = within(framesDialog)
        .getByText(label)
        .closest('article');
      expect(frameCard).not.toBeNull();
      expect(
        within(frameCard as HTMLElement).getByRole('button', { name: '上传' })
      ).toBeVisible();
    }
  });

  it('shows selected frames inside the prompt and supports mention or removal', async () => {
    renderPage({
      pathname: '/zh-CN/create/video',
      state: {
        prompt: '镜头缓慢推进。',
        imageUrl: 'https://cdn.example.com/discovery-floating-island.png'
      }
    });

    const references = await screen.findByLabelText('已引用图片');
    expect(
      within(references).getByRole('img', { name: '首帧' })
    ).toHaveAttribute(
      'src',
      'https://cdn.example.com/discovery-floating-island.png'
    );

    fireEvent.click(within(references).getByRole('button', { name: '@首帧' }));
    expect(screen.getByRole('textbox', { name: '视频提示词' })).toHaveValue(
      '镜头缓慢推进。\n@首帧 '
    );

    fireEvent.click(
      within(references).getByRole('button', { name: '取消首帧' })
    );
    expect(screen.queryByLabelText('已引用图片')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '视频提示词' })).toHaveValue(
      '镜头缓慢推进。\n'
    );
  });

  it('uploads a pasted clipboard image through the reference-image API', async () => {
    renderPage();
    const textarea = await screen.findByRole('textbox', {
      name: '视频提示词'
    });
    const itemImage = new File(
      ['clipboard-reference'],
      'clipboard-reference.png',
      {
        type: 'image/png',
        lastModified: 1
      }
    );
    const fileImage = new File(
      ['clipboard-reference'],
      'clipboard-reference.png',
      {
        type: 'image/png',
        lastModified: 2
      }
    );
    const pasteEvent = new Event('paste', {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        items: [
          { kind: 'file', type: 'image/png', getAsFile: () => itemImage }
        ],
        files: [fileImage]
      }
    });

    fireEvent(textarea, pasteEvent);

    await waitFor(() => {
      expect(testState.uploadImageReference).toHaveBeenCalledTimes(1);
      expect(testState.uploadImageReference).toHaveBeenCalledWith({
        imageBase64: expect.stringMatching(/^data:image\/png;base64,/),
        mimeType: 'image/png',
        role: 'style',
        label: 'clipboard-reference',
        sourceApp: 'create_video_page'
      });
    });
    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(await screen.findByRole('img', { name: '图片1' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/uploaded-frame.png'
    );
  });

  it('optimizes the current prompt with video settings before replacing it', async () => {
    testState.optimizeVideoPrompt.mockResolvedValue({
      success: true,
      optimizedPrompt: '优化后的五秒产品推进镜头。',
      optimizedNegativePrompt: '闪烁，水印',
      summary: '已补齐镜头与动作',
      changes: ['补齐镜头']
    });
    renderPage();

    fireEvent.change(screen.getByRole('textbox', { name: '视频提示词' }), {
      target: { value: '拍一个香水广告' }
    });
    const promptDialog = openTool('提示词');
    fireEvent.click(
      within(promptDialog).getByRole('button', { name: '立即优化提示词' })
    );

    await waitFor(() => {
      expect(testState.optimizeVideoPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: '拍一个香水广告',
          aspectRatio: 'adaptive',
          duration: 5,
          referenceImageCount: 0,
          referenceVideoCount: 0,
          referenceAudioCount: 0,
          hasFirstFrame: false,
          hasLastFrame: false
        })
      );
      expect(screen.getByRole('textbox', { name: '视频提示词' })).toHaveValue(
        '优化后的五秒产品推进镜头。\n\n负向约束：闪烁，水印'
      );
    });
    expect(screen.getByText('已补齐镜头与动作')).toBeVisible();
  });

  it('shows the official Seedance 2.5 and all verified 2.0 models as selectable', async () => {
    renderPage();

    const modelDialog = openTool('模型');
    expect(within(modelDialog).getAllByRole('option')).toHaveLength(4);
    expect(
      within(modelDialog).getByRole('option', {
        name: /Doubao Seedance 2\.5/
      })
    ).toBeEnabled();
    expect(
      within(modelDialog).getByRole('option', {
        name: /Doubao Seedance 2\.0 Fast/
      })
    ).toBeEnabled();
    expect(
      within(modelDialog).getByRole('option', {
        name: /Doubao Seedance 2\.0 Mini/
      })
    ).toBeEnabled();
  });

  it('enables Seedance 2.5 when the runtime model catalog confirms provider access', async () => {
    testState.getVisualVideoAvailability.mockResolvedValue({
      enabled: true,
      message: '视频生成通道已开启。',
      models: [{ id: 'seedance-2-5', status: 'available' }]
    });
    renderPage();

    await waitFor(() =>
      expect(testState.getVisualVideoAvailability).toHaveBeenCalled()
    );
    const modelDialog = openTool('模型');
    await waitFor(() =>
      expect(
        within(modelDialog).getByRole('option', {
          name: /Doubao Seedance 2\.5/
        })
      ).toBeEnabled()
    );
  });

  it('submits selected ratio and duration, then starts real task polling', async () => {
    renderPage();

    fireEvent.change(screen.getByRole('textbox', { name: '视频提示词' }), {
      target: { value: '一支产品广告，镜头缓慢推进，光影扫过透明香水瓶。' }
    });

    const ratioDialog = openTool('比例');
    fireEvent.click(within(ratioDialog).getByRole('button', { name: '9:16' }));
    const durationDialog = openTool('时长');
    const durationSlider = within(durationDialog).getByRole('slider', {
      name: '时长'
    });
    expect(durationSlider).toHaveAttribute('aria-valuenow', '5');
    fireEvent.keyDown(durationSlider, { key: 'ArrowRight' });
    fireEvent.keyDown(durationSlider, { key: 'ArrowRight' });
    expect(durationSlider).toHaveAttribute('aria-valuenow', '7');
    const generateButton = await screen.findByRole('button', {
      name: /生成 · 约每秒 \d+ 积分 · 本次共 \d+ 积分/
    });
    await waitFor(() => expect(generateButton).toBeEnabled());
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(testState.enqueueVisualVideoTask).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'seedance-2-0',
          aspectRatio: '9:16',
          duration: 7,
          resolution: '720p',
          generateAudio: true,
          outputFormat: 'mp4',
          referenceMode: 'reference',
          referenceImageUrls: []
        })
      );
      expect(testState.waitForVisualVideoTask).toHaveBeenCalledWith(
        'video-task-1',
        0
      );
    });
    expect(testState.optimizeVideoPrompt).not.toHaveBeenCalled();
  });

  it('continues generation with the original prompt when automatic optimization fails', async () => {
    testState.optimizeVideoPrompt.mockRejectedValue(
      new Error('提示词优化服务暂时不可用：tuzi request timed out')
    );
    renderPage();

    const originalPrompt = '一支不允许被自动优化故障阻断的视频。';
    fireEvent.change(screen.getByRole('textbox', { name: '视频提示词' }), {
      target: { value: originalPrompt }
    });
    const promptDialog = openTool('提示词');
    fireEvent.click(
      within(promptDialog).getByRole('checkbox', {
        name: '生成前自动优化提示词'
      })
    );
    const generateButton = await screen.findByRole('button', {
      name: /生成 · 约每秒 \d+ 积分 · 本次共 \d+ 积分/
    });
    await waitFor(() => expect(generateButton).toBeEnabled());
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(testState.optimizeVideoPrompt).toHaveBeenCalled();
      expect(testState.enqueueVisualVideoTask).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining(originalPrompt)
        })
      );
    });
    expect(
      screen.getByText(/自动优化失败，已使用原提示词继续提交/)
    ).toBeVisible();
  });

  it('keeps generation disabled while the provider channel is unavailable', async () => {
    testState.getVisualVideoAvailability.mockResolvedValue({
      enabled: false,
      message: '视频生成通道维护中。'
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /通道维护中/ })).toBeDisabled();
    });
  });

  it('creates a session, shows the shared skeleton, and replaces it with a video result', async () => {
    let resolveTask: ((value: unknown) => void) | undefined;
    testState.waitForVisualVideoTask.mockReturnValue(
      new Promise((resolve) => {
        resolveTask = resolve;
      })
    );
    testState.getVisualVideoHistoryByIds.mockResolvedValue({
      items: [historyItem],
      missingIds: []
    });
    testState.listImageSessionTurns.mockImplementation(async () => {
      const successfulCall = testState.createImageSessionTurn.mock.calls.find(
        ([, input]) => input.status === 'succeeded'
      );
      return successfulCall
        ? [
            {
              id: 'completed-turn',
              sessionId: 'video-session-1',
              prompt: historyItem.prompt,
              status: 'succeeded',
              context: {
                sessionId: 'video-session-1',
                referenceAssetIds: []
              },
              generationIds: [historyItem.generationId],
              createdAt: historyItem.createdAt,
              updatedAt: historyItem.createdAt
            }
          ]
        : [];
    });
    renderPage();

    fireEvent.change(screen.getByRole('textbox', { name: '视频提示词' }), {
      target: { value: historyItem.prompt }
    });
    const generateButton = await screen.findByRole('button', {
      name: /生成 ·/
    });
    await waitFor(() => expect(generateButton).toBeEnabled());
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByLabelText('正在生成视频')).toBeInTheDocument();
    });
    expect(testState.createImageSession).toHaveBeenCalledWith(
      historyItem.prompt,
      'video'
    );

    await act(async () => {
      resolveTask?.({
        taskId: 'video-task-1',
        status: 'succeeded',
        generation: historyItem
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(testState.createImageSessionTurn).toHaveBeenCalledWith(
        'video-session-1',
        expect.objectContaining({
          prompt: historyItem.prompt,
          generationIds: [historyItem.generationId],
          status: 'succeeded'
        })
      );
    });
    expect(
      await screen.findByRole('button', { name: '预览生成视频' })
    ).toBeVisible();
  });

  it('selects the required first frame from the image gallery', async () => {
    renderPage();

    const framesDialog = openTool('首尾帧');
    const firstCard = within(framesDialog).getByText('首帧').closest('article');
    expect(firstCard).not.toBeNull();
    fireEvent.click(
      within(firstCard as HTMLElement).getByRole('button', { name: '图库' })
    );

    const gallery = await screen.findByRole('dialog', { name: '选择首帧' });
    fireEvent.click(
      within(gallery).getByRole('button', { name: galleryFrameItem.prompt })
    );
    fireEvent.change(screen.getByRole('textbox', { name: '视频提示词' }), {
      target: { value: '首帧中的人物转身看向镜头。' }
    });
    fireEvent.click(screen.getByRole('button', { name: /生成 ·/ }));

    await waitFor(() => {
      expect(testState.enqueueVisualVideoTask).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceMode: 'reference',
          referenceImageUrls: [],
          firstFrameUrl: galleryFrameItem.previewUrl,
          lastFrameUrl: undefined
        })
      );
    });
  });

  it('uploads an optional last frame and keeps both frame fields explicit', async () => {
    renderPage();

    openTool('首尾帧');
    const firstInput = screen.getByLabelText('选择首帧');
    const lastInput = screen.getByLabelText('选择尾帧');
    fireEvent.change(firstInput, {
      target: {
        files: [new File(['first'], 'first.png', { type: 'image/png' })]
      }
    });
    fireEvent.change(lastInput, {
      target: { files: [new File(['last'], 'last.png', { type: 'image/png' })] }
    });

    await waitFor(() => {
      expect(testState.uploadImageReference).toHaveBeenCalledTimes(2);
    });

    fireEvent.change(screen.getByRole('textbox', { name: '视频提示词' }), {
      target: { value: '人物从首帧动作自然过渡到尾帧。' }
    });
    fireEvent.click(screen.getByRole('button', { name: /生成 ·/ }));

    await waitFor(() => {
      expect(testState.enqueueVisualVideoTask).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceMode: 'reference',
          referenceImageUrls: [],
          firstFrameUrl: 'https://cdn.example.com/uploaded-frame.png',
          lastFrameUrl: 'https://cdn.example.com/uploaded-frame.png'
        })
      );
    });
  });

  it('keeps multimodal references mutually exclusive with strict frames', async () => {
    renderPage();

    const referencesDialog = openTool('参考素材');
    fireEvent.click(
      within(referencesDialog).getByRole('button', { name: '图库' })
    );
    const referenceGallery = await screen.findByRole('dialog', {
      name: '选择参考图'
    });
    fireEvent.click(
      within(referenceGallery).getByRole('button', {
        name: galleryFrameItem.prompt
      })
    );

    const framesDialog = openTool('首尾帧');
    const firstCard = within(framesDialog).getByText('首帧').closest('article');
    expect(
      within(firstCard as HTMLElement).getByRole('button', { name: '图库' })
    ).toBeDisabled();
    expect(
      within(firstCard as HTMLElement).getByRole('button', { name: '上传' })
    ).toBeDisabled();
    expect(
      within(framesDialog).getByText('严格首尾帧与多模态参考不可同时使用。')
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '取消图片1' }));

    expect(screen.queryByLabelText('已引用图片')).not.toBeInTheDocument();
    expect(
      within(firstCard as HTMLElement).getByRole('button', { name: '图库' })
    ).toBeEnabled();
  });

  it('renders recent videos as first-class results and opens the detail dialog', async () => {
    testState.listImageSessionTurns.mockResolvedValue([
      {
        id: 'turn-1',
        sessionId: 'video-session-1',
        prompt: historyItem.prompt,
        status: 'succeeded',
        context: { sessionId: 'video-session-1', referenceAssetIds: [] },
        generationIds: [historyItem.generationId],
        createdAt: historyItem.createdAt,
        updatedAt: historyItem.createdAt
      }
    ]);
    testState.getVisualVideoHistoryByIds.mockResolvedValue({
      items: [historyItem],
      missingIds: []
    });
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined);
    renderPage('/zh-CN/create/video?sessionId=video-session-1');

    const card = await screen.findByRole('button', {
      name: '预览生成视频'
    });
    fireEvent.click(screen.getByRole('button', { name: '加入收藏' }));
    await waitFor(() => {
      expect(testState.setVisualVideoFavorite).toHaveBeenCalledWith(
        historyItem.generationId,
        true
      );
      expect(
        screen.getByRole('button', { name: '取消收藏' })
      ).toBeInTheDocument();
    });
    fireEvent.mouseEnter(card.closest('figure') as HTMLElement);
    expect(play).toHaveBeenCalled();
    fireEvent.mouseLeave(card.closest('figure') as HTMLElement);
    expect(pause).toHaveBeenCalled();
    fireEvent.click(card);

    expect(
      screen.getByRole('dialog', { name: /Video detail|视频详情/ })
    ).toBeVisible();
    expect(screen.getAllByText(historyItem.prompt).length).toBeGreaterThan(0);
    expect(screen.queryByText('渠道')).not.toBeInTheDocument();
    expect(screen.queryByText(/tuzi/i)).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole('dialog', { name: /Video detail|视频详情/ })
      ).getByRole('button', { name: /Remove favorite|取消收藏/ })
    ).toBeVisible();
  });

  it('routes unauthenticated users to login from the generate control', async () => {
    testState.auth.isAuthenticated = false;
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /登录后生成/ })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /登录后生成/ }));
    expect(await screen.findByText('登录页')).toBeVisible();
  });
});
