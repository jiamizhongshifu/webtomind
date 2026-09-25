import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../Button';

describe('Button', () => {
  it('exposes loading, disabled, icon, variant, and size semantics', () => {
    render(
      <Button
        variant="danger"
        size="icon"
        isLoading
        leadingIcon={<svg data-testid="leading-icon" />}
      >
        Delete
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveClass(
      'ui-button--danger',
      'ui-button--icon',
      'ui-button--loading'
    );
    expect(screen.getByTestId('leading-icon').parentElement).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('keeps pressed and reduced-motion behavior in the shared primitive', () => {
    const styles = readFileSync(
      join(process.cwd(), 'src/design/ui-primitives.css'),
      'utf8'
    );
    expect(styles).toMatch(
      /\.ui-button:not\(:disabled\):active,[\s\S]*?transform:\s*scale\(0\.98\);[\s\S]*?var\(--motion-press, 100ms\)/
    );
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.ui-button:not\(:disabled\):active,[\s\S]*?transform:\s*none;/
    );
  });

  it('uses restrained depth, explicit visual states, and touch-safe controls', () => {
    const styles = readFileSync(
      join(process.cwd(), 'src/design/ui-primitives.css'),
      'utf8'
    );

    expect(styles).not.toContain('box-shadow: 0 5px 0');
    expect(styles).not.toContain('box-shadow: 0 4px 0');
    expect(styles).toMatch(
      /--product-action-primary-shadow:\s*0 1px 2px[\s\S]*?0 6px 16px -10px/
    );
    expect(styles).toMatch(
      /\.ui-button--primary:not\(:disabled\):hover,[\s\S]*?background:\s*var\(--product-action-primary-hover\);/
    );
    expect(styles).toMatch(
      /\.ui-button,[\s\S]*?\.ui-icon-button\s*\{[\s\S]*?touch-action:\s*manipulation;[\s\S]*?-webkit-tap-highlight-color:\s*transparent;/
    );
    expect(styles).toMatch(
      /@media \(pointer: coarse\)[\s\S]*?\.ui-button--sm:not\(\.ui-button--link\),[\s\S]*?min-height:\s*44px;/
    );
  });

  it('keeps icons and labels on one internal line under flex compression', () => {
    const styles = readFileSync(
      join(process.cwd(), 'src/design/ui-primitives.css'),
      'utf8'
    );
    expect(styles).toMatch(
      /\.ui-button\s*\{[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?white-space:\s*nowrap;/
    );
    expect(styles).toMatch(
      /\.ui-button__label\s*\{[\s\S]*?display:\s*block;[\s\S]*?flex:\s*0 1 auto;[\s\S]*?max-width:\s*100%;[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/
    );
    expect(styles).toMatch(
      /\.ui-button__label:has\(svg, \[data-icon\]\)\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?align-items:\s*center;[\s\S]*?flex-wrap:\s*nowrap;/
    );
    expect(styles).toMatch(
      /\.ui-button__label\s*>\s*:is\(svg, \[data-icon\]\)[\s\S]*?flex:\s*0 0 auto;/
    );
    expect(styles).toMatch(
      /\.ui-button__icon\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?flex:\s*0 0 auto;/
    );
  });
});
