import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../radix/button';
import { Input } from '../radix/input';

describe('compatibility controls', () => {
  it('does not submit a form implicitly and blocks loading activation', () => {
    const submit = vi.fn((event) => event.preventDefault());
    const click = vi.fn();
    const { rerender } = render(
      <form onSubmit={submit}>
        <Button onClick={click}>Save</Button>
      </form>
    );
    fireEvent.click(screen.getByRole('button'));
    expect(click).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
    rerender(
      <Button isLoading onClick={click}>
        Save
      </Button>
    );
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(screen.getByRole('button'));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('preserves anchor semantics and blocks the child handler while loading', () => {
    const click = vi.fn();
    const { rerender } = render(
      <Button asChild isLoading>
        <a href="#next" onClick={click}>
          Continue
        </a>
      </Button>
    );
    const link = screen.getByRole('link');
    expect(link).not.toHaveAttribute('type');
    expect(link).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(link);
    expect(click).not.toHaveBeenCalled();
    rerender(
      <Button asChild>
        <a href="#next" onClick={click}>
          Continue
        </a>
      </Button>
    );
    fireEvent.click(screen.getByRole('link'));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('forwards the common invalid, read-only and size contracts', () => {
    render(
      <Input
        aria-label="Email"
        invalid
        readOnly
        inputSize="lg"
        value="a@example.test"
      />
    );
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly');
    expect(screen.getByRole('textbox')).toHaveValue('a@example.test');
  });
});
