import { describe, expect, it } from 'vitest';
import { IMAGE_TOOL_ROUTE_PATHS, isImageToolRoute } from '../image-tool-routes';

describe('image tool routes', () => {
  it('recognizes the application detail routes', () => {
    expect(IMAGE_TOOL_ROUTE_PATHS).toHaveLength(7);
    for (const route of IMAGE_TOOL_ROUTE_PATHS) {
      expect(isImageToolRoute(route)).toBe(true);
    }
    expect(isImageToolRoute('/tools/comfyui-workflow-checker')).toBe(false);
    expect(isImageToolRoute('/create/apps')).toBe(false);
  });
});
