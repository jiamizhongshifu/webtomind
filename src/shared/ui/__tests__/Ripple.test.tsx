import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../Button';
import { Card } from '../Card';

const buttonBounds = {
  width: 100,
  height: 40,
  top: 20,
  right: 110,
  bottom: 60,
  left: 10,
  x: 10,
  y: 20,
  toJSON: () => ({})
};

function mockBounds(element: HTMLElement) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(buttonBounds);
}

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches }));
}

describe('shared ripple feedback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mockReducedMotion(false);
  });

  it('expands from the pointer position far enough to cover the surface', () => {
    render(<Button>Generate</Button>);
    const button = screen.getByRole('button', { name: 'Generate' });
    mockBounds(button);

    fireEvent.pointerDown(button, { button: 0, clientX: 35, clientY: 30 });

    const ripple = button.querySelector<HTMLElement>('.ui-ripple');
    expect(ripple).not.toBeNull();
    expect(ripple?.style.getPropertyValue('--ui-ripple-x')).toBe('25px');
    expect(ripple?.style.getPropertyValue('--ui-ripple-y')).toBe('10px');
    expect(
      Number.parseFloat(
        ripple?.style.getPropertyValue('--ui-ripple-size') ?? '0'
      )
    ).toBeGreaterThan(150);
    expect(ripple?.parentElement).toHaveAttribute('aria-hidden', 'true');

    fireEvent.animationEnd(ripple as HTMLElement);
    expect(button.querySelector('.ui-ripple')).toBeNull();
  });

  it('keeps a quick 20% fade on a clipped overlay without clipping surface content', () => {
    const styles = readFileSync(
      join(process.cwd(), 'src/design/ui-primitives.css'),
      'utf8'
    );

    expect(styles).toMatch(
      /\.ui-ripple-surface\s*\{[^}]*position:\s*relative;[^}]*isolation:\s*isolate;[^}]*\}/
    );
    expect(styles).toMatch(
      /\.ui-ripple-container\s*\{[^}]*overflow:\s*hidden;[^}]*border-radius:\s*inherit;/
    );
    expect(styles).toMatch(
      /animation:[\s\S]*?ui-ripple-expand var\(--motion-feedback, 220ms\)[\s\S]*?ui-ripple-fade var\(--motion-feedback, 220ms\) linear;/
    );
    expect(styles).toMatch(
      /@keyframes ui-ripple-expand[\s\S]*?from\s*\{[\s\S]*?scale\(0\.18\);[\s\S]*?to\s*\{[\s\S]*?scale\(1\);/
    );
    expect(styles).toMatch(
      /@keyframes ui-ripple-fade[\s\S]*?from\s*\{[\s\S]*?opacity:\s*0\.2;[\s\S]*?to\s*\{[\s\S]*?opacity:\s*0;/
    );
  });

  it('uses the center for keyboard activation and ignores repeated keys', () => {
    render(<Button>Continue</Button>);
    const button = screen.getByRole('button', { name: 'Continue' });
    mockBounds(button);

    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: 'Enter', repeat: true });

    const ripples = button.querySelectorAll<HTMLElement>('.ui-ripple');
    expect(ripples).toHaveLength(1);
    expect(ripples[0].style.getPropertyValue('--ui-ripple-x')).toBe('50px');
    expect(ripples[0].style.getPropertyValue('--ui-ripple-y')).toBe('20px');
  });

  it('does not animate disabled controls or reduced-motion users', () => {
    const { rerender } = render(<Button disabled>Disabled</Button>);
    const disabledButton = screen.getByRole('button', { name: 'Disabled' });
    mockBounds(disabledButton);
    fireEvent.pointerDown(disabledButton, {
      button: 0,
      clientX: 35,
      clientY: 30
    });
    expect(disabledButton.querySelector('.ui-ripple')).toBeNull();

    mockReducedMotion(true);
    rerender(<Button>Reduced motion</Button>);
    const reducedButton = screen.getByRole('button', {
      name: 'Reduced motion'
    });
    mockBounds(reducedButton);
    fireEvent.pointerDown(reducedButton, {
      button: 0,
      clientX: 35,
      clientY: 30
    });
    expect(reducedButton.querySelector('.ui-ripple')).toBeNull();
  });

  it('enables entry cards while leaving static cards unchanged', () => {
    render(
      <>
        <Card as="a" href="/create/image">
          Create image
        </Card>
        <Card>Static summary</Card>
      </>
    );

    expect(screen.getByRole('link', { name: 'Create image' })).toHaveClass(
      'ui-ripple-surface'
    );
    expect(screen.getByText('Static summary')).not.toHaveClass(
      'ui-ripple-surface'
    );
  });

  it('lets consumers cancel or explicitly disable ripple feedback', () => {
    render(
      <>
        <Button onPointerDown={(event) => event.preventDefault()}>
          Cancelled
        </Button>
        <Button ripple={false}>Opted out</Button>
      </>
    );

    const cancelled = screen.getByRole('button', { name: 'Cancelled' });
    mockBounds(cancelled);
    fireEvent.pointerDown(cancelled, { button: 0, clientX: 35, clientY: 30 });
    expect(cancelled.querySelector('.ui-ripple')).toBeNull();
    expect(screen.getByRole('button', { name: 'Opted out' })).not.toHaveClass(
      'ui-ripple-surface'
    );
  });
});
