import React, { forwardRef, useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const motionHarness = vi.hoisted(() => ({
  animations: [] as Array<{
    target: number;
    options: Record<string, unknown>;
    stop: () => void;
  }>
}));

vi.mock('motion/react', () => {
  const MotionButton = forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & Record<string, unknown>
  >(
    (
      {
        initial: _initial,
        animate: _animate,
        transition: _transition,
        ...props
      },
      ref
    ) => <button ref={ref} {...props} />
  );
  MotionButton.displayName = 'MotionButton';
  const MotionSection = forwardRef<
    HTMLElement,
    React.HTMLAttributes<HTMLElement> & {
      onAnimationComplete?: () => void;
    } & Record<string, unknown>
  >(
    (
      {
        initial: _initial,
        animate: _animate,
        transition: _transition,
        onAnimationComplete,
        style,
        ...props
      },
      ref
    ) => {
      const completeAnimation = onAnimationComplete as (() => void) | undefined;
      useEffect(() => {
        queueMicrotask(() => completeAnimation?.());
      }, [completeAnimation]);
      return (
        <section
          ref={ref}
          style={style as React.CSSProperties | undefined}
          {...props}
        />
      );
    }
  );
  MotionSection.displayName = 'MotionSection';

  return {
    motion: { button: MotionButton, section: MotionSection },
    useReducedMotion: () => false,
    useMotionValue: (initial: number) => {
      const value = React.useRef({
        current: initial,
        get() {
          return this.current;
        },
        set(next: number) {
          this.current = next;
        }
      });
      return value.current;
    },
    animate: (
      _value: unknown,
      target: number,
      options: Record<string, unknown>
    ) => {
      let resolveAnimation: (() => void) | undefined;
      const promise = new Promise<void>((resolve) => {
        resolveAnimation = resolve;
      });
      const controls = {
        stop: () => resolveAnimation?.(),
        then: promise.then.bind(promise)
      };
      motionHarness.animations.push({
        target,
        options,
        stop: controls.stop
      });
      return controls;
    }
  };
});

import { ActionSheet } from '../ActionSheet';

describe('ActionSheet interruptible motion', () => {
  it('cancels an in-flight dismiss and preserves release velocity on rebound', async () => {
    const onClose = vi.fn();
    const now = vi.spyOn(performance, 'now');
    let timestamp = 0;
    now.mockImplementation(() => timestamp);

    render(
      <ActionSheet open title="More actions" onClose={onClose}>
        <button type="button">Download</button>
      </ActionSheet>
    );

    const sheet = screen.getByRole('dialog', { name: 'More actions' });
    const header = sheet.querySelector('header') as HTMLElement;
    Object.defineProperty(sheet, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ height: 400 })
    });
    header.setPointerCapture = vi.fn();
    header.releasePointerCapture = vi.fn();

    await waitFor(() =>
      expect(sheet).toHaveAttribute('data-drag-ready', 'true')
    );
    fireEvent.pointerDown(header, {
      pointerId: 1,
      button: 0,
      isPrimary: true,
      clientY: 100
    });
    timestamp = 40;
    fireEvent.pointerMove(header, {
      pointerId: 1,
      isPrimary: true,
      clientY: 220
    });
    timestamp = 70;
    fireEvent.pointerUp(header, {
      pointerId: 1,
      isPrimary: true,
      clientY: 220
    });

    expect(sheet).toHaveAttribute('data-closing', 'true');
    fireEvent.pointerDown(header, {
      pointerId: 2,
      button: 0,
      isPrimary: true,
      clientY: 220
    });
    expect(sheet).toHaveAttribute('data-closing', 'false');

    await Promise.resolve();
    expect(onClose).not.toHaveBeenCalled();

    timestamp = 100;
    fireEvent.pointerMove(header, {
      pointerId: 2,
      isPrimary: true,
      clientY: 180
    });
    timestamp = 130;
    fireEvent.pointerUp(header, {
      pointerId: 2,
      isPrimary: true,
      clientY: 180
    });

    const rebound = motionHarness.animations.at(-1);
    expect(rebound?.target).toBe(0);
    expect(rebound?.options.velocity).toBeLessThan(0);
    now.mockRestore();
  });
});
