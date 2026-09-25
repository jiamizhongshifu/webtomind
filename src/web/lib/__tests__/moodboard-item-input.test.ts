import { describe, expect, it, vi } from 'vitest';

const { importGenerationMock } = vi.hoisted(() => ({
  importGenerationMock: vi.fn()
}));

vi.mock('@/services/agent-api', () => ({
  importGenerationAsReference: importGenerationMock,
  uploadImageReference: vi.fn()
}));

import { prepareDiscoveryMoodboardItem } from '../moodboard-item-input';

describe('prepareDiscoveryMoodboardItem', () => {
  it('stores scraped Krea art as an external gallery item without a fake generation id', async () => {
    const item = await prepareDiscoveryMoodboardItem({
      id: '1af40dbd-3fcc-50bf-b9b2-8d9253658ab1',
      kind: 'krea',
      title: 'Spacecraft at dusk',
      prompt: 'Rear view of a spacecraft descending at dusk.',
      imageUrl:
        'https://images.example.com/images/1af40dbd-3fcc-50bf-b9b2-8d9253658ab1.png',
      sourceUrl:
        'https://www.krea.ai/feed/1af40dbd-3fcc-50bf-b9b2-8d9253658ab1',
      dominantColor: '#55718c',
      model: 'Krea 2',
      href: '/create/image'
    });

    expect(importGenerationMock).not.toHaveBeenCalled();
    expect(item).toMatchObject({
      source: 'gallery',
      prompt: 'Rear view of a spacecraft descending at dusk.'
    });
    expect(item).not.toHaveProperty('imageGenerationId');
    expect(item).not.toHaveProperty('promptCaseId');
  });
});
