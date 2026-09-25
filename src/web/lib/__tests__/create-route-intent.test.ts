import { describe, expect, it } from 'vitest';
import { hasImageCreateRouteIntent } from '../create-route-intent';

describe('hasImageCreateRouteIntent', () => {
  it('keeps discovery preview state on the inspiration route', () => {
    expect(
      hasImageCreateRouteIntent({
        search: '?gallery=images&preview=demo-image-1',
        state: { discoveryImage: { id: 'demo-image-1' } }
      })
    ).toBe(false);
    expect(
      hasImageCreateRouteIntent({
        search: '?gallery=moodboards&preview=demo-board-1',
        state: { discoveryMoodboard: { id: 'demo-board-1' } }
      })
    ).toBe(false);
  });

  it('still redirects recognized query and state creation intents', () => {
    expect(
      hasImageCreateRouteIntent({ search: '?prompt=cinematic', state: null })
    ).toBe(true);
    expect(
      hasImageCreateRouteIntent({
        search: '',
        state: { workflowPrompt: 'cinematic', source: 'comfyui_checker' }
      })
    ).toBe(true);
    expect(
      hasImageCreateRouteIntent({
        search: '',
        state: { visualRecipeSelection: { style: 'editorial' } }
      })
    ).toBe(true);
  });
});
