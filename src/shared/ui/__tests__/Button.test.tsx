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
    // 填充按钮按下时沉入 1u，不再缩放；图标按钮沿用旧的缩放反馈。
    expect(styles).toMatch(
      /\.ui-button:not\(:disabled\):active\s*\{[\s\S]*?transform:\s*translateY\(calc\(var\(--btn-press\) \* var\(--btn-u\)\)\);/
    );
    expect(styles).toMatch(
      /\.ui-icon-button:not\(:disabled\):active,[\s\S]*?transform:\s*scale\(0\.98\);/
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
    // 五层材质：高光、底影、占位内层、接触影、抬升影。
    expect(styles).toMatch(/--btn-face-top:\s*#404859;/);
    expect(styles).toMatch(/--btn-face-bottom:\s*#273042;/);
    expect(styles).toMatch(
      /inset 0 calc\(1 \* var\(--btn-u\)\) 0 var\(--btn-highlight\)/
    );
    expect(styles).toMatch(/inset 0 0 0 transparent/);
    // 尺寸随字号缩放：lg 的 u = 16/14。
    expect(styles).toMatch(/--btn-u:\s*1\.142857px;/);
    expect(styles).toMatch(
      /\.ui-button--primary:not\(:disabled\):hover\s*\{[\s\S]*?--btn-face-top:\s*#485062;/
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
