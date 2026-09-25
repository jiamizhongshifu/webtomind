import { cleanup, render, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const motionMocks = vi.hoisted(() => ({
  animate: vi.fn(),
  stagger: vi.fn(),
  useReducedMotion: vi.fn()
}));

vi.mock('motion', () => ({
  animate: motionMocks.animate,
  stagger: motionMocks.stagger
}));

vi.mock('motion/react', () => ({
  useReducedMotion: motionMocks.useReducedMotion
}));

import { StaggeredImageGrid } from '../StaggeredImageGrid';

describe('StaggeredImageGrid', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: false })
    );
    motionMocks.animate.mockImplementation(() => ({
      stop: vi.fn(),
      then: (resolve: () => void) => Promise.resolve().then(resolve)
    }));
    motionMocks.stagger.mockReturnValue(() => 0);
    motionMocks.useReducedMotion.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('reveals image items from the center with a bounded stagger', async () => {
    const { rerender } = render(
      <StaggeredImageGrid observeAdditions>
        <button type="button">One</button>
        <button type="button">Two</button>
        <button type="button">Three</button>
      </StaggeredImageGrid>
    );

    await waitFor(() => expect(motionMocks.animate).toHaveBeenCalledTimes(1));
    expect(motionMocks.stagger).toHaveBeenCalledWith(0.05, { from: 'center' });
    expect(motionMocks.animate).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.any(HTMLButtonElement),
        expect.any(HTMLButtonElement),
        expect.any(HTMLButtonElement)
      ]),
      { opacity: [0, 1], y: [10, 0], rotate: [-1.25, 0] },
      expect.objectContaining({ duration: 0.32 })
    );

    rerender(
      <StaggeredImageGrid observeAdditions>
        <button type="button">One</button>
        <button type="button">Two</button>
        <button type="button">Three</button>
        <button type="button">Four</button>
      </StaggeredImageGrid>
    );

    await waitFor(() => expect(motionMocks.animate).toHaveBeenCalledTimes(2));
    expect(motionMocks.animate.mock.calls[1]?.[0]).toHaveLength(1);
  });

  it('shows items immediately when reduced motion is preferred', () => {
    motionMocks.useReducedMotion.mockReturnValue(true);

    const { getByRole } = render(
      <StaggeredImageGrid>
        <button type="button">Still</button>
      </StaggeredImageGrid>
    );

    expect(motionMocks.animate).not.toHaveBeenCalled();
    expect(getByRole('button')).toHaveAttribute('data-grid-revealed', 'true');
  });

  it('caps each reveal batch and shows overflow items immediately', async () => {
    const items = Array.from({ length: 100 }, (_, index) => (
      <button key={index} type="button">
        Item {index + 1}
      </button>
    ));
    const { getAllByRole } = render(
      <StaggeredImageGrid>{items}</StaggeredImageGrid>
    );

    await waitFor(() => expect(motionMocks.animate).toHaveBeenCalledTimes(1));
    expect(motionMocks.animate.mock.calls[0]?.[0]).toHaveLength(18);
    expect(motionMocks.stagger).toHaveBeenCalledWith(
      0.28 / 17,
      { from: 'center' }
    );
    expect(getAllByRole('button')[99]?.style.opacity).toBe('');
    expect(getAllByRole('button')[99]?.style.transform).toBe('');
  });

  it('does not leave reveal state or motion styles after StrictMode cleanup', async () => {
    const { getByRole, unmount } = render(
      <StrictMode>
        <StaggeredImageGrid>
          <button type="button">Strict item</button>
        </StaggeredImageGrid>
      </StrictMode>
    );
    const item = getByRole('button');

    await waitFor(() => expect(motionMocks.animate).toHaveBeenCalled());
    unmount();

    expect(item).not.toHaveAttribute('data-grid-revealed');
    expect(item.style.opacity).toBe('');
    expect(item.style.transform).toBe('');
  });
});
