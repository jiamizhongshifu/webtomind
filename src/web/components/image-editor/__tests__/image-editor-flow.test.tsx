import type { ComponentProps } from 'react';
import { estimateImageGenerationCreditCost } from '@/shared/image-generation-pricing';
import type { ImageCreatorModelOption } from '@/web/data/image-creator-options';
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useImageEditor } from '../useImageEditor';
import { sanitizeImageGenerateInput } from '../../../../../api/image/generate/request';
import { ImageEditorPanel } from '../ImageEditorPanel';

const api = vi.hoisted(() => ({ enqueueVisualImageTask: vi.fn(), getVisualImageTaskStatus: vi.fn(), importGenerationAsReference: vi.fn(), loadVisualImageHistoryBlobUrl: vi.fn(), uploadImageReference: vi.fn() }));
vi.mock('@/services/agent-api', () => api);
const imageInput = vi.hoisted(() => ({ loadEditorImageBlob: vi.fn(), renderEditorImageInputs: vi.fn(), imageBlobToDataUrl: vi.fn(), selectionMaskToEditMask: vi.fn() }));
vi.mock('../editor-image-input', () => imageInput);
const models = [{ value: 'nano-banana-2', label: 'Nano Banana 2', supportsReferenceImage: true }];
beforeEach(() => { vi.clearAllMocks(); api.importGenerationAsReference.mockResolvedValue({ id: 'ref-source', thumbnailUrl: 'https://example.test/thumbnail.png' }); api.uploadImageReference.mockResolvedValue({ id: 'mask-or-guide' }); imageInput.loadEditorImageBlob.mockResolvedValue(new Blob(['original'], { type:'image/png' })); imageInput.renderEditorImageInputs.mockResolvedValue({ mask: new Blob(['mask'],{type:'image/png'}), guide: new Blob(['guide'],{type:'image/png'}) }); imageInput.imageBlobToDataUrl.mockResolvedValue('data:image/png;base64,aW1hZ2U='); });
afterEach(cleanup);
it('allows retry after a rejected submission', async () => {
  api.enqueueVisualImageTask.mockRejectedValue(new Error('simulated submission failure'));
  const { result } = renderHook(() => useImageEditor(models as ImageCreatorModelOption[], false));
  await act(async () => { await result.current.importGenerationSource('source-generation', 'https://example.test/source.png'); });
  act(() => result.current.setPrompt('将门改成蓝色'));
  await act(async () => { await result.current.generate(); });
  expect(result.current.generation.status).toBe('failed');
  expect(result.current.error).toBe('simulated submission failure');
  await act(async () => { await result.current.generate(); });
  expect(api.enqueueVisualImageTask).toHaveBeenCalledTimes(2);
});
it('sends a real mask and visual guide from the original for manual regions', async () => {
  api.enqueueVisualImageTask.mockResolvedValue({ taskId: 'task-audit' });
  const { result } = renderHook(() => useImageEditor(models as ImageCreatorModelOption[], false));
  await act(async () => { await result.current.importGenerationSource('source-generation', 'https://example.test/source.png'); });
  act(() => result.current.addRegion({ x: 0.123, y: 0.234, width: 0.111, height: 0.222, prompt: '将门改成蓝色' }));
  await act(async () => { await result.current.generate(); });
  const request = api.enqueueVisualImageTask.mock.calls[0][0];
  expect(request.maskImageId).toBe('mask-or-guide');
  expect(imageInput.loadEditorImageBlob).toHaveBeenCalledWith('https://example.test/source.png', 'source-generation');
  expect(imageInput.renderEditorImageInputs).toHaveBeenCalled();
  expect(request.referenceImageIds).toContain('mask-or-guide');
  expect(result.current.generationReferenceImageCount).toBe(request.referenceImageIds.length);
  expect(estimateImageGenerationCreditCost({ model:'nano-banana-2', imageSize:'auto', quality:'auto', referenceImageCount:result.current.generationReferenceImageCount, referenceMode:'image_reference' }).cost).toBe(100);
  expect(request.sourceGenerationId).toBeUndefined();
  expect(request.prompt).toContain('将门改成蓝色');
  expect(request.prompt).not.toContain('0.123');
});
it('submits a region with Enter, leaves spaces and IME confirmation intact', () => {
  const generate = vi.fn(); const selectRegion = vi.fn();
  const props = { sourceLabel:'source', sourceThumbnailUrl:'', extraReferences:[], maxExtraReferences:3, isEnglish:false, prompt:'', model:'nano-banana-2', models, busy:false, generationLabel:'', error:'', regions:[{id:'region-audit',x:0.1,y:0.1,width:0.2,height:0.2,kind:'rect',prompt:'改成蓝色'}], activeTool:null, cropAspect:null, adjustments:{brightness:50,contrast:50,saturation:50,colorTemp:50}, camera:{}, brushSize:8, brushColor:'#000000',drawPrompt:'',strokeCount:0,estimatedCost:80, onGenerate:generate, onSelectRegion:selectRegion };
  const { container } = render(<ImageEditorPanel {...props as unknown as ComponentProps<typeof ImageEditorPanel>} />);
  const input = container.querySelector('.image-editor-panel-region textarea')!;
  expect(fireEvent.keyDown(input, { key:'Enter', code:'Enter' })).toBe(false);
  expect(fireEvent.keyDown(input, { key:' ', code:'Space' })).toBe(true);
  expect(fireEvent.keyDown(input, { key:'Enter', shiftKey:true })).toBe(true);
  expect(fireEvent.keyDown(input, { key:'Enter', isComposing:true })).toBe(true);
  expect(selectRegion).not.toHaveBeenCalled();
  expect(generate).toHaveBeenCalledTimes(1);
});

it('counts guides for non-native selections and sketches, but not native GPT masks', async () => {
  const supportedModels = [...models, { value:'gpt-image-2.5', label:'GPT Image 2.5', supportsReferenceImage:true }] as ImageCreatorModelOption[];
  const { result } = renderHook(() => useImageEditor(supportedModels, false));
  await act(async () => { await result.current.importGenerationSource('source-generation', 'https://example.test/source.png'); });
  expect(result.current.generationReferenceImageCount).toBe(1);
  act(() => result.current.addRegion({ x:0.1,y:0.1,width:0.2,height:0.2,prompt:'改成蓝色' }));
  expect(result.current.generationReferenceImageCount).toBe(2);
  act(() => result.current.setModel('gpt-image-2.5'));
  expect(result.current.generationReferenceImageCount).toBe(1);
  act(() => result.current.addStroke({ id:'stroke',color:'#00f',size:8,points:[{x:0.1,y:0.1},{x:0.2,y:0.2}] }));
  expect(result.current.generationReferenceImageCount).toBe(2);
});

it('sends expansion intent and the chosen ratio even with an empty optional description', async () => {
  api.enqueueVisualImageTask.mockResolvedValue({ taskId: 'expand-audit' });
  const { result } = renderHook(() => useImageEditor(models as ImageCreatorModelOption[], false));
  await act(async () => { await result.current.importGenerationSource('source-generation', 'https://example.test/source.png'); });
  act(() => { result.current.setActiveTool('crop'); result.current.setCropMode('expand'); result.current.setCropExpand({aspect:'2.35:1',prompt:''}); });
  await act(async () => { await result.current.generate(); });
  expect(api.enqueueVisualImageTask).toHaveBeenCalledWith(expect.objectContaining({
    aspectRatio:'47:20', appOperation:'ai_edit', referenceImageIds:['ref-source'],
    prompt:expect.stringContaining('保留原图主体')
  }));
  expect(api.enqueueVisualImageTask.mock.calls[0][0].prompt).toContain('不裁掉原图内容');
  const sanitized = sanitizeImageGenerateInput(api.enqueueVisualImageTask.mock.calls[0][0]);
  expect(sanitized.ok).toBe(true);
  if (sanitized.ok) expect(sanitized.value.aspectRatio).toBe('47:20');
});

it('does not carry expansion intent into local crop or a different editing tool', async () => {
  api.enqueueVisualImageTask.mockResolvedValue({ taskId: 'edit-audit' });
  const { result } = renderHook(() => useImageEditor(models as ImageCreatorModelOption[], false));
  await act(async () => { await result.current.importGenerationSource('source-generation', 'https://example.test/source.png'); });
  act(() => { result.current.setActiveTool('crop'); result.current.setPrompt('修改颜色'); result.current.setCropExpand({aspect:'16:9',prompt:'增加树林'}); });
  await act(async () => { await result.current.generate(); });
  expect(api.enqueueVisualImageTask).not.toHaveBeenCalled();
  act(() => { result.current.setCropMode('expand'); result.current.setActiveTool('region'); result.current.setPrompt('修改颜色'); });
  await act(async () => { await result.current.generate(); });
  expect(api.enqueueVisualImageTask).toHaveBeenCalledWith(expect.objectContaining({aspectRatio:'auto'}));
  expect(api.enqueueVisualImageTask.mock.calls[0][0].prompt).not.toContain('增加树林');
});

it('does not reuse pending region masks or sketches when expanding', async () => {
  api.enqueueVisualImageTask.mockResolvedValue({ taskId: 'expand-clean' });
  const { result } = renderHook(() => useImageEditor(models as ImageCreatorModelOption[], false));
  await act(async () => { await result.current.importGenerationSource('source-generation', 'https://example.test/source.png'); });
  act(() => {
    result.current.addRegion({ x:0.1,y:0.1,width:0.2,height:0.2,prompt:'remove the subject' });
    result.current.addStroke({ id:'stroke',color:'#00f',size:8,points:[{x:0.1,y:0.1},{x:0.2,y:0.2}] });
    result.current.setActiveTool('crop'); result.current.setCropMode('expand');
    result.current.setCropExpand({aspect:'16:9',prompt:''});
  });
  await act(async () => { await result.current.generate(); });
  const request = api.enqueueVisualImageTask.mock.calls[0][0];
  expect(request.maskImageId).toBeUndefined();
  expect(request.referenceImageIds).toEqual(['ref-source']);
  expect(result.current.generationReferenceImageCount).toBe(1);
  expect(imageInput.renderEditorImageInputs).not.toHaveBeenCalled();
  expect(request.prompt).not.toContain('remove the subject');
});

it.each(['gpt-image-2', 'gpt-image-2.5'])(
  'keeps native %s masks separate from billable guide references',
  async (model) => {
    api.enqueueVisualImageTask.mockResolvedValue({
      taskId: 'native-mask-task'
    });
    const supportedModels = [
      ...models,
      { value: model, label: model, supportsReferenceImage: true }
    ] as ImageCreatorModelOption[];
    const { result } = renderHook(() => useImageEditor(supportedModels, false));
    await act(async () => {
      await result.current.importGenerationSource(
        'fictional-source',
        'https://example.test/source.png'
      );
    });
    act(() => {
      result.current.setModel(model);
      result.current.addRegion({
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.4,
        prompt: 'Make the fictional door blue'
      });
    });
    await act(async () => {
      await result.current.generate();
    });
    expect(api.enqueueVisualImageTask).toHaveBeenCalledWith(
      expect.objectContaining({
        model,
        maskImageId: 'mask-or-guide',
        referenceImageIds: ['ref-source'],
        appOperation: 'ai_edit'
      })
    );
    expect(result.current.generationReferenceImageCount).toBe(1);
  }
);
