import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeFile = vi.fn().mockResolvedValue(undefined);
const addSlide = vi.fn(() => ({
  background: {},
  addShape: vi.fn(),
  addText: vi.fn()
}));

vi.mock('pptxgenjs', () => ({
  default: class MockPptxGenJs {
    static ShapeType = { rect: 'rect', line: 'line' };
    ShapeType = MockPptxGenJs.ShapeType;
    addSlide = addSlide;
    writeFile = writeFile;
  }
}));

import { generatePptxInBrowser } from '../generate-pptx';

describe('generatePptxInBrowser', () => {
  beforeEach(() => {
    addSlide.mockClear();
    writeFile.mockClear();
  });

  it('creates the requested deck and downloads a sanitized pptx file', async () => {
    const result = await generatePptxInBrowser({
      content:
        'AI 图片工作流增长复盘。现状与问题。目标用户。核心方案。案例结果。实施计划。下一步行动。',
      style: 'notion',
      slideCount: 6
    });

    expect(addSlide).toHaveBeenCalledTimes(6);
    expect(writeFile).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledWith({
      fileName: 'AI 图片工作流增长复盘.pptx'
    });
    expect(result).toEqual({
      slideCount: 6,
      fileName: 'AI 图片工作流增长复盘.pptx'
    });
  });

  it('does not pad sparse content with empty slides', async () => {
    const result = await generatePptxInBrowser({
      content: 'Product review. One concrete finding.',
      style: 'minimal',
      slideCount: 10
    });

    expect(addSlide).toHaveBeenCalledTimes(2);
    expect(result.slideCount).toBe(2);
  });
});
